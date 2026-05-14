// ============================================================
// Tabatha — Blockgate Service (Plan 023 Task 05a)
// Owns the site-blocking gate, temporary unblocks, sugar-box (deferred
// reading list), parked tabs, and side-quests. START_SIDE_QUEST is the
// only cross-service call surface — it pauses the active focus through
// focusService.pauseActiveFocus.
// ============================================================

import { DEFAULT_SETTINGS } from '../constants.js';
import {
  getStorage,
  setStorage,
  getSettings,
  getTabData,
  enforceArrayCap
} from './storageService.js';
import { broadcastAll, broadcastToExtension } from './notificationService.js';
import { archiveBeforeCap } from './archiveService.js';
import { pauseActiveFocus } from './focusService.js';

let injectedDeps = {};

export function configureBlockgateService(deps = {}) {
  injectedDeps = { ...injectedDeps, ...deps };
}

async function persistTabs(tabs) {
  if (injectedDeps.setTabData) return injectedDeps.setTabData(tabs);
  return setStorage({ tabs });
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
      return undefined;
  }
}

async function checkBlockedSite(sender) {
  let domain;
  try {
    domain = new URL(sender.tab.url).hostname;
  } catch {
    return { blocked: false };
  }

  const { blockedSites, tempUnblocked } = await getStorage(['blockedSites', 'tempUnblocked']);
  const sites = blockedSites || [];
  const temp = tempUnblocked || {};

  const isBlocked = sites.some(s => {
    if (s === domain) return true;
    if (s.startsWith('*.') && domain.endsWith(s.slice(2))) return true;
    if (domain.endsWith('.' + s)) return true;
    return false;
  });
  if (!isBlocked) return { blocked: false };

  if (temp[domain] && new Date(temp[domain].expiresAt) > new Date()) {
    return { blocked: false };
  }
  return { blocked: true };
}

async function manageBlockedSites(message) {
  const { blockedSites } = await getStorage('blockedSites');
  const sites = blockedSites || [];

  if (message.action === 'add' && message.domain) {
    if (!sites.includes(message.domain)) {
      sites.push(message.domain);
      await setStorage({ blockedSites: sites });
    }
    return { sites };
  }

  if (message.action === 'remove' && message.domain) {
    const filtered = sites.filter(s => s !== message.domain);
    await setStorage({ blockedSites: filtered });
    return { sites: filtered };
  }

  if (message.action === 'list') {
    return { sites };
  }

  return { sites };
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
  chrome.alarms.create(`blockgate-${message.domain}`, { delayInMinutes: message.minutes });
  return { success: true, expiresAt };
}

async function addToSugarBox(message, sender) {
  const { sugarBox } = await getStorage('sugarBox');
  const list = sugarBox || [];
  list.push({
    url: message.url,
    title: message.title,
    addedAt: new Date().toISOString()
  });
  await setStorage({ sugarBox: list });

  // FIFO cap: archive any entries that fall off the front of the list.
  const { dropped } = await enforceArrayCap('sugarBox', 'sugarBoxCap');
  if (dropped.length > 0) {
    await archiveBeforeCap('sugarBox', dropped, 'localArchive');
    broadcastToExtension({
      type: 'STORAGE_CAP_WARNING',
      key: 'sugarBox',
      count: dropped.length
    });
  }

  if (sender?.tab?.id) {
    try { await chrome.tabs.remove(sender.tab.id); } catch { /* ignore */ }
  }
  broadcastToExtension({ type: 'SUGAR_BOX_UPDATED' });
  return { success: true };
}

async function parkTab(message, sender) {
  const { parkedTabs } = await getStorage('parkedTabs');
  const list = parkedTabs || [];
  const exists = list.find(t => t.url === message.url);

  if (!exists) {
    list.push({
      url: message.url,
      title: message.title,
      context: message.context || null,
      note: message.note || null,
      parkedAt: new Date().toISOString()
    });
    await setStorage({ parkedTabs: list });
    broadcastToExtension({ type: 'PARKED_TABS_UPDATED' });

    // Warn once when the list crosses the configured threshold.
    const settings = await getSettings();
    const warnAt = settings?.storage?.parkedTabsWarnAt
      ?? DEFAULT_SETTINGS.storage.parkedTabsWarnAt;
    if (Number.isFinite(warnAt) && list.length === warnAt) {
      broadcastToExtension({
        type: 'PARKED_TABS_WARNING',
        count: list.length
      });
    }
  }

  if (sender?.tab?.id) {
    try { await chrome.tabs.remove(sender.tab.id); } catch { /* ignore */ }
  }
  return { success: true };
}

async function startSideQuest(message, sender) {
  if (!sender?.tab?.id) return { success: false };

  const tabs = await getTabData();
  if (tabs[sender.tab.id]) {
    tabs[sender.tab.id].context = message.context;
    tabs[sender.tab.id].intent = 'Side Quest';
    await persistTabs(tabs);
    broadcastAll({
      type: 'TAB_UPDATED',
      tabId: sender.tab.id,
      tabData: tabs[sender.tab.id]
    });
  }

  // Cross-service: pause the active focus with a reason so completion
  // reporting can distinguish side-quest pauses from user-driven pauses.
  await pauseActiveFocus('side-quest');

  if (Number.isFinite(message.minutes) && message.minutes > 0) {
    chrome.alarms.create(`context-timer-${sender.tab.id}`, { delayInMinutes: message.minutes });
  }
  return { success: true };
}
