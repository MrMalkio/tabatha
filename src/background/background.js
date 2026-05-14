// Tabatha — Service Worker (background.js)
// Core orchestrator for tab tracking, context/intent, priority, locking,
// groups, categories, time tracking, and markdown export.

import { supabase } from '../services/supabaseClient';
import * as timeTracker from '../services/timeTracking.js';
import { fireWebhook } from './webhooks.js';
import {
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
  getTabData
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
import * as taskService from './services/taskService.js';
import * as tabService from './services/tabService.js';
import {
  configureTabService,
  registerTabServiceListeners
} from './services/tabService.js';
import * as focusService from './services/focusService.js';
import { configureFocusService } from './services/focusService.js';
import * as clockService from './services/clockService.js';
import {
  configureClockService,
  endBreakIfActive,
  consumeIdleAutoBreakApplied,
  resetIdleAutoBreakApplied
} from './services/clockService.js';
import * as clockTickService from './services/clockTickService.js';
import * as companionService from './services/companionService.js';
import { companionBridge } from './services/companionService.js';
import * as groupService from './services/groupService.js';
import {
  configureGroupService,
  registerGroupServiceListeners
} from './services/groupService.js';
import * as blockgateService from './services/blockgateService.js';
import { configureBlockgateService } from './services/blockgateService.js';
import * as alarmService from './services/alarmService.js';
import {
  configureAlarmService,
  registerAlarmServiceListener
} from './services/alarmService.js';
import { registerBootstrap, runRetentionCleanup } from './bootstrap.js';

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
// CHROME TAB GROUPS
// ============================================================
// Tab-group lifecycle listeners and CRUD handlers live in
// `./services/groupService.js`. They are registered below alongside the
// router setup so background.js stays orchestration-only.

// ============================================================
// IDLE / OFF-CHROME CONTEXT
// ============================================================

let userIdleSince = null;

// Set idle detection interval to 60 seconds (1 minute).
// `idleAutoBreakApplied` lives in clockService — see
// consumeIdleAutoBreakApplied / resetIdleAutoBreakApplied.
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
    resetIdleAutoBreakApplied();

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
      const wasAutoBreakApplied = consumeIdleAutoBreakApplied();
      if (wasAutoBreakApplied) {
        const { clockSession } = await getStorage('clockSession');
        if (clockSession?.active && clockSession?.onBreak) {
          if (settings.autoResumeFromBreak) {
            await endBreakIfActive(); // auto-resume
          }
        }
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
        wasOnBreak: wasAutoBreakApplied
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

// ============================================================
// PERIODIC ALARM CADENCES
// ============================================================
// Dispatch lives in alarmService. These create() calls just ensure the
// cadence alarms are registered on every service worker start. The names
// are owned by:
//   - `unfocused-nudge` → focusService.handleUnfocusedNudge
//   - `context-timer-<id>` → tabService.handleContextTimerExpired (per-tab,
//     created from tabService.registerTabServiceListeners)

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

configureClockService({ companionBridge, fireWebhook, getFocusEngine, setFocusEngine });
configureFocusService({ companionBridge, triggerSync, getTabData, setTabData, clockService, fireWebhook });
configureGroupService({ setTabData });
configureBlockgateService({ setTabData });
configureAlarmService({
  syncToSupabase,
  runRetentionCleanup,
  getAuthSession: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }
});

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
  clockService,
  clockTickService,
  companionService,
  taskService,
  tabService,
  focusService,
  groupService,
  blockgateService,
  alarmService
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
      const legacy = await handleLegacyMessage(message);
      sendResponse(legacy);
    } catch (err) {
      console.error('[Tabatha] handleMessage Error:', err);
      sendResponse({ error: err.message || 'Unknown error' });
    }
  })();
  return true; // Async response
});

async function handleLegacyMessage(message) {
  switch (message.type) {
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
registerGroupServiceListeners();
registerAlarmServiceListener();
registerBootstrap();

// Notification click handler merged into single listener above (L757)
