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
import { createClockService } from '../clock.js';
import * as timeTracker from '../../services/timeTracking.js';

// ── Injected dependencies (set via configureClockService) ──
let deps = {};
let idleListenerRegistered = false;
let userIdleSince = null;

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
  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener(handleIdleStateChanged);
  // Plan 036: auto clock-in when Chrome (re)launches, if configured.
  chrome.runtime.onStartup.addListener(() => { maybeAutoClockIn('chrome_open'); });
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
async function isUserInMeeting() {
  try {
    const settings = await getSettings();
    const meetingDomains = settings.meetingDomains?.length
      ? settings.meetingDomains
      : ['meet.google.com', 'zoom.us', 'teams.microsoft.com', 'teams.live.com', 'webex.com', 'app.webex.com'];
    const tabs = await getTabData();

    // L1 (domain present) + L2 (live-call signals) — scan every tracked tab.
    for (const [tabId, tabData] of Object.entries(tabs)) {
      const url = (tabData?.url || '').toLowerCase();
      if (!meetingDomains.some(d => url.includes(d))) continue;
      try {
        const chromeTab = await chrome.tabs.get(Number(tabId));
        const titleSignals = /\b(meeting|call|huddle|presenting|in call)\b/i.test(chromeTab?.title || '');
        const isAudible = chromeTab?.audible === true;
        const openedAt = tabData.openedAt ? new Date(tabData.openedAt).getTime() : Date.now();
        const isEstablished = Date.now() - openedAt > 120_000; // open >2min ⇒ likely a real call, not a landing page
        if (isAudible || titleSignals || isEstablished) {
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
async function collectIdleSuppressors() {
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
async function hardPauseActiveFocus(reason) {
  const engine = await deps.getFocusEngine?.();
  if (!engine?.activeFocusId) return null;
  const active = engine.items[engine.activeFocusId];
  if (active?.focusState !== 'active') return null;
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

async function handleIdleStateChanged(newState) {
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

    if (hasActiveFocus && settings.idleConfirmationEnabled !== false) {
      // Prompt instead of hard-pausing. Persist a pending marker so (a) the
      // InBar/popup can render the prompt and (b) the idle-auto-break alarm can
      // fall back to a hard pause if the user never responds.
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
    } else if (hasActiveFocus) {
      // Legacy hard-pause behaviour (idleConfirmationEnabled === false).
      await hardPauseActiveFocus('idle');
    }

    broadcastToExtension({ type: 'USER_IDLE', since: userIdleSince });
    chrome.alarms.create('idle-auto-break', { delayInMinutes: 5 });
    return;
  }

  if (newState !== 'active') return;

  // Plan 036: returning to Chrome means this profile is active again. Clear
  // any pending idle prompt — the Welcome-Back flow below owns the return UX.
  deps.setAwarenessIdleState?.('active');
  try {
    const { _idlePrompt } = await getStorage('_idlePrompt');
    if (_idlePrompt) {
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
      iconUrl: 'icons/icon128.png',
      title: 'Welcome Back!',
      message: `You were away for ${Math.round(idleDuration / 60000)}m. Click to log your offline context.`,
      requireInteraction: true
    });
  }
  userIdleSince = null;
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
      if (!result.error) deps.triggerSync?.();
      deps.notifyAwarenessStateChange?.();
      return result;
    }

    case 'GET_CLOCK_STATUS':
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
