// ════════════════════════════════════════════
// Tabatha — clockService (Plan 023 Task 04d)
// Wraps the existing createClockService() factory and adds the
// standardised handleMessage() entry point for the router.
//
// Handlers owned:
//   CLOCK_IN, CLOCK_OUT, TOGGLE_BREAK,
//   GET_CLOCK_STATUS, GET_CLOCK_HISTORY, GET_LAST_SESSION
// ════════════════════════════════════════════

import { getStorage, setStorage } from './storageService.js';
import { broadcastToExtension, broadcastAll } from './notificationService.js';
import { getOwnAbandonedStints } from './awarenessService.js';
import { createClockService } from '../clock.js';
import * as timeTracker from '../../services/timeTracking.js';
import { detectGap } from '../../utils/gapDetection.js';
import { shortfallsToPrompt, shortfallKey, fmtMinutes } from '../../utils/scheduleModel.js';

// ── NB-09: offline-gap detector constants ──
export const ALIVE_HEARTBEAT_ALARM = 'alive-heartbeat';
const DEFAULT_GAP_THRESHOLD_MINUTES = 10;
// A pending _idlePrompt older than this is considered abandoned and may be
// replaced — prevents a never-answered prompt from deadlocking the machinery.
const IDLE_PROMPT_STALE_MS = 30 * 60000;

// ── Injected dependencies (set via configureClockService) ──
let deps = {};
let idleListenerRegistered = false;
let userIdleSince = null;
let gapCheckInFlight = false;

/**
 * Wire up cross-service deps that can't be imported directly
 * (avoids circular imports with focusService / companionService).
 *
 * Expected shape:
 *   { companionBridge, fireWebhook, getFocusEngine, setFocusEngine }
 */
export function configureClockService(injected = {}) {
  deps = { ...deps, ...injected };
}

export function registerClockServiceListeners() {
  if (idleListenerRegistered) return;
  idleListenerRegistered = true;
  applyIdleDetectionInterval();
  chrome.idle.onStateChanged.addListener(handleIdleStateChanged);
  // QA fix: re-apply the detection interval whenever the threshold setting
  // changes, so "Idle threshold (minutes)" takes effect immediately.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) applyIdleDetectionInterval();
  });
  // Plan 036: auto clock-in when Chrome (re)launches, if configured.
  chrome.runtime.onStartup.addListener(() => {
    maybeAutoClockIn('chrome_open');
    // NB-09: browser relaunch is the classic offline-gap wake event.
    checkOfflineGap('startup').catch(() => {});
  });

  // NB-09: 1-minute alive heartbeat. The alarm tick both persists
  // `_lastAliveAt` and — because Chrome delivers missed alarms on wake —
  // doubles as the wake-event gap check after sleep/SW death.
  chrome.alarms.create(ALIVE_HEARTBEAT_ALARM, { periodInMinutes: 1 });
  // SW module init is itself a wake event (MV3 workers restart constantly):
  // check the gap immediately rather than waiting up to a minute.
  checkOfflineGap('sw_init').catch(() => {});
}

// NB-09: alive-heartbeat alarm handler (routed from alarmService).
export async function handleAliveHeartbeat() {
  return checkOfflineGap('heartbeat');
}

/**
 * NB-09 — Offline-gap detector.
 * Compares the persisted `_lastAliveAt` heartbeat against now. If the service
 * worker was dead longer than the configured threshold while a focus was
 * ACTIVELY accruing time (focusState 'active' + lastResumedAt set), the focus
 * is retro-paused AT THE GAP START (time is credited only up to the last
 * heartbeat) and the user is prompted through the EXISTING _idlePrompt /
 * Welcome-Back machinery (payload extended with source:'gap' + the gap span).
 *
 * Companion consultation: if the desktop companion shows the user was active
 * off-Chrome, we do NOT auto-trim — the prompt still surfaces as info with a
 * credit option, but the focus keeps running.
 *
 * Single-flight: reuses the _idlePrompt pending marker as the guard (sleep /
 * wake commonly also fires Chrome's native idle event — the two paths must
 * not stack prompts), plus an in-module flag against concurrent checks.
 */
export async function checkOfflineGap(trigger = 'wake') {
  if (gapCheckInFlight) return null;
  gapCheckInFlight = true;
  try {
    const now = Date.now();
    const { _lastAliveAt } = await getStorage('_lastAliveAt');
    // Refresh the heartbeat FIRST so a crash below never re-detects this gap.
    await setStorage({ _lastAliveAt: now });

    const settings = await getSettings();
    const thresholdMs = Math.max(1, Number(settings.offlineGapThresholdMinutes) || DEFAULT_GAP_THRESHOLD_MINUTES) * 60000;

    const engine = await deps.getFocusEngine?.();
    const activeId = engine?.activeFocusId;
    const active = activeId ? engine.items[activeId] : null;

    const verdict = detectGap(_lastAliveAt ?? null, now, thresholdMs, active?.focusState || null);
    if (!verdict.shouldPrompt) return null;
    if (!active?.lastResumedAt) return null; // no live portion accruing — nothing to retro-trim
    if (active.offDevice) return null;       // user flagged this work as intentionally off-Chrome

    // Single-flight _idlePrompt guard — never stack a second prompt.
    const { _idlePrompt } = await getStorage('_idlePrompt');
    if (_idlePrompt && (now - (_idlePrompt.ts || 0)) < IDLE_PROMPT_STALE_MS) return null;

    // Companion / meeting / other-profile suppressors: active off-Chrome
    // during the gap means the accrued time is probably legitimate.
    let suppressors = [];
    try { suppressors = await collectIdleSuppressors(); } catch { /* fail-open: no suppressors */ }
    const activeElsewhere = suppressors.length > 0;

    const resumedMs = new Date(active.lastResumedAt).getTime();
    // The focus may have been resumed AFTER the last heartbeat (up to ~59s of
    // skew) — never pause before it was resumed.
    const pauseAtMs = Math.max(verdict.pauseAt, Number.isFinite(resumedMs) ? resumedMs : verdict.pauseAt);
    let trimmed = false;
    let trimmedMs = 0;

    if (!activeElsewhere) {
      // Retro-pause at the gap start: credit elapsed only up to _lastAliveAt.
      const credit = Math.max(0, pauseAtMs - resumedMs);
      active.elapsedMs = (active.elapsedMs || 0) + credit;
      active.lastResumedAt = null;
      active.focusState = 'paused';
      active.pausedAt = new Date(pauseAtMs).toISOString();
      active.pausedReason = 'offline_gap';
      if (active.funnelStage === 'addressing') active.funnelStage = 'focus';
      trimmedMs = Math.max(0, now - pauseAtMs);
      trimmed = true;

      // System checkpoint. Text starts with "Paused" on purpose: the UI's
      // remove-last-pause splice and hasPause detection both match /^Paused/.
      if (!active.checkpoint) active.checkpoint = [];
      active.checkpoint.push({
        id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        text: `Paused (offline gap ~${Math.round(verdict.gapMs / 60000)}m)`,
        progressLevel: 'none',
        progressValue: 0,
        createdAt: new Date().toISOString(),
        focusId: active.id,
        elapsedAtMs: active.elapsedMs,
        triggeredBy: 'system'
      });

      await deps.setFocusEngine?.(engine);
      broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
    }

    // Route through the EXISTING idle-prompt state machine — no parallel path.
    const sinceIso = new Date(pauseAtMs).toISOString();
    const promptId = `gap_${activeId}_${now}`;
    await setStorage({
      _idlePrompt: {
        id: promptId, focusId: activeId, focusLabel: active.label,
        since: sinceIso, ts: now,
        source: 'gap', gapMs: verdict.gapMs, trimmed, trimmedMs
      }
    });
    broadcastAll({
      type: 'IDLE_PROMPT',
      id: promptId,
      focusId: activeId,
      focusLabel: active.label,
      since: sinceIso,
      source: 'gap',
      gapMs: verdict.gapMs,
      trimmed,
      trimmedMs,
      suppressors
    });

    try {
      const { tabathaLogs } = await getStorage('tabathaLogs');
      const logs = tabathaLogs || [];
      logs.push({ type: 'offline_gap', trigger, gapMs: verdict.gapMs, trimmed, suppressors, ts: new Date().toISOString() });
      await setStorage({ tabathaLogs: logs.slice(-500) });
    } catch { /* non-critical */ }

    return { gapMs: verdict.gapMs, trimmed, trimmedMs };
  } finally {
    gapCheckInFlight = false;
  }
}

// QA fix: the "Idle threshold (minutes)" setting now actually drives Chrome's
// idle detection interval (was hardcoded to 60s, making the setting inert, so
// the prompt always fired at ~60s regardless of the configured value). Chrome's
// minimum interval is 15s.
async function applyIdleDetectionInterval() {
  try {
    const settings = await getSettings();
    const mins = settings.idleThresholdMinutes ?? 5;
    chrome.idle.setDetectionInterval(Math.max(15, Math.round(mins * 60)));
  } catch {
    chrome.idle.setDetectionInterval(60);
  }
}

/**
 * Plan 036 (#187): auto clock-in on a configured trigger.
 *   trigger 'chrome_open' — fired from chrome.runtime.onStartup (default)
 *   trigger 'os_unlock'   — fired from the companion idle→active transition
 * No-op unless autoClockInEnabled is set and the trigger matches the user's
 * choice. Never double-clocks an already-active session.
 */
export async function maybeAutoClockIn(trigger) {
  try {
    const settings = await getSettings();
    if (!settings.autoClockInEnabled) return;
    if ((settings.autoClockInTrigger || 'chrome_open') !== trigger) return;

    const { clockSession } = await getStorage('clockSession');
    if (clockSession?.active) return; // already clocked in

    // NB-05: never SILENTLY auto-clock-in over an unresolved abandoned shift.
    // The visible clock-in paths surface the AbandonedStintsModal, but this
    // headless trigger bypasses the UI — so if any of the user's OWN same-class
    // stints are abandoned, suppress the silent clock-in and notify instead, so
    // they resolve it on their next visible interaction.
    const abandoned = await getOwnAbandonedStints();
    if (abandoned.length > 0) {
      try {
        chrome.notifications.create('abandoned-stint-blocked-autoclockin', {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Tabatha — unfinished shift',
          message: `Auto clock-in paused: ${abandoned.length} abandoned shift${abandoned.length === 1 ? '' : 's'} need${abandoned.length === 1 ? 's' : ''} resolving. Open Tabatha to fix the end time or discard, then clock in.`,
          requireInteraction: true
        });
      } catch { /* notifications best-effort */ }
      broadcastToExtension({ type: 'AUTO_CLOCK_IN_SUPPRESSED', reason: 'abandoned_stints', count: abandoned.length });
      return;
    }

    const result = await clock.clockIn();
    if (deps.companionBridge?.isConnected) deps.companionBridge.sendClockIn();
    if (deps.fireWebhook) deps.fireWebhook('clock_in', { auto: true, trigger });
    deps.notifyAwarenessStateChange?.();
    broadcastToExtension({ type: 'AUTO_CLOCK_IN', trigger });
    return result;
  } catch { /* auto clock-in is best-effort */ }
}

// ── Core clock instance ──
const clock = createClockService(getStorage, setStorage, broadcastToExtension);

// ── Idle auto-break coordination ──
// alarmService writes this flag from the `idle-auto-break` handler;
// background.js's idle.onStateChanged 'active' branch consumes it to
// decide whether to auto-resume from break.
let idleAutoBreakApplied = false;

export function consumeIdleAutoBreakApplied() {
  const v = idleAutoBreakApplied;
  idleAutoBreakApplied = false;
  return v;
}

export function resetIdleAutoBreakApplied() {
  idleAutoBreakApplied = false;
}

// idle-auto-break alarm handler. Routed from alarmService when the
// 5-minute idle alarm fires. If the user is still idle and clocked-in
// without an active break, toggle to break.
export async function handleIdleAutoBreak() {
  const state = await chrome.idle.queryState(60);
  if (state !== 'idle' && state !== 'locked') return;

  const { clockSession } = await getStorage('clockSession');
  if (clockSession?.active && !clockSession?.onBreak) {
    await clock.toggleBreak();
    idleAutoBreakApplied = true;
    broadcastToExtension({ type: 'AUTO_BREAK', reason: 'idle_5min' });
  }

  // Plan 036: idle-prompt fallback. If the user never answered the IDLE_PROMPT,
  // hard-pause the focus now so tracked time stops accruing while they're away.
  try {
    const { _idlePrompt } = await getStorage('_idlePrompt');
    if (_idlePrompt?.focusId) {
      await hardPauseActiveFocus('idle_timeout');
      await setStorage({ _idlePrompt: null });
      broadcastAll({ type: 'IDLE_PROMPT_RESOLVED', id: _idlePrompt.id, resolution: 'timeout' });
    }
  } catch { /* non-critical */ }
}

// ── Public cross-service helpers ──

/**
 * End the active break (if any).
 * Called by focusService.RESUME_FOCUS to auto-resume clock when
 * the user switches back to working.
 */
export async function endBreakIfActive() {
  const { clockSession } = await getStorage('clockSession');
  if (clockSession?.active && clockSession?.onBreak) {
    return clock.toggleBreak();
  }
  return null;
}

/**
 * FIX-02 / FIX-05: apply an inbound companion CLOCK_STATE to the `clockSession`
 * key that Home (src/home/index.jsx) actually reads.
 *
 * The companion broadcasts a snake_case payload:
 *   { active, on_break, clocked_in_at, break_started_at, total_break_ms }
 * The extension's canonical session (see src/background/clock.js) is camelCase:
 *   { active, clockedInAt, clockedOutAt, onBreak, breakStartedAt, breaks[] }
 *
 * This writer maps the former into the latter and persists it. It is the
 * COMPANION-ORIGIN writer: it deliberately does NOT call sendClockIn/sendClockOut
 * (or any companionBridge send*), because doing so would echo the state back to
 * the companion and create an infinite clock-sync loop.
 *
 * The mapping is robust to missing fields: an empty/absent payload yields an
 * inactive session rather than throwing. `total_break_ms` is preserved as a
 * synthetic completed break so elapsed/work-time math downstream stays correct.
 */
export async function setSessionFromCompanion(companionClock) {
  const c = companionClock || {};
  const active = !!c.active;
  const onBreak = !!c.on_break;

  // Preserve the existing breaks[] shape used by clock.js so any consumer that
  // sums break durations (getLastSession / getClockHistory) still works. We
  // don't know individual break start/end times from the companion, so we model
  // total_break_ms as a single synthetic completed break anchored to clock-in.
  const clockedInAt = c.clocked_in_at || null;
  const breaks = [];
  const totalBreakMs = Number(c.total_break_ms) || 0;
  if (totalBreakMs > 0 && clockedInAt) {
    const start = new Date(clockedInAt).getTime();
    if (Number.isFinite(start)) {
      breaks.push({
        start: new Date(start).toISOString(),
        end: new Date(start + totalBreakMs).toISOString(),
        synthetic: true
      });
    }
  }

  const session = {
    active,
    clockedInAt,
    clockedOutAt: active ? null : (c.clocked_out_at || null),
    onBreak,
    breakStartedAt: onBreak ? (c.break_started_at || null) : null,
    breaks
  };

  await setStorage({ clockSession: session });
  broadcastToExtension({ type: 'CLOCK_SESSION_UPDATED' });
  return session;
}

/**
 * Forward a clock event to the desktop companion.
 * Called by companionService (Phase 5).
 */
export function sendClockEventToCompanion(event) {
  if (deps.companionBridge?.isConnected) {
    switch (event) {
      case 'clock_in':
        deps.companionBridge.sendClockIn();
        break;
      case 'clock_out':
        deps.companionBridge.sendClockOut();
        break;
      case 'toggle_break':
        deps.companionBridge.sendToggleBreak();
        break;
    }
  }
}

// Re-export for callers that still reference the legacy factory methods
// (idle handler, alarm handler) during the transition period.
export const toggleBreak = () => clock.toggleBreak();
export const getClockStatus = () => clock.getClockStatus();

// ════════════════════════════════════════════
// Plan 036 — Smart Idle Engine
// ════════════════════════════════════════════

/**
 * Build the 3-layer meeting verdict (challenge-response Resolution 2). Scans
 * ALL open tabs (not just the active/audible one) so muted, backgrounded
 * meetings still suppress idle, then falls back to the desktop companion's
 * active app. Returns { detected, source?, ... }.
 */
export async function isUserInMeeting() {
  try {
    const settings = await getSettings();
    const meetingDomains = settings.meetingDomains?.length
      ? settings.meetingDomains
      : ['meet.google.com', 'zoom.us', 'teams.microsoft.com', 'teams.live.com', 'webex.com', 'app.webex.com'];
    const tabs = await getTabData();

    // Grace window bounds the weakest "muted, backgrounded meeting" signal so a
    // forgotten meeting tab can't disable idle detection forever.
    const graceMs = (settings.meetingIdleGraceMinutes ?? 60) * 60000;

    // L1 (domain present) + L2 (live-call signals) — scan every tracked tab.
    for (const [tabId, tabData] of Object.entries(tabs)) {
      const url = (tabData?.url || '').toLowerCase();
      if (!meetingDomains.some(d => url.includes(d))) continue;
      try {
        const chromeTab = await chrome.tabs.get(Number(tabId));
        const titleSignals = /\b(meeting|call|huddle|presenting|in call)\b/i.test(chromeTab?.title || '');
        const isAudible = chromeTab?.audible === true;      // unmuted / someone speaking
        const isActiveTab = chromeTab?.active === true;      // user is looking at it
        const openDuration = Date.now() - (tabData.openedAt ? new Date(tabData.openedAt).getTime() : Date.now());
        // "Probably in a muted call I joined recently" — only counts WITHIN the
        // grace window. After it, a stale tab no longer suppresses idle.
        const recentMutedCall = openDuration > 120_000 && openDuration < graceMs;
        if (isAudible || titleSignals || isActiveTab || recentMutedCall) {
          return { detected: true, source: 'browser', tabId, domain: url };
        }
      } catch { /* tab may have closed between query and get */ }
    }

    // L3 — companion app context (zoom.exe, ms-teams.exe, …).
    const companion = deps.companionBridge;
    const activeApp = companion?.getActiveApp?.();
    if (activeApp) {
      const appName = (activeApp.name || '').toLowerCase();
      const meetingApps = ['zoom', 'teams', 'webex', 'slack huddle', 'meet'];
      if (meetingApps.some(m => appName.includes(m))) {
        return { detected: true, source: 'companion', app: activeApp.name };
      }
    }
  } catch { /* fail-open: no meeting detected */ }
  return { detected: false };
}

/**
 * Collect reasons NOT to pause the global focus (challenge-response
 * Resolution 1). Checks other browser profiles, the desktop companion, and
 * active meetings. Additive/benign: a false-positive only keeps the user
 * "active" slightly longer; it never causes a pause.
 */
export async function collectIdleSuppressors() {
  const suppressors = [];
  const settings = await getSettings();

  // Other browser profiles of the same user, via the awareness cache.
  try {
    const { _otherProfiles } = await getStorage('_otherProfiles');
    const activeProfile = (_otherProfiles || []).find(p => {
      if (!p.online) return false;
      // Prefer the explicit idle_state published in metadata (Plan 036). Fall
      // back to clock/focus signals for older clients that don't publish it.
      if (p.idle_state) return p.idle_state === 'active';
      return p.focus_state === 'active' || p.clock_state === 'clocked_in';
    });
    if (activeProfile) {
      suppressors.push({ type: 'profile', name: activeProfile.profile_name || 'another profile' });
    }
  } catch { /* cache miss — no profile suppressor */ }

  // Desktop companion: user active in another app within the grace window.
  const companion = deps.companionBridge;
  const graceMs = (settings.companionIdleGraceMinutes ?? 5) * 60000;
  if (companion?.isRecentlyActive?.(graceMs)) {
    suppressors.push({ type: 'companion', app: companion.getActiveApp?.()?.name || null });
  }

  // Active meeting (muted/backgrounded calls included).
  const meeting = await isUserInMeeting();
  if (meeting.detected) {
    suppressors.push({ type: 'meeting', source: meeting.source });
  }

  return suppressors;
}

// Immediately accumulate elapsed time and pause the active focus.
export async function hardPauseActiveFocus(reason) {
  const engine = await deps.getFocusEngine?.();
  if (!engine?.activeFocusId) return null;
  const active = engine.items[engine.activeFocusId];
  if (active?.focusState !== 'active') return null;
  // Off-device focuses are exempt from all idle-triggered mutations — the user
  // deliberately flagged this work as happening outside Chrome.
  if (active.offDevice) return null;
  if (active.lastResumedAt) {
    active.elapsedMs = (active.elapsedMs || 0) + (Date.now() - new Date(active.lastResumedAt).getTime());
    active.lastResumedAt = null;
  }
  active.focusState = 'paused';
  active.pausedAt = new Date().toISOString();
  if (reason) active.pausedReason = reason;
  if (active.funnelStage === 'addressing') active.funnelStage = 'focus';
  await deps.setFocusEngine?.(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine.activeFocusId;
}

export async function handleIdleStateChanged(newState) {
  if (newState === 'idle' || newState === 'locked') {
    // Step 1: always publish THIS profile's idle verdict so other profiles can
    // suppress their own pausing (profile-local state is informational only).
    deps.setAwarenessIdleState?.(newState);

    // Step 2: before touching the global focus, is the user active anywhere?
    const suppressors = await collectIdleSuppressors();
    if (suppressors.length > 0) {
      console.log('[idle] Suppressed — active elsewhere:', suppressors);
      const meeting = suppressors.find(s => s.type === 'meeting');
      const companionSup = suppressors.find(s => s.type === 'companion');
      broadcastToExtension({
        type: 'OFF_CHROME_ACTIVE',
        suppressors,
        app: companionSup?.app || null,
        inMeeting: !!meeting
      });
      // Log so the user can later see why idle didn't fire.
      try {
        const { tabathaLogs } = await getStorage('tabathaLogs');
        const logs = tabathaLogs || [];
        logs.push({ type: 'idle_suppressed', suppressors, ts: new Date().toISOString() });
        await setStorage({ tabathaLogs: logs.slice(-500) });
      } catch { /* non-critical */ }
      return; // DO NOT pause focus or schedule auto-break.
    }

    // Step 3: nobody active anywhere → proceed with idle handling.
    await timeTracker.stopAllTracking();
    userIdleSince = new Date().toISOString();
    resetIdleAutoBreakApplied();

    const settings = await getSettings();
    const engine = await deps.getFocusEngine?.();
    const activeId = engine?.activeFocusId;
    const active = activeId ? engine.items[activeId] : null;
    const hasActiveFocus = active?.focusState === 'active';

    // Off-device focuses: user is intentionally working outside Chrome.
    // Never prompt or pause — the focus stays active until they return.
    const isOffDevice = hasActiveFocus && active.offDevice;

    // Master auto-pause toggle: autoPauseEnabled === false means no idle-driven
    // focus mutations at all — not even a prompt.
    const autoPauseEnabled = settings.autoPauseEnabled !== false;

    if (hasActiveFocus && !isOffDevice && autoPauseEnabled && settings.idleConfirmationEnabled !== false) {
      // Prompt instead of hard-pausing. Persist a pending marker so (a) the
      // InBar/popup can render the prompt and (b) the idle-auto-break alarm can
      // fall back to a hard pause if the user never responds.
      // NB-09 single-flight: sleep/wake can fire both the offline-gap detector
      // and this native idle event — never stack a second prompt over a fresh
      // pending one (stale abandoned markers may be replaced).
      const { _idlePrompt: pendingPrompt } = await getStorage('_idlePrompt');
      if (pendingPrompt && (Date.now() - (pendingPrompt.ts || 0)) < 30 * 60000) {
        broadcastToExtension({ type: 'USER_IDLE', since: userIdleSince });
        chrome.alarms.create('idle-auto-break', { delayInMinutes: 5 });
        return;
      }
      const promptId = `idle_${activeId}_${Date.now()}`;
      await setStorage({
        _idlePrompt: { id: promptId, focusId: activeId, focusLabel: active.label, since: userIdleSince, ts: Date.now() }
      });
      broadcastAll({
        type: 'IDLE_PROMPT',
        id: promptId,
        focusId: activeId,
        focusLabel: active.label,
        since: userIdleSince
      });
    } else if (hasActiveFocus && !isOffDevice && autoPauseEnabled) {
      // idleConfirmationEnabled === false → legacy hard-pause.
      await hardPauseActiveFocus('idle');
    }

    broadcastToExtension({ type: 'USER_IDLE', since: userIdleSince });
    chrome.alarms.create('idle-auto-break', { delayInMinutes: 5 });
    return;
  }

  if (newState !== 'active') return;

  // Plan 036: returning to Chrome means this profile is active again. Clear
  // any pending idle prompt — the Welcome-Back flow below owns the return UX.
  // NB-09: EXCEPT gap-sourced prompts — those are created AT the return (the
  // wake) and ARE the return UX; clearing them here is the exact race the
  // single-flight guard exists to prevent.
  deps.setAwarenessIdleState?.('active');
  try {
    const { _idlePrompt } = await getStorage('_idlePrompt');
    if (_idlePrompt && _idlePrompt.source !== 'gap') {
      await setStorage({ _idlePrompt: null });
      broadcastAll({ type: 'IDLE_PROMPT_RESOLVED', id: _idlePrompt.id, resolution: 'returned' });
    }
  } catch { /* non-critical */ }

  chrome.alarms.clear('idle-auto-break');

  chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (activeTabs) => {
    if (!activeTabs?.length) return;
    const tabId = activeTabs[0].id;
    const tabs = await getTabData();
    if (tabs[tabId]) {
      await timeTracker.startTracking(tabId, tabs[tabId].url, tabs[tabId]);
    }
  });

  if (!userIdleSince) return;

  const idleDuration = Date.now() - new Date(userIdleSince).getTime();
  const settings = await getSettings();
  const wasAutoBreakApplied = consumeIdleAutoBreakApplied();

  if (wasAutoBreakApplied) {
    const { clockSession } = await getStorage('clockSession');
    if (clockSession?.active && clockSession?.onBreak && settings.autoResumeFromBreak) {
      await endBreakIfActive();
    }
  }

  // Plan 025: WBP threshold — minimum idle time
  const minIdleMs = (settings.welcomeBackMinIdleMinutes ?? 5) * 60000;
  if (idleDuration < minIdleMs) {
    userIdleSince = null;
    return;
  }

  // Plan 025: WBP threshold — show after break return
  if (wasAutoBreakApplied && settings.welcomeBackShowAfterBreak === false) {
    userIdleSince = null;
    return;
  }

  let pausedFocusId = null;
  let pausedFocusLabel = null;
  let activeFocusDrifted = false;
  let driftedFocusLabel = null;
  const engine = await deps.getFocusEngine?.();

  if (engine?.activeFocusId && engine.items[engine.activeFocusId]) {
    const activeFocus = engine.items[engine.activeFocusId];

    // Plan 025: Off-device suppression
    if (activeFocus.offDevice) {
      userIdleSince = null;
      return;
    }

    if (activeFocus.focusState === 'paused') {
      pausedFocusId = engine.activeFocusId;
      pausedFocusLabel = activeFocus.label;
    }

    // Plan 025: Combo detection — focus timer expired while user was away
    if (activeFocus.focusState === 'drifted') {
      activeFocusDrifted = true;
      driftedFocusLabel = activeFocus.label;
    }
  }

  // Plan 025: Combo popup — both WBP and FTE conditions met
  if (activeFocusDrifted) {
    const comboPopupId = `combo_${engine.activeFocusId}_${Date.now()}`;
    await setStorage({
      _activePopup: { type: 'COMBO', id: comboPopupId, focusId: engine.activeFocusId, ts: Date.now() }
    });

    broadcastAll({
      type: 'FOCUS_RETURN_COMBO',
      idleSince: userIdleSince,
      idleDurationMs: idleDuration,
      focusId: engine.activeFocusId,
      focusLabel: driftedFocusLabel,
      timerMinutes: engine.items[engine.activeFocusId]?.timerMinutes,
      wasOnBreak: wasAutoBreakApplied
    });

    userIdleSince = null;
    return;
  }

  // Standard WBP flow
  if (pausedFocusId) {
    await setStorage({
      _activePopup: { type: 'WBP', id: `wb_${Date.now()}`, focusId: pausedFocusId, ts: Date.now() }
    });
  }

  broadcastAll({
    type: 'WELCOME_BACK',
    idleSince: userIdleSince,
    idleDurationMs: idleDuration,
    pausedFocusId,
    pausedFocusLabel,
    wasOnBreak: wasAutoBreakApplied
  });

  if (idleDuration > (settings.idleThresholdMinutes || 5) * 60 * 1000) {
    broadcastToExtension({
      type: 'OFF_CHROME_RETURN',
      idleSince: userIdleSince,
      idleDurationMs: idleDuration
    });

    chrome.notifications.create('welcome-back', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Welcome Back!',
      message: `You were away for ${Math.round(idleDuration / 60000)}m. Click to log your offline context.`,
      requireInteraction: true
    });
  }
  userIdleSince = null;
}

// ════════════════════════════════════════════
// NB-01/NB-02 — Required-hours shortfall detection.
//
// Evaluated at clock-out (the moment a cadence window's tally can change).
// Pure math lives in src/utils/scheduleModel.js: for each of the member's
// active required-hours floors (daily/weekly/monthly are INDEPENDENT — the
// anti-back-loading rule), the just-closed window is checked for a final
// miss, and the current window for a miss that is already mathematically
// certain. Detected shortfalls are:
//   1. written to tabatha.shortfall_ledger (resolution 'unresolved') via the
//      injected scheduleApi wrapper — idempotent per member/cadence/period;
//   2. surfaced with a SHORTFALL_PROMPT broadcast + a Chrome notification so
//      the user can account for the time (make-up / shift / reason) from the
//      Work Shifts → Schedule view.
// Deliberately NOT a hard block on clock-in/out (Koda): this is the minimal
// detection + prompt + ledger slice; the full adherence engine phases later.
// Fail-open: signed-out / offline / no-requirements users are unaffected.
// ════════════════════════════════════════════
export async function checkShortfallAtClockOut(now = Date.now()) {
  try {
    const api = deps.scheduleApi;
    const supabase = deps.supabase;
    if (!api || !supabase) return null;

    const { data: { session } = {} } = await supabase.auth.getSession();
    if (!session?.user?.id) return null;

    const { data: prof } = await supabase
      .schema('tabatha')
      .from('profiles')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (!prof?.id) return null;

    // Open floors across all of the member's orgs (RLS returns own rows).
    const requirements = await api.getWorkRequirements({ profileId: prof.id });
    if (!requirements?.length) return null;

    const { clockHistory } = await getStorage('clockHistory');
    const sessions = clockHistory || [];

    // Group per org — floors and ledgers are org-scoped.
    const byOrg = new Map();
    for (const r of requirements) {
      if (!byOrg.has(r.org_id)) byOrg.set(r.org_id, []);
      byOrg.get(r.org_id).push(r);
    }

    // Prompt dedupe (persisted): one prompt per member/org/cadence/period.
    const { _shortfallPrompted } = await getStorage('_shortfallPrompted');
    const prompted = _shortfallPrompted || {};
    const results = [];

    for (const [orgId, reqs] of byOrg) {
      const detected = shortfallsToPrompt(reqs, sessions, now);
      const fresh = detected.filter(s => !prompted[`${orgId}:${shortfallKey(s)}`]);
      if (fresh.length === 0) continue;

      // Ledger rows are created ON PROMPT (never pre-materialized); the
      // unique index makes re-runs harmless.
      try {
        await api.logShortfalls({ orgId, profileId: prof.id, shortfalls: fresh });
      } catch { /* ledger write is best-effort; the prompt still shows */ }

      for (const s of fresh) {
        prompted[`${orgId}:${shortfallKey(s)}`] = now;
        results.push({ ...s, orgId });
      }
    }

    if (results.length === 0) return null;

    // Cap the dedupe map so it can't grow unbounded.
    const keys = Object.keys(prompted);
    if (keys.length > 200) {
      keys.sort((a, b) => prompted[a] - prompted[b]);
      for (const k of keys.slice(0, keys.length - 200)) delete prompted[k];
    }
    await setStorage({ _shortfallPrompted: prompted });

    broadcastToExtension({ type: 'SHORTFALL_PROMPT', shortfalls: results });
    try {
      const first = results[0];
      chrome.notifications.create(`shortfall-${now}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Tabatha — required hours',
        message: results.length === 1
          ? `You're ${fmtMinutes(first.missingMinutes)} short of your ${first.cadence} minimum${first.final ? '' : ' (current period can no longer be met)'}. Open Work Shifts → Schedule to make it up, shift it, or log a reason.`
          : `${results.length} required-hours shortfalls need accounting. Open Work Shifts → Schedule to resolve them.`,
        requireInteraction: true,
      });
    } catch { /* notifications best-effort */ }

    try {
      const { tabathaLogs } = await getStorage('tabathaLogs');
      const logs = tabathaLogs || [];
      logs.push({ type: 'shortfall_detected', shortfalls: results, ts: new Date().toISOString() });
      await setStorage({ tabathaLogs: logs.slice(-500) });
    } catch { /* non-critical */ }

    return results;
  } catch {
    return null; // shortfall detection is always fail-open
  }
}

async function getTabData() {
  if (deps.getTabData) return deps.getTabData();
  const { tabs } = await getStorage('tabs');
  return tabs || {};
}

async function getSettings() {
  const { settings } = await getStorage('settings');
  return settings || {};
}

// ── Router entry point ──

export async function handleMessage(type, message, _sender) {
  switch (type) {
    case 'CLOCK_IN': {
      const result = await clock.clockIn();
      // Sync to desktop companion
      if (deps.companionBridge?.isConnected) {
        deps.companionBridge.sendClockIn(message.label);
      }
      if (deps.fireWebhook) deps.fireWebhook('clock_in', { label: message.label });
      deps.notifyAwarenessStateChange?.();
      return result;
    }

    case 'CLOCK_OUT': {
      const result = await clock.clockOut();
      if (deps.companionBridge?.isConnected) {
        deps.companionBridge.sendClockOut();
      }
      if (deps.fireWebhook) deps.fireWebhook('clock_out', {});
      if (!result.error) {
        deps.triggerSync?.();
        // NB-01/NB-02: fire-and-forget required-hours check — never delays
        // or blocks the clock-out itself (Koda: no hard blocks by profile type).
        checkShortfallAtClockOut().catch(() => {});
      }
      deps.notifyAwarenessStateChange?.();
      return result;
    }

    case 'GET_CLOCK_STATUS':
      // NB-09: cheap wake-event hook — popup/home opening after a sleep is
      // often the first sign of life; piggyback a gap check (in-flight guarded,
      // fire-and-forget so the status response is never delayed).
      checkOfflineGap('message').catch(() => {});
      return await clock.getClockStatus();

    case 'TOGGLE_BREAK': {
      const result = await clock.toggleBreak();
      if (deps.companionBridge?.isConnected) {
        deps.companionBridge.sendToggleBreak();
      }
      // If going ON break → auto-pause active focus
      if (result.session?.onBreak && deps.getFocusEngine && deps.setFocusEngine) {
        const engine = await deps.getFocusEngine();
        if (engine.activeFocusId) {
          const active = engine.items[engine.activeFocusId];
          if (active && active.focusState === 'active') {
            if (active.lastResumedAt) {
              active.elapsedMs = (active.elapsedMs || 0) +
                (Date.now() - new Date(active.lastResumedAt).getTime());
              active.lastResumedAt = null;
            }
            active.focusState = 'paused';
            active.pausedAt = new Date().toISOString();
            await deps.setFocusEngine(engine);
            broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
          }
        }
      }
      deps.notifyAwarenessStateChange?.();
      return result;
    }

    case 'GET_LAST_SESSION':
      return await clock.getLastSession();

    case 'GET_CLOCK_HISTORY':
      return await clock.getClockHistory();

    default:
      return undefined;
  }
}
