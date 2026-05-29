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

async function setTabData(tabs) {
  const result = await setStorage({ tabs });
  triggerSync();
  return result;
}

configureSyncService({ supabase });
configureAwarenessService({ supabase });
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
  logEvent: tabTrackingService.logEvent
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
  awarenessService
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
registerSyncServiceAlarms();
registerSyncStorageListener();
registerAlarmServiceListener();
registerBootstrap();

// Phase C: start cross-profile awareness once the SW is ready. The service
// itself bails gracefully if auth or browser_profiles isn't ready yet, and
// can be re-armed by sending `AWARENESS_START` (the Settings UI does this
// after sign-in and after the first sync registers this install).
startAwareness();

// Phase D₂: proxy-register the desktop companion as a browser_profiles row
// + heartbeat its status. Bails gracefully if the companion isn't running
// or the user isn't signed in.
startCompanionInstallService();
