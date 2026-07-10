// ════════════════════════════════════════════
// Tabatha — Context Reconciliation Service (Cortex C10a, Plan 042).
//
// The thin chrome-facing shell for the ACTIVE, HOLISTIC reconciliation pass.
// ALL proposal logic is pure + unit-tested (src/utils/contextReconcile.js):
// proposeReconciliations, summarizeProposals. This service only:
//   • reads the joined snapshot (cortexLedger + tabs + focusEngine),
//   • stores the proposal set under `cortexPendingChanges` (cap 200, FIFO),
//   • applies ONE confirmed proposal at a time through the C10 apply path
//     (selfCorrectionService.applyCorrection + mutateKey — audited, reversible),
//   • stamps controller attribution (C11a agentSessions) on applied rows,
//   • folds free-text context into the ledger (kind:'context-note') and re-runs.
//
// v1 reasoning is LOCAL + deterministic (no LLM). Everything is confirm-first:
// nothing applies without an explicit APPLY_RECONCILE. The routed/harness
// reasoning pass, audio input, and delta watermarks are v2 (see spec §Phase).
//
// Storage keys:
//   cortexLedger        — read (observations; owned by captureService)
//   tabs / focusEngine  — read + targeted write-back (apply targets)
//   agentSessions       — read (controller attribution, owned by agentSessionService)
//   cortexPendingChanges — the proposal set awaiting confirmation (cap 200)
//   activityAuditLog    — applied-proposal audit trail (via logAudit)
// ════════════════════════════════════════════

import { getStorage, setStorage } from './storageService.js';
import { logAudit } from './activityAuditService.js';
import { recordObservation } from './captureService.js';
import { applyCorrection, mutateKey } from './selfCorrectionService.js';
import { openSessions } from '../../utils/agentSessionStore.js';
import { proposeReconciliations, summarizeProposals } from '../../utils/contextReconcile.js';

const LEDGER_KEY = 'cortexLedger';
const PENDING_KEY = 'cortexPendingChanges';
const PENDING_CAP = 200;

const ACTION_APPLY = 'RECONCILE_APPLY';

// Serialize read-modify-writes of the pending set so a re-run and an apply/skip
// can't interleave and drop each other's status writes.
let opChain = Promise.resolve();
function serialized(fn) {
  const run = opChain.then(fn, fn);
  opChain = run.then(() => undefined, () => undefined);
  return run;
}

async function readPending() {
  const { [PENDING_KEY]: raw } = await getStorage(PENDING_KEY);
  return Array.isArray(raw) ? raw : [];
}

async function writePending(proposals) {
  const trimmed = proposals.length > PENDING_CAP ? proposals.slice(-PENDING_CAP) : proposals;
  await setStorage({ [PENDING_KEY]: trimmed });
  return trimmed;
}

async function readSnapshot() {
  const { [LEDGER_KEY]: ledgerRaw } = await getStorage(LEDGER_KEY);
  const { focusEngine } = await getStorage('focusEngine');
  const { tabs } = await getStorage('tabs');
  return {
    observations: Array.isArray(ledgerRaw) ? ledgerRaw : [],
    focusEngine: focusEngine || { activeFocusId: null, items: {}, history: [] },
    tabs: tabs || {}
  };
}

// Regenerate the proposal set, carrying forward any already-applied/skipped
// decision for a proposal whose deterministic id recurs (v1 has no delta
// watermark — a full re-run is cheap and confirm-first anyway).
async function runReconcile(message) {
  return serialized(async () => {
    const snapshot = await readSnapshot();
    const { generatedAt, proposals } = proposeReconciliations({ ...snapshot, day: message?.day });

    const prior = await readPending();
    const decided = new Map(
      prior.filter(p => p.status === 'applied' || p.status === 'skipped').map(p => [p.id, p])
    );
    const merged = proposals.map(p => {
      const was = decided.get(p.id);
      return was ? { ...p, status: was.status, resolvedAt: was.resolvedAt } : { ...p, status: 'pending' };
    });

    const stored = await writePending(merged);
    return { ok: true, generatedAt, summary: summarizeProposals(stored), proposals: stored };
  });
}

// The single currently-open agent-controller span, if any, so applied rows are
// attributed to the agent driving this reconciliation (C11a).
async function activeController() {
  try {
    const { agentSessions } = await getStorage('agentSessions');
    const open = openSessions(Array.isArray(agentSessions) ? agentSessions : [], Date.now());
    const span = open[0];
    return span ? { controller: 'ai-agent', controllerSource: span.source, agentSessionId: span.id } : null;
  } catch { return null; }
}

// Translate a confirmed proposal into the C10 correction shape and apply it.
// tab-intent-link + focus-time reuse selfCorrectionService.applyCorrection;
// tab-group + orphan-adopt write their owned fields via mutateKey the same way.
async function applyProposal(p) {
  if (p.kind === 'tab-intent-link') {
    return applyCorrection({ type: 'tab-intent-link', tabId: p.targetId, from: p.before, to: p.after });
  }
  if (p.kind === 'focus-time') {
    return applyCorrection({ type: 'focus-time', focusId: p.targetId, observedMs: p.after });
  }
  if (p.kind === 'tab-group') {
    const tabId = p.targetId;
    const nextContext = p.after?.context ?? null;
    return mutateKey('tabs', {}, (tabMap) => {
      if (!tabMap[tabId]) return null;
      const prevContext = tabMap[tabId].context ?? null;
      tabMap[tabId].context = nextContext;
      return {
        previousState: { tabId, prevContext, prevGroupId: p.before?.groupId ?? null },
        newState: { tabId, context: nextContext }
      };
    });
  }
  if (p.kind === 'orphan-adopt') {
    const focusId = p.targetId;
    const parent = p.after?.suggestedParent ?? null;
    return mutateKey('focusEngine', { activeFocusId: null, items: {}, history: [] }, (engine) => {
      const holder = engine.items?.[focusId] || (engine.history || []).find(e => e.id === focusId) || null;
      if (!holder) return null;
      const prevParentLabel = holder.parentLabel ?? null;
      holder.parentLabel = parent;
      return {
        previousState: { focusId, prevParentLabel },
        newState: { focusId, parentLabel: parent }
      };
    });
  }
  return null;
}

async function applyReconcile(id) {
  return serialized(async () => {
    if (!id) return { ok: false, reason: 'no-id' };
    const proposals = await readPending();
    const target = proposals.find(p => p.id === id);
    if (!target) return { ok: false, reason: 'not-found' };
    if (target.status === 'applied') return { ok: true, already: true, proposal: target };

    let state;
    try {
      state = await applyProposal(target);
    } catch (err) {
      return { ok: false, reason: err?.message || 'apply-failed' };
    }
    if (!state) return { ok: false, reason: 'target-unresolved' };

    const ctrl = await activeController();
    await logAudit(ACTION_APPLY, {
      focusId: target.kind === 'focus-time' || target.kind === 'orphan-adopt' ? target.targetId : null,
      previousState: state.previousState,
      newState: state.newState,
      metadata: {
        proposalId: target.id,
        kind: target.kind,
        confidence: target.confidence,
        evidence: target.evidence,
        ...(ctrl || { controller: 'user' })
      }
    });

    const resolvedAt = new Date().toISOString();
    const next = proposals.map(p => p.id === id ? { ...p, status: 'applied', resolvedAt, controller: ctrl?.controller || 'user' } : p);
    const stored = await writePending(next);
    return { ok: true, proposal: stored.find(p => p.id === id), summary: summarizeProposals(stored) };
  });
}

async function skipReconcile(id) {
  return serialized(async () => {
    if (!id) return { ok: false, reason: 'no-id' };
    const proposals = await readPending();
    if (!proposals.some(p => p.id === id)) return { ok: false, reason: 'not-found' };
    const resolvedAt = new Date().toISOString();
    const next = proposals.map(p => p.id === id ? { ...p, status: 'skipped', resolvedAt } : p);
    const stored = await writePending(next);
    return { ok: true, proposal: stored.find(p => p.id === id), summary: summarizeProposals(stored) };
  });
}

// Store the user's free-text note as a ledger observation (kind:'context-note',
// C9 hard rule that spoken/typed context mirrors to the ledger) and re-run the
// reconciliation folding it in. v1 just appends + re-runs; actual NLP folding of
// the note into the reasoning is v2.
async function addContext(text) {
  const note = typeof text === 'string' ? text.trim() : '';
  if (!note) return { ok: false, reason: 'empty' };
  try {
    let clockState = 'clocked_out';
    try {
      const { clockSession } = await getStorage('clockSession');
      if (clockSession?.active) clockState = clockSession.onBreak ? 'on_break' : 'clocked_in';
    } catch { /* default personal */ }
    await recordObservation(
      { at: Date.now(), surface: 'user', kind: 'context-note', title: note },
      clockState,
      { controller: 'user' }
    );
  } catch { /* ledger write is best-effort; still re-run below */ }
  const res = await runReconcile({});
  return { ...res, noteRecorded: true };
}

async function listPending() {
  const proposals = await readPending();
  return { ok: true, proposals, summary: summarizeProposals(proposals) };
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'RUN_RECONCILE': return runReconcile(message || {});
    case 'APPLY_RECONCILE': return applyReconcile(message?.id);
    case 'SKIP_RECONCILE': return skipReconcile(message?.id);
    case 'ADD_RECONCILE_CONTEXT': return addContext(message?.text);
    case 'LIST_PENDING_CHANGES': return listPending();
    default: return undefined;
  }
}
