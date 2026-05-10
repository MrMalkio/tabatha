import * as timeTracker from '../../services/timeTracking.js';
import { getStorage, getTabData, getTimeTracking, setStorage } from './storageService.js';
import { broadcastMessage } from './notificationService.js';

let dependencies = {
  setTabData: async (tabs) => setStorage({ tabs }),
  tryAssociateTab: async () => {},
  triggerSync: () => {},
};

let listenersRegistered = false;

export function configureTabTrackingService(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export function registerTabTrackingListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const { setTabData, tryAssociateTab } = dependencies;
    const tabs = await getTabData();
    const tabData = tabs[activeInfo.tabId];

    if (tabData) {
      tabData.lastActive = new Date().toISOString();
      await setTabData(tabs);

      // Start tracking the new active tab.
      await timeTracker.startTracking(activeInfo.tabId, tabData.url, tabData);
    }

    broadcastMessage({ type: 'TAB_ACTIVATED', tabId: activeInfo.tabId });

    // Auto-associate activated tab with current focus.
    tryAssociateTab(activeInfo.tabId);
  });

  chrome.tabs.onRemoved.addListener(async (tabId) => {
    await timeTracker.stopTracking(tabId);
  });
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_TIME_TRACKING':
      return { timeTracking: await getTimeTracking() };
    case 'LOG_INTENT_ACTION':
      return logIntentAction(message);
    default:
      return null;
  }
}

async function logIntentAction(message) {
  const { triggerSync } = dependencies;
  const { intentHistory } = await getStorage('intentHistory');
  const history = intentHistory || [];
  history.unshift({
    action: message.action,
    context: message.context || null,
    focusId: message.focusId || null,
    url: message.url,
    domain: message.domain,
    timestamp: new Date().toISOString()
  });
  // Keep last 500.
  await setStorage({ intentHistory: history.slice(0, 500) });
  broadcastMessage({ type: 'INTENT_HISTORY_UPDATED' });
  triggerSync();
  return { success: true };
}
