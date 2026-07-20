// ════════════════════════════════════════════
// Cortex C10a — Context Reconciliation (Plan 042 T-C10a) — PURE CORE.
//
// C10 (selfCorrection.js) repairs ONE record at a time and auto-applies above
// a confidence floor. C10a is the ACTIVE, HOLISTIC pass: given a joined
// snapshot of the day's observations + tabs + focus engine, it proposes a
// COHERENT SET of changes for a human to confirm — re-linking, re-grouping,
// retroactive time edits, and orphan adoption (#213). Nothing mutates here;
// the service shell (contextReconcileService.js) decides what to apply.
//
// v1 reasoning is LOCAL + DETERMINISTIC (no LLM). It reuses the C10 detectors
// verbatim for the two kinds they already cover and adds two joined-state
// detectors (tab-group, orphan-adopt). The routed/harness reasoning pass is v2.
//
// No chrome / supabase / DOM deps — unit-tested in isolation.
// ════════════════════════════════════════════

import { selectObservationsForDay } from './ledgerExport.js';
import {
  detectTabIntentMismatches,
  recomputeActualWorkTime,
  scoreCorrectionConfidence
} from './selfCorrection.js';

function toMs(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

// Deterministic id so re-runs produce stable ids for the same proposal — lets
// the service carry an already-applied/skipped decision across a re-run and
// dedupe without a random nonce. djb2 over the identifying fields.
function shortHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export function reconcileId(kind, targetId, before, after) {
  return `${kind}:${targetId}:${shortHash(JSON.stringify([before ?? null, after ?? null]))}`;
}

// ── Joined-state prep (pure mirrors of the C10 service's private helpers) ──

// Every focus that could be reconciled: live items + completed history. Passes
// through the nesting fields #213 cares about (parent/task/project/tags).
export function collectFocusSessions(engine) {
  const map = (it, source, focusState) => ({
    focusId: it.id,
    label: it.label ?? null,
    recordedMs: it.elapsedMs || 0,
    startedAt: it.startedAt || it.createdAt || null,
    endedAt: it.endedAt || null,
    parentId: it.parentId ?? it.parentFocusId ?? null,
    taskId: it.taskId ?? null,
    projectId: it.projectId ?? null,
    tags: Array.isArray(it.tags) ? it.tags : [],
    category: it.category ?? null,
    focusState: focusState ?? it.focusState ?? null,
    _source: source
  });
  const items = Object.values(engine?.items || {}).map(it => map(it, 'items', it.focusState));
  const history = (Array.isArray(engine?.history) ? engine.history : []).map(h => map(h, 'history', 'completed'));
  return [...items, ...history];
}

// Stamp each observation with the focus label active at its timestamp (by
// focus-session time window), so the tab-intent detector has a real intentId
// to corroborate against even when the capture ledger doesn't stamp focusId.
export function stampIntentByWindow(observations, sessions) {
  const windows = (sessions || [])
    .filter(s => s.startedAt && s.label)
    .map(s => ({ start: toMs(s.startedAt), end: s.endedAt ? toMs(s.endedAt) : Infinity, label: s.label }))
    .filter(w => Number.isFinite(w.start));
  return (observations || []).map(o => {
    if (o.intentId) return o;
    const t = toMs(o.ts);
    if (t == null) return o;
    const hit = windows.find(w => t >= w.start && t <= w.end);
    return hit ? { ...o, intentId: hit.label } : o;
  });
}

function tabsToArray(tabs) {
  if (!tabs) return [];
  const entries = Array.isArray(tabs) ? tabs.map(t => [t.tabId ?? t.id, t]) : Object.entries(tabs);
  return entries
    .filter(([, t]) => t && typeof t === 'object')
    .map(([id, t]) => ({
      tabId: typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : (t.tabId ?? t.id ?? id),
      host: hostOf(t.url) || (t.host ? String(t.host).toLowerCase() : null),
      intent: t.intent ?? t.intentId ?? null,
      context: t.context ?? null,
      groupId: t.groupId ?? null,
      title: t.title ?? null
    }));
}

// Longest consecutive run of a single intent among a host's observations,
// regardless of any recorded tab link. Returns { label, obs, category } | null.
function dominantHostRun(sorted, host, minRun) {
  if (!host) return null;
  const matched = sorted.filter(o => o.host && String(o.host).toLowerCase() === host);
  let best = { label: null, obs: [] };
  let runId = null;
  let runObs = [];
  for (const o of matched) {
    const id = o.intentId ?? null;
    if (id != null) {
      if (id === runId) runObs.push(o); else { runId = id; runObs = [o]; }
      if (runObs.length > best.obs.length) best = { label: runId, obs: runObs.slice() };
    } else { runId = null; runObs = []; }
  }
  if (best.obs.length < minRun) return null;
  const cats = best.obs.map(o => o.category).filter(Boolean);
  const category = cats.length === best.obs.length && cats.every(c => c === cats[0]) ? cats[0] : null;
  return { label: best.label, obs: best.obs, category };
}

function attributedObs(sorted, session, now) {
  const start = toMs(session.startedAt);
  if (start == null) return [];
  const end = session.endedAt ? toMs(session.endedAt) : now;
  return sorted.filter(o => {
    if (session.focusId != null && o.focusId != null) return o.focusId === session.focusId;
    const t = toMs(o.ts);
    return t != null && t >= start && t <= (end ?? now);
  });
}

// ── Detectors → unified proposal shape ──────────────────────────
// proposal: { id, kind, targetId, before, after, why, evidence[], confidence }

function proposeTabIntentLinks(observations, tabs, opts) {
  const arr = tabsToArray(tabs);
  return detectTabIntentMismatches(observations, arr, opts).map(c => {
    const run = c.evidence.find(e => e.kind === 'host-run') || {};
    return {
      id: reconcileId('tab-intent-link', c.tabId, c.from, c.to),
      kind: 'tab-intent-link',
      targetId: c.tabId,
      before: c.from,
      after: c.to,
      why: `Tab ${c.tabId} showed "${c.to}" context ${run.count ?? '?'}× on ${run.host || 'its host'} — link it to "${c.to}"${c.from ? ` (was "${c.from}")` : ''}.`,
      evidence: c.evidence,
      confidence: c.confidence
    };
  });
}

function proposeFocusTimes(observations, sessions, opts) {
  const byId = new Map(sessions.map(s => [s.focusId, s]));
  return recomputeActualWorkTime(observations, sessions, opts).map(c => {
    const label = byId.get(c.focusId)?.label || c.focusId;
    const mins = (ms) => Math.round(ms / 60000);
    const dir = c.deltaMs >= 0 ? 'add' : 'trim';
    return {
      id: reconcileId('focus-time', c.focusId, c.recordedMs, c.observedMs),
      kind: 'focus-time',
      targetId: c.focusId,
      before: c.recordedMs,
      after: c.observedMs,
      why: `"${label}" shows ${mins(c.observedMs)}m of observed activity vs ${mins(c.recordedMs)}m recorded — ${dir} ${mins(Math.abs(c.deltaMs))}m.`,
      evidence: c.evidence,
      confidence: c.confidence
    };
  });
}

// A tab whose SUSTAINED observed context differs from the dominant context of
// the tab group it sits in. Group context = the majority assigned context/intent
// among the group's members. Deterministic; self-contained on tabs+observations.
function proposeTabGroups(observations, tabs, opts) {
  const minRun = opts.minRun ?? 3;
  const arr = tabsToArray(tabs);
  const sorted = [...observations].sort((a, b) => (toMs(a.ts) ?? 0) - (toMs(b.ts) ?? 0));

  // group → dominant assigned context label.
  const groups = new Map();
  for (const t of arr) {
    if (t.groupId == null) continue;
    const label = t.context ?? t.intent ?? null;
    if (!groups.has(t.groupId)) groups.set(t.groupId, new Map());
    if (label != null) {
      const counts = groups.get(t.groupId);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }
  const groupContext = new Map();
  for (const [gid, counts] of groups) {
    let top = null, topN = 0;
    for (const [label, n] of counts) if (n > topN) { top = label; topN = n; }
    groupContext.set(gid, top);
  }

  const proposals = [];
  for (const t of arr) {
    if (t.groupId == null) continue;
    const gCtx = groupContext.get(t.groupId);
    if (gCtx == null) continue;
    const run = dominantHostRun(sorted, t.host, minRun);
    if (!run || run.label == null) continue;
    if (run.label === gCtx) continue; // already coherent

    const signals = ['host-run'];
    if (run.category) signals.push('category');
    proposals.push({
      id: reconcileId('tab-group', t.tabId, { groupId: t.groupId, context: gCtx }, run.label),
      kind: 'tab-group',
      targetId: t.tabId,
      before: { groupId: t.groupId, context: gCtx },
      after: { context: run.label },
      why: `Tab ${t.tabId} sustained "${run.label}" (${run.obs.length}× on ${t.host}) but sits in a "${gCtx}" group — regroup it under "${run.label}".`,
      evidence: [
        { kind: 'host-run', host: t.host, count: run.obs.length, firstTs: run.obs[0].ts, lastTs: run.obs[run.obs.length - 1].ts },
        { kind: 'group-context', groupId: t.groupId, context: gCtx },
        ...(run.category ? [{ kind: 'category', category: run.category }] : [])
      ],
      confidence: scoreCorrectionConfidence(signals)
    });
  }
  return proposals;
}

function isOrphan(s) {
  return !s.parentId && !s.taskId && !s.projectId &&
    (!Array.isArray(s.tags) || s.tags.length === 0);
}

// A focus/intent that has observations attributed to it but no parent (#213:
// no orphan focuses). Suggested parent: a sibling non-orphan focus sharing the
// orphan's category, else the dominant observation category, else null (create).
function proposeOrphanAdoptions(observations, sessions, opts) {
  const minObservations = opts.minObservations ?? 2;
  const now = opts.now ?? Date.now();
  const sorted = [...observations].sort((a, b) => (toMs(a.ts) ?? 0) - (toMs(b.ts) ?? 0));
  const proposals = [];

  for (const s of sessions) {
    if (s.focusId == null || !isOrphan(s)) continue;
    const obs = attributedObs(sorted, s, now);
    if (obs.length < minObservations) continue;

    // Dominant observation category.
    const catCounts = new Map();
    for (const o of obs) if (o.category) catCounts.set(o.category, (catCounts.get(o.category) || 0) + 1);
    let domCat = null, domN = 0;
    for (const [c, n] of catCounts) if (n > domN) { domCat = c; domN = n; }

    // Prefer a non-orphan sibling that shares the orphan's category.
    const siblingCat = s.category || domCat;
    const sibling = siblingCat
      ? sessions.find(o => o.focusId !== s.focusId && !isOrphan(o) &&
          (o.category === siblingCat || (Array.isArray(o.tags) && o.tags.includes(siblingCat))))
      : null;

    const suggestedParent = sibling?.label ?? domCat ?? null;
    const signals = ['has-observations'];
    if (sibling) signals.push('sibling-match');
    else if (domCat) signals.push('category');

    proposals.push({
      id: reconcileId('orphan-adopt', s.focusId, null, suggestedParent),
      kind: 'orphan-adopt',
      targetId: s.focusId,
      before: null,
      after: { suggestedParent, byLabel: !!sibling },
      why: `Focus "${s.label || s.focusId}" has ${obs.length} observations but no parent — nest it under ${suggestedParent ? `"${suggestedParent}"` : 'a new parent'}.`,
      evidence: [
        { kind: 'attributed-observations', count: obs.length, firstTs: obs[0].ts, lastTs: obs[obs.length - 1].ts },
        ...(domCat ? [{ kind: 'category', category: domCat }] : []),
        ...(sibling ? [{ kind: 'sibling-focus', focusId: sibling.focusId, label: sibling.label }] : [])
      ],
      confidence: scoreCorrectionConfidence(signals)
    });
  }
  return proposals;
}

/**
 * The holistic pass. Given a joined snapshot, return a proposal SET.
 * @param {{observations:Array, tabs:object|Array, focusEngine:object, day?:string}} state
 * @param {{now?:number, minRun?:number, minObservations?:number, ...C10opts}} [opts]
 * @returns {{ generatedAt:string, proposals:Array }}
 */
export function proposeReconciliations(state = {}, opts = {}) {
  const rawObs = Array.isArray(state.observations) ? state.observations : [];
  const observations = state.day ? selectObservationsForDay(rawObs, state.day) : rawObs;
  const engine = state.focusEngine || { activeFocusId: null, items: {}, history: [] };
  const tabs = state.tabs || {};
  const now = opts.now ?? Date.now();

  const sessions = collectFocusSessions(engine);
  const enriched = stampIntentByWindow(observations, sessions);
  const withNow = { ...opts, now };

  const proposals = [
    ...proposeTabIntentLinks(enriched, tabs, opts),
    ...proposeFocusTimes(enriched, sessions, withNow),
    ...proposeTabGroups(enriched, tabs, opts),
    ...proposeOrphanAdoptions(enriched, sessions, withNow)
  ];

  return { generatedAt: new Date(now).toISOString(), proposals };
}

const KIND_ORDER = ['tab-intent-link', 'focus-time', 'tab-group', 'orphan-adopt'];

/**
 * Header summary for the panel: per-kind counts + total.
 * @returns {{ counts: { byKind: Record<string,number> }, total:number }}
 */
export function summarizeProposals(proposals = []) {
  const byKind = {};
  for (const k of KIND_ORDER) byKind[k] = 0;
  for (const p of proposals || []) {
    if (!p || !p.kind) continue;
    byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  }
  return { counts: { byKind }, total: (proposals || []).length };
}
