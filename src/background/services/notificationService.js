import { getStorage, setStorage } from './storageService.js';

let injectedDeps = {};

export function configureNotificationService(deps = {}) {
  injectedDeps = { ...injectedDeps, ...deps };
}

export function broadcastToExtension(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

export function broadcastToAllTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  });
}

export function broadcastAll(message) {
  broadcastToExtension(message);
  broadcastToAllTabs(message);
}

// Pomodoro-timer alarm handler. Routed from alarmService when the
// `pomodoro-timer` alarm fires.
export async function handlePomodoroComplete() {
  chrome.notifications.create('pomodoro-done', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Tabatha — Timer Complete!',
    message: 'Time is up! Take a break or refocus.',
    requireInteraction: true
  });
  broadcastToExtension({ type: 'POMODORO_COMPLETE' });
}

export async function handleMessage(type, message, sender) {
  switch (type) {
    case 'START_POMODORO':
      chrome.alarms.create('pomodoro-timer', { delayInMinutes: message.minutes });
      broadcastToExtension({ type: 'POMODORO_STARTED', minutes: message.minutes });
      return { success: true };

    case 'GET_INBAR_DATA':
      return getInbarData(sender);

    case 'SAVE_INBAR_NOTE':
      return saveInbarNote(message, sender);

    case 'GET_INBAR_NOTES':
      return getInbarNotes(sender);

    case 'OPEN_POPUP':
      return openPopup(message, sender);

    default:
      return undefined;
  }
}

async function getInbarData(sender) {
  const { settings: ibSettings } = await getStorage('settings');
  const tabs = await getTabData();
  const tabId = sender.tab ? sender.tab.id : null;
  const tabContext = tabId ? tabs[tabId] : null;
  const engine = await getFocusEngine();
  const activeFocus = engine.activeFocusId ? engine.items[engine.activeFocusId] : null;

  let totalTimeMs = 0;
  if (activeFocus) {
    const { timeTracking } = await getStorage('timeTracking');
    if (timeTracking?.byTab) {
      for (const tid of activeFocus.associatedTabIds) {
        totalTimeMs += timeTracking.byTab[tid] || 0;
      }
    }
    activeFocus.totalTimeMs = totalTimeMs;
  }

  const show = ibSettings?.inbarEnabled !== false;
  const allFocusItems = Object.values(engine.items).map(i => ({
    id: i.id,
    label: i.label,
    focusState: i.focusState,
    funnelStage: i.funnelStage
  }));

  return { show, tabContext, activeFocus, activeFocusId: engine.activeFocusId, allFocusItems, settings: ibSettings || {} };
}

async function saveInbarNote(message, sender) {
  const { note, tabId: noteTabId } = message;
  const { inbarNotes = {} } = await getStorage('inbarNotes');
  const noteKey = noteTabId || (sender.tab ? sender.tab.id : 'global');
  inbarNotes[noteKey] = { text: note, updatedAt: new Date().toISOString() };
  await setStorage({ inbarNotes });
  return { success: true };
}

async function getInbarNotes(sender) {
  const { inbarNotes = {} } = await getStorage('inbarNotes');
  const tabId = sender.tab ? sender.tab.id : null;
  return { note: inbarNotes[tabId]?.text || inbarNotes['global']?.text || '' };
}

async function openPopup(message, sender) {
  const tabId = sender?.tab?.id || message.tabId;
  if (!tabId) return { error: 'No tab ID' };

  const tabs = await getTabData();
  if (tabs[tabId]) {
    tabs[tabId].contextSource = null;
    await setTabData(tabs);
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['assets/gatekeeper.js']
    });
    return { success: true };
  } catch (e) {
    return { error: 'Could not inject gatekeeper: ' + e.message };
  }
}

async function getTabData() {
  return injectedDeps.getTabData ? injectedDeps.getTabData() : getStorage('tabs').then(({ tabs }) => tabs || {});
}

async function setTabData(tabs) {
  return injectedDeps.setTabData ? injectedDeps.setTabData(tabs) : setStorage({ tabs });
}

async function getFocusEngine() {
  if (injectedDeps.getFocusEngine) return injectedDeps.getFocusEngine();
  const { focusEngine } = await getStorage('focusEngine');
  return focusEngine || { activeFocusId: null, items: {}, history: [] };
}
