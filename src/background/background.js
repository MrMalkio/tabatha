// Tabatha — Service Worker (background.js)
// Core orchestrator for tab tracking, context/intent, priority, locking, 
// groups, categories, time tracking, and markdown export.

import { supabase } from '../services/supabaseClient';
import * as timeTracker from '../services/timeTracking.js';
import { createClockService } from './clock.js';
import { companionBridge } from './companion-bridge.js';

// ============================================================
// CONSTANTS & DEFAULTS
// ============================================================

const DEFAULT_SETTINGS = {
  globalTimerMinutes: 15,
  idleThresholdMinutes: 5,
  exportPath: 'Tabatha',
  autoExportEnabled: false,
  autoExportIntervalMinutes: 60
};

const PRIORITY_LEVELS = {
  critical: { label: '🔴 Critical', color: 'red', order: 0 },
  high:     { label: '🟠 High',     color: 'orange', order: 1 },
  medium:   { label: '🟡 Medium',   color: 'yellow', order: 2 },
  low:      { label: '🟢 Low',      color: 'green', order: 3 },
  none:     { label: '⚪ None',     color: 'grey', order: 4 }
};

const BUILT_IN_CATEGORIES = {
  work:      { name: 'Work',      icon: '💼', builtIn: true, persistent: false, urlPatterns: [], rules: { autoDetect: false, promptOnOpen: false, trackTime: true, timerEnabled: true } },
  media:     { name: 'Media',     icon: '🎵', builtIn: true, persistent: false, urlPatterns: ['*://music.youtube.com/*', '*://open.spotify.com/*', '*://soundcloud.com/*', '*://podcasts.google.com/*', '*://podcasts.apple.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: false } },
  meeting:   { name: 'Meeting',   icon: '📹', builtIn: true, persistent: false, urlPatterns: ['*://meet.google.com/*', '*://zoom.us/*', '*://teams.microsoft.com/*', '*://app.webex.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: false } },
  reference: { name: 'Reference', icon: '📚', builtIn: true, persistent: false, urlPatterns: [], rules: { autoDetect: false, promptOnOpen: false, trackTime: true, timerEnabled: true } },
  messaging: { name: 'Messaging', icon: '💬', builtIn: true, persistent: true,  urlPatterns: ['*://web.whatsapp.com/*', '*://discord.com/*', '*://slack.com/*', '*://telegram.org/*', '*://messages.google.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: false } },
  email:     { name: 'Email',     icon: '📧', builtIn: true, persistent: true,  urlPatterns: ['*://mail.google.com/*', '*://outlook.live.com/*', '*://outlook.office365.com/*', '*://mail.yahoo.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: false } },
  learning:  { name: 'Learning',  icon: '🎓', builtIn: true, persistent: false, urlPatterns: ['*://udemy.com/*', '*://coursera.org/*', '*://edx.org/*', '*://stackoverflow.com/*', '*://github.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: true } },
  entertainment: { name: 'Entertainment', icon: '🎮', builtIn: true, persistent: false, urlPatterns: ['*://twitch.tv/*', '*://netflix.com/*', '*://hulu.com/*', '*://steamcommunity.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: false } },
  unknown:   { name: 'Unknown',   icon: '❓', builtIn: true, persistent: false, urlPatterns: [], rules: { autoDetect: false, promptOnOpen: true, trackTime: true, timerEnabled: true } }
};

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

const DEFAULT_FOCUS_ENGINE = {
  activeFocusId: null,
  items: {},
  history: []
};

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

function generateFocusId() {
  return `f_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

async function startFocus(label, timerMinutes = 15, tags = {}) {
  const engine = await getFocusEngine();
  const id = generateFocusId();
  
  // Pause currently active focus
  if (engine.activeFocusId && engine.items[engine.activeFocusId]) {
    const current = engine.items[engine.activeFocusId];
    if (current.focusState === 'active' || current.focusState === 'drifted') {
      current.focusState = 'paused';
      current.pausedAt = new Date().toISOString();
      // Accumulate elapsed time
      if (current.startedAt) {
        current.elapsedMs = (current.elapsedMs || 0) + (Date.now() - new Date(current.lastResumedAt || current.startedAt).getTime());
      }
      chrome.alarms.clear(`focus-timer-${engine.activeFocusId}`);
    }
  }
  
  // Capture currently active tab
  const associatedTabIds = [];
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id) associatedTabIds.push(activeTab.id);
  } catch (e) { /* no active tab */ }
  
  engine.items[id] = {
    id,
    label,
    focusState: 'active',
    funnelStage: 'focus',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    lastResumedAt: new Date().toISOString(),
    endedAt: null,
    pausedAt: null,
    timerMinutes,
    elapsedMs: 0,
    overMs: 0,
    associatedTabIds,
    tags: { realm: '', client: '', project: '', task: '', ...tags },
    parentFocusId: engine.activeFocusId || null,
    contextSwitchCount: 0,
    priority: 5  // 1 (highest) to 10 (lowest), default middle
  };
  
  engine.activeFocusId = id;
  await setFocusEngine(engine);
  
  // Set alarm for timer
  if (timerMinutes > 0) {
    chrome.alarms.create(`focus-timer-${id}`, { delayInMinutes: timerMinutes });
  }
  
  broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

async function addFocus(label, timerMinutes = 15, tags = {}) {
  const engine = await getFocusEngine();
  const id = generateFocusId();
  
  // Add without interrupting active — new item starts as 'todo'
  engine.items[id] = {
    id,
    label,
    focusState: 'paused',
    funnelStage: 'todo',
    createdAt: new Date().toISOString(),
    startedAt: null,
    lastResumedAt: null,
    endedAt: null,
    pausedAt: null,
    timerMinutes,
    elapsedMs: 0,
    overMs: 0,
    associatedTabIds: [],
    tags: { realm: '', client: '', project: '', task: '', ...tags },
    parentFocusId: engine.activeFocusId || null,
    contextSwitchCount: 0
  };
  
  await setFocusEngine(engine);
  broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

async function switchFocus(focusId) {
  const engine = await getFocusEngine();
  if (!engine.items[focusId]) return engine;
  
  // Pause current active
  if (engine.activeFocusId && engine.items[engine.activeFocusId]) {
    const current = engine.items[engine.activeFocusId];
    if (current.focusState === 'active' || current.focusState === 'drifted') {
      current.focusState = 'paused';
      current.pausedAt = new Date().toISOString();
      if (current.lastResumedAt) {
        current.elapsedMs = (current.elapsedMs || 0) + (Date.now() - new Date(current.lastResumedAt).getTime());
      }
      chrome.alarms.clear(`focus-timer-${engine.activeFocusId}`);
    }
  }
  
  // Activate target
  const target = engine.items[focusId];
  target.focusState = 'active';
  target.funnelStage = target.funnelStage === 'todo' || target.funnelStage === 'unsorted' ? 'focus' : target.funnelStage;
  target.lastResumedAt = new Date().toISOString();
  if (!target.startedAt) target.startedAt = new Date().toISOString();
  target.pausedAt = null;
  
  // Track context switch
  target.contextSwitchCount = (target.contextSwitchCount || 0) + 1;
  
  engine.activeFocusId = focusId;
  await setFocusEngine(engine);
  
  // Restart timer for remaining time
  const totalTimerMs = target.timerMinutes * 60 * 1000;
  const remaining = totalTimerMs - (target.elapsedMs || 0);
  if (remaining > 0) {
    chrome.alarms.create(`focus-timer-${focusId}`, { delayInMinutes: remaining / 60000 });
  }
  
  // Capture active tab
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id && !target.associatedTabIds.includes(activeTab.id)) {
      target.associatedTabIds.push(activeTab.id);
      await setFocusEngine(engine);
    }
  } catch (e) { /* no active tab */ }
  
  broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

async function completeFocus(focusId) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  if (!id || !engine.items[id]) return engine;
  
  const item = engine.items[id];
  // Accumulate remaining active time
  if ((item.focusState === 'active' || item.focusState === 'drifted') && item.lastResumedAt) {
    item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime());
  }
  item.focusState = 'completed';
  item.funnelStage = 'resolved';
  item.endedAt = new Date().toISOString();
  
  chrome.alarms.clear(`focus-timer-${id}`);
  
  // Move to history
  engine.history.unshift({ ...item });
  delete engine.items[id];
  
  // Keep last 200 history items
  engine.history = engine.history.slice(0, 200);
  
  // Promote next paused item to active
  if (engine.activeFocusId === id) {
    engine.activeFocusId = null;
    const nextPaused = Object.values(engine.items)
      .filter(i => i.focusState === 'paused')
      .sort((a, b) => new Date(b.pausedAt || b.createdAt) - new Date(a.pausedAt || a.createdAt))[0];
    if (nextPaused) {
      nextPaused.focusState = 'active';
      nextPaused.lastResumedAt = new Date().toISOString();
      if (!nextPaused.startedAt) nextPaused.startedAt = new Date().toISOString();
      nextPaused.pausedAt = null;
      engine.activeFocusId = nextPaused.id;
      
      const totalTimerMs = nextPaused.timerMinutes * 60 * 1000;
      const remaining = totalTimerMs - (nextPaused.elapsedMs || 0);
      if (remaining > 0) {
        chrome.alarms.create(`focus-timer-${nextPaused.id}`, { delayInMinutes: remaining / 60000 });
      }
    }
  }
  
  await setFocusEngine(engine);
  broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

async function extendFocusTimer(focusId, extraMinutes = 5) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  if (!id || !engine.items[id]) return engine;
  
  const item = engine.items[id];
  item.timerMinutes = (item.timerMinutes || 0) + extraMinutes;
  
  // If drifted, transition back to active
  if (item.focusState === 'drifted') {
    item.focusState = 'active';
    item.lastResumedAt = new Date().toISOString();
  }
  
  // Recalculate remaining and set new alarm
  const totalTimerMs = item.timerMinutes * 60 * 1000;
  let elapsed = item.elapsedMs || 0;
  if (item.focusState === 'active' && item.lastResumedAt) {
    elapsed += (Date.now() - new Date(item.lastResumedAt).getTime());
  }
  const remaining = totalTimerMs - elapsed;
  
  chrome.alarms.clear(`focus-timer-${id}`);
  if (remaining > 0) {
    chrome.alarms.create(`focus-timer-${id}`, { delayInMinutes: remaining / 60000 });
  }
  
  await setFocusEngine(engine);
  broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

async function setFunnelStage(focusId, stage) {
  const engine = await getFocusEngine();
  if (!engine.items[focusId]) return engine;
  engine.items[focusId].funnelStage = stage;
  await setFocusEngine(engine);
  broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

async function updateFocusTags(focusId, tags) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  if (!id || !engine.items[id]) return engine;
  engine.items[id].tags = { ...engine.items[id].tags, ...tags };
  await setFocusEngine(engine);
  broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

// Auto-associate tab with active focus (heuristic)
async function tryAssociateTab(tabId) {
  const engine = await getFocusEngine();
  if (!engine.activeFocusId) return;
  const active = engine.items[engine.activeFocusId];
  if (!active || active.focusState !== 'active') return;
  
  // Already associated?
  if (active.associatedTabIds.includes(tabId)) return;
  
  const tabs = await getTabData();
  const tab = tabs[tabId];
  if (!tab) return;
  
  // Heuristic 1: Tab was opened from an already-associated tab
  if (tab.parentTabId && active.associatedTabIds.includes(tab.parentTabId)) {
    active.associatedTabIds.push(tabId);
    await setFocusEngine(engine);
    return;
  }
  
  // Heuristic 2: Same domain as any associated tab
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

function patternToRegex(pattern) {
  try {
    // Split on wildcards first, escape each segment, then rejoin with .*
    const parts = pattern.split('*');
    const escaped = parts.map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp('^' + escaped.join('.*') + '$');
  } catch {
    return null;
  }
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
  
  await timeTracker.stopTracking(tabId);
  
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
// TIME TRACKING DELEGATED TO SERVICE
// ============================================================

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tabs = await getTabData();
  const tabData = tabs[activeInfo.tabId];
  
  if (tabData) {
    tabData.lastActive = new Date().toISOString();
    await setTabData(tabs);
    
    // Start tracking the new active tab
    await timeTracker.startTracking(activeInfo.tabId, tabData.url, tabData);
  }
  
  broadcastMessage({ type: 'TAB_ACTIVATED', tabId: activeInfo.tabId });
  
  // Auto-associate activated tab with current focus
  tryAssociateTab(activeInfo.tabId);
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
    // Check if companion reports the user is active in another app
    const activeApp = companionBridge.activeApp;
    if (companionBridge.isConnected && activeApp) {
      const offChromeSince = new Date(activeApp.timestamp);
      const offChromeMs = Date.now() - offChromeSince.getTime();
      // If user switched to another app recently (<2min ago), don't treat as idle
      if (offChromeMs < 120000) {
        console.log('[idle] Suppressed — user active in:', activeApp.displayName);
        broadcastMessage({
          type: 'OFF_CHROME_ACTIVE',
          app: activeApp.displayName,
          category: activeApp.category,
          since: activeApp.timestamp,
        });
        return; // Don't trigger idle
      }
    }

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
// TAB LOCKING — CLOSE PROTECTION
// ============================================================

// We can't directly prevent tab close in MV3, so we use a different approach:
// When a locked tab is about to close, we show a warning in the sidebar.
// The actual multi-step close is enforced through the sidebar UI.
// The service worker tracks pending close confirmations.

const pendingCloseConfirmations = new Map();

async function requestTabClose(tabId) {
  const tabs = await getTabData();
  const tabData = tabs[tabId];
  
  if (!tabData) {
    await chrome.tabs.remove(tabId);
    return { closed: true };
  }
  
  if (tabData.locked) {
    if (pendingCloseConfirmations.has(tabId)) {
      // Second confirmation — actually close
      pendingCloseConfirmations.delete(tabId);
      await chrome.tabs.remove(tabId);
      return { closed: true };
    } else {
      // First attempt — request confirmation
      pendingCloseConfirmations.set(tabId, Date.now());
      return { closed: false, needsConfirmation: true, tabData };
    }
  }
  
  await chrome.tabs.remove(tabId);
  return { closed: true };
}

// ============================================================
// CHROME TAB GROUP INTEGRATION
// ============================================================

async function createOrUpdateGroup(tabIds, groupName, priority) {
  const color = PRIORITY_LEVELS[priority]?.color || 'grey';
  
  const groupId = await chrome.tabs.group({ tabIds });
  await chrome.tabGroups.update(groupId, {
    title: groupName,
    color,
    collapsed: false
  });
  
  // Update tab data with group ID
  const tabs = await getTabData();
  for (const tabId of tabIds) {
    if (tabs[tabId]) {
      tabs[tabId].groupId = groupId;
    }
  }
  await setTabData(tabs);
  
  return groupId;
}

// ============================================================
// SUB-GROUPS (Tabatha hierarchy beyond Chrome flat groups)
// ============================================================

async function createSubGroup(name, chromeGroupIds = [], projectId = null, settings = {}) {
  const subGroups = await getSubGroups();
  const id = `sg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  
  subGroups[id] = {
    name,
    projectId,
    chromeGroupIds,
    settings: {
      timersEnabled: true,
      autoContext: true,
      lockingEnabled: true,
      ...settings
    }
  };
  
  await setStorage({ subGroups });
  return id;
}

// ============================================================
// CUSTOM CATEGORIES
// ============================================================

async function createCategory(id, categoryData) {
  const categories = await getCategories();
  categories[id] = {
    builtIn: false,
    ...categoryData
  };
  await setStorage({ categories });
  return categories;
}

async function cloneCategory(sourceId, newId, overrides = {}) {
  const categories = await getCategories();
  const source = categories[sourceId];
  if (!source) return null;
  
  const cloned = {
    ...JSON.parse(JSON.stringify(source)),
    builtIn: false,
    clonedFrom: sourceId,
    name: overrides.name || `${source.name} (Copy)`,
    ...overrides
  };
  
  categories[newId] = cloned;
  await setStorage({ categories });
  return categories;
}

// ============================================================
// BULK OPERATIONS
// ============================================================

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
  
  // Remove non-locked tabs, collect locked ones for confirmation
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

// ============================================================
// "RETURN TO FLOW" — SESSION RECALL
// ============================================================

async function getFlowRecallData() {
  const closedContexts = await getClosedContexts();
  const subGroups = await getSubGroups();
  
  // Group closed contexts by sub-group or context
  const flows = {};
  for (const ctx of closedContexts) {
    const key = ctx.subGroupId || ctx.context || 'ungrouped';
    if (!flows[key]) {
      flows[key] = {
        context: ctx.context,
        intent: ctx.intent,
        subGroupId: ctx.subGroupId,
        subGroupName: ctx.subGroupId ? subGroups[ctx.subGroupId]?.name : null,
        tabs: []
      };
    }
    flows[key].tabs.push(ctx);
  }
  
  return flows;
}

async function reopenFlow(flowKey, newSessionIntent) {
  const flows = await getFlowRecallData();
  const flow = flows[flowKey];
  if (!flow) return;
  
  const tabIds = [];
  for (const ctx of flow.tabs) {
    if (ctx.url) {
      const tab = await chrome.tabs.create({ url: ctx.url, active: false });
      tabIds.push(tab.id);
      
      // Restore context on the new tab
      const tabs = await getTabData();
      if (tabs[tab.id]) {
        tabs[tab.id].context = ctx.context;
        tabs[tab.id].intent = newSessionIntent || ctx.intent;
        tabs[tab.id].priority = ctx.priority;
        tabs[tab.id].category = ctx.category;
        await setTabData(tabs);
      }
    }
  }
  
  return tabIds;
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
// MARKDOWN EXPORT
// ============================================================

async function exportMarkdown() {
  const tabs = await getTabData();
  const subGroups = await getSubGroups();
  const categories = await getCategories();
  const closedContexts = await getClosedContexts();
  const timeTracking = await getTimeTracking();
  const settings = await getSettings();
  
  let md = `# Tabatha Context — ${new Date().toLocaleString()}\n\n`;
  md += `> Auto-generated by Tabatha. Designed for AI agent consumption.\n\n`;
  
  // Active tabs by group
  md += `## Active Tabs (${Object.keys(tabs).length})\n\n`;
  
  const grouped = {};
  for (const [tabId, tab] of Object.entries(tabs)) {
    const key = tab.subGroupId || tab.groupId || 'ungrouped';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ tabId, ...tab });
  }
  
  for (const [groupKey, groupTabs] of Object.entries(grouped)) {
    const groupName = subGroups[groupKey]?.name || `Group ${groupKey}`;
    md += `### ${groupKey === 'ungrouped' ? 'Ungrouped' : groupName}\n\n`;
    
    for (const tab of groupTabs) {
      const priority = PRIORITY_LEVELS[tab.priority]?.label || '⚪ None';
      const catIcon = categories[tab.category]?.icon || '❓';
      const time = formatDuration(tab.activeTime || 0);
      const locked = tab.locked ? '🔒' : '';
      const urlLocked = tab.urlLocked ? '🔗' : '';
      
      md += `- ${priority} ${catIcon} ${locked}${urlLocked} **${tab.title}**\n`;
      md += `  - URL: ${tab.url}\n`;
      if (tab.context) md += `  - Context: ${tab.context}\n`;
      if (tab.intent) md += `  - Intent: ${tab.intent}\n`;
      md += `  - Active time: ${time}\n`;
      md += `  - Opened: ${tab.openedAt}\n\n`;
    }
  }
  
  // Closed contexts
  if (closedContexts.length > 0) {
    md += `## Recently Closed Contexts\n\n`;
    for (const ctx of closedContexts.slice(0, 20)) {
      md += `- **${ctx.title}** (${ctx.priority})\n`;
      if (ctx.context) md += `  - Context: ${ctx.context}\n`;
      md += `  - URL: ${ctx.url}\n`;
      md += `  - Closed: ${ctx.closedAt}\n\n`;
    }
  }
  
  // Time summary
  md += `## Time Summary\n\n`;
  md += `| Category | Time |\n|----------|------|\n`;
  for (const [cat, ms] of Object.entries(timeTracking.byCategory)) {
    const catName = categories[cat]?.name || cat;
    md += `| ${catName} | ${formatDuration(ms)} |\n`;
  }
  md += `\n`;
  
  // Download the file
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url,
    filename: `${settings.exportPath}/context.md`,
    saveAs: false,
    conflictAction: 'overwrite'
  });
  
  return md;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ============================================================
// MESSAGE ROUTING
// ============================================================

function broadcastMessage(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // No listeners — sidebar not open, that's fine
  });
}

// ── Service instances ──
const clockService = createClockService(getStorage, setStorage, broadcastMessage);

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
  switch (message.type) {
    // --- Tab Data ---
    case 'GET_ALL_TABS':
      return { tabs: await getTabData() };
    
    case 'GET_TAB':
      const allTabs = await getTabData();
      return { tab: allTabs[message.tabId] };
    
    case 'UPDATE_TAB': {
      const tabs = await getTabData();
      if (tabs[message.tabId]) {
        Object.assign(tabs[message.tabId], message.updates);
        await setTabData(tabs);
        broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
      }
      return { success: true };
    }
    
    case 'BATCH_UPDATE_CONTEXT': {
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
    
    // --- Priority ---
    case 'SET_PRIORITY': {
      const tabs = await getTabData();
      if (tabs[message.tabId]) {
        tabs[message.tabId].priority = message.priority;
        await setTabData(tabs);
        
        // Update Chrome tab group color if in a group
        if (tabs[message.tabId].groupId) {
          try {
            const color = PRIORITY_LEVELS[message.priority]?.color || 'grey';
            await chrome.tabGroups.update(tabs[message.tabId].groupId, { color });
          } catch (e) { /* group may not exist */ }
        }
        
        broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
      }
      return { success: true };
    }
    
    // --- Locking ---
    case 'TOGGLE_LOCK': {
      const tabs = await getTabData();
      if (tabs[message.tabId]) {
        tabs[message.tabId].locked = !tabs[message.tabId].locked;
        await setTabData(tabs);
        broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
      }
      return { success: true };
    }
    
    case 'UPDATE_TAB_TITLE': {
        const tabs = await getTabData();
        if (tabs[message.tabId]) {
            tabs[message.tabId].customTitle = message.title;
            await setTabData(tabs);
            broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
        }
        return { success: true };
    }
    
    case 'TOGGLE_URL_LOCK': {
      const tabs = await getTabData();
      if (tabs[message.tabId]) {
        tabs[message.tabId].urlLocked = !tabs[message.tabId].urlLocked;
        if (tabs[message.tabId].urlLocked) {
          tabs[message.tabId].urlLockScope = tabs[message.tabId].url;
        } else {
          tabs[message.tabId].urlLockScope = null;
        }
        await setTabData(tabs);
        
        // Inject/remove content script
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
    
    // --- Close ---
    case 'REQUEST_CLOSE':
      return await requestTabClose(message.tabId);
    
    case 'CANCEL_CLOSE':
      pendingCloseConfirmations.delete(message.tabId);
      return { success: true };
    
    // --- Bulk ---
    case 'BULK_CLOSE':
      return await bulkCloseTabs(message.tabIds, message.context, message.intent);
    
    // --- Groups ---
    case 'GET_SAVED_GROUPS': {
      try {
        const allGroups = await chrome.tabGroups.query({});
        const tabs = await getTabData();
        const savedGroups = {};
        for (const group of allGroups) {
          const groupTabs = await chrome.tabs.query({ groupId: group.id });
          savedGroups[group.id] = {
            id: group.id,
            title: group.title || 'Untitled Group',
            color: group.color,
            collapsed: group.collapsed,
            tabIds: groupTabs.map(t => t.id),
            tabCount: groupTabs.length,
          };
        }
        return { savedGroups };
      } catch (e) {
        return { savedGroups: {} };
      }
    }

    case 'CREATE_GROUP': {
      const groupId = await createOrUpdateGroup(message.tabIds, message.name, message.priority);
      return { groupId };
    }
    
    case 'CREATE_SUB_GROUP': {
      const id = await createSubGroup(message.name);
      return { id };
    }
    
    case 'GET_SUB_GROUPS':
      return { subGroups: await getSubGroups() };
    
    // --- Categories ---
    case 'GET_CATEGORIES':
      return { categories: await getCategories() };
    
    case 'CREATE_CATEGORY':
      return { categories: await createCategory(message.id, message.data) };
    
    case 'CLONE_CATEGORY':
      return { categories: await cloneCategory(message.sourceId, message.newId, message.overrides) };
    
    // --- Flow Recall ---
    case 'GET_FLOW_RECALL':
      return { flows: await getFlowRecallData() };
    
    case 'REOPEN_FLOW':
      return { tabIds: await reopenFlow(message.flowKey, message.newIntent) };

    // --- Closed Contexts ---
    case 'GET_CLOSED_CONTEXTS':
      return { closedContexts: await getClosedContexts() };
    
    // --- Time Tracking ---
    case 'GET_TIME_TRACKING':
      return { timeTracking: await getTimeTracking() };
      
    case 'START_POMODORO':
        chrome.alarms.create('pomodoro-timer', { delayInMinutes: message.minutes });
        broadcastMessage({ type: 'POMODORO_STARTED', minutes: message.minutes });
        return { success: true };
    
    // --- Sessions ---
    case 'GET_SESSIONS':
      return { sessions: await getSessions() };
    
    case 'GET_LATEST_SESSION':
      const sessions = await getSessions();
      return { session: sessions[0] || null };
    
    // --- Settings ---
    case 'GET_SETTINGS':
      return { settings: await getSettings() };
    
    case 'UPDATE_SETTINGS': {
      const settings = await getSettings();
      Object.assign(settings, message.settings);
      await setStorage({ settings });
      
      // Update idle detection interval
      if (message.settings.idleThresholdMinutes) {
        chrome.idle.setDetectionInterval(message.settings.idleThresholdMinutes * 60);
      }
      
      // Setup or clear auto-export
      if (settings.autoExportEnabled) {
        chrome.alarms.create('auto-export', { periodInMinutes: settings.autoExportIntervalMinutes });
      } else {
        chrome.alarms.clear('auto-export');
      }
      
      return { settings };
    }
    
    // --- Export ---
    case 'EXPORT_MARKDOWN':
      const md = await exportMarkdown();
      return { success: true, content: md };
    
    // --- Focus Tab ---
    case 'FOCUS_TAB':
      try {
        const tab = await chrome.tabs.get(message.tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(message.tabId, { active: true });
      } catch (e) { /* tab may not exist */ }
      return { success: true };

    // --- Gatekeeper ---
    case 'CHECK_CONTEXT_NEEDED': {
        // Check if gatekeeper is globally disabled
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
            const taskName = pageTitle.replace(/\s*[-–—]\s*Asana\s*$/i, '').replace(/\s*[-–—]\s*[^-–—]+$/, '').trim();
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
    
    case 'SET_TAB_CONTEXT': {
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
    
    case 'START_SIDE_QUEST': {
        const tabs = await getTabData();
        if (tabs[sender.tab.id]) {
            tabs[sender.tab.id].context = message.context;
            tabs[sender.tab.id].intent = 'Side Quest';
            await setTabData(tabs);
            broadcastMessage({ type: 'TAB_UPDATED', tabId: sender.tab.id, tabData: tabs[sender.tab.id] });
            
            // Auto-pause the active focus when going on a side quest
            const engine = await getFocusEngine();
            if (engine.activeFocusId && engine.items[engine.activeFocusId]) {
              const activeFocus = engine.items[engine.activeFocusId];
              if (activeFocus.focusState === 'active') {
                if (activeFocus.lastResumedAt) {
                  activeFocus.elapsedMs = (activeFocus.elapsedMs || 0) + (Date.now() - new Date(activeFocus.lastResumedAt).getTime());
                  activeFocus.lastResumedAt = null;
                }
                activeFocus.focusState = 'paused';
                activeFocus.pausedAt = new Date().toISOString();
                activeFocus.pausedReason = 'side_quest';
                await setFocusEngine(engine);
                broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
              }
            }
            
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
            list.push({ url: message.url, title: message.title, context: message.context || null, note: message.note || null, parkedAt: new Date().toISOString() });
            await setStorage({ parkedTabs: list });
            broadcastMessage({ type: 'PARKED_TABS_UPDATED' });
        }
        try { await chrome.tabs.remove(sender.tab.id); } catch(e) { /* ignore */ }
        return { success: true };
    }
    
    case 'SKIP_DOMAIN': {
        const { skippedDomains } = await getStorage('skippedDomains');
        const list = skippedDomains || [];
        if (!list.includes(message.domain)) {
          list.push(message.domain);
          await setStorage({ skippedDomains: list });
        }
        return { success: true };
    }
    
    case 'LOG_INTENT_ACTION': {
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
        // Keep last 500
        await setStorage({ intentHistory: history.slice(0, 500) });
        broadcastMessage({ type: 'INTENT_HISTORY_UPDATED' });
        triggerSync();
        return { success: true };
    }
    
    case 'ASSOCIATE_TAB_WITH_FOCUS': {
        const engine = await getFocusEngine();
        const focusId = message.focusId;
        const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
        if (focusId && engine.items[focusId] && tabId) {
          if (!engine.items[focusId].associatedTabIds.includes(tabId)) {
            engine.items[focusId].associatedTabIds.push(tabId);
            await setFocusEngine(engine);
            broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
          }
        }
        return { success: true };
    }

    case 'GET_CURRENT_TAB_ID': {
        return { tabId: sender.tab ? sender.tab.id : null };
    }
    
    case 'CLOSE_TAB': {
        try { await chrome.tabs.remove(message.tabId); } catch(e) { /* tab may not exist */ }
        return { success: true };
    }

    // --- Link/Merge Actions ---
    case 'LINK_TAB_TO_INTENT': {
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

    case 'LINK_INTENT_TO_TASK': {
        const engine = await getFocusEngine();
        const { intentId, taskId, newTaskName } = message;
        
        let finalTaskId = taskId;
        if (newTaskName) {
           const { tasks } = await getStorage('tasks') || { tasks: [] };
           finalTaskId = `task_${Date.now()}`;
           tasks.push({ id: finalTaskId, name: newTaskName, createdAt: new Date().toISOString() });
           await setStorage({ tasks });
           // Ideally we'd broadcast TASKS_UPDATED if UI expects it
           broadcastMessage({ type: 'TASKS_UPDATED', tasks }); 
        }
        
        if (engine.items[intentId]) {
          engine.items[intentId].tags = engine.items[intentId].tags || {};
          engine.items[intentId].tags.task = finalTaskId;
          await setFocusEngine(engine);
          broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
        }
        return { success: true };
    }

    case 'MERGE_INTENTS': {
        const engine = await getFocusEngine();
        const { sourceIntentId, targetIntentId } = message;
        
        if (engine.items[sourceIntentId] && engine.items[targetIntentId]) {
          const source = engine.items[sourceIntentId];
          const target = engine.items[targetIntentId];
          
          // Merge tabs
          const newTabs = [...new Set([...target.associatedTabIds, ...source.associatedTabIds])];
          target.associatedTabIds = newTabs;
          
          // Merge elapsed time
          target.elapsedMs = (target.elapsedMs || 0) + (source.elapsedMs || 0);
          
          // Delete old intent
          delete engine.items[sourceIntentId];
          
          // Fix active focus if it was the source
          if (engine.activeFocusId === sourceIntentId) {
            engine.activeFocusId = targetIntentId;
          }
          
          await setFocusEngine(engine);
          broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
        }
        return { success: true };
    }

    // --- Tasks CRUD ---
    case 'GET_TASKS': {
      const { tasks } = await getStorage('tasks') || {};
      return { tasks: tasks || [] };
    }
    case 'CREATE_TASK': {
      const { tasks: existing } = await getStorage('tasks') || {};
      const taskList = existing || [];
      const newTask = {
        id: `task_${Date.now()}`,
        name: message.name,
        description: message.description || '',
        status: 'active', // active | completed | archived
        linkedIntents: [],
        createdAt: new Date().toISOString(),
        completedAt: null,
      };
      taskList.push(newTask);
      await setStorage({ tasks: taskList });
      broadcastMessage({ type: 'TASKS_UPDATED', tasks: taskList });
      return { success: true, task: newTask };
    }
    case 'UPDATE_TASK': {
      const { tasks: all } = await getStorage('tasks') || {};
      const taskArr = all || [];
      const idx = taskArr.findIndex(t => t.id === message.taskId);
      if (idx >= 0) {
        taskArr[idx] = { ...taskArr[idx], ...message.updates };
        await setStorage({ tasks: taskArr });
        broadcastMessage({ type: 'TASKS_UPDATED', tasks: taskArr });
        return { success: true };
      }
      return { error: 'Task not found' };
    }
    case 'DELETE_TASK': {
      const { tasks: tAll } = await getStorage('tasks') || {};
      const filtered = (tAll || []).filter(t => t.id !== message.taskId);
      await setStorage({ tasks: filtered });
      broadcastMessage({ type: 'TASKS_UPDATED', tasks: filtered });
      return { success: true };
    }

    // --- Focus Engine ---
    case 'GET_FOCUS_ENGINE':
      return { focusEngine: await getFocusEngine() };
    
    case 'START_FOCUS': {
      const result = await startFocus(message.label, message.timerMinutes, message.tags);
      // Notify desktop companion of new focus
      if (companionBridge.isConnected && result.activeId) {
        const active = result.items[result.activeId];
        companionBridge.sendFocusUpdate(result.activeId, active?.label);
      }
      return { focusEngine: result };
    }
    
    case 'ADD_FOCUS':
      return { focusEngine: await addFocus(message.label, message.timerMinutes, message.tags) };
    
    case 'SWITCH_FOCUS':
      return { focusEngine: await switchFocus(message.focusId) };
    
    case 'COMPLETE_FOCUS':
      return { focusEngine: await completeFocus(message.focusId) };
    
    case 'EXTEND_FOCUS_TIMER':
      return { focusEngine: await extendFocusTimer(message.focusId, message.extraMinutes) };
    
    case 'SET_FUNNEL_STAGE':
      return { focusEngine: await setFunnelStage(message.focusId, message.stage) };
    
    case 'UPDATE_FOCUS_TAGS':
      return { focusEngine: await updateFocusTags(message.focusId, message.tags) };

    case 'RENAME_FOCUS': {
        const engine = await getFocusEngine();
        if (engine.items[message.focusId]) {
          engine.items[message.focusId].label = message.newLabel;
          await setFocusEngine(engine);
          broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
        }
        return { focusEngine: engine };
    }

    case 'UPDATE_FOCUS': {
        const engine = await getFocusEngine();
        const item = engine.items[message.focusId];
        if (!item) return { error: 'Focus not found', focusEngine: engine };
        if (message.label !== undefined) item.label = message.label;
        if (message.timerMinutes !== undefined) item.timerMinutes = message.timerMinutes;
        if (message.tags !== undefined) item.tags = { ...item.tags, ...message.tags };
        if (message.funnelStage !== undefined) item.funnelStage = message.funnelStage;
        await setFocusEngine(engine);
        broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
        return { focusEngine: engine };
    }

    case 'PAUSE_FOCUS': {
        const engine = await getFocusEngine();
        const focusId = message.focusId || engine.activeFocusId;
        const item = focusId ? engine.items[focusId] : null;
        if (!item) return { error: 'Focus not found', focusEngine: engine };
        // Save elapsed time
        if (item.lastResumedAt) {
          item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime());
          item.lastResumedAt = null;
        }
        item.focusState = 'paused';
        item.pausedAt = new Date().toISOString();
        await setFocusEngine(engine);
        broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
        return { focusEngine: engine };
    }

    case 'RESUME_FOCUS': {
        const engine = await getFocusEngine();
        const focusId = message.focusId;
        const item = focusId ? engine.items[focusId] : null;
        if (!item) return { error: 'Focus not found', focusEngine: engine };
        // If another focus is currently active, pause it first
        if (engine.activeFocusId && engine.activeFocusId !== focusId) {
          const current = engine.items[engine.activeFocusId];
          if (current && current.focusState === 'active') {
            if (current.lastResumedAt) {
              current.elapsedMs = (current.elapsedMs || 0) + (Date.now() - new Date(current.lastResumedAt).getTime());
              current.lastResumedAt = null;
            }
            current.focusState = 'paused';
            current.pausedAt = new Date().toISOString();
          }
        }
        item.focusState = 'active';
        item.lastResumedAt = new Date().toISOString();
        item.pausedAt = null;
        engine.activeFocusId = focusId;
        await setFocusEngine(engine);
        broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
        return { focusEngine: engine };
    }

    case 'RENAME_TAB': {
        const tabs = await getTabData();
        if (tabs[message.tabId]) {
          tabs[message.tabId].customTitle = message.newTitle;
          await setTabData(tabs);
          broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
        }
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

    // --- InBar data ---
    case 'GET_INBAR_DATA': {
        const { settings: ibSettings } = await getStorage('settings');
        const tabs = await getTabData();
        const tabId = sender.tab ? sender.tab.id : null;
        const tabContext = tabId ? tabs[tabId] : null;
        const engine = await getFocusEngine();
        const activeFocus = engine.activeFocusId ? engine.items[engine.activeFocusId] : null;
        
        // Calculate total task time from all associated tabs
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
        const allFocusItems = Object.values(engine.items).map(i => ({ id: i.id, label: i.label, focusState: i.focusState, funnelStage: i.funnelStage }));
        return { show, tabContext, activeFocus, activeFocusId: engine.activeFocusId, allFocusItems, settings: ibSettings || {} };
    }

    case 'SAVE_INBAR_NOTE': {
        const { note, tabId: noteTabId } = message;
        const { inbarNotes = {} } = await getStorage('inbarNotes');
        const noteKey = noteTabId || (sender.tab ? sender.tab.id : 'global');
        inbarNotes[noteKey] = { text: note, updatedAt: new Date().toISOString() };
        await setStorage({ inbarNotes });
        return { success: true };
    }

    case 'GET_INBAR_NOTES': {
        const { inbarNotes = {} } = await getStorage('inbarNotes');
        const tabId = sender.tab ? sender.tab.id : null;
        return { note: inbarNotes[tabId]?.text || inbarNotes['global']?.text || '' };
    }
    
    // --- Open InPop on current tab (from InBar "Set intent" button) ---
    case 'OPEN_POPUP': {
        const tabId = sender?.tab?.id || message.tabId;
        if (!tabId) return { error: 'No tab ID' };
        // Clear any existing context so gatekeeper will fire
        const tabs = await getTabData();
        if (tabs[tabId]) {
          tabs[tabId].contextSource = null;
          await setTabData(tabs);
        }
        // Inject gatekeeper content script
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

    // --- Clock In/Out (synced bidirectionally with companion) ---
    case 'CLOCK_IN': {
        const result = await clockService.clockIn();
        // Sync to desktop companion
        if (companionBridge.isConnected) {
          companionBridge.sendClockIn(message.label);
        }
        return result;
    }
    
    case 'CLOCK_OUT': {
        const result = await clockService.clockOut();
        if (companionBridge.isConnected) {
          companionBridge.sendClockOut();
        }
        return result;
    }
    
    case 'GET_CLOCK_STATUS':
        return await clockService.getClockStatus();
    
    case 'TOGGLE_BREAK': {
        const result = await clockService.toggleBreak();
        if (companionBridge.isConnected) {
          companionBridge.sendToggleBreak();
        }
        return result;
    }

    case 'GET_LAST_SESSION':
        return await clockService.getLastSession();

    case 'GET_CLOCK_HISTORY':
        return await clockService.getClockHistory();

    // --- Desktop Companion ---
    case 'GET_COMPANION_STATUS':
        return {
          connected: companionBridge.isConnected,
          status: companionBridge.status,
          activeApp: companionBridge.activeApp,
          clock: companionBridge.clockState,
        };

    case 'GET_COMPANION_SUMMARY':
        if (companionBridge.isConnected) {
          companionBridge.requestSummary(message.date);
          return { requested: true };
        }
        return { connected: false };

    case 'COMPANION_CLOCK_IN':
        if (companionBridge.isConnected) {
          companionBridge.sendClockIn(message.label);
          return { sent: true };
        }
        return { connected: false };

    case 'COMPANION_CLOCK_OUT':
        if (companionBridge.isConnected) {
          companionBridge.sendClockOut();
          return { sent: true };
        }
        return { connected: false };

    case 'COMPANION_TOGGLE_BREAK':
        if (companionBridge.isConnected) {
          companionBridge.sendToggleBreak();
          return { sent: true };
        }
        return { connected: false };

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

// ============================================================
// DATA RETENTION — Desktop/Companion Activity Pruning
// ============================================================

const RETENTION_ALARM = 'tabatha-data-retention';
const DEFAULT_RETENTION_DAYS = 90;

async function runRetentionCleanup() {
  try {
    const { settings = {} } = await getStorage('settings');
    const retentionDays = settings.desktopRetentionDays || DEFAULT_RETENTION_DAYS;
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // Prune companionRecentSessions
    const { companionRecentSessions = [] } = await getStorage('companionRecentSessions');
    if (companionRecentSessions.length > 0) {
      const kept = companionRecentSessions.filter(s => {
        const ts = s.start ? new Date(s.start).getTime() : 0;
        return ts > cutoff;
      });
      if (kept.length < companionRecentSessions.length) {
        await setStorage({ companionRecentSessions: kept });
        console.log(`Tabatha: Retention pruned ${companionRecentSessions.length - kept.length} companion sessions (>${retentionDays}d)`);
      }
    }

    // Prune desktopActivity entries
    const { desktopActivity = [] } = await getStorage('desktopActivity');
    if (desktopActivity.length > 0) {
      const kept = desktopActivity.filter(a => {
        const ts = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        return ts > cutoff;
      });
      if (kept.length < desktopActivity.length) {
        await setStorage({ desktopActivity: kept });
        console.log(`Tabatha: Retention pruned ${desktopActivity.length - kept.length} desktop activity entries`);
      }
    }
  } catch (e) {
    console.warn('Tabatha: Retention cleanup error', e);
  }
}

// Register daily alarm
chrome.alarms.create(RETENTION_ALARM, { periodInMinutes: 1440 }); // 24h
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETENTION_ALARM) runRetentionCleanup();
});

// Run once on startup
runRetentionCleanup();

// Notification click handler merged into single listener above (L757)
