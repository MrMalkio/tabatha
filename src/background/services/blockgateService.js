import { getStorage, getTabData, setStorage } from './storageService.js';
import { broadcastMessage } from './notificationService.js';

let dependencies = {
  setTabData: async (tabs) => setStorage({ tabs }),
};

export function configureBlockgateService(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export async function handleMessage(type, message, sender) {
  switch (type) {
    case 'CHECK_BLOCKED_SITE':
      return checkBlockedSite(sender);
    case 'MANAGE_BLOCKED_SITES':
      return manageBlockedSites(message);
    case 'UNBLOCK_SITE_TEMPORARILY':
      return unblockSiteTemporarily(message);
    case 'ADD_TO_SUGAR_BOX':
      return addToSugarBox(message, sender);
    case 'PARK_TAB':
      return parkTab(message, sender);
    case 'START_SIDE_QUEST':
      return startSideQuest(message, sender);
    default:
      return null;
  }
}

async function startSideQuest(message, sender) {
  const { setTabData } = dependencies;
  const tabs = await getTabData();
  if (tabs[sender.tab.id]) {
    tabs[sender.tab.id].context = message.context;
    tabs[sender.tab.id].intent = 'Side Quest';
    await setTabData(tabs);
    broadcastMessage({ type: 'TAB_UPDATED', tabId: sender.tab.id, tabData: tabs[sender.tab.id] });

    // Start 5m timer.
    chrome.alarms.create(`context-timer-${sender.tab.id}`, { delayInMinutes: message.minutes });
  }
  return { success: true };
}

async function addToSugarBox(message, sender) {
  // Simple storage for now.
  const { sugarBox } = await getStorage('sugarBox');
  const list = sugarBox || [];
  list.push({ url: message.url, title: message.title, addedAt: new Date().toISOString() });
  await setStorage({ sugarBox: list });

  await chrome.tabs.remove(sender.tab.id);

  // Notify sidebar?
  broadcastMessage({ type: 'SUGAR_BOX_UPDATED' });
  return { success: true };
}

async function parkTab(message, sender) {
  const { parkedTabs } = await getStorage('parkedTabs');
  const list = parkedTabs || [];
  const exists = list.find(t => t.url === message.url);
  if (!exists) {
    list.push({ url: message.url, title: message.title, context: message.context || null, parkedAt: new Date().toISOString() });
    await setStorage({ parkedTabs: list });
    broadcastMessage({ type: 'PARKED_TABS_UPDATED' });
  }
  try { await chrome.tabs.remove(sender.tab.id); } catch(e) { /* ignore */ }
  return { success: true };
}

async function checkBlockedSite(sender) {
  const { blockedSites, tempUnblocked } = await getStorage(['blockedSites', 'tempUnblocked']);
  const sites = blockedSites || [];
  const temp = tempUnblocked || {};
  const domain = new URL(sender.tab.url).hostname;

  // Check if domain matches a blocked pattern.
  const isBlocked = sites.some(s => {
    if (s === domain) return true;
    // Wildcard: *.example.com matches sub.example.com
    if (s.startsWith('*.') && domain.endsWith(s.slice(2))) return true;
    // Suffix match: example.com matches www.example.com
    if (domain.endsWith('.' + s)) return true;
    return false;
  });

  if (!isBlocked) return { blocked: false };

  // Check temp unblock.
  if (temp[domain] && new Date(temp[domain].expiresAt) > new Date()) {
    return { blocked: false };
  }

  return { blocked: true };
}

async function unblockSiteTemporarily(message) {
  const { tempUnblocked } = await getStorage('tempUnblocked');
  const temp = tempUnblocked || {};
  const expiresAt = new Date(Date.now() + message.minutes * 60 * 1000).toISOString();
  temp[message.domain] = {
    expiresAt,
    why: message.why,
    intent: message.intent,
    unlockedAt: new Date().toISOString()
  };
  await setStorage({ tempUnblocked: temp });

  // Set alarm to re-block.
  chrome.alarms.create(`blockgate-${message.domain}`, { delayInMinutes: message.minutes });

  return { success: true, expiresAt };
}

async function manageBlockedSites(message) {
  const { blockedSites } = await getStorage('blockedSites');
  const sites = blockedSites || [];

  if (message.action === 'add' && message.domain) {
    if (!sites.includes(message.domain)) {
      sites.push(message.domain);
      await setStorage({ blockedSites: sites });
    }
  } else if (message.action === 'remove' && message.domain) {
    const filtered = sites.filter(s => s !== message.domain);
    await setStorage({ blockedSites: filtered });
    return { sites: filtered };
  } else if (message.action === 'list') {
    return { sites };
  }

  return { sites };
}
