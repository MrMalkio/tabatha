// ════════════════════════════════════════════
// Tabatha — Capture Service (Cortex C1/C2/C3/C4, Plan 040 Phase 1 T2+T4)
//
// The thin chrome-facing shell for adaptive capture. ALL decision logic lives
// in pure, unit-tested helpers (src/utils/): captureDecision (when + surface),
// sensitiveDataGuard (suppress + redact), captureArtifacts (redaction rects +
// partitioned paths), observationLedger (normalize + partition), ledgerExport
// (nightly export + retention pruning). This service only orchestrates them
// and touches chrome APIs/storage.
//
// T4 adds the real I/O: chrome.tabs.captureVisibleTab → canvas redaction pass
// (blackout/blur BEFORE persist, per the C2 privacy spine) → frame write via
// chrome.downloads under the Downloads-relative captureStoragePath (MV3 cannot
// write arbitrary filesystem paths; the desktop companion is the future home
// of true external-archive writes — see externalArchive stub below), plus the
// event listeners (tab/window/focus) and the dwell + nightly-export alarms.
//
// Storage keys:
//   cortexLedger        — array of normalized observations (capped)
//   cortexCaptureState  — { lastCaptureAt, lastContextKey, lastExportDay }
// ════════════════════════════════════════════

import { getStorage, setStorage, getSettings } from './storageService.js';
import { decideCapture, captureSurface } from '../../utils/captureDecision.js';
import { evaluateCapture } from '../../utils/sensitiveDataGuard.js';
import { normalizeObservation, partitionOf } from '../../utils/observationLedger.js';
import {
  computeRedactionRects,
  buildCaptureFilename,
  buildCapturePath
} from '../../utils/captureArtifacts.js';
import {
  buildLedgerExport,
  buildExportRelPath,
  pruneLedgerByAge
} from '../../utils/ledgerExport.js';

const LEDGER_KEY = 'cortexLedger';
const STATE_KEY = 'cortexCaptureState';
const DEFAULT_LEDGER_CAP = 5000;

export const DWELL_ALARM = 'cortex-dwell-tick';
export const NIGHTLY_EXPORT_ALARM = 'cortex-nightly-export';

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

// C4 partition input: everything while clocked in (incl. break) is org time.
async function currentClockState() {
  try {
    const { clockSession } = await getStorage('clockSession');
    if (clockSession?.active) return clockSession.onBreak ? 'on_break' : 'clocked_in';
  } catch { /* default personal */ }
  return 'clocked_out';
}

// Append one normalized observation to the local ledger (capped, FIFO).
// `extra` lets the caller stamp shell-level flags the pure normalizer doesn't
// own (e.g. suppressed: true — migration 022 has a column for it).
export async function recordObservation(raw, clockState = 'clocked_out', extra = {}) {
  const rec = { ...normalizeObservation(raw), ...extra };
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
    lastExportDay: state?.lastExportDay ?? null,
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

// ── T4: pixel I/O ───────────────────────────────────────────

// C3 external-archive interface stub. Local (Downloads) is the only concrete
// target in Phase 1; Drive/OneDrive/HDD adapters and true arbitrary-path
// writes arrive with the companion handoff (Phase 2+).
export const externalArchive = {
  targets: () => ['local-downloads'],
  archive: async () => ({ archived: 0, reason: 'no-external-target-in-phase-1' })
};

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// C2: apply redaction regions to the frame BEFORE it is persisted anywhere.
// 'blackout' (default) is safest; 'blur' preserves rough layout context.
async function applyRedactions(dataUrl, redactions, style = 'blackout') {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const rects = computeRedactionRects(redactions, { width: bitmap.width, height: bitmap.height });
  for (const r of rects) {
    if (style === 'blur' && typeof ctx.filter === 'string') {
      ctx.save();
      ctx.filter = 'blur(16px)';
      ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
  }
  return blobToDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 }));
}

// Erase our frame downloads from the shelf/history once complete (file stays
// on disk). Best-effort: capture must never break on shelf cosmetics.
const pendingErase = new Set();
function eraseWhenComplete(downloadId) {
  pendingErase.add(downloadId);
  try {
    chrome.downloads.onChanged.addListener(function onChanged(delta) {
      if (!pendingErase.has(delta.id)) return;
      if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted') {
        pendingErase.delete(delta.id);
        chrome.downloads.onChanged.removeListener(onChanged);
        if (delta.state.current === 'complete') {
          try { chrome.downloads.erase({ id: delta.id }); } catch { /* cosmetic */ }
        }
      }
    });
  } catch { /* cosmetic */ }
}

// Write one frame under Downloads/<captureStoragePath>/<partition>/<YYYY-MM>/.
async function writeFrame(dataUrl, rec, settings) {
  const filename = buildCaptureFilename(rec);
  const relPath = buildCapturePath(settings.captureStoragePath, rec, filename);
  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename: relPath,
    conflictAction: 'uniquify',
    saveAs: false
  });
  eraseWhenComplete(downloadId);
  return relPath;
}

async function activeTabTarget() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return null;
    let host = null;
    try { host = new URL(tab.url).hostname; } catch { /* chrome:// etc. */ }
    return {
      surface: 'browser', host, url: tab.url, title: tab.title,
      tabId: tab.id, windowId: tab.windowId
    };
  } catch {
    return null;
  }
}

// Guarded capture entrypoint. Evaluates the enable gate, the timing decision,
// and the sensitive-data guard; then (T4) grabs pixels, applies redactions,
// writes the frame, and records the observation with its captureRef.
// Suppressed frames still record a context-only observation (suppressed: true)
// so the ledger keeps "was in a sensitive context" without any pixels.
async function captureNow({ target = {}, event, clockState } = {}) {
  const settings = await getSettings();
  if (!(await isEnabled(settings))) return { captured: false, reason: 'disabled' };

  const clock = clockState || (await currentClockState());
  const { [STATE_KEY]: state } = await getStorage(STATE_KEY);
  if (event) {
    const decision = decideCapture(
      event,
      { enabled: true, lastCaptureAt: state?.lastCaptureAt ?? null, lastContextKey: state?.lastContextKey ?? null },
      captureConfig(settings)
    );
    if (!decision.capture) {
      // Still advance the context key so the NEXT event diffs correctly.
      if (event.contextKey && event.contextKey !== state?.lastContextKey) {
        await setStorage({ [STATE_KEY]: { ...state, lastContextKey: event.contextKey } });
      }
      return { captured: false, reason: decision.reason };
    }
  }

  const guard = evaluateCapture(target, settings.sensitiveRules || []);
  const baseRaw = {
    at: Date.now(), surface: target.surface || 'browser', host: target.host,
    appName: target.appName, title: target.title
  };

  if (guard.suppress) {
    await recordObservation({ ...baseRaw, kind: 'context' }, clock, { suppressed: true });
    return { captured: false, reason: 'suppressed' };
  }

  // Pixel grab — browser surface only in Phase 1 (companion OS capture is the
  // Phase 2 handoff). Protected pages (chrome://, Web Store) throw: degrade to
  // a context-only observation rather than failing the event.
  let captureRef = null;
  if ((target.surface || 'browser') === 'browser') {
    try {
      let dataUrl = await chrome.tabs.captureVisibleTab(null, {
        format: 'jpeg',
        quality: settings.captureQuality ?? 60
      });
      if (guard.redactions.length) {
        dataUrl = await applyRedactions(dataUrl, guard.redactions, settings.captureRedactionStyle);
      }
      const provisional = {
        ts: new Date(baseRaw.at).toISOString(),
        surface: baseRaw.surface,
        partition: partitionOf({}, clock)
      };
      captureRef = await writeFrame(dataUrl, provisional, settings);
    } catch (err) {
      console.warn('[captureService] frame grab failed (recording context only):', err?.message);
    }
  }

  const rec = await recordObservation(
    { ...baseRaw, captureRef, kind: captureRef ? 'capture' : 'context' },
    clock,
    guard.redactions.length ? { redacted: true } : {}
  );
  await setStorage({
    [STATE_KEY]: {
      ...state,
      lastCaptureAt: baseRaw.at,
      lastContextKey: event?.contextKey ?? state?.lastContextKey ?? null
    }
  });

  return { captured: true, captureRef, redactions: guard.redactions, surface: baseRaw.surface, observation: rec };
}

// ── T4: event wiring ────────────────────────────────────────

async function onContextEvent(type, contextKey) {
  const settings = await getSettings();
  if (!(await isEnabled(settings))) return;
  const target = await activeTabTarget();
  if (!target) return;
  await captureNow({ target, event: { type, at: Date.now(), contextKey } });
}

// Dwell tick (chrome.alarms minimum period is 30s — effective dwell resolution
// under MV3; decideCapture still compares against captureDwellSeconds).
export async function handleDwellTick() {
  const settings = await getSettings();
  if (!(await isEnabled(settings))) return;
  const target = await activeTabTarget();
  if (!target) return;
  const contextKey = `tab:${target.tabId}:${target.host || ''}`;
  await captureNow({ target, event: { type: 'dwell-tick', at: Date.now(), contextKey } });
}

// Nightly export (C4 → C6): write yesterday's ledger slice as a plain JSON
// file the harness cron reads, then apply C3 age retention to the ledger.
export async function runNightlyExport(dayOverride) {
  const settings = await getSettings();
  const { [LEDGER_KEY]: ledger } = await getStorage(LEDGER_KEY);
  const arr = Array.isArray(ledger) ? ledger : [];
  const now = Date.now();
  const day = dayOverride || new Date(now - 86400000).toISOString().slice(0, 10);

  const { filename, content } = buildLedgerExport(arr, { day, now });
  let exported = false;
  if (content.counts.total > 0) {
    const relPath = buildExportRelPath(settings.captureStoragePath, filename);
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(content, null, 1))}`;
    const downloadId = await chrome.downloads.download({
      url: dataUrl, filename: relPath, conflictAction: 'overwrite', saveAs: false
    });
    eraseWhenComplete(downloadId);
    exported = true;
  }

  const pruned = pruneLedgerByAge(arr, settings.captureRetention, now);
  const updates = { [STATE_KEY]: { ...(await getStorage(STATE_KEY))[STATE_KEY], lastExportDay: day } };
  if (pruned.length !== arr.length) updates[LEDGER_KEY] = pruned;
  await setStorage(updates);

  return { exported, day, records: content.counts.total, prunedCount: arr.length - pruned.length };
}

let listenersRegistered = false;
export function registerCaptureListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  chrome.tabs.onActivated.addListener((activeInfo) => {
    onContextEvent('tab-activated', `tab:${activeInfo.tabId}`);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab?.active) {
      let host = '';
      try { host = new URL(tab.url).hostname; } catch { /* ignore */ }
      onContextEvent('tab-activated', `tab:${tabId}:${host}`);
    }
  });

  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // Chrome blurred → companion owns capture (C1 handoff; Phase 2 sends a
      // WS signal). Record the surface transition so the ledger shows it.
      const settings = await getSettings();
      if (!(await isEnabled(settings))) return;
      await recordObservation(
        { at: Date.now(), surface: 'desktop', kind: 'signal', title: 'chrome-blurred' },
        await currentClockState()
      );
      return;
    }
    onContextEvent('window-focus-changed', `win:${windowId}`);
  });

  // Focus/intent context changes, zone-safely observed via storage writes
  // (no focusService edits): a focusEngine change is a capture-worthy moment.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.focusEngine) return;
    const activeId = changes.focusEngine.newValue?.activeFocusId || 'none';
    if (activeId !== (changes.focusEngine.oldValue?.activeFocusId || 'none')) {
      onContextEvent('focus-changed', `focus:${activeId}`);
    }
  });

  // Alarms: dwell heartbeat + nightly export (handlers dispatched by
  // alarmService). Creation is idempotent.
  try {
    chrome.alarms.create(DWELL_ALARM, { periodInMinutes: 0.5 });
    const next = new Date();
    next.setHours(3, 30, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    chrome.alarms.create(NIGHTLY_EXPORT_ALARM, { when: next.getTime(), periodInMinutes: 1440 });
  } catch (err) {
    console.warn('[captureService] alarm registration failed:', err?.message);
  }
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_CAPTURE_STATE': return getCaptureState();
    case 'SET_CAPTURE_ENABLED': return setEnabled(message?.enabled);
    case 'LIST_OBSERVATIONS': return listObservations(message?.limit);
    case 'CAPTURE_NOW': return captureNow(message);
    case 'RUN_LEDGER_EXPORT': return runNightlyExport(message?.day);
    default: return undefined;
  }
}
