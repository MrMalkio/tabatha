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
  if (!(clockSession?.active && !clockSession?.onBreak)) return;

  await clock.toggleBreak();
  idleAutoBreakApplied = true;
  broadcastToExtension({ type: 'AUTO_BREAK', reason: 'idle_5min' });
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

async function handleIdleStateChanged(newState) {
  if (newState === 'idle' || newState === 'locked') {
    const activeApp = deps.companionBridge?.activeApp;
    if (deps.companionBridge?.isConnected && activeApp) {
      const offChromeSince = new Date(activeApp.timestamp);
      const offChromeMs = Date.now() - offChromeSince.getTime();
      if (offChromeMs < 120000) {
        console.log('[idle] Suppressed - user active in:', activeApp.displayName);
        broadcastToExtension({
          type: 'OFF_CHROME_ACTIVE',
          app: activeApp.displayName,
          category: activeApp.category,
          since: activeApp.timestamp
        });
        return;
      }
    }

    await timeTracker.stopAllTracking();
    userIdleSince = new Date().toISOString();
    resetIdleAutoBreakApplied();

    const engine = await deps.getFocusEngine?.();
    if (engine?.activeFocusId) {
      const active = engine.items[engine.activeFocusId];
      if (active?.focusState === 'active') {
        if (active.lastResumedAt) {
          active.elapsedMs = (active.elapsedMs || 0) + (Date.now() - new Date(active.lastResumedAt).getTime());
          active.lastResumedAt = null;
        }
        active.focusState = 'paused';
        active.pausedAt = new Date().toISOString();
        if (active.funnelStage === 'addressing') active.funnelStage = 'focus';
        await deps.setFocusEngine?.(engine);
        broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
      }
    }

    broadcastToExtension({ type: 'USER_IDLE', since: userIdleSince });
    chrome.alarms.create('idle-auto-break', { delayInMinutes: 5 });
    return;
  }

  if (newState !== 'active') return;

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
      return result;
    }

    case 'CLOCK_OUT': {
      const result = await clock.clockOut();
      if (deps.companionBridge?.isConnected) {
        deps.companionBridge.sendClockOut();
      }
      if (deps.fireWebhook) deps.fireWebhook('clock_out', {});
      if (!result.error) deps.triggerSync?.();
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
