// ════════════════════════════════════════════
// Tabatha — Capture Service (Cortex C1/C2/C4, Plan 040 Phase 1)
//
// The thin chrome-facing shell for adaptive capture. ALL decision logic lives
// in pure, unit-tested helpers (src/utils/): captureDecision (when + surface),
// sensitiveDataGuard (suppress + redact), observationLedger (normalize +
// partition). This service only orchestrates them + touches chrome/storage.
//
// Phase 1 scope: opt-in gate (the "screenshotCapture" setting is the master
// enable), guard evaluation, and appending normalized observations to the local
// ledger. Actual frame capture (chrome.tabs.captureVisibleTab), local-file write,
// external archive, and the companion OS handoff are the next increment (T4) —
// marked TODO below. No API key required.
//
// Storage keys:
//   cortexLedger        — array of normalized observations (capped)
//   cortexCaptureState  — { lastCaptureAt, lastContextKey }
// ════════════════════════════════════════════

import { getStorage, setStorage, getSettings } from './storageService.js';
import { decideCapture, captureSurface } from '../../utils/captureDecision.js';
import { evaluateCapture } from '../../utils/sensitiveDataGuard.js';
import { normalizeObservation, partitionOf } from '../../utils/observationLedger.js';

const LEDGER_KEY = 'cortexLedger';
const STATE_KEY = 'cortexCaptureState';
const DEFAULT_LEDGER_CAP = 5000;

function captureConfig(settings) {
  return {
    dwellIntervalMs: (settings.captureDwellSeconds ?? 10) * 1000,
    minGapMs: (settings.captureMinGapSeconds ?? 2) * 1000,
    captureOnContextChange: settings.captureOnContextChange !== false
  };
}

async function isEnabled(settings) {
  const s = settings || (await getSettings());
  return !!s.screenshotCapture; // master enable (the "Privacy & Capture" toggle)
}

// Append one normalized observation to the local ledger (capped, FIFO).
// This is the ledger primitive tab/companion listeners feed. Pure logic
// (normalize/partition) is tested; this only does the capped write.
export async function recordObservation(raw, clockState = 'clocked_out') {
  const rec = normalizeObservation(raw);
  rec.partition = partitionOf(rec, clockState);

  const { [LEDGER_KEY]: prev } = await getStorage(LEDGER_KEY);
  const settings = await getSettings();
  const cap = settings?.storage?.cortexLedgerCap ?? DEFAULT_LEDGER_CAP;
  const ledger = Array.isArray(prev) ? prev : [];
  ledger.push(rec);
  const trimmed = ledger.length > cap ? ledger.slice(-cap) : ledger;
  await setStorage({ [LEDGER_KEY]: trimmed });
  return rec;
}

async function getCaptureState() {
  const settings = await getSettings();
  const { [STATE_KEY]: state } = await getStorage(STATE_KEY);
  const { [LEDGER_KEY]: ledger } = await getStorage(LEDGER_KEY);
  return {
    enabled: await isEnabled(settings),
    surface: captureSurface({ chromeFocused: true, idle: false }),
    lastCaptureAt: state?.lastCaptureAt ?? null,
    observationCount: Array.isArray(ledger) ? ledger.length : 0
  };
}

async function setEnabled(enabled) {
  const settings = await getSettings();
  await setStorage({ settings: { ...settings, screenshotCapture: !!enabled } });
  return { ok: true, enabled: !!enabled };
}

async function listObservations(limit = 100) {
  const { [LEDGER_KEY]: ledger } = await getStorage(LEDGER_KEY);
  const arr = Array.isArray(ledger) ? ledger : [];
  return { observations: arr.slice(-limit), total: arr.length };
}

// Guarded capture entrypoint. Phase 1: evaluates the enable gate, the timing
// decision, and the sensitive-data guard, then records the observation. The
// actual pixel grab + redaction + file write is T4 (marked below).
async function captureNow({ target = {}, event, clockState = 'clocked_out' } = {}) {
  const settings = await getSettings();
  if (!(await isEnabled(settings))) return { captured: false, reason: 'disabled' };

  const { [STATE_KEY]: state } = await getStorage(STATE_KEY);
  if (event) {
    const decision = decideCapture(
      event,
      { enabled: true, lastCaptureAt: state?.lastCaptureAt ?? null, lastContextKey: state?.lastContextKey ?? null },
      captureConfig(settings)
    );
    if (!decision.capture) return { captured: false, reason: decision.reason };
  }

  const guard = evaluateCapture(target, settings.sensitiveRules || []);
  if (guard.suppress) return { captured: false, reason: 'suppressed' };

  // TODO(T4): chrome.tabs.captureVisibleTab → apply guard.redactions → write to
  // settings.captureStoragePath (personal/org partition) → set captureRef.
  const rec = await recordObservation(
    { at: Date.now(), surface: target.surface || 'browser', host: target.host,
      appName: target.appName, title: target.title, kind: 'capture' },
    clockState
  );
  await setStorage({ [STATE_KEY]: { lastCaptureAt: rec.ts ? Date.parse(rec.ts) : Date.now(), lastContextKey: event?.contextKey ?? state?.lastContextKey ?? null } });

  return { captured: true, redactions: guard.redactions, surface: target.surface || 'browser', observation: rec };
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_CAPTURE_STATE': return getCaptureState();
    case 'SET_CAPTURE_ENABLED': return setEnabled(message?.enabled);
    case 'LIST_OBSERVATIONS': return listObservations(message?.limit);
    case 'CAPTURE_NOW': return captureNow(message);
    default: return undefined;
  }
}
