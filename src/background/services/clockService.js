// ════════════════════════════════════════════
// Tabatha — Clock Service (background module)
// Handles: CLOCK_IN, CLOCK_OUT, TOGGLE_BREAK, GET_CLOCK_STATUS
// Storage keys: clockSession, clockHistory
// ════════════════════════════════════════════

import * as timeTracker from '../../services/timeTracking.js';
import { getSettings, getStorage, getTabData, setStorage } from './storageService.js';
import { broadcastMessage } from './notificationService.js';

const defaultClockService = createClockService(getStorage, setStorage, broadcastMessage);
let idleListenersRegistered = false;
let userIdleSince = null;
let idleAutoBreakApplied = false;

export async function handleMessage(type) {
  switch (type) {
    case 'CLOCK_IN':
      return defaultClockService.clockIn();
    case 'CLOCK_OUT':
      return defaultClockService.clockOut();
    case 'GET_CLOCK_STATUS':
      return defaultClockService.getClockStatus();
    case 'TOGGLE_BREAK':
      return defaultClockService.toggleBreak();
    case 'GET_LAST_SESSION':
      return defaultClockService.getLastSession();
    case 'GET_CLOCK_HISTORY':
      return defaultClockService.getClockHistory();
    case 'GET_LATEST_SESSION':
      return defaultClockService.getLatestSession();
    default:
      return null;
  }
}

export function registerIdleListeners(clockService = defaultClockService) {
  if (idleListenersRegistered) return;
  idleListenersRegistered = true;

  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener((newState) => handleIdleStateChanged(newState, clockService));
  chrome.alarms.onAlarm.addListener((alarm) => handleIdleAlarm(alarm, clockService));
}

async function handleIdleStateChanged(newState, clockService) {
  if (newState === 'idle' || newState === 'locked') {
    await timeTracker.stopAllTracking();
    userIdleSince = new Date().toISOString();
    idleAutoBreakApplied = false;

    broadcastMessage({ type: 'USER_IDLE', since: userIdleSince });
    chrome.alarms.create('idle-auto-break', { delayInMinutes: 5 });
    return;
  }

  if (newState !== 'active') return;

  chrome.alarms.clear('idle-auto-break');

  chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (activeTabs) => {
    if (activeTabs && activeTabs.length > 0) {
      const tId = activeTabs[0].id;
      const tabs = await getTabData();
      if (tabs[tId]) {
        await timeTracker.startTracking(tId, tabs[tId].url, tabs[tId]);
      }
    }
  });

  if (!userIdleSince) return;

  const idleDuration = Date.now() - new Date(userIdleSince).getTime();
  const settings = await getSettings();

  if (idleAutoBreakApplied) {
    const { clockSession } = await getStorage('clockSession');
    if (clockSession?.active && clockSession?.onBreak) {
      await clockService.toggleBreak();
    }
    idleAutoBreakApplied = false;
  }

  broadcastMessage({
    type: 'WELCOME_BACK',
    idleSince: userIdleSince,
    idleDurationMs: idleDuration
  });

  if (idleDuration > (settings.idleThresholdMinutes || 5) * 60 * 1000) {
    broadcastMessage({
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

async function handleIdleAlarm(alarm, clockService) {
  if (alarm.name !== 'idle-auto-break') return;

  const state = await chrome.idle.queryState(60);
  if (state === 'idle' || state === 'locked') {
    const { clockSession } = await getStorage('clockSession');
    if (clockSession?.active && !clockSession?.onBreak) {
      await clockService.toggleBreak();
      idleAutoBreakApplied = true;
      broadcastMessage({ type: 'AUTO_BREAK', reason: 'idle_5min' });
    }
  }
}

/**
 * @param {Function} getStorage - async (keys) => data
 * @param {Function} setStorage - async (data) => void
 * @param {Function} broadcastMessage - (msg) => void
 */
export function createClockService(getStorage, setStorage, broadcastMessage) {

  async function clockIn() {
    const { clockSession } = await getStorage('clockSession');
    if (clockSession?.active) return { error: 'Already clocked in', session: clockSession };
    const session = {
      active: true,
      clockedInAt: new Date().toISOString(),
      clockedOutAt: null,
      breaks: [],
      onBreak: false,
      breakStartedAt: null
    };
    await setStorage({ clockSession: session });
    broadcastMessage({ type: 'CLOCK_SESSION_UPDATED' });
    return { session };
  }

  async function clockOut() {
    const { clockSession } = await getStorage('clockSession');
    if (!clockSession?.active) return { error: 'Not clocked in' };
    // End any active break
    if (clockSession.onBreak && clockSession.breakStartedAt) {
      clockSession.breaks.push({ start: clockSession.breakStartedAt, end: new Date().toISOString() });
    }
    clockSession.active = false;
    clockSession.clockedOutAt = new Date().toISOString();
    clockSession.onBreak = false;
    clockSession.breakStartedAt = null;

    // Archive to history
    const { clockHistory } = await getStorage('clockHistory');
    const history = clockHistory || [];
    history.unshift({ ...clockSession });
    await setStorage({ clockSession, clockHistory: history.slice(0, 365) });
    broadcastMessage({ type: 'CLOCK_SESSION_UPDATED' });
    return { session: clockSession };
  }

  async function getClockStatus() {
    const { clockSession } = await getStorage('clockSession');
    return { session: clockSession || { active: false } };
  }

  async function toggleBreak() {
    const { clockSession } = await getStorage('clockSession');
    if (!clockSession?.active) return { error: 'Not clocked in' };

    if (clockSession.onBreak) {
      // End break
      clockSession.breaks.push({ start: clockSession.breakStartedAt, end: new Date().toISOString() });
      clockSession.onBreak = false;
      clockSession.breakStartedAt = null;
    } else {
      // Start break
      clockSession.onBreak = true;
      clockSession.breakStartedAt = new Date().toISOString();
    }
    await setStorage({ clockSession });
    broadcastMessage({ type: 'CLOCK_SESSION_UPDATED' });
    return { session: clockSession };
  }

  /**
   * Get the last completed session from history (for "last session" display).
   */
  async function getLastSession() {
    const { clockHistory } = await getStorage('clockHistory');
    const history = clockHistory || [];
    if (history.length === 0) return { lastSession: null };
    const last = history[0];
    // Compute duration
    const clockedIn = new Date(last.clockedInAt).getTime();
    const clockedOut = new Date(last.clockedOutAt).getTime();
    let breakMs = 0;
    for (const b of last.breaks || []) {
      breakMs += new Date(b.end).getTime() - new Date(b.start).getTime();
    }
    return {
      lastSession: {
        ...last,
        totalMs: clockedOut - clockedIn,
        workMs: clockedOut - clockedIn - breakMs,
        breakMs,
      }
    };
  }

  /**
   * Get all clock history entries (for work logs/shifts page).
   */
  async function getClockHistory() {
    const { clockHistory } = await getStorage('clockHistory');
    const history = (clockHistory || []).map(session => {
      const clockedIn = new Date(session.clockedInAt).getTime();
      const clockedOut = new Date(session.clockedOutAt).getTime();
      let breakMs = 0;
      for (const b of session.breaks || []) {
        breakMs += new Date(b.end).getTime() - new Date(b.start).getTime();
      }
      return {
        ...session,
        totalMs: clockedOut - clockedIn,
        workMs: clockedOut - clockedIn - breakMs,
        breakMs,
      };
    });
    return { history };
  }

  async function getLatestSession() {
    const { sessions } = await getStorage('sessions');
    return { session: (sessions || [])[0] || null };
  }

  return {
    clockIn,
    clockOut,
    getClockStatus,
    toggleBreak,
    getLastSession,
    getClockHistory,
    getLatestSession,
  };
}
