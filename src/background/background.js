// Tabatha — Service Worker (background.js)
// Core orchestrator for tab tracking, context/intent, priority, locking,
// groups, categories, time tracking, and markdown export.

import { supabase } from '../services/supabaseClient';
import * as timeTracker from '../services/timeTracking.js';
import { createClockService } from './clock.js';
import { companionBridge } from './companion-bridge.js';
import { fireWebhook } from './webhooks.js';
import {
  PRIORITY_LEVELS,
  DEFAULT_FOCUS_ENGINE,
  STAGE_ORDER
} from './constants.js';
import {
  getUrlBase
} from './helpers.js';
import {
  getStorage,
  setStorage,
  getSettings,
  getTabData,
  getSubGroups
} from './services/storageService.js';
import * as notificationService from './services/notificationService.js';
import {
  broadcastAll,
  broadcastToExtension,
  configureNotificationService
} from './services/notificationService.js';
import * as settingsService from './services/settingsService.js';
import * as tabTrackingService from './services/tabTrackingService.js';
import {
  configureTabTrackingService
} from './services/tabTrackingService.js';
import * as categoryService from './services/categoryService.js';
import * as sessionService from './services/sessionService.js';
import {
  configureSessionService
} from './services/sessionService.js';
import * as tabService from './services/tabService.js';
import {
  configureTabService,
  registerTabServiceListeners
} from './services/tabService.js';
import { registerBootstrap } from './bootstrap.js';

// ============================================================
// LOGGING
// ============================================================

function logEvent(type, data = {}) {
  const entry = { type, ...data, ts: new Date().toISOString() };
  chrome.storage.local.get('tabathaLogs', r => {
    const logs = r.tabathaLogs || [];
    logs.push(entry);
    // Keep last 500
    chrome.storage.local.set({ tabathaLogs: logs.slice(-500) });
  });
}

// setTabData stays local because it fires the Supabase sync debouncer.
async function setTabData(tabs) {
  const result = await setStorage({ tabs });
  triggerSync();
  return result;
}

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
          context: intent.context ?? intent.newContext ?? null,
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
  
  // Apply default realm from profile settings if not explicitly set
  if (!tags.realm) {
    try {
      const { tabathaSettings } = await getStorage('tabathaSettings');
      if (tabathaSettings?.defaultRealm) tags.realm = tabathaSettings.defaultRealm;
    } catch (e) { /* ignore */ }
  }
  
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
    funnelStage: 'addressing', // Active attention = addressing
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
  
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  fireWebhook('focus_started', { id, label, timerMinutes, tags });
  return engine;
}

async function addFocus(label, timerMinutes = 15, tags = {}) {
  const engine = await getFocusEngine();
  const id = generateFocusId();
  
  // Apply default realm from profile settings if not explicitly set
  if (!tags.realm) {
    try {
      const { tabathaSettings } = await getStorage('tabathaSettings');
      if (tabathaSettings?.defaultRealm) tags.realm = tabathaSettings.defaultRealm;
    } catch (e) { /* ignore */ }
  }
  
  // Add without interrupting active — new item starts as 'paused'
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
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { engine, newFocusId: id };
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
  
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
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
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  fireWebhook('focus_resolved', { id, label: item.label, elapsedMs: item.elapsedMs });
  return engine;
}

async function extendFocusTimer(focusId, extraMinutes = 5) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  if (!id || !engine.items[id]) return engine;
  
  const item = engine.items[id];
  item.timerMinutes = (item.timerMinutes || 0) + extraMinutes;
  
  // If drifted, transition back to active — flush elapsed first
  if (item.focusState === 'drifted') {
    // Accumulate the time since last resume BEFORE resetting lastResumedAt
    if (item.lastResumedAt) {
      item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime());
    }
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
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

async function setFunnelStage(focusId, stage) {
  const engine = await getFocusEngine();
  if (!engine.items[focusId]) return engine;
  engine.items[focusId].funnelStage = stage;
  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

async function updateFocusTags(focusId, tags) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  if (!id || !engine.items[id]) return engine;
  engine.items[id].tags = { ...engine.items[id].tags, ...tags };
  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
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
// TAB LIFECYCLE TRACKING
// ============================================================
// onCreated/onRemoved/onUpdated are registered by tabService.

// ============================================================
// TIME TRACKING DELEGATED TO SERVICE
// ============================================================

// ── Smart Context-Switch Detection ──
// Detects rapid switching between unrelated contexts (>3 distinct in 5 min)
const contextSwitchTracker = (() => {
  const history = []; // { context, ts }
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  const THRESHOLD = 4; // 4+ distinct contexts = drifting
  let lastNotified = 0;
  const COOLDOWN_MS = 10 * 60 * 1000; // Don't re-notify within 10 min

  return {
    record(context) {
      const now = Date.now();
      history.push({ context, ts: now });
      // Trim old entries
      while (history.length > 0 && now - history[0].ts > WINDOW_MS) history.shift();
      // Count distinct contexts in window
      const distinct = new Set(history.map(h => h.context)).size;
      if (distinct >= THRESHOLD && now - lastNotified > COOLDOWN_MS) {
        lastNotified = now;
        try {
          chrome.notifications.create(`context-drift-${now}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: '⚠️ Context Drift Detected',
            message: `You've switched between ${distinct} different contexts in the last 5 minutes. Click to set a focus.`,
            priority: 2,
          });
        } catch (e) { console.warn('[Tabatha] Notification error:', e); }
        logEvent('context_drift', { distinctContexts: distinct, window: '5min' });
      }
    }
  };
})();

// Handle notification clicks — open homepage to set focus
chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId.startsWith('context-drift-') || notifId.startsWith('focus-expired-') || notifId.startsWith('nudge-')) {
    chrome.tabs.create({ url: chrome.runtime.getURL('home.html') });
    chrome.notifications.clear(notifId);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tabs = await getTabData();
  const tabData = tabs[activeInfo.tabId];
  
  if (tabData) {
    tabData.lastActive = new Date().toISOString();
    await setTabData(tabs);
    
    // Start tracking the new active tab
    await timeTracker.startTracking(activeInfo.tabId, tabData.url, tabData);
    
    // ── Context-switch detection ──
    // Use domain as primary context signal (user context if set, else domain, else category)
    let contextSignal = tabData.context;
    if (!contextSignal && tabData.url) {
      try { contextSignal = new URL(tabData.url).hostname.replace(/^www\./, ''); } catch (e) {}
    }
    contextSignal = contextSignal || tabData.category || 'unknown';
    contextSwitchTracker.record(contextSignal);
  }
  
  broadcastToExtension({ type: 'TAB_ACTIVATED', tabId: activeInfo.tabId });
  
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
      broadcastToExtension({ type: 'GROUPS_UPDATED' });
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
      broadcastToExtension({ type: 'GROUPS_UPDATED' });
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
      broadcastAll({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
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
        broadcastToExtension({
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

    // Auto-pause active focus when going idle
    const engine = await getFocusEngine();
    if (engine.activeFocusId) {
      const active = engine.items[engine.activeFocusId];
      if (active && active.focusState === 'active') {
        if (active.lastResumedAt) {
          active.elapsedMs = (active.elapsedMs || 0) + (Date.now() - new Date(active.lastResumedAt).getTime());
          active.lastResumedAt = null;
        }
        active.focusState = 'paused';
        active.pausedAt = new Date().toISOString();
        if (active.funnelStage === 'addressing') active.funnelStage = 'focus';
        await setFocusEngine(engine);
        broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
      }
    }

    // Log idle event
    broadcastToExtension({ type: 'USER_IDLE', since: userIdleSince });

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

      // If user was auto-put on break, auto-resume or prompt
      let pausedFocusId = null;
      let pausedFocusLabel = null;
      if (idleAutoBreakApplied) {
        const { clockSession } = await getStorage('clockSession');
        if (clockSession?.active && clockSession?.onBreak) {
          if (settings.autoResumeFromBreak) {
            await clockService.toggleBreak(); // auto-resume
          }
        }
        idleAutoBreakApplied = false;
      }

      // Find the most recently paused focus to offer resumption
      const engine = await getFocusEngine();
      if (engine.activeFocusId && engine.items[engine.activeFocusId]) {
        const item = engine.items[engine.activeFocusId];
        if (item.focusState === 'paused') {
          pausedFocusId = engine.activeFocusId;
          pausedFocusLabel = item.label;
        }
      }

      // Broadcast welcome back with idle duration + paused focus
      broadcastAll({
        type: 'WELCOME_BACK',
        idleSince: userIdleSince,
        idleDurationMs: idleDuration,
        pausedFocusId,
        pausedFocusLabel,
        wasOnBreak: idleAutoBreakApplied
      });

      if (idleDuration > (settings.idleThresholdMinutes || 5) * 60 * 1000) {
        broadcastToExtension({
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
        broadcastToExtension({ type: 'AUTO_BREAK', reason: 'idle_5min' });
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
        broadcastToExtension({ type: 'PROMPT_PURPOSE', tabId });
    }
});

// Notification button click handler (for focus timer expiry actions)
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId.startsWith('focus-drift-')) {
    const focusId = notificationId.replace('focus-drift-', '');
    if (buttonIndex === 0) {
      // Extend 5 min
      await extendFocusTimer(focusId, 5);
      broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
    } else if (buttonIndex === 1) {
      // Complete & Move On
      await completeFocus(focusId);
      broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
    }
    chrome.notifications.clear(notificationId);
  }
});

// Set idle detection interval (1 min = idle, 5 min = auto-break handled below)
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
      broadcastToExtension({
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
      
      broadcastToExtension({
        type: 'INTENT_REINFORCEMENT',
        tabId,
        tabData
      });
      
      // Re-arm timer
      chrome.alarms.create(`context-timer-${tabId}`, { delayInMinutes: timerMinutes });
    }
  }
  
  if (alarm.name === 'auto-export') {
    await sessionService.exportMarkdown();
  }

  // 'session-snapshot' alarm is now dispatched by bootstrap.js to
  // sessionService.saveSessionSnapshot — see registerBootstrap().

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
      broadcastToExtension({ type: 'POMODORO_COMPLETE' });
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
      broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
      
      // Interrupting notification with action buttons
      chrome.notifications.create(`focus-drift-${focusId}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '⏰ Tabatha — Focus Timer Expired',
        message: `"${item.label}" — Your allotted ${item.timerMinutes}m is up. Add more time or move to the next item.`,
        requireInteraction: true,
        priority: 2,
        buttons: [
          { title: '⏱️ Extend 5 min' },
          { title: '➡️ Complete & Move On' }
        ]
      });

      // Broadcast to all tabs so InBar can show interrupting alert
      broadcastAll({
        type: 'FOCUS_TIMER_EXPIRED',
        focusId,
        label: item.label,
        timerMinutes: item.timerMinutes,
        elapsedMs: item.elapsedMs
      });
    }
  }

  // ── Unfocused Nudge ──
  // Every 10 min: if no active focus is set and user is not idle, nudge them
  if (alarm.name === 'unfocused-nudge') {
    const engine = await getFocusEngine();
    const hasActive = engine.activeFocusId && engine.items[engine.activeFocusId]?.focusState === 'active';
    if (!hasActive) {
      const idleState = await chrome.idle.queryState(60);
      if (idleState === 'active') {
        try {
          chrome.notifications.create(`nudge-${Date.now()}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: '🎯 Tabatha — What are you working on?',
            message: 'You\'ve been browsing without a focus set. Click to set one.',
            priority: 1,
          });
        } catch (e) { console.warn('[Tabatha] Nudge notification error:', e); }
        logEvent('unfocused_nudge', { activeFocusId: engine.activeFocusId });
      }
    }
  }
});

// Create the unfocused nudge recurring alarm (every 10 min)
chrome.alarms.create('unfocused-nudge', { periodInMinutes: 10 });

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
        broadcastToExtension({
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

// Sync to Supabase every 5 minutes
chrome.alarms.create('supabase-sync', { periodInMinutes: 5 });

// ============================================================
// MESSAGE ROUTING
// ============================================================

// ── Service instances ──
configureNotificationService({ getTabData, setTabData, getFocusEngine });
configureTabTrackingService({ broadcastToExtension, triggerSync });
configureSessionService({ setTabData });
configureTabService({ getFocusEngine, setFocusEngine, addFocus, setTabData, logEvent });

const clockService = createClockService(getStorage, setStorage, broadcastToExtension);

// ── Router skeleton ──
// Services land in Plan 023 Tasks 02+. Each registered entry must expose
// `handleMessage(type, message, sender)` and return `undefined` to indicate
// the message is not theirs (the router then falls through to
// `handleLegacyMessage`). Anything else — including `null`, `{}`, or an
// error object — is treated as a handled response.
const services = [
  notificationService,
  settingsService,
  tabTrackingService,
  categoryService,
  sessionService,
  tabService
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      for (const svc of services) {
        const result = await svc.handleMessage(message?.type, message, sender);
        if (result !== undefined) {
          sendResponse(result);
          return;
        }
      }
      const legacy = await handleLegacyMessage(message, sender);
      sendResponse(legacy);
    } catch (err) {
      console.error('[Tabatha] handleMessage Error:', err);
      sendResponse({ error: err.message || 'Unknown error' });
    }
  })();
  return true; // Async response
});

async function handleLegacyMessage(message, sender) {
  switch (message.type) {
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
    
    case 'START_SIDE_QUEST': {
        const tabs = await getTabData();
        if (tabs[sender.tab.id]) {
            tabs[sender.tab.id].context = message.context;
            tabs[sender.tab.id].intent = 'Side Quest';
            await setTabData(tabs);
            broadcastAll({ type: 'TAB_UPDATED', tabId: sender.tab.id, tabData: tabs[sender.tab.id] });
            
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
                broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
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
        broadcastToExtension({ type: 'SUGAR_BOX_UPDATED' });
        return { success: true };
    }
    
    case 'PARK_TAB': {
        const { parkedTabs } = await getStorage('parkedTabs');
        const list = parkedTabs || [];
        const exists = list.find(t => t.url === message.url);
        if (!exists) {
            list.push({ url: message.url, title: message.title, context: message.context || null, note: message.note || null, parkedAt: new Date().toISOString() });
            await setStorage({ parkedTabs: list });
            broadcastToExtension({ type: 'PARKED_TABS_UPDATED' });
        }
        try { await chrome.tabs.remove(sender.tab.id); } catch(e) { /* ignore */ }
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
           broadcastToExtension({ type: 'TASKS_UPDATED', tasks }); 
        }
        
        if (engine.items[intentId]) {
          engine.items[intentId].tags = engine.items[intentId].tags || {};
          engine.items[intentId].tags.task = finalTaskId;
          await setFocusEngine(engine);
          broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
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
          broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
        }
        return { success: true };
    }

    // --- Tasks CRUD ---
    case 'GET_TASKS': {
      // Return tasks from org registry (primary) + any remaining legacy tasks
      const { tabathaOrg, tasks: legacyTasks } = await getStorage(['tabathaOrg', 'tasks']);
      const orgTasks = Object.values(tabathaOrg?.tasks || {}).filter(t => !t.archived);
      const legacy = (legacyTasks || []);
      const orgIds = new Set(orgTasks.map(t => t.id));
      const merged = [...orgTasks, ...legacy.filter(t => !orgIds.has(t.id))];
      return { tasks: merged };
    }
    case 'CREATE_TASK': {
      // Write directly to org registry
      const { tabathaOrg } = await getStorage('tabathaOrg');
      const org = tabathaOrg || { clients: {}, projects: {}, tasks: {}, operations: {}, initiatives: {} };
      const id = `task_${Date.now()}`;
      const newTask = {
        id,
        name: message.name,
        description: message.description || '',
        projectId: message.projectId || null,
        clientId: message.clientId || null,
        status: 'active',
        funnelStage: 'unsorted', // Tasks always start unsorted
        linkedIntents: [],
        createdAt: new Date().toISOString(),
        completedAt: null,
        archived: false,
      };
      org.tasks[id] = newTask;
      await setStorage({ tabathaOrg: org });
      // Broadcast with full merged list for backward compatibility
      const allTasks = Object.values(org.tasks).filter(t => !t.archived);
      broadcastToExtension({ type: 'TASKS_UPDATED', tasks: allTasks });
      return { success: true, task: newTask };
    }
    case 'UPDATE_TASK': {
      const { tabathaOrg } = await getStorage('tabathaOrg');
      const org = tabathaOrg || { clients: {}, projects: {}, tasks: {}, operations: {}, initiatives: {} };
      if (org.tasks[message.taskId]) {
        const task = org.tasks[message.taskId];
        const updates = message.updates || {};

        // ── TASK STAGE GATING ──
        if (updates.funnelStage !== undefined) {
          const from = task.funnelStage || 'unsorted';
          const to = updates.funnelStage;
          const fromOrder = STAGE_ORDER[from] ?? 0;
          const toOrder = STAGE_ORDER[to] ?? 0;
          const isBackward = toOrder < fromOrder;
          const confirmed = !!message.confirmed;

          // Gate 1: Nothing rolls back to unsorted
          if (to === 'unsorted' && from !== 'unsorted') {
            return { error: 'Tasks cannot roll back to unsorted', needsConfirm: false };
          }

          // Gate 2: todo → focus requires name and description
          if (to === 'focus' && from === 'todo') {
            if (!(task.name && task.name.trim()) || !(task.description && task.description.trim())) {
              return { error: 'Task needs a name and description before entering focus', needsConfirm: false };
            }
          }

          // Gate 3: focus → addressing requires confirmation
          if (to === 'addressing' && (from === 'focus' || from === 'todo')) {
            if (!confirmed) {
              return { error: 'Moving to addressing will make this your active task. Confirm?', needsConfirm: true };
            }
          }

          // Gate 4: Backward transitions require confirmation (except roadblocked → focus)
          if (isBackward && !(from === 'roadblocked' && to === 'focus')) {
            if (!confirmed) {
              return { error: `Rolling task back from ${from} to ${to} requires confirmation`, needsConfirm: true };
            }
          }
        }

        org.tasks[message.taskId] = { ...task, ...updates };
        await setStorage({ tabathaOrg: org });
        const allTasks = Object.values(org.tasks).filter(t => !t.archived);
        broadcastToExtension({ type: 'TASKS_UPDATED', tasks: allTasks });
        return { success: true };
      }
      // Fallback: check legacy storage
      const { tasks: legacyAll } = await getStorage('tasks');
      const taskArr = legacyAll || [];
      const idx = taskArr.findIndex(t => t.id === message.taskId);
      if (idx >= 0) {
        taskArr[idx] = { ...taskArr[idx], ...message.updates };
        await setStorage({ tasks: taskArr });
        broadcastToExtension({ type: 'TASKS_UPDATED', tasks: taskArr });
        return { success: true };
      }
      return { error: 'Task not found' };
    }
    case 'DELETE_TASK': {
      const { tabathaOrg } = await getStorage('tabathaOrg');
      const org = tabathaOrg || { clients: {}, projects: {}, tasks: {}, operations: {}, initiatives: {} };
      if (org.tasks[message.taskId]) {
        // Archive instead of hard-delete (safe)
        org.tasks[message.taskId].archived = true;
        await setStorage({ tabathaOrg: org });
        const allTasks = Object.values(org.tasks).filter(t => !t.archived);
        broadcastToExtension({ type: 'TASKS_UPDATED', tasks: allTasks });
        return { success: true };
      }
      // Fallback: remove from legacy storage
      const { tasks: tAll } = await getStorage('tasks');
      const filtered = (tAll || []).filter(t => t.id !== message.taskId);
      await setStorage({ tasks: filtered });
      broadcastToExtension({ type: 'TASKS_UPDATED', tasks: filtered });
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
    
    case 'ADD_FOCUS': {
      const result = await addFocus(message.label, message.timerMinutes, message.tags);
      return { focusEngine: result.engine, newFocusId: result.newFocusId };
    }
    
    case 'SWITCH_FOCUS':
      return { focusEngine: await switchFocus(message.focusId) };
    
    case 'COMPLETE_FOCUS':
      return { focusEngine: await completeFocus(message.focusId) };
    
    case 'EXTEND_FOCUS_TIMER':
      return { focusEngine: await extendFocusTimer(message.focusId, message.extraMinutes) };
    
    case 'SET_FUNNEL_STAGE': {
      // Delegate to UPDATE_FOCUS handler logic to enforce state machine
      const engine = await getFocusEngine();
      const item = engine.items[message.focusId];
      if (!item) return { error: 'Focus not found', focusEngine: engine };
      const from = item.funnelStage || 'unsorted';
      const to = message.stage;
      const isBackward = (STAGE_ORDER[to] ?? 0) < (STAGE_ORDER[from] ?? 0);
      const confirmed = !!message.confirmed;

      if (to === 'unsorted' && from !== 'unsorted') return { error: 'Cannot roll back to unsorted', needsConfirm: false, focusEngine: engine };
      if (from === 'resolved' && to !== 'resolved') {
        if (!confirmed) return { error: 'Resolved items cannot change stage. Confirm to undo.', needsConfirm: true, focusEngine: engine };
        item.focusState = 'paused'; item.endedAt = null;
      }
      if (item.focusState === 'completed' && to !== 'resolved') {
        if (!confirmed) return { error: 'This focus is completed. Confirm to reopen.', needsConfirm: true, focusEngine: engine };
        item.focusState = 'paused'; item.endedAt = null;
      }
      if ((from === 'addressing' || from === 'focus') && to === 'todo') return { error: 'Cannot demote from focus/addressing to todo', needsConfirm: false, focusEngine: engine };
      if (isBackward && !(from === 'roadblocked' && to === 'focus') && !confirmed) return { error: `Rolling back from ${from} to ${to} requires confirmation`, needsConfirm: true, focusEngine: engine };
      if (to === 'focus' && !(item.label && item.label.trim())) return { error: 'Focus requires a title', needsConfirm: false, focusEngine: engine };

      item.funnelStage = to;
      if (to === 'resolved') {
        if (item.lastResumedAt) { item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime()); item.lastResumedAt = null; }
        item.focusState = 'completed'; item.endedAt = new Date().toISOString();
        if (engine.activeFocusId === item.id) engine.activeFocusId = null;
      } else if (to === 'addressing' && item.focusState !== 'active') {
        if (engine.activeFocusId && engine.activeFocusId !== item.id) {
          const prev = engine.items[engine.activeFocusId];
          if (prev && prev.focusState === 'active') {
            if (prev.lastResumedAt) { prev.elapsedMs = (prev.elapsedMs || 0) + (Date.now() - new Date(prev.lastResumedAt).getTime()); prev.lastResumedAt = null; }
            prev.focusState = 'paused'; prev.pausedAt = new Date().toISOString();
          }
        }
        item.focusState = 'active'; item.lastResumedAt = new Date().toISOString(); item.startedAt = item.startedAt || new Date().toISOString(); engine.activeFocusId = item.id;
      }
      await setFocusEngine(engine);
      broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
      return { focusEngine: engine };
    }
    
    case 'UPDATE_FOCUS_TAGS':
      return { focusEngine: await updateFocusTags(message.focusId, message.tags) };

    case 'RENAME_FOCUS': {
        const engine = await getFocusEngine();
        if (engine.items[message.focusId]) {
          engine.items[message.focusId].label = message.newLabel;
          await setFocusEngine(engine);
          broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
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
        if (message.funnelStage !== undefined) {
          const from = item.funnelStage || 'unsorted';
          const to = message.funnelStage;

          // ── STAGE TRANSITION STATE MACHINE ──
          // Stage hierarchy (forward order):
          // unsorted(0) → backlog(1) → todo(2) → focus(3) → addressing(4) → resolved(5) → roadblocked(*)
              const fromOrder = STAGE_ORDER[from] ?? 0;
          const toOrder = STAGE_ORDER[to] ?? 0;
          const isBackward = toOrder < fromOrder;
          const confirmed = !!message.confirmed;

          // Rule 1: Nothing rolls back to unsorted
          if (to === 'unsorted' && from !== 'unsorted') {
            return { error: 'Cannot roll back to unsorted', needsConfirm: false, focusEngine: engine };
          }

          // Rule 2: Resolved doesn't roll back unless confirmed (accident)
          if (from === 'resolved' && to !== 'resolved') {
            if (!confirmed) {
              return { error: 'Resolved items cannot change stage. Confirm to undo.', needsConfirm: true, focusEngine: engine };
            }
            // Accident override: un-complete the item
            item.focusState = 'paused';
            item.endedAt = null;
          }

          // Rule 3: Completed items cannot restart unless confirmed
          if (item.focusState === 'completed' && to !== 'resolved') {
            if (!confirmed) {
              return { error: 'This focus is completed. Confirm to reopen.', needsConfirm: true, focusEngine: engine };
            }
            item.focusState = 'paused';
            item.endedAt = null;
          }

          // Rule 4: Addressing/Focus don't roll back to todo
          if ((from === 'addressing' || from === 'focus') && to === 'todo') {
            return { error: 'Cannot demote from focus/addressing to todo', needsConfirm: false, focusEngine: engine };
          }

          // Rule 5: Backward transitions require confirmation (except roadblocked → focus which is allowed)
          if (isBackward && !(from === 'roadblocked' && to === 'focus')) {
            if (!confirmed) {
              return { error: `Rolling back from ${from} to ${to} requires confirmation`, needsConfirm: true, focusEngine: engine };
            }
          }

          // Rule 6: 'Focus' stage requires a label (title)
          if (to === 'focus' && !(item.label && item.label.trim())) {
            return { error: 'A focus item requires a title before entering focus stage', needsConfirm: false, focusEngine: engine };
          }

          // ── Apply the stage change ──
          item.funnelStage = to;

          // Auto-sync focusState when stage implies a state change
          if (to === 'resolved') {
            // Save elapsed time before completing
            if (item.lastResumedAt) {
              item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime());
              item.lastResumedAt = null;
            }
            item.focusState = 'completed';
            item.endedAt = new Date().toISOString();
            // Clear active if this was the active focus
            if (engine.activeFocusId === item.id) engine.activeFocusId = null;
          } else if (to === 'addressing' && item.focusState !== 'active') {
            // Addressing = actively working on it — activate this focus
            // Pause current active first
            if (engine.activeFocusId && engine.activeFocusId !== item.id) {
              const prev = engine.items[engine.activeFocusId];
              if (prev && prev.focusState === 'active') {
                if (prev.lastResumedAt) {
                  prev.elapsedMs = (prev.elapsedMs || 0) + (Date.now() - new Date(prev.lastResumedAt).getTime());
                  prev.lastResumedAt = null;
                }
                prev.focusState = 'paused';
                prev.pausedAt = new Date().toISOString();
              }
            }
            item.focusState = 'active';
            item.lastResumedAt = new Date().toISOString();
            item.startedAt = item.startedAt || new Date().toISOString();
            engine.activeFocusId = item.id;
          }
        }
        await setFocusEngine(engine);
        broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
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
        // Revert addressing → focus since it no longer has active attention
        if (item.funnelStage === 'addressing') item.funnelStage = 'focus';
        await setFocusEngine(engine);
        broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
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
            // Demote from addressing since it's losing attention
            if (current.funnelStage === 'addressing') current.funnelStage = 'focus';
          }
        }
        item.focusState = 'active';
        item.lastResumedAt = new Date().toISOString();
        item.pausedAt = null;
        // Auto-promote to addressing — this now has active attention
        if (item.funnelStage === 'focus' || item.funnelStage === 'todo' || item.funnelStage === 'unsorted') {
          item.funnelStage = 'addressing';
        }
        engine.activeFocusId = focusId;
        await setFocusEngine(engine);
        broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
        // Auto-end break if currently on break
        try {
          const clockSession = (await getStorage('clockSession')).clockSession;
          if (clockSession && clockSession.onBreak) {
            await clockService.toggleBreak();
          }
        } catch(e) { /* ignore */ }
        return { focusEngine: engine };
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

    // --- Clock In/Out (synced bidirectionally with companion) ---
    case 'CLOCK_IN': {
        const result = await clockService.clockIn();
        // Sync to desktop companion
        if (companionBridge.isConnected) {
          companionBridge.sendClockIn(message.label);
        }
        fireWebhook('clock_in', { label: message.label });
        return result;
    }
    
    case 'CLOCK_OUT': {
        const result = await clockService.clockOut();
        if (companionBridge.isConnected) {
          companionBridge.sendClockOut();
        }
        fireWebhook('clock_out', {});
        return result;
    }
    
    case 'GET_CLOCK_STATUS':
        return await clockService.getClockStatus();
    
    case 'TOGGLE_BREAK': {
        const result = await clockService.toggleBreak();
        if (companionBridge.isConnected) {
          companionBridge.sendToggleBreak();
        }
        // If going ON break → auto-pause active focus
        if (result.onBreak) {
          const engine = await getFocusEngine();
          if (engine.activeFocusId) {
            const active = engine.items[engine.activeFocusId];
            if (active && active.focusState === 'active') {
              if (active.lastResumedAt) {
                active.elapsedMs = (active.elapsedMs || 0) + (Date.now() - new Date(active.lastResumedAt).getTime());
                active.lastResumedAt = null;
              }
              active.focusState = 'paused';
              active.pausedAt = new Date().toISOString();
              await setFocusEngine(engine);
              broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
            }
          }
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
// EXTENSION INSTALL / STARTUP / RELOAD / RETENTION
// ============================================================
// Lifecycle, legacy-task migration, and retention cleanup live in
// `./bootstrap.js`. registerBootstrap() wires the listeners and runs the
// initial pass.
registerTabServiceListeners();
registerBootstrap();

// Notification click handler merged into single listener above (L757)
