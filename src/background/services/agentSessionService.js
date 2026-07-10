// ════════════════════════════════════════════
// Tabatha — Agent Session Service (Cortex C11a, Plan 044 T2)
//
// The thin chrome-facing shell for controller attribution's MANUAL half.
// A controller span marks a tab / window / whole machine as agent-driven; all
// span logic lives in the pure, unit-tested src/utils/agentSessionStore.js.
// This service owns the `agentSessions` storage key and answers the four
// message contracts the UI + agent-facing API use:
//
//   START_AGENT_SESSION     human-facing (InPop/InBar/home)  → source:'manual'
//   ANNOUNCE_AGENT_SESSION  agent-facing self-identification  → source:'announced'
//   END_AGENT_SESSION       close by id or by scope/tab/window resolution
//   LIST_AGENT_SESSIONS     all spans + the currently-open subset
//
// When a span opens or closes we record a C4 ledger observation (kind:'signal',
// title 'agent-session-start'/'agent-session-end', app = the agent's name) so
// the timeline carries the transition. captureService stamps `controller` on
// every OTHER observation by reading this key (see recordObservationInner).
//
// Storage key: agentSessions — FIFO-capped array of open + recently-closed spans.
// ════════════════════════════════════════════

import { getStorage, setStorage } from './storageService.js';
import { recordObservation } from './captureService.js';
import {
  openSession,
  closeSession,
  findActiveSession,
  pruneExpired,
  openSessions
} from '../../utils/agentSessionStore.js';

const KEY = 'agentSessions';
const CAP = 200;

// Serialize every read-modify-write so near-simultaneous toggles (InBar + home
// chip, or two tabs) don't drop each other's span writes.
let opChain = Promise.resolve();
function serialized(fn) {
  const run = opChain.then(fn, fn);
  opChain = run.then(() => undefined, () => undefined);
  return run;
}

async function readSessions() {
  const { [KEY]: s } = await getStorage(KEY);
  return Array.isArray(s) ? s : [];
}

async function writeSessions(sessions) {
  await setStorage({ [KEY]: sessions });
}

// C4 partition input: everything while clocked in (incl. break) is org time.
async function currentClockState() {
  try {
    const { clockSession } = await getStorage('clockSession');
    if (clockSession?.active) return clockSession.onBreak ? 'on_break' : 'clocked_in';
  } catch { /* default personal */ }
  return 'clocked_out';
}

// Mirror a span open/close into the observations ledger as a signal row,
// explicitly stamped agent-driven with the span's provenance.
async function recordSpanSignal(title, span) {
  try {
    await recordObservation(
      { at: Date.now(), surface: 'signal', kind: 'signal', title, appName: span.agentName || 'agent' },
      await currentClockState(),
      { controller: 'ai-agent', controllerSource: span.source, agentSessionId: span.id }
    );
  } catch { /* ledger stamp is best-effort — never fail the span mutation */ }
}

// START_AGENT_SESSION / ANNOUNCE_AGENT_SESSION share this handler; they differ
// only in the `source` they stamp. Fields arrive either at the message top
// level (UI callers) or under `payload` (the ANNOUNCE_AGENT_SESSION contract).
function startSession(message, source) {
  return serialized(async () => {
    const p = message?.payload || message || {};
    const now = Date.now();
    let sessions = pruneExpired(await readSessions(), now);
    const scope = p.scope || 'machine';
    sessions = openSession(sessions, {
      scope,
      tabId: p.tabId ?? null,
      windowId: p.windowId ?? null,
      agentName: p.agentName ?? (source === 'announced' ? null : 'manual'),
      supervising: !!p.supervising,
      source,
      autoExpiresAt: p.until ?? p.autoExpiresAt ?? null,
      now,
      cap: CAP
    });
    await writeSessions(sessions);
    const span = sessions[sessions.length - 1];
    await recordSpanSignal('agent-session-start', span);
    return { ok: true, session: span, open: openSessions(sessions, now) };
  });
}

function endSession(message) {
  return serialized(async () => {
    const p = message?.payload || message || {};
    const now = Date.now();
    let sessions = pruneExpired(await readSessions(), now);
    let target = null;
    if (p.id) {
      target = sessions.find((s) => s.id === p.id && !s.endedAt) || null;
    } else {
      target = findActiveSession(sessions, { tabId: p.tabId ?? null, windowId: p.windowId ?? null, now });
    }
    if (!target) {
      await writeSessions(sessions);
      return { ok: false, reason: 'no-active-session', open: openSessions(sessions, now) };
    }
    sessions = closeSession(sessions, target.id, now);
    await writeSessions(sessions);
    const closed = sessions.find((s) => s.id === target.id);
    await recordSpanSignal('agent-session-end', closed);
    return { ok: true, session: closed, open: openSessions(sessions, now) };
  });
}

function listSessions() {
  return serialized(async () => {
    const now = Date.now();
    const sessions = pruneExpired(await readSessions(), now);
    // Persist any auto-expiry closures we just applied so reads stay consistent.
    await writeSessions(sessions);
    return { ok: true, sessions, open: openSessions(sessions, now) };
  });
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'START_AGENT_SESSION': return startSession(message, 'manual');
    case 'ANNOUNCE_AGENT_SESSION': return startSession(message, 'announced');
    case 'END_AGENT_SESSION': return endSession(message);
    case 'LIST_AGENT_SESSIONS': return listSessions();
    default: return undefined;
  }
}
