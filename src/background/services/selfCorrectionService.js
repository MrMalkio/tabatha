// ════════════════════════════════════════════
// Tabatha — Self-Correction Service (Cortex C10, Plan 042 T7)
//
// The thin chrome-facing shell for passive self-correction. ALL detection
// logic lives in pure, unit-tested helpers (src/utils/selfCorrection.js):
// detectTabIntentMismatches, recomputeActualWorkTime, applyConfidenceFloor.
// This service only orchestrates them against chrome.storage + the audit sink
// and decides what to APPLY vs. QUEUE, mirroring captureService.js's
// "shell wraps pure logic" split.
//
// Pipeline (spec §2): read cortexLedger + tabs + focusEngine → enrich the
// ledger with the intent-active-at-capture (by focus-session time window,
// since the ledger doesn't stamp focusId today) → run the pure detectors →
// split by the settings confidence floor (`selfCorrectionConfidence`, default
// 'high'). Corrections AT/ABOVE the floor are APPLIED to the live record and
// logged via activityAuditService (auditable + reversible via previousState).
// Corrections BELOW the floor are stored as suggestions under `cortexCorrections`
// (capped 100) for the C7 dashboard surface.
//
// Every applied correction carries a `correctionId` in its audit metadata so
// REVERT_CORRECTION can replay its `previousState` back onto the record.
//
// Gated end-to-end on settings.selfCorrectionEnabled (default false, opt-in).
//
// Storage keys:
//   cortexLedger        — read (observations; owned by captureService)
//   tabs / focusEngine  — read + write-back (correction targets)
//   cortexCorrections   — below-floor suggestion queue (capped 100)
//   activityAuditLog    — applied-correction audit trail (via logAudit)
// ════════════════════════════════════════════

import { getStorage, setStorage, getSettings } from './storageService.js';
import { logAudit, getAuditLog } from './activityAuditService.js';
import {
  detectTabIntentMismatches,
  recomputeActualWorkTime,
  applyConfidenceFloor
} from '../../utils/selfCorrection.js';

const LEDGER_KEY = 'cortexLedger';
const SUGGESTIONS_KEY = 'cortexCorrections';
const SUGGESTIONS_CAP = 100;

export const SELF_CORRECTION_ALARM = 'cortex-self-correction';

// Audit `action` namespace (spec §2.5). previousState/newState carry the diff.
const ACTION_TAB_LINK = 'SELF_CORRECT_TAB_LINK';
const ACTION_DURATION = 'SELF_CORRECT_DURATION';
const ACTION_REVERT = 'REVERT_CORRECTION';
const SELF_CORRECT_PREFIX = 'SELF_CORRECT_';

// Serialize storage read-modify-writes so a nightly pass and a manual run
// can't interleave and drop each other's writes (same guard captureService
// uses for the ledger).
let opChain = Promise.resolve();
function serialized(fn) {
  const run = opChain.then(fn, fn);
  opChain = run.then(() => undefined, () => undefined);
  return run;
}

function newCorrectionId() {
  return `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

// Every focus that could be corrected: the live items plus completed history
// entries (both carry elapsedMs, associatedTabIds, startedAt/endedAt).
function collectFocusSessions(engine) {
  const items = Object.values(engine?.items || {}).map(it => ({
    focusId: it.id,
    label: it.label,
    recordedMs: it.elapsedMs || 0,
    startedAt: it.startedAt || it.createdAt || null,
    endedAt: it.endedAt || null,
    focusState: it.focusState,
    _source: 'items'
  }));
  const history = (Array.isArray(engine?.history) ? engine.history : []).map(h => ({
    focusId: h.id,
    label: h.label,
    recordedMs: h.elapsedMs || 0,
    startedAt: h.startedAt || h.createdAt || null,
    endedAt: h.endedAt || null,
    focusState: 'completed',
    _source: 'history'
  }));
  return [...items, ...history];
}

// Stamp each observation with the intent (focus label) that was active at its
// timestamp, derived from focus-session windows. This gives the pure tab-intent
// detector a real `intentId` to corroborate against even though the capture
// ledger doesn't record focusId per frame today (a known C4/C11 wiring gap —
// see spec open question #4). Observations already carrying intentId keep it.
function stampIntentByWindow(observations, sessions) {
  const windows = sessions
    .filter(s => s.startedAt && s.label)
    .map(s => ({ start: Date.parse(s.startedAt), end: s.endedAt ? Date.parse(s.endedAt) : Infinity, label: s.label }))
    .filter(w => Number.isFinite(w.start));
  return observations.map(o => {
    if (o.intentId) return o;
    const t = Date.parse(o.ts);
    if (!Number.isFinite(t)) return o;
    const hit = windows.find(w => t >= w.start && t <= w.end);
    return hit ? { ...o, intentId: hit.label } : o;
  });
}

// ── Write-back (apply) ──────────────────────────────────────────

// Move a tab's focus link. Mirrors focusService.linkTabToFocus's storage
// effects (associatedTabIds membership + tabs[tabId].intent = label) WITHOUT
// importing focusService — the same direct-storage posture captureService
// uses. `to`/`from` are intent labels; we resolve them to focus item ids.
// Returns the captured previousState (for the audit trail / revert) or null
// if the target focus can't be resolved.
// Atomic-ish targeted mutation: read the key and write it back within one
// await gap, with a SYNCHRONOUS mutator in between. focusEngine/tabs are
// owned by focusService/tabService, which do their own read-modify-writes —
// we can't share their queue, so the best available discipline is to keep
// our read→write window to a single storage round-trip per key and mutate
// only the fields this correction owns (review finding 2026-07-10).
export async function mutateKey(key, fallback, mutator) {
  const { [key]: raw } = await getStorage(key);
  const value = raw || fallback;
  const result = mutator(value);
  if (result === null) return null; // mutator declined — nothing written
  await setStorage({ [key]: value });
  return result;
}

async function applyTabLink(correction) {
  const tabId = correction.tabId;

  const engineResult = await mutateKey(
    'focusEngine',
    { activeFocusId: null, items: {}, history: [] },
    (engine) => {
      const items = Object.values(engine.items || {});
      const toItem = items.find(it => it.label === correction.to);
      if (!toItem) return null; // can't link to a focus that doesn't exist

      const prevFocusIds = items
        .filter(it => (it.associatedTabIds || []).includes(tabId))
        .map(it => it.id);

      // Detach from every focus, then attach to the target (one home per tab).
      for (const it of items) {
        it.associatedTabIds = (it.associatedTabIds || []).filter(id => id !== tabId);
      }
      if (!toItem.associatedTabIds) toItem.associatedTabIds = [];
      toItem.associatedTabIds.push(tabId);
      return { prevFocusIds, toLabel: toItem.label, toId: toItem.id };
    }
  );
  if (!engineResult) return null;

  const tabResult = await mutateKey('tabs', {}, (tabMap) => {
    if (!tabMap[tabId]) return { prevIntent: null, updated: false };
    const prevIntent = tabMap[tabId].intent ?? null;
    tabMap[tabId].intent = engineResult.toLabel;
    return { prevIntent, updated: true };
  });

  return {
    previousState: { tabId, prevIntent: tabResult?.prevIntent ?? null, prevFocusIds: engineResult.prevFocusIds },
    newState: { tabId, intent: engineResult.toLabel, focusId: engineResult.toId }
  };
}

// Correct a focus's stored elapsedMs to the observed value. Only touches
// records that are NOT currently active/paused-with-live-timer — an active
// focus is still advancing (elapsedMs + live portion), so rewriting it would
// double-count. Frozen/completed records are the intended target (spec §1).
async function applyDuration(correction) {
  const id = correction.focusId;
  return mutateKey(
    'focusEngine',
    { activeFocusId: null, items: {}, history: [] },
    (engine) => {
      let holder = null;
      let bucket = null;
      if (engine.items && engine.items[id]) { holder = engine.items[id]; bucket = 'items'; }
      else if (Array.isArray(engine.history)) {
        const h = engine.history.find(e => e.id === id);
        if (h) { holder = h; bucket = 'history'; }
      }
      if (!holder) return null;
      if (bucket === 'items' && holder.focusState === 'active') return null; // still live

      const prevElapsedMs = holder.elapsedMs || 0;
      holder.elapsedMs = correction.observedMs;
      return {
        previousState: { focusId: id, bucket, prevElapsedMs },
        newState: { focusId: id, bucket, elapsedMs: correction.observedMs }
      };
    }
  );
}

// Exported for the C10a reconciliation service, which translates its confirmed
// proposals into the same {type, tabId|focusId, to|observedMs} correction shape
// and reuses this apply/revert machinery verbatim.
export async function applyCorrection(correction) {
  if (correction.type === 'tab-intent-link') return applyTabLink(correction);
  if (correction.type === 'focus-time') return applyDuration(correction);
  return null;
}

function auditActionFor(type) {
  return type === 'tab-intent-link' ? ACTION_TAB_LINK : ACTION_DURATION;
}

// ── Suggestion queue (below-floor) ──────────────────────────────

async function queueSuggestions(corrections) {
  if (corrections.length === 0) return [];
  const { [SUGGESTIONS_KEY]: prev } = await getStorage(SUGGESTIONS_KEY);
  const queue = Array.isArray(prev) ? prev : [];
  const stamped = corrections.map(c => ({
    ...c,
    correctionId: newCorrectionId(),
    status: 'suggested',
    ts: new Date().toISOString()
  }));
  const next = [...queue, ...stamped];
  const trimmed = next.length > SUGGESTIONS_CAP ? next.slice(-SUGGESTIONS_CAP) : next;
  await setStorage({ [SUGGESTIONS_KEY]: trimmed });
  return stamped;
}

// ── Orchestration ───────────────────────────────────────────────

function runSelfCorrection() {
  return serialized(runSelfCorrectionInner);
}

async function runSelfCorrectionInner() {
  const settings = await getSettings();
  if (!settings.selfCorrectionEnabled) return { ran: false, reason: 'disabled' };

  const floor = settings.selfCorrectionConfidence || 'high';
  const { [LEDGER_KEY]: ledgerRaw } = await getStorage(LEDGER_KEY);
  const observations = Array.isArray(ledgerRaw) ? ledgerRaw : [];
  const { focusEngine: engineRaw } = await getStorage('focusEngine');
  const engine = engineRaw || { activeFocusId: null, items: {}, history: [] };
  const { tabs } = await getStorage('tabs');
  const tabMap = tabs || {};

  const sessions = collectFocusSessions(engine);
  const enriched = stampIntentByWindow(observations, sessions);

  // Tab-intent detector wants { tabId, host, intentId }.
  const tabInput = Object.entries(tabMap).map(([id, t]) => ({
    tabId: /^\d+$/.test(id) ? Number(id) : id,
    host: hostOf(t?.url),
    intentId: t?.intent ?? null,
    title: t?.title ?? null
  }));

  const proposals = [
    ...detectTabIntentMismatches(enriched, tabInput),
    ...recomputeActualWorkTime(enriched, sessions)
  ];

  const atOrAbove = applyConfidenceFloor(proposals, floor);
  const aboveSet = new Set(atOrAbove);
  const below = proposals.filter(p => !aboveSet.has(p));

  const applied = [];
  for (const correction of atOrAbove) {
    let state;
    try {
      state = await applyCorrection(correction);
    } catch (err) {
      console.warn('[selfCorrection] apply failed:', correction.type, err?.message);
      continue;
    }
    if (!state) continue; // target unresolved / still-live → skip silently

    const correctionId = newCorrectionId();
    await logAudit(auditActionFor(correction.type), {
      focusId: correction.focusId || state.newState?.focusId || null,
      previousState: state.previousState,
      newState: state.newState,
      metadata: {
        correctionId,
        correctionType: correction.type,
        confidence: correction.confidence,
        evidence: correction.evidence
      }
    });
    applied.push({ ...correction, correctionId, status: 'applied' });
  }

  const suggested = await queueSuggestions(below);

  return { ran: true, applied: applied.length, suggested: suggested.length, corrections: applied };
}

// Nightly cadence entry point (dispatched by alarmService for
// SELF_CORRECTION_ALARM). Gating happens inside runSelfCorrection.
export function runNightlySelfCorrection() {
  return runSelfCorrection();
}

// ── Read + revert (message API) ─────────────────────────────────

async function listCorrections(limit = 50) {
  const { [SUGGESTIONS_KEY]: sugRaw } = await getStorage(SUGGESTIONS_KEY);
  const suggestions = Array.isArray(sugRaw) ? sugRaw : [];
  const audit = await getAuditLog();
  const appliedTail = audit
    .filter(e => typeof e.action === 'string' && e.action.startsWith(SELF_CORRECT_PREFIX))
    .slice(-limit)
    .map(e => ({
      correctionId: e.metadata?.correctionId || null,
      type: e.metadata?.correctionType || null,
      confidence: e.metadata?.confidence || null,
      action: e.action,
      previousState: e.previousState,
      newState: e.newState,
      evidence: e.metadata?.evidence || [],
      ts: e.timestamp,
      status: 'applied'
    }));
  const corrections = [...suggestions.slice(-limit), ...appliedTail];
  return { corrections, total: suggestions.length + appliedTail.length };
}

// Replay a correction's previousState back onto the record, then log a
// REVERT_CORRECTION entry pointing at the original (spec §2.6).
async function revertCorrection(correctionId) {
  if (!correctionId) return { success: false, reason: 'no-id' };
  const audit = await getAuditLog();
  const entry = [...audit].reverse().find(
    e => typeof e.action === 'string' &&
      e.action.startsWith(SELF_CORRECT_PREFIX) &&
      e.metadata?.correctionId === correctionId
  );
  if (!entry) return { success: false, reason: 'not-found' };

  const prev = entry.previousState || {};
  try {
    if (entry.action === ACTION_TAB_LINK) {
      await revertTabLink(prev);
    } else if (entry.action === ACTION_DURATION) {
      await revertDuration(prev);
    } else {
      return { success: false, reason: 'unsupported-action' };
    }
  } catch (err) {
    return { success: false, reason: err?.message || 'revert-failed' };
  }

  await logAudit(ACTION_REVERT, {
    focusId: entry.focusId || null,
    previousState: entry.newState,
    newState: entry.previousState,
    metadata: { correctionId, revertedAction: entry.action }
  });
  return { success: true, correctionId };
}

async function revertTabLink(prev) {
  const { tabId, prevIntent, prevFocusIds = [] } = prev;
  await mutateKey('focusEngine', { activeFocusId: null, items: {}, history: [] }, (engine) => {
    const items = Object.values(engine.items || {});
    for (const it of items) {
      it.associatedTabIds = (it.associatedTabIds || []).filter(id => id !== tabId);
    }
    for (const it of items) {
      if (prevFocusIds.includes(it.id) && !(it.associatedTabIds || []).includes(tabId)) {
        (it.associatedTabIds = it.associatedTabIds || []).push(tabId);
      }
    }
    return {};
  });
  await mutateKey('tabs', {}, (tabMap) => {
    if (!tabMap[tabId]) return null;
    tabMap[tabId].intent = prevIntent;
    return {};
  });
}

async function revertDuration(prev) {
  const { focusId, bucket, prevElapsedMs } = prev;
  await mutateKey('focusEngine', { activeFocusId: null, items: {}, history: [] }, (engine) => {
    let holder = null;
    if (bucket === 'items') holder = engine.items?.[focusId] || null;
    else if (bucket === 'history') holder = (engine.history || []).find(e => e.id === focusId) || null;
    if (!holder) return null;
    holder.elapsedMs = prevElapsedMs;
    return {};
  });
}

// ── Alarm registration ──────────────────────────────────────────
// Daily 04:00 pass — piggybacks the Cortex nightly cadence but stays a
// distinct alarm (spec: do NOT reuse captureService's export handler).
// Dispatched by alarmService (SELF_CORRECTION_ALARM case), following the
// cortex-dwell-tick / cortex-nightly-export precedent.
export function registerSelfCorrectionAlarm() {
  try {
    const next = new Date();
    next.setHours(4, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    chrome.alarms.create(SELF_CORRECTION_ALARM, { when: next.getTime(), periodInMinutes: 1440 });
  } catch (err) {
    console.warn('[selfCorrection] alarm registration failed:', err?.message);
  }
}

// ── Router ──────────────────────────────────────────────────────

export async function handleMessage(type, message) {
  switch (type) {
    case 'RUN_SELF_CORRECTION': return runSelfCorrection();
    case 'LIST_CORRECTIONS': return listCorrections(message?.limit);
    case 'REVERT_CORRECTION': return revertCorrection(message?.id);
    default: return undefined;
  }
}
