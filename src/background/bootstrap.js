// ════════════════════════════════════════════
// Tabatha — Bootstrap
// Owns extension lifecycle: install/startup state init, legacy task
// migration, retention cleanup, and the daily retention alarm. Extracted
// from background.js so background.js only orchestrates the message router.
// ════════════════════════════════════════════

import {
  getStorage,
  setStorage,
  getTabData,
  getCategories,
  getSettings
} from './services/storageService.js';
import { detectCategory } from './helpers.js';
import {
  DEFAULT_SETTINGS,
  BUILT_IN_CATEGORIES,
  RETENTION_ALARM,
  DEFAULT_RETENTION_DAYS
} from './constants.js';
import { saveSessionSnapshot } from './services/sessionService.js';

export const SESSION_SNAPSHOT_ALARM = 'session-snapshot';

// ── INTENT HISTORY MIGRATION — intentChangeLog → intentHistory (one-time) ──
// Plan 023 §2 resolution: merge the two near-redundant logs into a single
// intentHistory key with the union shape. Runs once per profile; once the
// flag is set, we stop touching the legacy key.
export async function migrateIntentChangeLog() {
  try {
    const { _intentLogMigrated } = await getStorage('_intentLogMigrated');
    if (_intentLogMigrated) return;

    const { intentChangeLog = [], intentHistory = [] } =
      await getStorage(['intentChangeLog', 'intentHistory']);

    if (!intentChangeLog.length) {
      await setStorage({ _intentLogMigrated: new Date().toISOString() });
      return;
    }

    const projected = intentChangeLog.map((c) => ({
      timestamp: c.timestamp,
      tabId: c.tabId ?? null,
      url: c.url ?? null,
      domain: c.domain ?? null,
      action: 'change',
      oldIntent: c.oldIntent ?? null,
      newIntent: c.newIntent ?? null,
      oldContext: c.oldContext ?? null,
      newContext: c.newContext ?? null,
      focusId: null
    }));

    const merged = [...intentHistory, ...projected]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, DEFAULT_SETTINGS.storage.intentHistoryCap);

    await setStorage({ intentHistory: merged, _intentLogMigrated: new Date().toISOString() });
    await chrome.storage.local.remove('intentChangeLog');
    console.log(`Tabatha: Merged ${intentChangeLog.length} intentChangeLog entries into intentHistory`);
  } catch (e) {
    console.error('Tabatha: intentChangeLog migration failed', e);
  }
}

// ── TASK STORAGE MIGRATION — Legacy → Org Registry (one-time) ──
export async function migrateTasksToOrg() {
  try {
    const { _tasksMigrated } = await getStorage('_tasksMigrated');
    if (_tasksMigrated) return;

    const { tasks: legacyTasks, tabathaOrg } = await getStorage(['tasks', 'tabathaOrg']);
    if (!legacyTasks || legacyTasks.length === 0) {
      await setStorage({ _tasksMigrated: new Date().toISOString() });
      return;
    }

    const org = tabathaOrg || { clients: {}, projects: {}, tasks: {}, operations: {}, initiatives: {} };
    const orgTasks = org.tasks || {};
    let migratedCount = 0;

    for (const task of legacyTasks) {
      if (!task.id) continue;
      if (orgTasks[task.id]) continue;

      const status = task.status || 'active';

      orgTasks[task.id] = {
        id: task.id,
        name: task.name || 'Unnamed Task',
        description: task.description || '',
        projectId: task.projectId || null,
        clientId: task.clientId || null,
        status,
        funnelStage: status === 'completed' ? 'resolved' : 'unsorted',
        createdAt: task.createdAt || new Date().toISOString(),
        completedAt: task.completedAt || null,
        archived: task.status === 'archived' || false,
        linkedIntents: task.linkedIntents || []
      };
      migratedCount++;
    }

    org.tasks = orgTasks;
    await setStorage({
      tabathaOrg: org,
      _legacyTasksBackup: legacyTasks,
      tasks: [],
      _tasksMigrated: new Date().toISOString()
    });

    console.log(`Tabatha: Migrated ${migratedCount} legacy tasks to org registry`);
  } catch (e) {
    console.error('Tabatha: Task migration failed', e);
  }
}

// Additive migration: ensure `settings.storage` exists with defaults. Safe
// to run on every init — only writes when missing fields are detected.
async function ensureStorageSettings() {
  const { settings } = await getStorage('settings');
  if (settings && settings.storage && typeof settings.storage === 'object') {
    // Backfill any newly-added keys in DEFAULT_SETTINGS.storage without
    // overwriting user-tuned values.
    const merged = { ...DEFAULT_SETTINGS.storage, ...settings.storage };
    const needsWrite = Object.keys(merged).some(k => settings.storage[k] === undefined);
    if (needsWrite) {
      await setStorage({ settings: { ...settings, storage: merged } });
    }
    return;
  }
  const base = settings || { ...DEFAULT_SETTINGS };
  await setStorage({ settings: { ...DEFAULT_SETTINGS, ...base, storage: { ...DEFAULT_SETTINGS.storage } } });
}

export async function initializeState() {
  // Settings migration first (so downstream reads see the storage block).
  await ensureStorageSettings();

  // One-time intent log merge (Plan 023 §2).
  await migrateIntentChangeLog();

  // One-time legacy task migration.
  await migrateTasksToOrg();

  // Sync existing Chrome tabs into storage.
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

  // Clean up tabs that no longer exist.
  const existingTabIds = new Set(existingTabs.map(t => t.id));
  for (const tabId of Object.keys(tabs)) {
    if (!existingTabIds.has(parseInt(tabId))) {
      delete tabs[tabId];
    }
  }

  await setStorage({ tabs });
  console.log('Tabatha: State initialized', Object.keys(tabs).length, 'tabs');
}

// ── DATA RETENTION — Desktop/Companion Activity Pruning ──
export async function runRetentionCleanup() {
  try {
    const settings = await getSettings();
    const retentionDays = settings.desktopRetentionDays || DEFAULT_RETENTION_DAYS;
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // Prune companionRecentSessions
    const { companionRecentSessions = [] } = await getStorage('companionRecentSessions');
    if (companionRecentSessions.length > 0) {
      const kept = companionRecentSessions.filter(s => {
        const ts = new Date(s.started_at || s.startedAt || s.start || s.timestamp || 0).getTime();
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

// ── Session snapshot alarm ──
// The period is user-tunable via settings.storage.snapshotIntervalMinutes.
// settingsService re-invokes this on UPDATE_SETTINGS when the value changes.
export async function scheduleSessionSnapshotAlarm() {
  try {
    const settings = await getSettings();
    const minutes = Number(settings?.storage?.snapshotIntervalMinutes)
      || DEFAULT_SETTINGS.storage.snapshotIntervalMinutes;
    chrome.alarms.create(SESSION_SNAPSHOT_ALARM, { periodInMinutes: minutes });
  } catch (e) {
    console.warn('Tabatha: snapshot alarm registration failed; using default cadence', e);
    chrome.alarms.create(SESSION_SNAPSHOT_ALARM, {
      periodInMinutes: DEFAULT_SETTINGS.storage.snapshotIntervalMinutes
    });
  }
}

// ── Lifecycle registration ──
// Called once from background.js at module load.
export function registerBootstrap() {
  chrome.runtime.onInstalled.addListener(async (details) => {
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
    await scheduleSessionSnapshotAlarm();
  });

  chrome.runtime.onStartup.addListener(async () => {
    await initializeState();
    await scheduleSessionSnapshotAlarm();
  });

  // Daily retention alarm + snapshot dispatcher.
  chrome.alarms.create(RETENTION_ALARM, { periodInMinutes: 1440 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RETENTION_ALARM) runRetentionCleanup();
    if (alarm.name === SESSION_SNAPSHOT_ALARM) saveSessionSnapshot();
  });

  // Run once immediately to cover dev reloads / first-load.
  initializeState();
  runRetentionCleanup();
  scheduleSessionSnapshotAlarm();
}
