// ============================================================
// Tabatha - Tab Service (Plan 023 Task 04a)
// Owns tab state, context/intent assignment, close protection, and the
// chrome.tabs lifecycle listeners that maintain the canonical tabs map.
// ============================================================

import * as timeTracker from '../../services/timeTracking.js';
import { PRIORITY_LEVELS } from '../constants.js';
import { detectCategory } from '../helpers.js';
import {
  getStorage,
  setStorage,
  getSettings,
  getTabData,
  getSubGroups,
  getCategories
} from './storageService.js';
import { broadcastAll, broadcastToExtension } from './notificationService.js';
import { appendIntentHistory, aggregateAndPruneTabTime } from './tabTrackingService.js';
import { appendClosedContext } from './sessionService.js';

let injectedDeps = {};
let listenersRegistered = false;

const serviceFlags = {
  focus: { ready: false }
};

const pendingCloseConfirmations = new Map();

export function configureTabService(deps = {}) {
  injectedDeps = { ...injectedDeps, ...deps };
  if (deps.services?.focus) {
    serviceFlags.focus = { ...serviceFlags.focus, ...deps.services.focus };
  }
}

export function registerTabServiceListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  chrome.tabs.onCreated.addListener(handleTabCreated);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);

  runOneShotCleanup();
}

export async function handleMessage(type, message, sender) {
  switch (type) {
    case 'GET_ALL_TABS':
      return { tabs: await getTabData() };

    case 'GET_TAB': {
      const allTabs = await getTabData();
      return { tab: allTabs[message.tabId] };
    }

    case 'UPDATE_TAB':
      return updateTab(message);

    case 'BATCH_UPDATE_CONTEXT':
      return batchUpdateContext(message);

    case 'SET_PRIORITY':
      return setPriority(message);

    case 'TOGGLE_LOCK':
      return toggleLock(message);

    case 'UPDATE_TAB_TITLE':
      return updateTabTitle(message);

    case 'TOGGLE_URL_LOCK':
      return toggleUrlLock(message);

    case 'REQUEST_CLOSE':
      return requestTabClose(message.tabId);

    case 'CANCEL_CLOSE':
      pendingCloseConfirmations.delete(message.tabId);
      return { success: true };

    case 'BULK_CLOSE':
      return bulkCloseTabs(message.tabIds, message.context, message.intent);

    case 'FOCUS_TAB':
      return focusTab(message.tabId);

    case 'CHECK_CONTEXT_NEEDED':
      return checkContextNeeded(sender);

    case 'SET_TAB_CONTEXT':
      return setTabContext(message, sender);

    case 'SET_INTENT':
      return setIntent(message, sender);

    case 'SKIP_DOMAIN':
      return skipDomain(message);

    case 'ASSOCIATE_TAB_WITH_FOCUS':
      return associateTabWithFocus(message, sender);

    case 'GET_CURRENT_TAB_ID':
      return { tabId: sender.tab ? sender.tab.id : null };

    case 'CLOSE_TAB':
      return closeTab(message.tabId);

    case 'LINK_TAB_TO_INTENT':
      return linkTabToIntent(message);

    case 'RENAME_TAB':
      return renameTab(message);

    case 'UPDATE_TAB_CONTEXT':
      return updateTabContext(message);

    default:
      return undefined;
  }
}

async function handleTabCreated(tab) {
  const tabs = await getTabData();
  const categories = await getCategories();
  const settings = await getSettings();

  const isFromOpener = !!tab.openerTabId;
  let inheritedContext = null;
  let inheritedIntent = null;
  let inheritedSubGroupId = null;
  let parentCategory = null;

  if (isFromOpener && tabs[tab.openerTabId]) {
    const parent = tabs[tab.openerTabId];
    inheritedContext = parent.context;
    inheritedIntent = parent.intent;
    inheritedSubGroupId = parent.subGroupId;
    parentCategory = parent.category;
  }

  const detectedCategory = detectCategory(tab.url || tab.pendingUrl || '', false, categories);

  tabs[tab.id] = {
    url: tab.url || tab.pendingUrl || '',
    title: tab.title || 'New Tab',
    openedAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    activeTime: 0,
    context: inheritedContext,
    intent: inheritedIntent,
    contextSource: inheritedContext ? 'inherited' : null,
    priority: 'none',
    locked: false,
    urlLocked: false,
    urlLockScope: null,
    groupId: tab.groupId !== chrome.tabGroups?.TAB_GROUP_ID_NONE ? tab.groupId : null,
    subGroupId: inheritedSubGroupId,
    category: parentCategory || detectedCategory,
    parentTabId: tab.openerTabId || null,
    timerOverrideMinutes: null,
    ignored: false,
    persistent: false
  };

  try {
    const { urlRules } = await getStorage('urlRules');
    if (urlRules && urlRules.length > 0) {
      const tabUrl = (tab.url || tab.pendingUrl || '').toLowerCase();
      for (const rule of urlRules) {
        if (!rule.autoApply) continue;
        const pattern = rule.pattern.toLowerCase();
        if (tabUrl.includes(pattern)) {
          if (rule.defaultIntent) {
            tabs[tab.id].intent = rule.defaultIntent;
            tabs[tab.id].contextSource = 'url_rule';
          }
          if (rule.defaultContext) {
            tabs[tab.id].context = rule.defaultContext;
            if (!tabs[tab.id].contextSource) tabs[tab.id].contextSource = 'url_rule';
          }
          break;
        }
      }
    }
  } catch (e) { /* non-critical */ }

  await setTabData(tabs);

  const timerMinutes = settings.globalTimerMinutes;
  if (timerMinutes > 0) {
    chrome.alarms.create(`context-timer-${tab.id}`, { delayInMinutes: timerMinutes });
  }

  if (!isFromOpener && detectedCategory === 'unknown') {
    broadcastToExtension({ type: 'PROMPT_PURPOSE', tabId: tab.id });
  }

  broadcastToExtension({ type: 'TAB_CREATED', tabId: tab.id, tabData: tabs[tab.id] });
}

async function handleTabRemoved(tabId) {
  const tabs = await getTabData();
  const tabData = tabs[tabId];

  if (tabData) {
    await autoParkPausedTab(tabId, tabData);
    await archiveClosedTab(tabId, tabData);
    await aggregateAndPruneTabTime(tabId, tabData);

    delete tabs[tabId];
    await setTabData(tabs);
  }

  await timeTracker.stopTracking(tabId);
  chrome.alarms.clear(`context-timer-${tabId}`);
  broadcastToExtension({ type: 'TAB_REMOVED', tabId });
}

async function handleTabUpdated(tabId, changeInfo, tab) {
  const tabs = await getTabData();
  if (!tabs[tabId]) return;

  if (changeInfo.url) {
    await timeTracker.stopTracking(tabId);
    tabs[tabId].url = changeInfo.url;
    const categories = await getCategories();
    const newCat = detectCategory(changeInfo.url, tab.audible, categories);
    if (tabs[tabId].category === 'unknown') {
      tabs[tabId].category = newCat;
    }
    await timeTracker.startTracking(tabId, changeInfo.url, tabs[tabId]);
  }

  if (changeInfo.title) {
    tabs[tabId].title = changeInfo.title;

    if (!tabs[tabId].context && !tabs[tabId].intent) {
      try {
        const asanaMatch = (tabs[tabId].url || '').match(/app\.asana\.com\/0\/\d+\/(\d+)/);
        if (asanaMatch && changeInfo.title && changeInfo.title !== 'Asana' && changeInfo.title !== 'Loading...') {
          const taskName = changeInfo.title.replace(/\s*[-\u2013\u2014]\s*Asana\s*$/i, '').replace(/\s*[-\u2013\u2014]\s*[^-\u2013\u2014]+$/, '').trim();
          if (taskName) {
            tabs[tabId].context = taskName;
            tabs[tabId].intent = 'asana_auto';
            tabs[tabId].contextSource = 'asana_auto';
            tabs[tabId].category = 'work';
            tabs[tabId].asanaTaskGid = asanaMatch[1];
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  if (changeInfo.audible !== undefined) {
    const categories = await getCategories();
    const detected = detectCategory(tabs[tabId].url, changeInfo.audible, categories);
    if (detected !== 'unknown' && tabs[tabId].category === 'unknown') {
      tabs[tabId].category = detected;
    }
  }

  await setTabData(tabs);
  broadcastAll({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
}

async function updateTab(message) {
  const tabs = await getTabData();
  if (tabs[message.tabId]) {
    Object.assign(tabs[message.tabId], message.updates);
    await setTabData(tabs);
    broadcastAll({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
  }
  return { success: true };
}

async function batchUpdateContext(message) {
  const tabs = await getTabData();
  for (const { tabId, context, intent } of message.updates) {
    if (tabs[tabId]) {
      tabs[tabId].context = context;
      tabs[tabId].intent = intent;
    }
  }
  await setTabData(tabs);
  broadcastToExtension({ type: 'TABS_BATCH_UPDATED' });
  return { success: true };
}

async function setPriority(message) {
  const tabs = await getTabData();
  if (tabs[message.tabId]) {
    tabs[message.tabId].priority = message.priority;
    await setTabData(tabs);

    if (tabs[message.tabId].groupId) {
      try {
        const color = PRIORITY_LEVELS[message.priority]?.color || 'grey';
        await chrome.tabGroups.update(tabs[message.tabId].groupId, { color });
      } catch (e) { /* group may not exist */ }
    }

    broadcastAll({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
  }
  return { success: true };
}

async function toggleLock(message) {
  const tabs = await getTabData();
  if (tabs[message.tabId]) {
    tabs[message.tabId].locked = !tabs[message.tabId].locked;
    await setTabData(tabs);
    broadcastAll({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
  }
  return { success: true };
}

async function updateTabTitle(message) {
  const tabs = await getTabData();
  if (tabs[message.tabId]) {
    tabs[message.tabId].customTitle = message.title;
    await setTabData(tabs);
    broadcastAll({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
  }
  return { success: true };
}

async function toggleUrlLock(message) {
  const tabs = await getTabData();
  if (tabs[message.tabId]) {
    tabs[message.tabId].urlLocked = !tabs[message.tabId].urlLocked;
    if (tabs[message.tabId].urlLocked) {
      tabs[message.tabId].urlLockScope = tabs[message.tabId].url;
    } else {
      tabs[message.tabId].urlLockScope = null;
    }
    await setTabData(tabs);

    if (tabs[message.tabId].urlLocked) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: message.tabId },
          files: ['url-lock.js']
        });
      } catch (e) { console.error('Could not inject url-lock script', e); }
    }

    broadcastAll({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
  }
  return { success: true };
}

async function requestTabClose(tabId) {
  const tabs = await getTabData();
  const tabData = tabs[tabId];

  if (!tabData) {
    await chrome.tabs.remove(tabId);
    return { closed: true };
  }

  if (tabData.locked) {
    if (pendingCloseConfirmations.has(tabId)) {
      pendingCloseConfirmations.delete(tabId);
      await chrome.tabs.remove(tabId);
      return { closed: true };
    }
    pendingCloseConfirmations.set(tabId, Date.now());
    return { closed: false, needsConfirmation: true, tabData };
  }

  await chrome.tabs.remove(tabId);
  return { closed: true };
}

async function bulkCloseTabs(tabIds, sharedContext, sharedIntent) {
  const tabs = await getTabData();

  for (const tabId of tabIds) {
    const tabData = tabs[tabId];
    if (tabData) {
      await appendClosedContext({
        url: tabData.url,
        title: tabData.title,
        context: sharedContext || tabData.context,
        intent: sharedIntent || tabData.intent,
        priority: tabData.priority,
        closedAt: new Date().toISOString(),
        activeTime: tabData.activeTime,
        groupName: null,
        subGroupId: tabData.subGroupId,
        category: tabData.category
      });
    }
  }

  const lockedTabs = [];
  const closableTabs = [];

  for (const tabId of tabIds) {
    if (tabs[tabId]?.locked) {
      lockedTabs.push(tabId);
    } else {
      closableTabs.push(tabId);
    }
  }

  if (closableTabs.length > 0) {
    await chrome.tabs.remove(closableTabs);
  }

  return { closed: closableTabs, needsConfirmation: lockedTabs };
}

async function focusTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
  } catch (e) { /* tab may not exist */ }
  return { success: true };
}

async function checkContextNeeded(sender) {
  if (!sender.tab?.id) return { needed: false };

  const { settings: gkSettings } = await getStorage('settings');
  if (gkSettings && gkSettings.gatekeeperEnabled === false) return { needed: false };

  const tabs = await getTabData();
  const tabData = tabs[sender.tab.id];
  if (!tabData) return { needed: false };

  const isBuiltIn = sender.tab.url.startsWith('chrome://') || sender.tab.url.startsWith('chrome-extension://');
  if (isBuiltIn) return { needed: false };

  if ((tabData.context || tabData.intent) && (tabData.contextSource === 'user' || tabData.contextSource === 'url_rule')) {
    return { needed: false };
  }

  try {
    const asanaMatch = sender.tab.url.match(/app\.asana\.com\/0\/\d+\/(\d+)/);
    if (asanaMatch) {
      const pageTitle = sender.tab.title || '';
      const taskName = pageTitle.replace(/\s*[-\u2013\u2014]\s*Asana\s*$/i, '').replace(/\s*[-\u2013\u2014]\s*[^-\u2013\u2014]+$/, '').trim();
      if (taskName && taskName !== 'Asana' && taskName !== 'Loading...') {
        tabData.context = taskName;
        tabData.intent = 'asana_auto';
        tabData.contextSource = 'asana_auto';
        tabData.category = 'work';
        tabData.asanaTaskGid = asanaMatch[1];
        tabs[sender.tab.id] = tabData;
        await setTabData(tabs);
        broadcastAll({ type: 'TAB_UPDATED', tabId: sender.tab.id, tabData });
        if (!gkSettings || gkSettings.autoAssociateTabs !== false) {
          await associateTabWithActiveFocus(sender.tab.id);
        }
        return { needed: false };
      }
    }
  } catch (e) { /* not an Asana URL or title parsing failed */ }

  try {
    const { parkedTabs } = await getStorage('parkedTabs');
    if (parkedTabs) {
      const parkedIdx = parkedTabs.findIndex(t => t.url === sender.tab.url);
      if (parkedIdx !== -1) {
        const parkedData = parkedTabs[parkedIdx];
        tabData.intent = parkedData.context || 'Restored from Parked';
        tabs[sender.tab.id] = tabData;
        await setTabData(tabs);
        parkedTabs.splice(parkedIdx, 1);
        await setStorage({ parkedTabs });
        broadcastToExtension({ type: 'PARKED_TABS_UPDATED' });
        return { needed: false };
      }
    }
  } catch (e) { /* ignore */ }

  try {
    const domain = new URL(sender.tab.url).hostname;
    const { skippedDomains } = await getStorage('skippedDomains');
    if (skippedDomains && skippedDomains.includes(domain)) return { needed: false };
  } catch (e) { /* invalid URL */ }

  if (!gkSettings || gkSettings.autoAssociateTabs !== false) {
    await associateTabWithActiveFocus(sender.tab.id);
  }

  return {
    needed: true,
    inheritedContext: tabData.context || null,
    inheritedIntent: tabData.intent || null,
    contextSource: tabData.contextSource || null
  };
}

async function setTabContext(message, sender) {
  if (!sender.tab?.id) return { error: 'No tab context' };

  const tabs = await getTabData();
  if (!tabs[sender.tab.id]) {
    tabs[sender.tab.id] = buildTabEntryFromSender(sender);
  }

  const oldIntent = tabs[sender.tab.id].intent;
  const oldContext = tabs[sender.tab.id].context;
  tabs[sender.tab.id].context = message.context;
  tabs[sender.tab.id].category = message.category || tabs[sender.tab.id].category || 'unknown';
  tabs[sender.tab.id].intent = message.intent;
  tabs[sender.tab.id].contextSource = 'user';
  await setTabData(tabs);
  broadcastAll({ type: 'TAB_UPDATED', tabId: sender.tab.id, tabData: tabs[sender.tab.id] });

  if (message.intent !== oldIntent || message.context !== oldContext) {
    try {
      const domain = new URL(sender.tab.url || '').hostname.replace(/^www\./, '');
      await appendIntentHistory({
        tabId: sender.tab.id,
        url: sender.tab.url,
        domain,
        action: 'change',
        context: message.context || null,
        oldIntent: oldIntent || null,
        newIntent: message.intent || null,
        oldContext: oldContext || null,
        newContext: message.context || null
      });
    } catch (e) { /* non-critical */ }
  }

  return { success: true };
}

async function setIntent(message, sender) {
  if (!sender.tab?.id) return { error: 'No tab context' };

  const tabs = await getTabData();
  const tabId = sender.tab.id;
  if (!tabs[tabId]) {
    tabs[tabId] = {
      url: sender.tab.url || '',
      title: sender.tab.title || 'Untitled',
      openedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      activeTime: 0,
      context: null,
      intent: null,
      contextSource: null
    };
  }

  const payload = message.payload || {};
  if (payload.resolved) {
    tabs[tabId].context = null;
    tabs[tabId].intent = null;
    tabs[tabId].contextSource = null;
    tabs[tabId].resolvedAt = new Date().toISOString();
  } else {
    tabs[tabId].context = payload.intent || tabs[tabId].context;
    tabs[tabId].intent = payload.intent || tabs[tabId].intent;
    if (payload.description) tabs[tabId].intentDescription = payload.description;
    tabs[tabId].contextSource = 'user';
    tabs[tabId].startedAt = new Date().toISOString();

    if (payload.intent) {
      await autoQueueFromIntent(payload.intent, tabId);
    }
  }

  await setTabData(tabs);
  broadcastAll({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
  return { success: true };
}

async function skipDomain(message) {
  const { skippedDomains } = await getStorage('skippedDomains');
  const list = skippedDomains || [];
  if (!list.includes(message.domain)) {
    list.push(message.domain);
    await setStorage({ skippedDomains: list });
  }
  return { success: true };
}

async function associateTabWithFocus(message, sender) {
  const focusId = message.focusId;
  const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
  if (focusId && tabId) {
    await linkTabToFocus(focusId, tabId, { updateTabIntent: false });
  }
  return { success: true };
}

async function closeTab(tabId) {
  try { await chrome.tabs.remove(tabId); } catch (e) { /* tab may not exist */ }
  return { success: true };
}

async function linkTabToIntent(message) {
  const { tabId, targetIntentId } = message;
  await linkTabToFocus(targetIntentId, tabId, { updateTabIntent: true });
  return { success: true };
}

async function renameTab(message) {
  const tabs = await getTabData();
  if (tabs[message.tabId]) {
    tabs[message.tabId].customTitle = message.newTitle;
    await setTabData(tabs);
    broadcastAll({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
  }
  return { success: true };
}

async function updateTabContext(message) {
  const tabs = await getTabData();
  const { tabId, context } = message;
  if (tabs[tabId]) {
    tabs[tabId].context = context;
    tabs[tabId].intent = context;
    await setTabData(tabs);
    broadcastAll({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
    logEvent('tab_reassigned', { tabId, newContext: context });
  }
  return { success: true };
}

// Context-timer alarm handler. Routed from alarmService when a
// `context-timer-<tabId>` alarm fires. Either prompts for context if the
// tab still lacks one, or fires an intent-reinforcement reminder and
// re-arms the alarm.
export async function handleContextTimerExpired(tabId) {
  const tabs = await getTabData();
  const tabData = tabs[tabId];
  if (!tabData) return;

  if (!tabData.ignored && !tabData.context) {
    broadcastToExtension({ type: 'CONTEXT_REMINDER', tabId, tabData });
    chrome.notifications.create(`context-${tabId}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Tabatha — Context Needed',
      message: `"${tabData.title}" has been open for a while. What are you working on?`
    });
    return;
  }

  if (tabData.context) {
    const settings = await getSettings();
    const timerMinutes = tabData.timerOverrideMinutes || settings.globalTimerMinutes;
    broadcastToExtension({ type: 'INTENT_REINFORCEMENT', tabId, tabData });
    chrome.alarms.create(`context-timer-${tabId}`, { delayInMinutes: timerMinutes });
  }
}

export async function tryAssociateTab(tabId) {
  const engine = await getFocusEngine();
  if (!engine.activeFocusId) return;
  const active = engine.items[engine.activeFocusId];
  if (!active || active.focusState !== 'active') return;

  active.associatedTabIds = active.associatedTabIds || [];
  if (active.associatedTabIds.includes(tabId)) return;

  const tabs = await getTabData();
  const tab = tabs[tabId];
  if (!tab) return;

  if (tab.parentTabId && active.associatedTabIds.includes(tab.parentTabId)) {
    active.associatedTabIds.push(tabId);
    await setFocusEngine(engine);
    return;
  }

  try {
    const tabDomain = new URL(tab.url).hostname;
    for (const assocId of active.associatedTabIds) {
      const assocTab = tabs[assocId];
      if (assocTab) {
        const assocDomain = new URL(assocTab.url).hostname;
        if (tabDomain === assocDomain) {
          active.associatedTabIds.push(tabId);
          await setFocusEngine(engine);
          return;
        }
      }
    }
  } catch (e) { /* invalid URLs */ }
}

async function autoParkPausedTab(tabId, tabData) {
  const { pausedIntents = {} } = await getStorage('pausedIntents');
  const pauseData = pausedIntents[tabId];
  if (!pauseData) return;

  const { parkedTabs = [] } = await getStorage('parkedTabs');
  parkedTabs.unshift({
    url: tabData.url,
    title: tabData.customTitle || tabData.title,
    context: tabData.context || tabData.intent || pauseData.intentLabel || '',
    note: pauseData.note || '',
    parkedAt: new Date().toISOString(),
    pausedAt: pauseData.pausedAt,
    source: 'auto-park'
  });
  await setStorage({ parkedTabs: parkedTabs.slice(0, 200) });

  delete pausedIntents[tabId];
  await setStorage({ pausedIntents });
}

async function archiveClosedTab(tabId, tabData) {
  const { inbarNotes = {} } = await getStorage('inbarNotes');
  const note = inbarNotes[tabId] || inbarNotes[String(tabId)];
  const noteText = typeof note === 'string' ? note : note?.text;
  const hasNote = !!(noteText && noteText.trim());

  if (tabData.context || tabData.intent || hasNote) {
    await appendClosedContext({
      url: tabData.url,
      title: tabData.title,
      context: tabData.context,
      intent: tabData.intent,
      priority: tabData.priority,
      closedAt: new Date().toISOString(),
      activeTime: tabData.activeTime,
      groupName: null,
      subGroupId: tabData.subGroupId,
      category: tabData.category,
      inbarNote: hasNote ? noteText : null,
      inbarNoteUpdatedAt: hasNote ? note.updatedAt || null : null
    });
  }

  if (inbarNotes[tabId] !== undefined || inbarNotes[String(tabId)] !== undefined) {
    delete inbarNotes[tabId];
    delete inbarNotes[String(tabId)];
    await setStorage({ inbarNotes });
  }
}

async function associateTabWithActiveFocus(tabId) {
  const engine = await getFocusEngine();
  if (engine.activeFocusId && engine.items[engine.activeFocusId]) {
    const focus = engine.items[engine.activeFocusId];
    focus.associatedTabIds = focus.associatedTabIds || [];
    if (!focus.associatedTabIds.includes(tabId)) {
      focus.associatedTabIds.push(tabId);
      await setFocusEngine(engine);
    }
  }
}

async function autoQueueFromIntent(intentLabel, tabId) {
  try {
    if (serviceFlags.focus.ready && injectedDeps.autoQueueFromIntent) {
      await injectedDeps.autoQueueFromIntent(intentLabel, tabId);
      return;
    }

    const { tabathaSettings } = await getStorage('tabathaSettings');
    const bridgeMode = tabathaSettings?.intentBridgeMode || 'smart_dedup';

    if (bridgeMode === 'manual') return;

    const engine = await getFocusEngine();
    const activeFocus = engine.activeFocusId ? engine.items[engine.activeFocusId] : null;
    const activeLabel = activeFocus?.label?.toLowerCase()?.trim() || '';
    const newLabel = intentLabel.toLowerCase().trim();

    const existingMatch = Object.values(engine.items).find(
      item => item.label?.toLowerCase()?.trim() === newLabel && item.focusState !== 'completed'
    );

    const shouldAutoQueue = bridgeMode === 'always'
      ? !existingMatch
      : newLabel !== activeLabel && !existingMatch;

    if (shouldAutoQueue) {
      const defaultRealm = tabathaSettings?.defaultRealm || '';
      const result = await addFocus(intentLabel, 15, { realm: defaultRealm });
      const newItem = result.engine.items[result.newFocusId];
      if (newItem) {
        newItem.associatedTabIds = [...(newItem.associatedTabIds || []), tabId];
        await setFocusEngine(result.engine);
      }
      broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
    } else if (existingMatch) {
      if (!existingMatch.associatedTabIds?.includes(tabId)) {
        existingMatch.associatedTabIds = [...(existingMatch.associatedTabIds || []), tabId];
        await setFocusEngine(engine);
      }
    }
  } catch (bridgeErr) {
    console.warn('[Intent Bridge] Error:', bridgeErr);
  }
}

async function linkTabToFocus(focusId, tabId, { updateTabIntent }) {
  if (serviceFlags.focus.ready && injectedDeps.linkTabToFocus) {
    await injectedDeps.linkTabToFocus(focusId, tabId);
    return;
  }

  const engine = await getFocusEngine();
  const tabs = await getTabData();

  if (engine.items[focusId]) {
    Object.values(engine.items).forEach(intent => {
      intent.associatedTabIds = (intent.associatedTabIds || []).filter(id => id !== tabId);
    });

    if (!engine.items[focusId].associatedTabIds?.includes(tabId)) {
      engine.items[focusId].associatedTabIds = [
        ...(engine.items[focusId].associatedTabIds || []),
        tabId
      ];
    }
    await setFocusEngine(engine);

    if (updateTabIntent && tabs[tabId]) {
      tabs[tabId].intent = engine.items[focusId].label;
      await setTabData(tabs);
      broadcastAll({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
    }

    broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  }
}

function buildTabEntryFromSender(sender) {
  return {
    url: sender.tab.url || '',
    title: sender.tab.title || 'Untitled',
    openedAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    activeTime: 0,
    context: null,
    intent: null,
    priority: 'none',
    locked: false,
    urlLocked: false,
    urlLockScope: null,
    groupId: null,
    subGroupId: null,
    category: 'unknown',
    parentTabId: sender.tab.openerTabId || null,
    timerOverrideMinutes: null,
    ignored: false,
    persistent: false
  };
}

async function getFocusEngine() {
  if (injectedDeps.getFocusEngine) return injectedDeps.getFocusEngine();
  const { focusEngine } = await getStorage('focusEngine');
  return focusEngine || { activeFocusId: null, items: {}, history: [] };
}

async function setFocusEngine(engine) {
  if (injectedDeps.setFocusEngine) return injectedDeps.setFocusEngine(engine);
  return setStorage({ focusEngine: engine });
}

async function addFocus(label, timerMinutes, tags) {
  if (injectedDeps.addFocus) return injectedDeps.addFocus(label, timerMinutes, tags);
  const engine = await getFocusEngine();
  const id = `f_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  engine.items[id] = {
    id,
    label,
    focusState: 'paused',
    funnelStage: 'todo',
    createdAt: new Date().toISOString(),
    timerMinutes,
    associatedTabIds: [],
    tags
  };
  await setFocusEngine(engine);
  return { engine, newFocusId: id };
}

async function setTabData(tabs) {
  return injectedDeps.setTabData ? injectedDeps.setTabData(tabs) : setStorage({ tabs });
}

function logEvent(type, data = {}) {
  if (injectedDeps.logEvent) return injectedDeps.logEvent(type, data);
  const entry = { type, ...data, ts: new Date().toISOString() };
  chrome.storage.local.get('tabathaLogs', r => {
    const logs = r.tabathaLogs || [];
    logs.push(entry);
    chrome.storage.local.set({ tabathaLogs: logs.slice(-500) });
  });
}

async function runOneShotCleanup() {
  try {
    const { tabService04aCleanupDone } = await getStorage('tabService04aCleanupDone');
    if (tabService04aCleanupDone) return;
    await chrome.storage.local.remove('_legacyTasksBackup');
    await setStorage({ tabService04aCleanupDone: true });
  } catch (e) { /* cleanup is best-effort */ }
}
