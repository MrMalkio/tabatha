// ════════════════════════════════════════════
// Tabatha — Tab Tracking Service (Plan 023 Task 03)
// Owns time-tracking storage views, intent action logging, and the per-tab
// time-bucket pruning that runs when a tab closes.
// ════════════════════════════════════════════

import { getStorage, setStorage, getTimeTracking, enforceArrayCap } from './storageService.js';
import { archiveBeforeCap } from './archiveService.js';

let injectedDeps = {};

export function configureTabTrackingService(deps = {}) {
  injectedDeps = { ...injectedDeps, ...deps };
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
  history.unshift({
    timestamp: new Date().toISOString(),
    tabId: entry.tabId ?? null,
    url: entry.url ?? null,
    domain: entry.domain ?? null,
    action: entry.action ?? null,
    oldIntent: entry.oldIntent ?? null,
    newIntent: entry.newIntent ?? null,
    oldContext: entry.oldContext ?? null,
    newContext: entry.newContext ?? null,
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

async function logIntentAction(message) {
  await appendIntentHistory({
    tabId: message.tabId ?? null,
    url: message.url,
    domain: message.domain,
    action: message.action,
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
