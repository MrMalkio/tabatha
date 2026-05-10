import { getFocusEngine, getSettings, getTabData, setFocusEngine } from './storageService.js';
import { broadcastMessage } from './notificationService.js';

let dependencies = {
  exportMarkdown: async () => {},
  getFocusEngine,
  getSettings,
  getTabData,
  saveSessionSnapshot: async () => {},
  setFocusEngine,
  syncToSupabase: async () => {},
};

let alarmListenersRegistered = false;

export function configureAlarmService(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export function registerAlarmListeners() {
  if (alarmListenersRegistered) return;
  alarmListenersRegistered = true;

  chrome.alarms.onAlarm.addListener(handleAlarm);
  chrome.alarms.create('session-snapshot', { periodInMinutes: 5 });
  chrome.alarms.create('supabase-sync', { periodInMinutes: 5 });
}

async function handleAlarm(alarm) {
  if (alarm.name.startsWith('context-timer-')) {
    await handleContextTimerAlarm(alarm);
  }

  if (alarm.name === 'auto-export') {
    await dependencies.exportMarkdown();
  }

  if (alarm.name === 'session-snapshot') {
    await dependencies.saveSessionSnapshot();
  }

  if (alarm.name === 'supabase-sync') {
    await dependencies.syncToSupabase();
  }

  if (alarm.name === 'pomodoro-timer') {
    chrome.notifications.create('pomodoro-done', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Tabatha — Timer Complete!',
      message: 'Time is up! Take a break or refocus.',
      requireInteraction: true
    });
    broadcastMessage({ type: 'POMODORO_COMPLETE' });
  }

  if (alarm.name.startsWith('focus-timer-')) {
    await handleFocusTimerAlarm(alarm);
  }
}

async function handleContextTimerAlarm(alarm) {
  const tabId = parseInt(alarm.name.replace('context-timer-', ''));
  const tabs = await dependencies.getTabData();
  const tabData = tabs[tabId];

  if (tabData && !tabData.ignored && !tabData.context) {
    broadcastMessage({
      type: 'CONTEXT_REMINDER',
      tabId,
      tabData
    });

    chrome.notifications.create(`context-${tabId}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Tabatha — Context Needed',
      message: `"${tabData.title}" has been open for a while. What are you working on?`
    });
  } else if (tabData && tabData.context) {
    const settings = await dependencies.getSettings();
    const timerMinutes = tabData.timerOverrideMinutes || settings.globalTimerMinutes;

    broadcastMessage({
      type: 'INTENT_REINFORCEMENT',
      tabId,
      tabData
    });

    chrome.alarms.create(`context-timer-${tabId}`, { delayInMinutes: timerMinutes });
  }
}

async function handleFocusTimerAlarm(alarm) {
  const focusId = alarm.name.replace('focus-timer-', '');
  const engine = await dependencies.getFocusEngine();
  const item = engine.items[focusId];
  if (item && item.focusState === 'active') {
    item.focusState = 'drifted';
    if (item.lastResumedAt) {
      item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime());
      item.lastResumedAt = new Date().toISOString();
    }
    await dependencies.setFocusEngine(engine);
    broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });

    chrome.notifications.create(`focus-drift-${focusId}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Tabatha — Timer Drifted',
      message: `"${item.label}" timer has run out. Still working on it?`,
      requireInteraction: true
    });
  }
}
