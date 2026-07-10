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
// (blackout/blur BEFORE persist, per the C2 privacy spine) → SILENT frame write.
// The C3 "companion is the real writer" architecture: the redacted frame is
// handed to the desktop companion over the bridge (CAPTURE_FRAME → the companion
// writes it under its own base dir and replies FILE_WRITTEN). When the companion
// is offline we fall back to OPFS (navigator.storage.getDirectory — available in
// MV3 service workers) under cortex/captures/<rel>. We NEVER use chrome.downloads
// for frames — it pops the OS Save-As dialog on every capture. If neither sink is
// available we record a context-only observation (no dialog, ever). Plus the
// event listeners (tab/window/focus) and the dwell + nightly-export alarms.
//
// C1 browser⇄OS handoff: the extension captures the visible tab ONLY when Chrome
// is the focused application. While Chrome is blurred the companion owns OS
// capture; the extension no-ops (no stale last-focused-tab grabs).
//
// Storage keys:
//   cortexLedger          — array of normalized observations (capped)
//   cortexCaptureState    — { lastCaptureAt, lastContextKey, lastExportDay }
//   pendingCortexExports  — nightly exports buffered while companion offline
// ════════════════════════════════════════════

import { getStorage, setStorage, getSettings } from './storageService.js';
import * as settingsService from './settingsService.js';
import { companionBridge } from './companionService.js';
import { decideCapture, captureSurface } from '../../utils/captureDecision.js';
import { evaluateCapture } from '../../utils/sensitiveDataGuard.js';
import { normalizeObservation, partitionOf } from '../../utils/observationLedger.js';
import { findActiveSession } from '../../utils/agentSessionStore.js';
import {
  computeRedactionRects,
  buildCaptureFilename,
  buildCaptureRelPath
} from '../../utils/captureArtifacts.js';
import {
  buildLedgerExport,
  pruneLedgerByAge
} from '../../utils/ledgerExport.js';

const LEDGER_KEY = 'cortexLedger';
const STATE_KEY = 'cortexCaptureState';
const PENDING_EXPORTS_KEY = 'pendingCortexExports';
const DEFAULT_LEDGER_CAP = 5000;

// C1 browser⇄OS handoff: is Chrome the focused application right now? Updated by
// chrome.windows.onFocusChanged and the companion's chromeFocused/chromeBlurred
// events (companionService emits those from APP_SWITCH). Default true so a fresh
// worker doesn't over-suppress before the first focus signal arrives.
let chromeFocused = true;
export function setChromeFocused(v) { chromeFocused = !!v; }
export function isChromeFocused() { return chromeFocused; }

export const DWELL_ALARM = 'cortex-dwell-tick';
export const NIGHTLY_EXPORT_ALARM = 'cortex-nightly-export';

// Serialize every ledger/capture-state mutation. Multiple chrome events fire
// near-simultaneously (onActivated + onUpdated on one navigation, dwell ticks,
// the nightly export) and unserialized read-modify-writes would drop ledger
// appends and defeat the min-gap guarantee.
let opChain = Promise.resolve();
function serialized(fn) {
  const run = opChain.then(fn, fn);
  opChain = run.then(() => undefined, () => undefined);
  return run;
}

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
// Public entrypoint is serialized; flows already inside `serialized` call the
// inner variant directly (re-entering the queue would deadlock).
export function recordObservation(raw, clockState = 'clocked_out', extra = {}) {
  return serialized(() => recordObservationInner(raw, clockState, extra));
}

// C11a: is an agent-controller span (agentSessions key) currently covering the
// target this observation is about? Cheap single storage read; returns the
// { controller, source } to stamp, or null. Never throws — attribution is
// additive best-effort, it must never break capture.
async function resolveController(raw) {
  try {
    const { agentSessions } = await getStorage('agentSessions');
    if (!Array.isArray(agentSessions) || !agentSessions.length) return null;
    const span = findActiveSession(agentSessions, {
      tabId: raw?.tabId ?? null,
      windowId: raw?.windowId ?? null,
      now: raw?.at ?? Date.now()
    });
    return span ? { controller: 'ai-agent', source: span.source } : null;
  } catch {
    return null;
  }
}

async function recordObservationInner(raw, clockState = 'clocked_out', extra = {}) {
  const rec = { ...normalizeObservation(raw), ...extra };
  rec.partition = partitionOf(rec, clockState);

  // Stamp controller attribution when an agent span covers this tab/window/
  // machine — unless the caller already stamped it explicitly (e.g. the
  // agent-session start/end signals stamp their own controller).
  if (rec.controller === undefined) {
    const ctrl = await resolveController(raw);
    if (ctrl) {
      rec.controller = ctrl.controller;
      rec.controllerSource = ctrl.source;
    }
  }

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
  // Route through settingsService so the merge/validation conventions (and
  // any settings-change side effects) stay in one place.
  await settingsService.handleMessage('UPDATE_SETTINGS', {
    settings: { screenshotCapture: !!enabled }
  });
  return { ok: true, enabled: !!enabled };
}

async function listObservations(limit = 100) {
  const { [LEDGER_KEY]: ledger } = await getStorage(LEDGER_KEY);
  const arr = Array.isArray(ledger) ? ledger : [];
  return { observations: arr.slice(-limit), total: arr.length };
}

// ── T4: pixel I/O ───────────────────────────────────────────

// C3 external-archive interface stub. The desktop companion is now the concrete
// external writer (it owns the real base dir); OPFS is the offline fallback.
export const externalArchive = {
  targets: () => ['companion', 'opfs'],
  archive: async () => ({ archived: 0, reason: 'writes-happen-inline-via-companion-or-opfs' })
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
  if (rects.length === 0) {
    // Fail CLOSED: a redact rule that yields no drawable region (typo'd
    // region name, 0%) must not persist an unredacted frame.
    throw new Error('redaction rules produced no regions — refusing unredacted persist');
  }
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

// Write a file into OPFS (origin-private file system) — silent, MV3 SW-available,
// no user prompt. Creates the nested directory tree as needed.
async function writeOpfsFile(path, dataUrl) {
  const dir0 = await navigator?.storage?.getDirectory?.();
  if (!dir0) throw new Error('OPFS unavailable');
  const blob = await (await fetch(dataUrl)).blob();
  const parts = String(path).split('/').filter(Boolean);
  const filename = parts.pop();
  let dir = dir0;
  for (const seg of parts) dir = await dir.getDirectoryHandle(seg, { create: true });
  const handle = await dir.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

// Persist one redacted frame SILENTLY and return the captureRef to store on the
// observation. Preferred sink is the companion (owns the real base dir); OPFS is
// the offline fallback (captureRef prefixed `opfs:`); if neither is available we
// return null so the caller records a context-only observation. NEVER a Save-As
// dialog. rec must carry { ts, surface, partition } for path building.
async function persistFrame(dataUrl, rec) {
  const filename = buildCaptureFilename(rec);
  const relPath = buildCaptureRelPath(rec, filename);

  if (companionBridge?.isConnected) {
    // Fire-and-forget: the observation is recorded optimistically; the companion
    // acks with FILE_WRITTEN (handled in companionService for logging).
    companionBridge.sendCaptureFrame(relPath, dataUrl);
    return relPath;
  }

  try {
    await writeOpfsFile(`cortex/captures/${relPath}`, dataUrl);
    return `opfs:${relPath}`;
  } catch (err) {
    console.warn('[captureService] OPFS frame write unavailable (recording context only):', err?.message);
    return null;
  }
}

// Route an automatic/background export (nightly ledger) to the companion for a
// silent real-filesystem write. When the companion is offline the export is
// buffered in storage and flushed on the next 'connected' event — a background
// write must never surface a Save-As dialog. Returns { sent } or { buffered }.
async function writeExport(filename, content) {
  if (companionBridge?.isConnected) {
    companionBridge.sendWriteExport(filename, content);
    return { sent: true };
  }
  const { [PENDING_EXPORTS_KEY]: prev } = await getStorage(PENDING_EXPORTS_KEY);
  const pending = Array.isArray(prev) ? prev : [];
  // De-dupe by filename so re-running an export for the same day replaces rather
  // than stacks the buffered copy.
  const next = pending.filter((e) => e?.filename !== filename);
  next.push({ filename, content, bufferedAt: Date.now() });
  await setStorage({ [PENDING_EXPORTS_KEY]: next });
  return { buffered: true };
}

// Flush exports buffered while the companion was offline. Called on the bridge
// 'connected' event. No-op (and preserves the buffer) if still disconnected.
export async function flushPendingCortexExports() {
  if (!companionBridge?.isConnected) return { flushed: 0 };
  const { [PENDING_EXPORTS_KEY]: prev } = await getStorage(PENDING_EXPORTS_KEY);
  const pending = Array.isArray(prev) ? prev : [];
  if (!pending.length) return { flushed: 0 };
  for (const e of pending) {
    if (e?.filename) companionBridge.sendWriteExport(e.filename, e.content);
  }
  await setStorage({ [PENDING_EXPORTS_KEY]: [] });
  return { flushed: pending.length };
}

async function activeTabTarget() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return null;
    // Fail closed: the Privacy panel promises incognito tabs are NEVER
    // captured — no frame, no observation.
    if (tab.incognito) return null;
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
// Serialized: see the opChain note above.
function captureNow(args) {
  return serialized(() => captureNowInner(args));
}

async function captureNowInner({ target = {}, event, clockState } = {}) {
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
    appName: target.appName, title: target.title,
    // Carried only for C11a controller resolution (normalizeObservation drops
    // them — they never land on the stored record).
    tabId: target.tabId ?? null, windowId: target.windowId ?? null
  };

  if (guard.suppress) {
    await recordObservationInner({ ...baseRaw, kind: 'context' }, clock, { suppressed: true });
    return { captured: false, reason: 'suppressed' };
  }

  // Pixel grab — browser surface only, and ONLY when Chrome is the focused
  // application (C1 handoff). captureSurface() returns 'browser' when Chrome is
  // focused, 'os' when it's blurred (companion owns capture then), 'none' idle.
  // While blurred we do NOT grab the (stale, last-focused) tab; we record a
  // context-only observation instead. Protected pages (chrome://, Web Store)
  // throw: also degrade to context-only. Capture the guarded tab's OWN window so
  // the frame can never come from a different window than the guard evaluated.
  const surface = captureSurface({ chromeFocused, idle: false });
  let captureRef = null;
  if (surface === 'browser' && (target.surface || 'browser') === 'browser') {
    try {
      let dataUrl = await chrome.tabs.captureVisibleTab(target.windowId ?? null, {
        format: 'jpeg',
        quality: settings.captureQuality ?? 60
      });
      if (guard.redactions.length) {
        dataUrl = await applyRedactions(dataUrl, guard.redactions, settings.captureRedactionStyle);
      }
      const provisional = {
        ts: new Date(baseRaw.at).toISOString(),
        surface: baseRaw.surface,
        partition: partitionOf({}, clock),
        title: baseRaw.title
      };
      captureRef = await persistFrame(dataUrl, provisional);
    } catch (err) {
      console.warn('[captureService] frame grab failed (recording context only):', err?.message);
    }
  }

  const rec = await recordObservationInner(
    { ...baseRaw, captureRef, kind: captureRef ? 'capture' : 'context' },
    clock,
    captureRef && guard.redactions.length ? { redacted: true } : {}
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
  // C1 handoff: the extension only captures the tab while Chrome is focused.
  // When blurred the companion owns OS capture — don't grab a stale tab frame.
  if (!chromeFocused) return;
  const target = await activeTabTarget();
  if (!target) return;
  await captureNow({ target, event: { type, at: Date.now(), contextKey } });
}

// Dwell tick (chrome.alarms minimum period is 30s — effective dwell resolution
// under MV3; decideCapture still compares against captureDwellSeconds).
export async function handleDwellTick() {
  const settings = await getSettings();
  if (!(await isEnabled(settings))) return;
  // C1 handoff: suppress dwell-tick tab grabs entirely while Chrome is blurred —
  // the companion captures the focused screen in that window.
  if (!chromeFocused) return;
  const target = await activeTabTarget();
  if (!target) return;
  const contextKey = `tab:${target.tabId}:${target.host || ''}`;
  await captureNow({ target, event: { type: 'dwell-tick', at: Date.now(), contextKey } });
}

// Nightly export (C4 → C6): write yesterday's ledger slice as a plain JSON
// file the harness cron reads, then apply C3 age retention to the ledger.
// Serialized so observations recorded mid-export aren't lost by the prune write.
export function runNightlyExport(dayOverride) {
  return serialized(() => runNightlyExportInner(dayOverride));
}

async function runNightlyExportInner(dayOverride) {
  const settings = await getSettings();
  const { [LEDGER_KEY]: ledger } = await getStorage(LEDGER_KEY);
  const arr = Array.isArray(ledger) ? ledger : [];
  const now = Date.now();
  const day = dayOverride || new Date(now - 86400000).toISOString().slice(0, 10);

  const { filename, content } = buildLedgerExport(arr, { day, now });
  // C4→C6: the ledger export the harness cron reads must land on the real
  // filesystem. Route it through the companion (silent write) — NOT chrome.downloads
  // (which pops a Save-As dialog). Buffer when the companion is offline.
  let exported = false;
  let buffered = false;
  if (content.counts.total > 0) {
    const res = await writeExport(filename, JSON.stringify(content, null, 1));
    exported = !!res.sent;
    buffered = !!res.buffered;
  }

  const pruned = pruneLedgerByAge(arr, settings.captureRetention, now);
  const updates = { [STATE_KEY]: { ...(await getStorage(STATE_KEY))[STATE_KEY], lastExportDay: day } };
  if (pruned.length !== arr.length) updates[LEDGER_KEY] = pruned;
  await setStorage(updates);

  return { exported, buffered, day, records: content.counts.total, prunedCount: arr.length - pruned.length };
}

// ── Plan 041 T1: companion handoff wiring ───────────────────
// The companion owns OS capture while the browser is blurred. We (a) fold its
// CAPTURE_TAKEN events into the observations ledger and (b) keep its config
// (enable + guard rules + retention) mirrored from extension settings.

// Only rules the OS surface can evaluate travel over the bridge — a host-only
// rule must not reach the companion (it could degenerate to match-nothing or,
// worse, match-everything depending on matcher semantics).
function companionRules(sensitiveRules) {
  return (sensitiveRules || []).filter(
    (r) => r?.when && ('appName' in r.when || 'appNameContains' in r.when || 'titleContains' in r.when)
  );
}

async function pushCaptureConfig(bridge) {
  const settings = await getSettings();
  const retention = settings.captureRetention || {};
  bridge.sendCaptureConfig({
    enabled: !!settings.screenshotCapture,
    interval_secs: settings.captureDwellSeconds ?? 10,
    min_gap_secs: settings.captureMinGapSeconds ?? 2,
    quality: settings.captureQuality ?? 60,
    sensitive_rules: companionRules(settings.sensitiveRules),
    retention: {
      personal: { maxAgeDays: retention.personal?.maxAgeDays ?? 30 },
      org: { maxAgeDays: retention.org?.maxAgeDays ?? 90 }
    }
  });
}

export function registerCompanionCaptureBridge(bridge) {
  bridge.on('captureTaken', (msg) => {
    const at = Date.parse(msg?.ts);
    if (!Number.isFinite(at)) return;
    const clockState = msg.partition === 'org' ? 'clocked_in' : 'clocked_out';
    const extra = {};
    if (msg.suppressed) extra.suppressed = true;
    if (msg.redacted) extra.redacted = true;
    recordObservation(
      {
        at,
        surface: 'os',
        appName: msg.app_name,
        title: msg.window_title,
        captureRef: msg.capture_ref || null,
        kind: msg.capture_ref ? 'capture' : 'context'
      },
      clockState,
      extra
    ).catch((err) => console.warn('[captureService] companion observation failed:', err?.message));
  });

  // C1 handoff: mirror Chrome focus from the companion's app-switch signal so the
  // dwell/context capture path stays silent while the user is in another app.
  bridge.on('chromeFocused', () => { chromeFocused = true; });
  bridge.on('chromeBlurred', () => { chromeFocused = false; });

  // Mirror config on connect, flush any exports buffered while offline, and
  // re-push config whenever the relevant settings change.
  bridge.on('connected', () => {
    pushCaptureConfig(bridge).catch(() => {});
    flushPendingCortexExports().catch(() => {});
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const prev = changes.settings.oldValue || {};
    const next = changes.settings.newValue || {};
    if (
      prev.screenshotCapture !== next.screenshotCapture ||
      JSON.stringify(prev.sensitiveRules) !== JSON.stringify(next.sensitiveRules) ||
      prev.captureDwellSeconds !== next.captureDwellSeconds ||
      prev.captureQuality !== next.captureQuality
    ) {
      pushCaptureConfig(bridge).catch(() => {});
    }
  });
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
      // Chrome blurred → companion owns OS capture (C1 handoff). Flag it so the
      // dwell/context path stops grabbing the (now stale) last-focused tab, and
      // record the surface transition so the ledger shows it.
      chromeFocused = false;
      const settings = await getSettings();
      if (!(await isEnabled(settings))) return;
      await recordObservation(
        { at: Date.now(), surface: 'desktop', kind: 'signal', title: 'chrome-blurred' },
        await currentClockState()
      );
      return;
    }
    // A real window gained focus → Chrome is the foreground app again.
    chromeFocused = true;
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
