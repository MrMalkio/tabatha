// Tabatha - Service Worker
// Thin orchestration layer: configure services, register listeners, and
// dispatch runtime messages through the service chain.

import { supabase } from '../services/supabaseClient';
import {
  setStorage,
  getTabData
} from './services/storageService.js';
import * as notificationService from './services/notificationService.js';
import {
  configureNotificationService,
  registerNotificationListeners
} from './services/notificationService.js';
import * as settingsService from './services/settingsService.js';
import * as tabTrackingService from './services/tabTrackingService.js';
import {
  configureTabTrackingService,
  registerTabTrackingListeners
} from './services/tabTrackingService.js';
import * as categoryService from './services/categoryService.js';
import * as sessionService from './services/sessionService.js';
import * as taskService from './services/taskService.js';
import * as tabService from './services/tabService.js';
import {
  configureTabService,
  registerTabServiceListeners,
  registerUrlLockNavigationListener
} from './services/tabService.js';
import * as focusService from './services/focusService.js';
import {
  configureFocusService,
  registerFocusServiceAlarms
} from './services/focusService.js';
import * as clockService from './services/clockService.js';
import {
  configureClockService,
  registerClockServiceListeners
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
import * as calendarService from './services/calendarService.js';
import * as alarmService from './services/alarmService.js';
import {
  configureAlarmService,
  registerAlarmServiceListener
} from './services/alarmService.js';
import * as syncService from './services/syncService.js';
import {
  configureSyncService,
  getAuthSession,
  registerSyncStorageListener,
  registerSyncServiceAlarms,
  syncToSupabase,
  triggerSync
} from './services/syncService.js';
import * as autoFocusService from './services/autoFocusService.js';
import {
  configureAutoFocusService,
  registerAutoFocusListeners,
  evaluateTab as evaluateAutoFocus
} from './services/autoFocusService.js';
import * as domainHistoryService from './services/domainHistoryService.js';
import { recordDomainVisit } from './services/domainHistoryService.js';
import * as feedbackService from './services/feedbackService.js'; // B2: in-app feedback → Asana
import * as awarenessService from './services/awarenessService.js';
import {
  configureAwarenessService,
  startAwareness,
  notifyStateChange as notifyAwarenessStateChange,
  setLocalIdleState as setAwarenessIdleState
} from './services/awarenessService.js';
import {
  configureCompanionInstallService,
  startCompanionInstallService
} from './services/companionInstallService.js';
import { fireWebhook } from './webhooks.js';
import { registerBootstrap, runRetentionCleanup } from './bootstrap.js';
import { registerToolbarActionListeners } from './services/toolbarActionService.js';

async function setTabData(tabs) {
  const result = await setStorage({ tabs });
  triggerSync();
  return result;
}

configureSyncService({ supabase });
configureAwarenessService({
  supabase,
  // Lets a remote install command this one to clock itself out via the full
  // local path (history archive + companion + webhook + sync).
  requestClockOut: () => clockService.handleMessage('CLOCK_OUT', {}, null)
});
configureCompanionInstallService({ supabase, companionBridge });

configureNotificationService({
  getTabData,
  setTabData,
  getFocusEngine: focusService.getFocusEngine,
  extendFocusTimer: focusService.extendFocusTimer,
  completeFocus: focusService.completeFocus
});

configureTabTrackingService({
  setTabData,
  triggerSync,
  tryAssociateTab: tabService.tryAssociateTab
});

configureTabService({
  getFocusEngine: focusService.getFocusEngine,
  setFocusEngine: focusService.setFocusEngine,
  autoQueueFromIntent: focusService.autoQueueFromIntent,
  linkTabToFocus: focusService.linkTabToFocus,
  setTabData,
  logEvent: tabTrackingService.logEvent,
  evaluateAutoFocus,
  recordDomainVisit
});

configureClockService({
  companionBridge,
  fireWebhook,
  getFocusEngine: focusService.getFocusEngine,
  setFocusEngine: focusService.setFocusEngine,
  getTabData,
  triggerSync,
  notifyAwarenessStateChange,
  setAwarenessIdleState
});

configureFocusService({
  companionBridge,
  triggerSync,
  getTabData,
  setTabData,
  clockService,
  fireWebhook,
  endBreakIfActive: clockService.endBreakIfActive,
  notifyAwarenessStateChange
});

configureAutoFocusService({
  getFocusEngine: focusService.getFocusEngine,
  getTabData,
  startFocus: focusService.startFocus,
  markFocusDrifted: focusService.markFocusDrifted,
  pauseActiveFocus: focusService.pauseActiveFocus,
  linkTabToFocus: focusService.linkTabToFocus,
  companionBridge,
  fireWebhook
});

configureGroupService({ setTabData });
configureBlockgateService({ setTabData });
configureAlarmService({
  syncToSupabase,
  runRetentionCleanup,
  getAuthSession
});

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
  calendarService,
  alarmService,
  syncService,
  awarenessService,
  autoFocusService,
  domainHistoryService,
  feedbackService
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      for (const service of services) {
        const result = await service.handleMessage?.(message?.type, message, sender);
        if (result !== undefined) {
          sendResponse(result);
          return;
        }
      }
      sendResponse({ error: `Unknown message type: ${message?.type}` });
    } catch (err) {
      console.error('[Tabatha] handleMessage Error:', err);
      sendResponse({ error: err.message || 'Unknown error' });
    }
  })();
  return true;
});

registerNotificationListeners();
registerTabServiceListeners();
registerTabTrackingListeners();
registerUrlLockNavigationListener();
registerClockServiceListeners();

// Plan 036 (#187): OS-unlock auto clock-in. The desktop companion emits an
// idle→active transition when the workstation is unlocked; honour it only when
// the user picked the 'os_unlock' trigger (clockService gates on settings).
companionBridge.on('idleState', (payload) => {
  if (payload && payload.isIdle === false) {
    clockService.maybeAutoClockIn('os_unlock');
  }
});
registerGroupServiceListeners();
registerFocusServiceAlarms();
registerAutoFocusListeners();
registerSyncServiceAlarms();
registerSyncStorageListener();
registerAlarmServiceListener();
registerBootstrap();

// FIX-12: persistently configure the toolbar-icon click behavior (side panel
// vs. tab-list popup) + the tab-list hotkey. Applies on startup + on any
// settings change.
registerToolbarActionListeners();

// Plan 038: backfill domain history from tabs that were already open when the
// extension loaded (recordDomainVisit only fires on new navigations, not
// pre-existing tabs, so the Domains tab would show nothing on first use).
(async () => {
  try {
    const { tabs: stored } = await chrome.storage.local.get('tabs');
    if (stored && typeof stored === 'object') {
      for (const t of Object.values(stored)) {
        if (t?.url) await recordDomainVisit(t.url, t.intent || null);
      }
    }
  } catch { /* best-effort */ }
})();

// Phase C: start cross-profile awareness once the SW is ready. The service
// itself bails gracefully if auth or browser_profiles isn't ready yet, and
// can be re-armed by sending `AWARENESS_START` (the Settings UI does this
// after sign-in and after the first sync registers this install).
startAwareness();

// Phase D₂: proxy-register the desktop companion as a browser_profiles row
// + heartbeat its status. Bails gracefully if the companion isn't running
// or the user isn't signed in.
startCompanionInstallService();
