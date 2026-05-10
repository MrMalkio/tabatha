import * as timeTracker from '../../services/timeTracking.js';
import { patternToRegex } from '../helpers.js';
import { getCategories, getClosedContexts, getSettings, getStorage, getTabData, setStorage } from './storageService.js';
import { broadcastMessage } from './notificationService.js';

let dependencies = {
  setTabData: async (tabs) => setStorage({ tabs }),
  getFocusEngine: async () => ({ activeFocusId: null, items: {}, history: [] }),
  setFocusEngine: async (engine) => setStorage({ focusEngine: engine }),
};

const pendingCloseConfirmations = new Map();
let lifecycleListenersRegistered = false;

export function configureTabService(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export function registerTabLifecycleListeners() {
  if (lifecycleListenersRegistered) return;
  lifecycleListenersRegistered = true;

  chrome.tabs.onCreated.addListener(handleTabCreated);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
}

export async function handleMessage(type, message, sender) {
  switch (type) {
    case 'GET_ALL_TABS':
      return { tabs: await getTabData() };
    case 'GET_TAB': {
      const allTabs = await getTabData();
      return { tab: allTabs[message.tabId] };
    }
    case 'GET_CURRENT_TAB_ID':
      return { tabId: sender.tab ? sender.tab.id : null };
    case 'UPDATE_TAB':
      return updateTab(message);
    case 'UPDATE_TAB_TITLE':
      return updateTabTitle(message);
    case 'SET_TAB_CONTEXT':
      return setTabContext(message, sender);
    case 'LINK_TAB_TO_INTENT':
      return linkTabToIntent(message);
    case 'BATCH_UPDATE_CONTEXT':
      return batchUpdateContext(message);
    case 'CHECK_CONTEXT_NEEDED':
      return checkContextNeeded(sender);
    case 'SKIP_DOMAIN':
      return skipDomain(message);
    case 'TOGGLE_LOCK':
      return toggleLock(message);
    case 'TOGGLE_URL_LOCK':
      return toggleUrlLock(message);
    case 'FOCUS_TAB':
      return focusTab(message);
    case 'CLOSE_TAB':
      return closeTab(message);
    case 'BULK_CLOSE':
      return bulkCloseTabs(message.tabIds, message.context, message.intent);
    case 'REQUEST_CLOSE':
      return requestTabClose(message.tabId);
    case 'CANCEL_CLOSE':
      pendingCloseConfirmations.delete(message.tabId);
      return { success: true };
    default:
      return null;
  }
}

async function updateTab(message) {
  const { setTabData } = dependencies;
  const tabs = await getTabData();
  if (tabs[message.tabId]) {
    Object.assign(tabs[message.tabId], message.updates);
    await setTabData(tabs);
    broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
  }
  return { success: true };
}

function detectCategory(url, audible, categories) {
  if (!url) return 'unknown';

  for (const [catId, cat] of Object.entries(categories)) {
    if (catId === 'unknown' || catId === 'work') continue;
    if (!cat.rules?.autoDetect) continue;

    for (const pattern of cat.urlPatterns || []) {
      const regex = patternToRegex(pattern);
      if (regex && regex.test(url)) return catId;
    }
  }

  if (audible && url.match(/youtube\.com\/watch/)) return 'media';

  return 'unknown';
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

  await dependencies.setTabData(tabs);

  const timerMinutes = settings.globalTimerMinutes;
  if (timerMinutes > 0) {
    chrome.alarms.create(`context-timer-${tab.id}`, { delayInMinutes: timerMinutes });
  }

  if (!isFromOpener && detectedCategory === 'unknown') {
    broadcastMessage({ type: 'PROMPT_PURPOSE', tabId: tab.id });
  }

  broadcastMessage({ type: 'TAB_CREATED', tabId: tab.id, tabData: tabs[tab.id] });
}

async function handleTabRemoved(tabId) {
  const tabs = await getTabData();
  const tabData = tabs[tabId];

  if (tabData) {
    if (tabData.context || tabData.intent) {
      const closedContexts = await getClosedContexts();
      closedContexts.unshift({
        url: tabData.url,
        title: tabData.title,
        context: tabData.context,
        intent: tabData.intent,
        priority: tabData.priority,
        closedAt: new Date().toISOString(),
        activeTime: tabData.activeTime,
        groupName: null,
        subGroupId: tabData.subGroupId,
        category: tabData.category
      });
      await setStorage({ closedContexts: closedContexts.slice(0, 500) });
    }

    delete tabs[tabId];
    await dependencies.setTabData(tabs);
  }

  chrome.alarms.clear(`context-timer-${tabId}`);

  broadcastMessage({ type: 'TAB_REMOVED', tabId });
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

  await dependencies.setTabData(tabs);
  broadcastMessage({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
}

async function updateTabTitle(message) {
  const { setTabData } = dependencies;
  const tabs = await getTabData();
  if (tabs[message.tabId]) {
    tabs[message.tabId].customTitle = message.title;
    await setTabData(tabs);
    broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
  }
  return { success: true };
}

async function batchUpdateContext(message) {
  const { setTabData } = dependencies;
  const tabs = await getTabData();
  for (const { tabId, context, intent } of message.updates) {
    if (tabs[tabId]) {
      tabs[tabId].context = context;
      tabs[tabId].intent = intent;
    }
  }
  await setTabData(tabs);
  broadcastMessage({ type: 'TABS_BATCH_UPDATED' });
  return { success: true };
}

async function toggleLock(message) {
  const { setTabData } = dependencies;
  const tabs = await getTabData();
  if (tabs[message.tabId]) {
    tabs[message.tabId].locked = !tabs[message.tabId].locked;
    await setTabData(tabs);
    broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
  }
  return { success: true };
}

async function toggleUrlLock(message) {
  const { setTabData } = dependencies;
  const tabs = await getTabData();
  if (tabs[message.tabId]) {
    tabs[message.tabId].urlLocked = !tabs[message.tabId].urlLocked;
    if (tabs[message.tabId].urlLocked) {
      tabs[message.tabId].urlLockScope = tabs[message.tabId].url;
    } else {
      tabs[message.tabId].urlLockScope = null;
    }
    await setTabData(tabs);

    // Inject/remove content script.
    if (tabs[message.tabId].urlLocked) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: message.tabId },
          files: ['url-lock.js']
        });
      } catch (e) { console.error('Could not inject url-lock script', e); }
    }

    broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
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
      // Second confirmation - actually close.
      pendingCloseConfirmations.delete(tabId);
      await chrome.tabs.remove(tabId);
      return { closed: true };
    } else {
      // First attempt - request confirmation.
      pendingCloseConfirmations.set(tabId, Date.now());
      return { closed: false, needsConfirmation: true, tabData };
    }
  }

  await chrome.tabs.remove(tabId);
  return { closed: true };
}

async function bulkCloseTabs(tabIds, sharedContext, sharedIntent) {
  const tabs = await getTabData();
  const closedContexts = await getClosedContexts();

  for (const tabId of tabIds) {
    const tabData = tabs[tabId];
    if (tabData) {
      closedContexts.unshift({
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

  await setStorage({ closedContexts: closedContexts.slice(0, 500) });

  // Remove non-locked tabs, collect locked ones for confirmation.
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

async function focusTab(message) {
  try {
    const tab = await chrome.tabs.get(message.tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(message.tabId, { active: true });
  } catch (e) { /* tab may not exist */ }
  return { success: true };
}

async function checkContextNeeded(sender) {
  const { getFocusEngine, setFocusEngine, setTabData } = dependencies;

  // Check if gatekeeper is globally disabled.
  const { settings: gkSettings } = await getStorage('settings');
  if (gkSettings && gkSettings.gatekeeperEnabled === false) return { needed: false };

  const tabs = await getTabData();
  const tabData = tabs[sender.tab.id];
  if (!tabData) return { needed: false };

  // INTERCEPTION LOGIC:
  // 1. Not from an opener (fresh tab navigation)
  // 2. No context set yet
  // 3. Not a built-in page (newtab, extensions, etc.)
  // 4. Not an "Unloaded" tab being restored

  const isBuiltIn = sender.tab.url.startsWith('chrome://') || sender.tab.url.startsWith('chrome-extension://');
  if (isBuiltIn) return { needed: false };

  // If it already has USER-EXPLICIT or URL-RULE context/intent, skip.
  // Inherited and auto-detected contexts should still prompt.
  if ((tabData.context || tabData.intent) && (tabData.contextSource === 'user' || tabData.contextSource === 'url_rule')) return { needed: false };

  // --- Asana URL auto-intent ---
  // Detect Asana task URLs and auto-set context from the task title
  try {
    const asanaMatch = sender.tab.url.match(/app\.asana\.com\/0\/\d+\/(\d+)/);
    if (asanaMatch) {
      // Use the page title which Asana sets to the task name
      const pageTitle = sender.tab.title || '';
      // Asana titles follow pattern: "Task Name - Project - Asana" or just "Task Name"
      const taskName = pageTitle.replace(/\s*[-â€“â€”]\s*Asana\s*$/i, '').replace(/\s*[-â€“â€”]\s*[^-â€“â€”]+$/, '').trim();
      if (taskName && taskName !== 'Asana' && taskName !== 'Loading...') {
        tabData.context = taskName;
        tabData.intent = 'asana_auto';
        tabData.contextSource = 'asana_auto';
        tabData.category = 'work';
        tabData.asanaTaskGid = asanaMatch[1];
        tabs[sender.tab.id] = tabData;
        await setTabData(tabs);
        broadcastMessage({ type: 'TAB_UPDATED', tabId: sender.tab.id, tabData });
        // Auto-associate with active focus
        if (!gkSettings || gkSettings.autoAssociateTabs !== false) {
          const engine = await getFocusEngine();
          if (engine.activeFocusId && engine.items[engine.activeFocusId]) {
            const focus = engine.items[engine.activeFocusId];
            if (!focus.associatedTabIds.includes(sender.tab.id)) {
              focus.associatedTabIds.push(sender.tab.id);
              await setFocusEngine(engine);
            }
          }
        }
        return { needed: false };
      }
    }
  } catch (e) { /* not an Asana URL or title parsing failed */ }

  // Check if restoring a parked tab
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
        broadcastMessage({ type: 'PARKED_TABS_UPDATED' });
        return { needed: false };
      }
    }
  } catch (e) { /* ignore */ }

  // Check if domain is skipped
  try {
    const domain = new URL(sender.tab.url).hostname;
    const { skippedDomains } = await getStorage('skippedDomains');
    if (skippedDomains && skippedDomains.includes(domain)) return { needed: false };
  } catch (e) { /* invalid URL */ }

  // Auto-associate tab with active focus if setting enabled
  if (!gkSettings || gkSettings.autoAssociateTabs !== false) {
    const engine = await getFocusEngine();
    if (engine.activeFocusId && engine.items[engine.activeFocusId]) {
      const focus = engine.items[engine.activeFocusId];
      if (!focus.associatedTabIds.includes(sender.tab.id)) {
        focus.associatedTabIds.push(sender.tab.id);
        await setFocusEngine(engine);
      }
    }
  }

  return {
    needed: true,
    inheritedContext: tabData.context || null,
    inheritedIntent: tabData.intent || null,
    contextSource: tabData.contextSource || null,
  };
}

async function setTabContext(message, sender) {
  const { setTabData } = dependencies;
  const tabs = await getTabData();
  // Create tab entry if it doesn't exist yet (gatekeeper can fire before onTabCreated)
  if (!tabs[sender.tab.id]) {
    tabs[sender.tab.id] = {
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
  const oldIntent = tabs[sender.tab.id].intent;
  const oldContext = tabs[sender.tab.id].context;
  tabs[sender.tab.id].context = message.context;
  tabs[sender.tab.id].category = message.category || tabs[sender.tab.id].category || 'unknown';
  tabs[sender.tab.id].intent = message.intent;
  tabs[sender.tab.id].contextSource = 'user';
  await setTabData(tabs);
  broadcastMessage({ type: 'TAB_UPDATED', tabId: sender.tab.id, tabData: tabs[sender.tab.id] });

  // Log intent change for URL Rules changelog
  if (message.intent !== oldIntent || message.context !== oldContext) {
    try {
      const domain = new URL(sender.tab.url || '').hostname.replace(/^www\./, '');
      const { intentChangeLog } = await getStorage('intentChangeLog');
      const log = intentChangeLog || [];
      log.unshift({
        timestamp: new Date().toISOString(),
        tabId: sender.tab.id,
        url: sender.tab.url,
        domain,
        oldIntent: oldIntent || null,
        newIntent: message.intent || null,
        oldContext: oldContext || null,
        newContext: message.context || null,
      });
      await setStorage({ intentChangeLog: log.slice(0, 500) }); // keep last 500
    } catch (e) { /* non-critical */ }
  }
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

async function closeTab(message) {
  try { await chrome.tabs.remove(message.tabId); } catch(e) { /* tab may not exist */ }
  return { success: true };
}

async function linkTabToIntent(message) {
  const { getFocusEngine, setFocusEngine, setTabData } = dependencies;
  const engine = await getFocusEngine();
  const tabs = await getTabData();
  const { tabId, targetIntentId } = message;

  if (engine.items[targetIntentId]) {
    // Remove from other intents
    Object.values(engine.items).forEach(intent => {
      intent.associatedTabIds = intent.associatedTabIds.filter(id => id !== tabId);
    });
    // Add to new intent
    if (!engine.items[targetIntentId].associatedTabIds.includes(tabId)) {
      engine.items[targetIntentId].associatedTabIds.push(tabId);
    }
    await setFocusEngine(engine);

    // Update tab's internal context/intent if applicable
    if (tabs[tabId]) {
      tabs[tabId].intent = engine.items[targetIntentId].label;
      await setTabData(tabs);
      broadcastMessage({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
    }

    broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
  }
  return { success: true };
}
