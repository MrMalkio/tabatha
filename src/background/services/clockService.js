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

// ── Injected dependencies (set via configureClockService) ──
let deps = {};

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
