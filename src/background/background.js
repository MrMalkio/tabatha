// Tabatha — Service Worker (background.js)
// Core orchestrator for tab tracking, context/intent, priority, locking, 
// groups, categories, time tracking, and markdown export.

import { supabase } from '../services/supabaseClient';
import * as timeTracker from '../services/timeTracking.js';
import { BUILT_IN_CATEGORIES, DEFAULT_FOCUS_ENGINE, DEFAULT_SETTINGS } from './constants.js';
import { patternToRegex } from './helpers.js';
import { createClockService, handleMessage as handleClockMessage } from './services/clockService.js';
import {
  configureFocusService,
  handleMessage as handleFocusMessage,
  tryAssociateTab,
} from './services/focusService.js';
import { configureGroupService, handleMessage as handleGroupMessage } from './services/groupService.js';
import {
  broadcastMessage,
  configureNotificationService,
  handleMessage as handleNotificationMessage,
} from './services/notificationService.js';
import { handleMessage as handleCategoryMessage } from './services/categoryService.js';
import { configureSessionService, handleMessage as handleSessionMessage } from './services/sessionService.js';
import { handleMessage as handleSettingsMessage } from './services/settingsService.js';
import { configureTabService, handleMessage as handleTabMessage } from './services/tabService.js';
import {
  configureTabTrackingService,
  handleMessage as handleTabTrackingMessage,
  registerTabTrackingListeners,
} from './services/tabTrackingService.js';
import { handleMessage as handleTaskMessage } from './services/taskService.js';


// ============================================================
// STORAGE HELPERS
// ============================================================

async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

async function setStorage(data) {
  return chrome.storage.local.set(data);
}

async function getSettings() {
  const { settings } = await getStorage('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function getTabData() {
  const { tabs } = await getStorage('tabs');
  return tabs || {};
}

async function setTabData(tabs) {
  const result = await setStorage({ tabs });
  triggerSync();
  return result;
}

async function getSubGroups() {
  const { subGroups } = await getStorage('subGroups');
  return subGroups || {};
}

async function getCategories() {
  const { categories } = await getStorage('categories');
  return { ...BUILT_IN_CATEGORIES, ...categories };
}

async function getClosedContexts() {
  const { closedContexts } = await getStorage('closedContexts');
  return closedContexts || [];
}

async function getSessions() {
  const { sessions } = await getStorage('sessions');
  return sessions || [];
}

async function getTimeTracking() {
  const { timeTracking } = await getStorage('timeTracking');
  return timeTracking || { byTab: {}, byGroup: {}, bySubGroup: {}, byCategory: {}, byProject: {} };
}

// ============================================================
// FOCUS ENGINE — Storage & Logic
// ============================================================


// ============================================================
// SUPABASE SYNC
// ============================================================

async function syncToSupabase() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Not authenticated with Supabase. Skip sync for now.
      return;
    }
    
    // Fetch profile_id for this user
    const { data: profile } = await supabase
      .schema('tabatha')
      .from('profiles')
      .select('id, default_org_id, default_team_id')
      .eq('auth_user_id', session.user.id)
      .single();
      
    if (!profile) {
      console.warn('Tabatha: No profile found for user. Skipping sync.');
      return;
    }
    
    const profileId = profile.id;
    const orgId = profile.default_org_id;
    const teamId = profile.default_team_id;
    
    // Sync Focus Items
    const engine = await getFocusEngine();
    if (engine && engine.items) {
      const focusUpserts = Object.values(engine.items).map(item => ({
        profile_id: profileId,
        org_id: orgId || null,
        team_id: teamId || null,
        client_id: item.id,
        label: item.label,
        funnel_stage: item.funnelStage || 'unsorted',
        focus_state: item.focusState || 'paused',
        timer_minutes: item.timerMinutes || 15,
        tags: item.tags || {},
        completed_at: item.completedAt || null,
        synced_at: new Date().toISOString()
      }));
      
      if (focusUpserts.length > 0) {
        const { error } = await supabase
          .schema('tabatha')
          .from('focus_items')
          .upsert(focusUpserts, { onConflict: 'profile_id, client_id' });
        if (error) console.error('Tabatha: Error syncing focus items:', error);
      }
    }

    // Sync Intent History
    const { intentHistory } = await getStorage('intentHistory');
    if (intentHistory && intentHistory.length > 0) {
      // Get the last synced timestamp from local storage
      const { lastIntentSync } = await getStorage('lastIntentSync');
      const lastSyncTime = lastIntentSync ? new Date(lastIntentSync).getTime() : 0;
      
      // Filter out already synced intents
      const newIntents = intentHistory.filter(i => new Date(i.timestamp).getTime() > lastSyncTime);
      
      if (newIntents.length > 0) {
        const intentInserts = newIntents.map(intent => ({
          profile_id: profileId,
          org_id: orgId || null,
          team_id: teamId || null,
          action: intent.action || 'unknown',
          context: intent.context || null,
          focus_id: intent.focusId || null,
          url: intent.url || null,
          domain: intent.domain || null,
          timestamp: intent.timestamp
        }));

        const { error } = await supabase
          .schema('tabatha')
          .from('intent_history')
          .insert(intentInserts);
          
        if (error) {
          console.error('Tabatha: Error syncing intent history:', error);
        } else {
          // Update last sync time to the newest intent's timestamp
          const newest = Math.max(...newIntents.map(i => new Date(i.timestamp).getTime()));
          await setStorage({ lastIntentSync: new Date(newest).toISOString() });
        }
      }
    }
    
  } catch (err) {
    console.error('Tabatha: Supabase sync failed:', err);
  }
}

// Debounced wrapper for sync
let syncTimeout = null;
function triggerSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    // Quick-check: skip sync attempt if no Supabase session exists
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
    } catch { return; }
    syncToSupabase();
  }, 10000); // 10s debounce
}

async function getFocusEngine() {
  const { focusEngine } = await getStorage('focusEngine');
  if (!focusEngine) return { ...DEFAULT_FOCUS_ENGINE };
  
  // Ensure critical fields exist to prevent TypeError if storage is corrupted
  if (!focusEngine.items) focusEngine.items = {};
  if (!focusEngine.history) focusEngine.history = [];
  
  return focusEngine;
}

async function setFocusEngine(engine) {
  const result = await setStorage({ focusEngine: engine });
  triggerSync();
  return result;
}

// ============================================================
// TAB CATEGORY DETECTION
// ============================================================

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
  
  // Fallback: if tab is audible and matches video URLs, classify as media
  if (audible && url.match(/youtube\.com\/watch/)) return 'media';
  
  return 'unknown';
}


// ============================================================
// TAB LIFECYCLE TRACKING
// ============================================================

chrome.tabs.onCreated.addListener(async (tab) => {
  const tabs = await getTabData();
  const categories = await getCategories();
  const settings = await getSettings();
  
  const isFromOpener = !!tab.openerTabId;
  let inheritedContext = null;
  let inheritedIntent = null;
  let inheritedSubGroupId = null;
  let parentCategory = null;
  
  // If opened from a parent tab, inherit context
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

  // Auto-apply URL rules
  try {
    const { urlRules } = await getStorage('urlRules');
    if (urlRules && urlRules.length > 0) {
      const tabUrl = (tab.url || tab.pendingUrl || '').toLowerCase();
      for (const rule of urlRules) {
        if (!rule.autoApply) continue;
        const pattern = rule.pattern.toLowerCase();
        // Simple matching: domain contains or URL contains pattern
        if (tabUrl.includes(pattern)) {
          if (rule.defaultIntent) {
            tabs[tab.id].intent = rule.defaultIntent;
            tabs[tab.id].contextSource = 'url_rule';
          }
          if (rule.defaultContext) {
            tabs[tab.id].context = rule.defaultContext;
            if (!tabs[tab.id].contextSource) tabs[tab.id].contextSource = 'url_rule';
          }
          break; // first match wins
        }
      }
    }
  } catch (e) { /* non-critical */ }
  
  await setTabData(tabs);
  
  // Set context timer
  const timerMinutes = settings.globalTimerMinutes;
  if (timerMinutes > 0) {
    chrome.alarms.create(`context-timer-${tab.id}`, { delayInMinutes: timerMinutes });
  }
  
  // If this is a scratch-opened tab (no opener, no inherited context), notify sidebar to prompt
  if (!isFromOpener && detectedCategory === 'unknown') {
    broadcastMessage({ type: 'PROMPT_PURPOSE', tabId: tab.id });
  }
  
  broadcastMessage({ type: 'TAB_CREATED', tabId: tab.id, tabData: tabs[tab.id] });
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const tabs = await getTabData();
  const tabData = tabs[tabId];
  
  if (tabData) {
    // Save to closed contexts if it had context
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
        groupName: null, // Will be resolved from group data
        subGroupId: tabData.subGroupId,
        category: tabData.category
      });
      // Keep last 500 closed contexts
      await setStorage({ closedContexts: closedContexts.slice(0, 500) });
    }
    
    delete tabs[tabId];
    await setTabData(tabs);
  }
  
  // Clear alarm
  chrome.alarms.clear(`context-timer-${tabId}`);
  
  broadcastMessage({ type: 'TAB_REMOVED', tabId });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const tabs = await getTabData();
  if (!tabs[tabId]) return;
  
  if (changeInfo.url) {
    await timeTracker.stopTracking(tabId);
    tabs[tabId].url = changeInfo.url;
    // Re-detect category on URL change
    const categories = await getCategories();
    const newCat = detectCategory(changeInfo.url, tab.audible, categories);
    if (tabs[tabId].category === 'unknown') {
      tabs[tabId].category = newCat;
    }
    await timeTracker.startTracking(tabId, changeInfo.url, tabs[tabId]);
  }
  if (changeInfo.title) {
    tabs[tabId].title = changeInfo.title;
    
    // Asana auto-intent: when an Asana task page title loads, auto-set context
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
  broadcastMessage({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
});

// ============================================================
// CHROME TAB GROUPS — BIDIRECTIONAL SYNC
// ============================================================

// When Chrome creates or updates a tab group, sync to Tabatha's tab data
chrome.tabGroups.onUpdated.addListener(async (group) => {
  try {
    // Get all tabs in this group
    const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
    const tabs = await getTabData();
    let changed = false;
    for (const tab of tabsInGroup) {
      if (tabs[tab.id]) {
        tabs[tab.id].groupId = group.id;
        tabs[tab.id].groupTitle = group.title || null;
        tabs[tab.id].groupColor = group.color || null;
        changed = true;
      }
    }
    if (changed) {
      await setTabData(tabs);
      broadcastMessage({ type: 'GROUPS_UPDATED' });
    }
  } catch (e) { /* group may be stale */ }
});

// When a tab group is removed, clear groupId from affected tabs
chrome.tabGroups.onRemoved.addListener(async (group) => {
  try {
    const tabs = await getTabData();
    let changed = false;
    for (const [tabId, data] of Object.entries(tabs)) {
      if (data.groupId === group.id) {
        data.groupId = null;
        data.groupTitle = null;
        data.groupColor = null;
        changed = true;
      }
    }
    if (changed) {
      await setTabData(tabs);
      broadcastMessage({ type: 'GROUPS_UPDATED' });
    }
  } catch (e) { /* ignore */ }
});

// When a tab moves into/out of a group, update its data
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.groupId !== undefined) {
    const tabs = await getTabData();
    if (tabs[tabId]) {
      const noGroup = changeInfo.groupId === chrome.tabGroups?.TAB_GROUP_ID_NONE || changeInfo.groupId === -1;
      tabs[tabId].groupId = noGroup ? null : changeInfo.groupId;
      if (noGroup) {
        tabs[tabId].groupTitle = null;
        tabs[tabId].groupColor = null;
      } else {
        try {
          const group = await chrome.tabGroups.get(changeInfo.groupId);
          tabs[tabId].groupTitle = group.title || null;
          tabs[tabId].groupColor = group.color || null;
        } catch (e) { /* group may not exist yet */ }
      }
      await setTabData(tabs);
      broadcastMessage({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
    }
  }
});

// ============================================================
// IDLE / OFF-CHROME CONTEXT
// ============================================================

let userIdleSince = null;
let idleAutoBreakApplied = false;

// Set idle detection interval to 60 seconds (1 minute)
chrome.idle.setDetectionInterval(60);

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'idle' || newState === 'locked') {
    // User went idle
    await timeTracker.stopAllTracking();
    userIdleSince = new Date().toISOString();
    idleAutoBreakApplied = false;

    // Log idle event
    broadcastMessage({ type: 'USER_IDLE', since: userIdleSince });

    // Schedule auto-break check after 5 minutes
    chrome.alarms.create('idle-auto-break', { delayInMinutes: 5 });

  } else if (newState === 'active') {
    // User returned — cancel any pending auto-break alarm
    chrome.alarms.clear('idle-auto-break');

    // Restart tracking on currently active tab
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (activeTabs) => {
      if (activeTabs && activeTabs.length > 0) {
        const tId = activeTabs[0].id;
        const tabs = await getTabData();
        if (tabs[tId]) {
          await timeTracker.startTracking(tId, tabs[tId].url, tabs[tId]);
        }
      }
    });

    if (userIdleSince) {
      const idleDuration = Date.now() - new Date(userIdleSince).getTime();
      const settings = await getSettings();

      // If user was auto-put on break, auto-resume
      if (idleAutoBreakApplied) {
        const { clockSession } = await getStorage('clockSession');
        if (clockSession?.active && clockSession?.onBreak) {
          await clockService.toggleBreak(); // resume from break
        }
        idleAutoBreakApplied = false;
      }

      // Broadcast welcome back with idle duration
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
  }
});

// Handle the 5-minute auto-break alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'idle-auto-break') {
    // Check if user is still idle
    const state = await chrome.idle.queryState(60);
    if (state === 'idle' || state === 'locked') {
      const { clockSession } = await getStorage('clockSession');
      if (clockSession?.active && !clockSession?.onBreak) {
        await clockService.toggleBreak(); // auto-put on break
        idleAutoBreakApplied = true;
        broadcastMessage({ type: 'AUTO_BREAK', reason: 'idle_5min' });
      }
    }
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
    if (notificationId === 'welcome-back') {
        // Open sidebar
        chrome.sidePanel.setOptions({ enabled: true });
        chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT })
            .catch(() => {
                // sidePanel.open() requires user gesture — notification click qualifies
                // but may still fail in edge cases; swallow gracefully.
            });
    } else if (notificationId.startsWith('context-')) {
        // Context reminder notification — focus the tab and prompt for intent
        const tabId = parseInt(notificationId.replace('context-', ''));
        try {
            const tab = await chrome.tabs.get(tabId);
            await chrome.windows.update(tab.windowId, { focused: true });
            await chrome.tabs.update(tabId, { active: true });
        } catch (e) { /* tab may not exist */ }
        broadcastMessage({ type: 'PROMPT_PURPOSE', tabId });
    }
});

// Set idle detection interval
chrome.idle.setDetectionInterval(60); // 1 minute granularity

// ============================================================
// CONTEXT TIMER / ALARMS
// ============================================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('context-timer-')) {
    const tabId = parseInt(alarm.name.replace('context-timer-', ''));
    const tabs = await getTabData();
    const tabData = tabs[tabId];
    
    if (tabData && !tabData.ignored && !tabData.context) {
      // Tab has been open for threshold without context — prompt
      broadcastMessage({
        type: 'CONTEXT_REMINDER',
        tabId,
        tabData
      });
      
      // Also show a notification
      chrome.notifications.create(`context-${tabId}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Tabatha — Context Needed',
        message: `"${tabData.title}" has been open for a while. What are you working on?`
      });
    } else if (tabData && tabData.context) {
      // Tab has context — send reinforcement reminder
      const settings = await getSettings();
      const timerMinutes = tabData.timerOverrideMinutes || settings.globalTimerMinutes;
      
      broadcastMessage({
        type: 'INTENT_REINFORCEMENT',
        tabId,
        tabData
      });
      
      // Re-arm timer
      chrome.alarms.create(`context-timer-${tabId}`, { delayInMinutes: timerMinutes });
    }
  }
  
  if (alarm.name === 'auto-export') {
    await exportMarkdown();
  }
  
  if (alarm.name === 'session-snapshot') {
    await saveSessionSnapshot();
  }
  
  if (alarm.name === 'supabase-sync') {
    await syncToSupabase();
  }
  
  if (alarm.name === 'pomodoro-timer') {
      // Notify user
      chrome.notifications.create('pomodoro-done', {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Tabatha — Timer Complete!',
          message: 'Time is up! Take a break or refocus.',
          requireInteraction: true
      });
      broadcastMessage({ type: 'POMODORO_COMPLETE' });
  }
  
  // Focus Engine timer — transitions to 'drifted', counts up
  if (alarm.name.startsWith('focus-timer-')) {
    const focusId = alarm.name.replace('focus-timer-', '');
    const engine = await getFocusEngine();
    const item = engine.items[focusId];
    if (item && item.focusState === 'active') {
      item.focusState = 'drifted';
      // Accumulate elapsed time up to now
      if (item.lastResumedAt) {
        item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime());
        item.lastResumedAt = new Date().toISOString(); // reset for countup tracking
      }
      await setFocusEngine(engine);
      broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
      
      // Notification
      chrome.notifications.create(`focus-drift-${focusId}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Tabatha — Timer Drifted',
        message: `"${item.label}" timer has run out. Still working on it?`,
        requireInteraction: true
      });
    }
  }
});

// ============================================================
// URL LOCK — NAVIGATION INTERCEPTION
// ============================================================

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only care about main frame
  if (details.frameId !== 0) return;
  
  const tabs = await getTabData();
  const tabData = tabs[details.tabId];
  
  if (!tabData || !tabData.urlLocked) return;
  
  const currentBase = getUrlBase(tabData.urlLockScope || tabData.url);
  const newBase = getUrlBase(details.url);
  
  if (currentBase && newBase && currentBase !== newBase) {
    // URL is changing on a locked tab — block and open in new tab
    try {
      // We can't truly cancel in MV3 webNavigation, so we'll navigate back
      // and open the new URL in a new tab
      chrome.tabs.update(details.tabId, { url: tabData.urlLockScope || tabData.url });
      
      const newTab = await chrome.tabs.create({
        url: details.url,
        openerTabId: details.tabId,
        active: true
      });
      
      // Prompt for purpose of new tab
      setTimeout(() => {
        broadcastMessage({
          type: 'PROMPT_PURPOSE',
          tabId: newTab.id,
          reason: 'url_lock_redirect',
          fromTabId: details.tabId,
          fromContext: tabData.context
        });
      }, 500);
    } catch (e) {
      console.error('Tabatha: URL lock interception error', e);
    }
  }
});

function getUrlBase(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

// ============================================================
// SESSION SNAPSHOTS
// ============================================================

async function saveSessionSnapshot() {
  const tabs = await getTabData();
  const sessions = await getSessions();
  
  const snapshot = {
    snapshotAt: new Date().toISOString(),
    tabCount: Object.keys(tabs).length,
    tabs: { ...tabs }
  };
  
  // Keep last 50 snapshots
  sessions.unshift(snapshot);
  await setStorage({ sessions: sessions.slice(0, 50) });
}

// Save a snapshot every 5 minutes
chrome.alarms.create('session-snapshot', { periodInMinutes: 5 });

// Sync to Supabase every 5 minutes
chrome.alarms.create('supabase-sync', { periodInMinutes: 5 });

// ============================================================
// MESSAGE ROUTING
// ============================================================


// ── Service instances ──
configureNotificationService({ getStorage, setStorage, getTabData, setTabData, getFocusEngine });
configureGroupService({ setTabData });
configureSessionService({ setTabData });
configureTabService({ setTabData, getFocusEngine, setFocusEngine });
configureFocusService({ getStorage, setStorage, getTabData, setTabData, getFocusEngine, setFocusEngine });
configureTabTrackingService({ setTabData, tryAssociateTab, triggerSync });
const clockService = createClockService(getStorage, setStorage, broadcastMessage);
registerTabTrackingListeners();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => {
      console.error('[Tabatha] handleMessage Error:', err);
      sendResponse({ error: err.message || 'Unknown error' });
    });
  return true; // Async response
});

async function handleMessage(message, sender) {
  const notificationResponse = await handleNotificationMessage(message.type, message, sender);
  if (notificationResponse) return notificationResponse;

  const settingsResponse = await handleSettingsMessage(message.type, message, sender);
  if (settingsResponse) return settingsResponse;

  const categoryResponse = await handleCategoryMessage(message.type, message, sender);
  if (categoryResponse) return categoryResponse;

  const clockResponse = await handleClockMessage(message.type, message, sender);
  if (clockResponse) return clockResponse;

  const groupResponse = await handleGroupMessage(message.type, message, sender);
  if (groupResponse) return groupResponse;

  const sessionResponse = await handleSessionMessage(message.type, message, sender);
  if (sessionResponse) return sessionResponse;

  const taskResponse = await handleTaskMessage(message.type, message, sender);
  if (taskResponse) return taskResponse;

  const tabResponse = await handleTabMessage(message.type, message, sender);
  if (tabResponse) return tabResponse;

  const tabTrackingResponse = await handleTabTrackingMessage(message.type, message, sender);
  if (tabTrackingResponse) return tabTrackingResponse;

  const focusResponse = await handleFocusMessage(message.type, message, sender);
  if (focusResponse) return focusResponse;

  switch (message.type) {
    case 'START_SIDE_QUEST': {
        const tabs = await getTabData();
        if (tabs[sender.tab.id]) {
            tabs[sender.tab.id].context = message.context;
            tabs[sender.tab.id].intent = 'Side Quest';
            await setTabData(tabs);
            broadcastMessage({ type: 'TAB_UPDATED', tabId: sender.tab.id, tabData: tabs[sender.tab.id] });
            
            // Start 5m timer
            chrome.alarms.create(`context-timer-${sender.tab.id}`, { delayInMinutes: message.minutes });
        }
        return { success: true };
    }
    
    case 'ADD_TO_SUGAR_BOX': {
        // Simple storage for now
        const { sugarBox } = await getStorage('sugarBox');
        const list = sugarBox || [];
        list.push({ url: message.url, title: message.title, addedAt: new Date().toISOString() });
        await setStorage({ sugarBox: list });
        
        await chrome.tabs.remove(sender.tab.id);
        
        // Notify sidebar?
        broadcastMessage({ type: 'SUGAR_BOX_UPDATED' });
        return { success: true };
    }
    
    case 'PARK_TAB': {
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
    // --- Site Blocking ---
    case 'CHECK_BLOCKED_SITE': {
        const { blockedSites, tempUnblocked } = await getStorage(['blockedSites', 'tempUnblocked']);
        const sites = blockedSites || [];
        const temp = tempUnblocked || {};
        const domain = new URL(sender.tab.url).hostname;
        
        // Check if domain matches a blocked pattern
        const isBlocked = sites.some(s => {
          if (s === domain) return true;
          // Wildcard: *.example.com matches sub.example.com
          if (s.startsWith('*.') && domain.endsWith(s.slice(2))) return true;
          // Suffix match: example.com matches www.example.com
          if (domain.endsWith('.' + s)) return true;
          return false;
        });
        
        if (!isBlocked) return { blocked: false };
        
        // Check temp unblock
        if (temp[domain] && new Date(temp[domain].expiresAt) > new Date()) {
          return { blocked: false };
        }
        
        return { blocked: true };
    }
    
    case 'UNBLOCK_SITE_TEMPORARILY': {
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
        
        // Set alarm to re-block
        chrome.alarms.create(`blockgate-${message.domain}`, { delayInMinutes: message.minutes });
        
        return { success: true, expiresAt };
    }
    
    case 'MANAGE_BLOCKED_SITES': {
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
    default:
      return { error: 'Unknown message type' };
  }
}

// ============================================================
// EXTENSION INSTALL / STARTUP
// ============================================================

// ============================================================
// EXTENSION INSTALL / STARTUP / RELOAD
// ============================================================

async function initializeState() {
  // Sync existing tabs into storage
  const existingTabs = await chrome.tabs.query({});
  const tabs = await getTabData();
  const categories = await getCategories();
  
  for (const tab of existingTabs) {
    if (!tabs[tab.id]) {
      tabs[tab.id] = {
        url: tab.url || '',
        title: tab.title || 'Tab',
        openedAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        activeTime: 0,
        context: null,
        intent: null,
        priority: 'none',
        locked: false,
        urlLocked: false,
        urlLockScope: null,
        groupId: tab.groupId !== chrome.tabGroups?.TAB_GROUP_ID_NONE ? tab.groupId : null,
        subGroupId: null,
        category: detectCategory(tab.url || '', tab.audible, categories),
        parentTabId: null,
        timerOverrideMinutes: null,
        ignored: false,
        persistent: false
      };
    }
  }
  
  // Clean up tabs that no longer exist
  const existingTabIds = new Set(existingTabs.map(t => t.id));
  for (const tabId of Object.keys(tabs)) {
    if (!existingTabIds.has(parseInt(tabId))) {
      delete tabs[tabId];
    }
  }
  
  await setTabData(tabs);
  console.log('Tabatha: State initialized', Object.keys(tabs).length, 'tabs');
}

// Run on Install/Update
chrome.runtime.onInstalled.addListener(async (details) => {
    // Initialize defaults if fresh install
  if (details.reason === 'install') {
    await setStorage({
      tabs: {},
      subGroups: {},
      categories: BUILT_IN_CATEGORIES,
      closedContexts: [],
      sessions: [],
      timeTracking: { byTab: {}, byGroup: {}, bySubGroup: {}, byCategory: {}, byProject: {} },
      settings: DEFAULT_SETTINGS
    });
  }
  
  await initializeState();
});

// Run on Browser Startup
chrome.runtime.onStartup.addListener(async () => {
  await initializeState();
});

// Run immediately (for development reloads where listeners might not fire exactly as expected)
initializeState();


// Notification click handler merged into single listener above (L757)
