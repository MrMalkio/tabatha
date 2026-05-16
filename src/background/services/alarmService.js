// ============================================================
// Tabatha — Alarm Service (Plan 023 Task 05c)
// Owns the single `chrome.alarms.onAlarm` listener. Routes alarm names
// to the alarm handler exposed by the owning service. Periodic-alarm
// creation (`chrome.alarms.create`) stays with the owning module — this
// service only consolidates dispatch.
// ============================================================

import { RETENTION_ALARM } from '../constants.js';
import {
  handleFocusTimerExpired,
  handleUnfocusedNudge,
  handleCheckpointPrompt
} from './focusService.js';
import { handleContextTimerExpired } from './tabService.js';
import { handlePomodoroComplete } from './notificationService.js';
import { handleIdleAutoBreak } from './clockService.js';
import { saveSessionSnapshot, exportMarkdown } from './sessionService.js';

// `session-snapshot` is also exported from bootstrap.js; redeclaring as a
// local constant avoids the circular import.
const SESSION_SNAPSHOT_ALARM = 'session-snapshot';

let injectedDeps = {};
let listenerRegistered = false;

export function configureAlarmService(deps = {}) {
  injectedDeps = { ...injectedDeps, ...deps };
}

export function registerAlarmServiceListener() {
  if (listenerRegistered) return;
  listenerRegistered = true;
  chrome.alarms.onAlarm.addListener(handleAlarm);
}

async function handleAlarm(alarm) {
  const name = alarm.name;
  try {
    // Dynamic-name alarms — prefix match.
    if (name.startsWith('focus-timer-')) {
      return handleFocusTimerExpired(name.slice('focus-timer-'.length));
    }
    if (name.startsWith('context-timer-')) {
      const tabId = parseInt(name.slice('context-timer-'.length), 10);
      if (Number.isFinite(tabId)) return handleContextTimerExpired(tabId);
      return;
    }
    // Plan 025: Checkpoint prompt alarm
    if (name.startsWith('checkpoint-prompt-')) {
      return handleCheckpointPrompt(name.slice('checkpoint-prompt-'.length));
    }
    if (name.startsWith('blockgate-')) {
      // No-op: temp-unblock expiry is enforced inline in CHECK_BLOCKED_SITE
      // via timestamp comparison. The alarm exists so a future cleanup can
      // remove the stale tempUnblocked entry; keeping the dispatch path
      // explicit here documents the ownership.
      return;
    }

    switch (name) {
      case RETENTION_ALARM:
        return injectedDeps.runRetentionCleanup?.();
      case SESSION_SNAPSHOT_ALARM:
        return saveSessionSnapshot();
      case 'auto-export':
        return exportMarkdown();
      case 'supabase-sync':
        return runGuardedSupabaseSync();
      case 'pomodoro-timer':
        return handlePomodoroComplete();
      case 'unfocused-nudge':
        return handleUnfocusedNudge();
      case 'idle-auto-break':
        return handleIdleAutoBreak();
      default:
        return;
    }
  } catch (err) {
    console.error('[alarmService] handler failed for', name, err);
  }
}

// Auth-guarded supabase sync. Today's `syncToSupabase` does its own
// auth check internally, but per the spec we skip the tick entirely when
// the user isn't authenticated so we don't burn a getSession() round-trip.
async function runGuardedSupabaseSync() {
  const { syncToSupabase, getAuthSession } = injectedDeps;
  if (!syncToSupabase) return;
  if (getAuthSession) {
    try {
      const session = await getAuthSession();
      if (!session) return;
    } catch {
      return;
    }
  }
  return syncToSupabase();
}

// alarmService doesn't handle runtime messages — it owns the alarm
// listener. Still implements handleMessage so the router chain stays
// uniform.
export async function handleMessage() {
  return undefined;
}
