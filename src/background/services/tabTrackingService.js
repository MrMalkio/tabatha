// ════════════════════════════════════════════
// Tabatha — Tab Tracking Service (Plan 023 Task 03)
// Owns time-tracking storage views, intent action logging, and the per-tab
// time-bucket pruning that runs when a tab closes.
// ════════════════════════════════════════════

import * as timeTracker from '../../services/timeTracking.js';
import { getStorage, setStorage, getTimeTracking, getTabData, enforceArrayCap } from './storageService.js';
import { archiveBeforeCap } from './archiveService.js';
import { broadcastToExtension } from './notificationService.js';

let injectedDeps = {};
let activationListenerRegistered = false;

export function configureTabTrackingService(deps = {}) {
  injectedDeps = { ...injectedDeps, ...deps };
}

export function registerTabTrackingListeners() {
  if (activationListenerRegistered) return;
  activationListenerRegistered = true;
  chrome.tabs.onActivated.addListener(handleTabActivated);
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_TIME_TRACKING':
      return { timeTracking: await getTimeTracking() };

    case 'LOG_INTENT_ACTION':
      return logIntentAction(message);

    default:
      return undefined;
  }
}

// ── Intent history ──
// Writes the union-shape entry agreed in Plan 023 §2 (action + transition).
// Caller passes optional oldIntent/oldContext when known (e.g. SET_TAB_CONTEXT
// in background.js); otherwise the entry is action-only.
export async function appendIntentHistory(entry) {
  const { intentHistory } = await getStorage('intentHistory');
  const history = Array.isArray(intentHistory) ? intentHistory : [];
  const context = entry.context ?? entry.newContext ?? null;
  history.unshift({
    timestamp: new Date().toISOString(),
    tabId: entry.tabId ?? null,
    url: entry.url ?? null,
    domain: entry.domain ?? null,
    action: entry.action ?? null,
    context,
    oldIntent: entry.oldIntent ?? null,
    newIntent: entry.newIntent ?? null,
    oldContext: entry.oldContext ?? null,
    newContext: context,
    focusId: entry.focusId ?? null
  });
  await setStorage({ intentHistory: history });

  // Archive overflow before trimming.
  const { dropped } = await enforceArrayCap('intentHistory', 'intentHistoryCap');
  if (dropped.length) {
    await archiveBeforeCap('intentHistory', dropped, 'localArchive');
  }

  return history;
}

export function logEvent(type, data = {}) {
  const entry = { type, ...data, ts: new Date().toISOString() };
  chrome.storage.local.get('tabathaLogs', r => {
    const logs = r.tabathaLogs || [];
    logs.push(entry);
    chrome.storage.local.set({ tabathaLogs: logs.slice(-500) });
  });
}

async function logIntentAction(message) {
  await appendIntentHistory({
    tabId: message.tabId ?? null,
    url: message.url,
    domain: message.domain,
    action: message.action,
    context: message.context ?? null,
    newContext: message.context ?? null,
    focusId: message.focusId ?? null
  });
  if (injectedDeps.broadcastToExtension) {
    injectedDeps.broadcastToExtension({ type: 'INTENT_HISTORY_UPDATED' });
  }
  if (injectedDeps.triggerSync) injectedDeps.triggerSync();
  return { success: true };
}

// ── Tab close pruning ──
// On tab close, credit the closed tab's tracked time to its group / subGroup
// / project buckets (byCategory is already maintained by timeTracker.* on
// every tracking flush), then delete the per-tab row so the bucket doesn't
// grow unbounded.
export async function aggregateAndPruneTabTime(tabId, tabData) {
  const { timeTracking } = await getStorage('timeTracking');
  if (!timeTracking || typeof timeTracking !== 'object') return;
  const byTab = timeTracking.byTab || {};
  const tabMs = byTab[tabId];
  if (!Number.isFinite(tabMs) || tabMs <= 0) {
    if (byTab[tabId] !== undefined) {
      delete byTab[tabId];
      timeTracking.byTab = byTab;
      await setStorage({ timeTracking });
    }
    return;
  }

  timeTracking.byGroup = timeTracking.byGroup || {};
  timeTracking.bySubGroup = timeTracking.bySubGroup || {};
  timeTracking.byProject = timeTracking.byProject || {};

  if (tabData?.groupId !== null && tabData?.groupId !== undefined) {
    const key = String(tabData.groupId);
    timeTracking.byGroup[key] = (timeTracking.byGroup[key] || 0) + tabMs;
  }
  if (tabData?.subGroupId) {
    timeTracking.bySubGroup[tabData.subGroupId] = (timeTracking.bySubGroup[tabData.subGroupId] || 0) + tabMs;
  }
  if (tabData?.projectId) {
    timeTracking.byProject[tabData.projectId] = (timeTracking.byProject[tabData.projectId] || 0) + tabMs;
  }

  delete byTab[tabId];
  timeTracking.byTab = byTab;
  await setStorage({ timeTracking });
}

const contextSwitchTracker = (() => {
  const history = [];
  const WINDOW_MS = 5 * 60 * 1000;
  const THRESHOLD = 4;
  const COOLDOWN_MS = 10 * 60 * 1000;
  let lastNotified = 0;

  return {
    record(context) {
      const now = Date.now();
      history.push({ context, ts: now });
      while (history.length > 0 && now - history[0].ts > WINDOW_MS) history.shift();

      const distinct = new Set(history.map(h => h.context)).size;
      if (distinct < THRESHOLD || now - lastNotified <= COOLDOWN_MS) return;

      lastNotified = now;
      try {
        chrome.notifications.create(`context-drift-${now}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: 'Context Drift Detected',
          message: `You've switched between ${distinct} different contexts in the last 5 minutes. Click to set a focus.`,
          priority: 2
        });
      } catch (e) {
        console.warn('[Tabatha] Notification error:', e);
      }
      logEvent('context_drift', { distinctContexts: distinct, window: '5min' });
    }
  };
})();

async function handleTabActivated(activeInfo) {
  const tabs = await getTabData();
  const tabData = tabs[activeInfo.tabId];

  if (tabData) {
    tabData.lastActive = new Date().toISOString();
    await setTabData(tabs);
    await timeTracker.startTracking(activeInfo.tabId, tabData.url, tabData);

    let contextSignal = tabData.context;
    if (!contextSignal && tabData.url) {
      try {
        contextSignal = new URL(tabData.url).hostname.replace(/^www\./, '');
      } catch { /* ignore invalid URL */ }
    }
    contextSignal = contextSignal || tabData.category || 'unknown';
    contextSwitchTracker.record(contextSignal);
  }

  broadcastToExtension({ type: 'TAB_ACTIVATED', tabId: activeInfo.tabId });
  injectedDeps.tryAssociateTab?.(activeInfo.tabId);
}

async function setTabData(tabs) {
  if (injectedDeps.setTabData) return injectedDeps.setTabData(tabs);
  const result = await setStorage({ tabs });
  injectedDeps.triggerSync?.();
  return result;
}
