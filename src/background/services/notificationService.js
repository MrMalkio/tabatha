import {
  getFocusEngine as getStoredFocusEngine,
  getStorage as getStoredStorage,
  getTabData as getStoredTabData,
  setStorage as setStoredStorage,
} from './storageService.js';

let dependencies = {
  getStorage: getStoredStorage,
  setStorage: setStoredStorage,
  getTabData: getStoredTabData,
  setTabData: async (tabs) => setStoredStorage({ tabs }),
  getFocusEngine: getStoredFocusEngine,
};

export function configureNotificationService(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export function broadcastMessage(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // No listeners - sidebar not open, that's fine.
  });
}

export async function handleMessage(type, message, sender) {
  switch (type) {
    case 'START_POMODORO':
      return startPomodoro(message);
    case 'GET_INBAR_DATA':
      return getInbarData(sender);
    case 'SAVE_INBAR_NOTE':
      return saveInbarNote(message, sender);
    case 'GET_INBAR_NOTES':
      return getInbarNotes(sender);
    case 'OPEN_POPUP':
      return openPopup(message, sender);
    default:
      return null;
  }
}

async function startPomodoro(message) {
  chrome.alarms.create('pomodoro-timer', { delayInMinutes: message.minutes });
  broadcastMessage({ type: 'POMODORO_STARTED', minutes: message.minutes });
  return { success: true };
}

async function getInbarData(sender) {
  const { getStorage, getTabData, getFocusEngine } = dependencies;
  const { settings: ibSettings } = await getStorage('settings');
  const tabs = await getTabData();
  const tabId = sender.tab ? sender.tab.id : null;
  const tabContext = tabId ? tabs[tabId] : null;
  const engine = await getFocusEngine();
  const activeFocus = engine.activeFocusId ? engine.items[engine.activeFocusId] : null;

  // Calculate total task time from all associated tabs.
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
  return { show, tabContext, activeFocus, settings: ibSettings || {} };
}

async function saveInbarNote(message, sender) {
  const { getStorage, setStorage } = dependencies;
  const { note, tabId: noteTabId } = message;
  const { inbarNotes = {} } = await getStorage('inbarNotes');
  const noteKey = noteTabId || (sender.tab ? sender.tab.id : 'global');
  inbarNotes[noteKey] = { text: note, updatedAt: new Date().toISOString() };
  await setStorage({ inbarNotes });
  return { success: true };
}

async function getInbarNotes(sender) {
  const { getStorage } = dependencies;
  const { inbarNotes = {} } = await getStorage('inbarNotes');
  const tabId = sender.tab ? sender.tab.id : null;
  return { note: inbarNotes[tabId]?.text || inbarNotes['global']?.text || '' };
}

async function openPopup(message, sender) {
  const { getTabData, setTabData } = dependencies;
  const tabId = sender?.tab?.id || message.tabId;
  if (!tabId) return { error: 'No tab ID' };

  // Clear any existing context so gatekeeper will fire.
  const tabs = await getTabData();
  if (tabs[tabId]) {
    tabs[tabId].contextSource = null;
    await setTabData(tabs);
  }

  // Inject gatekeeper content script.
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
