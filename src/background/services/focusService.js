// Tabatha - Focus Service (Plan 023 Task 04b)
// Owns focus lifecycle, focus funnel transitions, and intent/focus linking.

import { DEFAULT_FOCUS_ENGINE, DEFAULT_SETTINGS, STAGE_ORDER, PROGRESS_VALUES } from '../constants.js';
import { fireWebhook as defaultFireWebhook } from '../webhooks.js';
import { getStorage, setStorage, getSettings } from './storageService.js';
import { archiveBeforeCap } from './archiveService.js';
import { broadcastAll, broadcastToExtension } from './notificationService.js';
import { logAudit } from './activityAuditService.js';
import { validateStartTime } from '../../utils/focusTimeValidation.js';
import { sanitizeFocusEngine } from '../../utils/focusDataSanitize.js';
import { logger } from '../../services/logger.js';

let injectedDeps = {};
let focusAlarmsRegistered = false;

export function configureFocusService(deps = {}) {
  injectedDeps = { ...injectedDeps, ...deps };
}

export function registerFocusServiceAlarms() {
  if (focusAlarmsRegistered) return;
  focusAlarmsRegistered = true;
  chrome.alarms.create('unfocused-nudge', { periodInMinutes: 10 });
}

export async function handleMessage(type, message) {
  const result = await _handleMessage(type, message);
  // Plan 031: fire-and-forget audit emission for focus lifecycle actions
  if (result !== undefined) emitAudit(type, message);
  return result;
}

async function _handleMessage(type, message) {
  switch (type) {
    case 'GET_FOCUS_ENGINE':
      return { focusEngine: await getFocusEngine() };

    case 'START_FOCUS': {
      const result = await startFocus(message.label, message.timerMinutes, message.tags);
      const companionBridge = injectedDeps.companionBridge;
      if (companionBridge?.isConnected && result.activeId) {
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

    case 'LET_ME_COOK':
      return { focusEngine: await letMeCook(message.focusId) };

    case 'BACKBURNER_FOCUS': {
      const engine = await backburnerFocus(
        message.focusId,
        message.durationMinutes,
        message.reason,
        message.switchToFocusId,
        message.createNewFocusLabel
      );
      return { focusEngine: engine };
    }

    case 'DISMISS_BACKBURNER': {
      const engine = await getFocusEngine();
      const item = engine.items[message.focusId];
      if (item) {
        item.backburnered = false;
        item.backburnerExpired = false;
        chrome.alarms.clear(`backburner-timer-${message.focusId}`);
        await setFocusEngine(engine);
        // Matches the Sidecar's resumeBackburner: un-hides the item from the
        // Backburner group without activating it (still lands back in the
        // regular paused queue).
        logFocusEvent(message.focusId, 'unbackburner', {});
        broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
      }
      return { focusEngine: engine };
    }

    case 'SNOOZE_BACKBURNER': {
      const engine = await getFocusEngine();
      const item = engine.items[message.focusId];
      if (item) {
        item.backburnerExpired = false;
        item.backburnerDurationMinutes = 10;
        chrome.alarms.clear(`backburner-timer-${message.focusId}`);
        chrome.alarms.create(`backburner-timer-${message.focusId}`, { delayInMinutes: 10 });
        await setFocusEngine(engine);
        logFocusEvent(message.focusId, 'snooze', { mins: 10, until: new Date(Date.now() + 10 * 60000).toISOString() });
        broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
      }
      return { focusEngine: engine };
    }

    case 'SET_FUNNEL_STAGE':
      return setFunnelStage(message.focusId, message.stage, message.confirmed);

    case 'RESUME_BACKBURNER': {
      const engine = await getFocusEngine();
      const item = engine.items[message.focusId];
      if (!item || !item.backburnered) return { focusEngine: engine };

      // Cascade: pause the currently active focus (if any)
      if (engine.activeFocusId && engine.items[engine.activeFocusId]) {
        const currentActive = engine.items[engine.activeFocusId];
        if (currentActive.focusState === 'active') {
          pauseItem(currentActive, 'backburner-resume-cascade', engine);
        }
      }

      // Clear backburner state and activate the returning focus
      item.backburnered = false;
      item.backburnerExpired = false;
      item.backburnerReason = null;
      item.backburnerDurationMinutes = null;
      item.backburneredAt = null;
      item.focusState = 'active';
      item.lastResumedAt = new Date().toISOString();
      chrome.alarms.clear(`backburner-timer-${message.focusId}`);

      // Restore focus timer if it had remaining time
      if (item.timerEndAt) {
        const remainingMs = new Date(item.timerEndAt).getTime() - Date.now();
        if (remainingMs > 0) {
          chrome.alarms.create(`focus-timer-${message.focusId}`, { delayInMinutes: remainingMs / 60000 });
        }
      }

      engine.activeFocusId = message.focusId;
      await setFocusEngine(engine);
      // Unlike the Sidecar's resumeBackburner (which only un-hides, see
      // DISMISS_BACKBURNER above), the extension's RESUME_BACKBURNER also
      // activates the item — semantically closer to switchFocus's
      // was-backburnered case, so it emits both kinds.
      logFocusEvent(message.focusId, 'start');
      logFocusEvent(message.focusId, 'unbackburner', {});
      broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
      return { focusEngine: engine };
    }

    case 'UPDATE_FOCUS_TAGS':
      return { focusEngine: await updateFocusTags(message.focusId, message.tags) };

    case 'RENAME_FOCUS':
      return renameFocus(message.focusId, message.newLabel);

    case 'UPDATE_FOCUS':
      return updateFocus(message);

    case 'PAUSE_FOCUS':
      return pauseFocus(message.focusId);

    case 'RESUME_FOCUS':
      return resumeFocus(message.focusId);

    // Plan 036: user's response to the Smart Idle Engine prompt.
    case 'IDLE_PROMPT_RESPONSE':
      return idlePromptResponse(message);

    // Plan 037: Focus time editing.
    case 'ADJUST_FOCUS_TIME':
      return adjustFocusTime(message.focusId, message.adjustmentMs, message.reason);
    case 'SET_FOCUS_ELAPSED':
      return setFocusElapsed(message.focusId, message.elapsedMs);
    case 'REMOVE_LAST_PAUSE':
      return removeLastPause(message.focusId);
    // NB-09: last user-activity timestamp for the "trim to last activity" UI.
    case 'GET_LAST_ACTIVITY':
      return getLastActivity();
    // Workstream B1: backdate a focus's start time.
    case 'SET_FOCUS_START_TIME':
      return setFocusStartTime(message.focusId, message.startedAt, message.reason);

    // Plan 037 Phase 2: per-entry checkpoint editing.
    case 'EDIT_CHECKPOINT':
      return editCheckpoint(message);
    case 'DELETE_CHECKPOINT':
      return deleteCheckpoint(message.focusId, message.checkpointId);

    // ── Plan 025: Checkpoint Progress Notes ──
    case 'SAVE_CHECKPOINT_NOTE':
      return saveCheckpointNote(message);

    case 'SNOOZE_CHECKPOINT':
      return snoozeCheckpoint(message.focusId, message.snoozeMinutes);

    case 'GET_CHECKPOINT_STATUS':
      return getCheckpointStatus(message.focusId);

    case 'DISMISS_POPUP':
      return dismissActivePopup(message.popupId);

    case 'LINK_INTENT_TO_TASK':
      return linkIntentToTask(message);

    case 'MERGE_INTENTS':
      return mergeIntents(message.sourceIntentId, message.targetIntentId);

    default:
      return undefined;
  }
}

// Plan 031: Audit-logged actions set — fire-and-forget after handler returns
const AUDITABLE_ACTIONS = new Set([
  'START_FOCUS', 'COMPLETE_FOCUS', 'SWITCH_FOCUS', 'PAUSE_FOCUS', 'RESUME_FOCUS',
  'EXTEND_FOCUS_TIMER', 'LET_ME_COOK', 'BACKBURNER_FOCUS', 'SNOOZE_BACKBURNER',
  'DISMISS_BACKBURNER', 'RESUME_BACKBURNER', 'SAVE_CHECKPOINT_NOTE',
  'IDLE_PROMPT_RESPONSE',
  'ADJUST_FOCUS_TIME', 'SET_FOCUS_ELAPSED', 'REMOVE_LAST_PAUSE',
  'SET_FOCUS_START_TIME'
]);

async function emitAudit(type, message) {
  if (!AUDITABLE_ACTIONS.has(type)) return;
  let tabUrl = null, tabTitle = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) { tabUrl = tab.url; tabTitle = tab.title; }
  } catch { /* content scripts may not have tab access */ }
  logAudit(type, {
    focusId: message.focusId || null,
    focusLabel: message.label || null,
    activeTabUrl: tabUrl,
    activeTabTitle: tabTitle,
    metadata: { timerMinutes: message.timerMinutes, extraMinutes: message.extraMinutes, reason: message.reason },
  });
}

// ── Cross-surface focus_events emission (Sidecar round-trip parity) ──
// Best-effort local append; syncService batches these to `tabatha.focus_events`
// on the existing sync cadence (mirrors the intent_history push block) so a
// write failure here can never block the lifecycle action it rides alongside.
// Kinds/meta shapes mirror the Sidecar's `insertFocusEvent`
// (sidecar/src/data/events.ts) exactly so the Context View timeline reads
// extension- and Sidecar-authored events identically.
const MAX_FOCUS_EVENT_LOG = 500;

async function logFocusEvent(focusClientId, kind, meta = {}) {
  if (!focusClientId) return;
  try {
    const { _focusEventLog } = await getStorage('_focusEventLog');
    const log = Array.isArray(_focusEventLog) ? _focusEventLog : [];
    log.push({ focusClientId, kind, at: new Date().toISOString(), meta });
    await setStorage({ _focusEventLog: log.slice(-MAX_FOCUS_EVENT_LOG) });
  } catch {
    /* best effort — the cross-surface timeline degrades gracefully without this row */
  }
}

// ── Auto-generated system checkpoint for lifecycle transitions ──
function autoCheckpoint(item, event) {
  if (!item) return;
  if (!item.checkpoint) item.checkpoint = [];
  let elapsedAtMs = item.elapsedMs || 0;
  if (item.lastResumedAt) elapsedAtMs += Date.now() - new Date(item.lastResumedAt).getTime();
  item.checkpoint.push({
    id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    text: event,
    progressLevel: 'none',
    progressValue: 0,
    createdAt: new Date().toISOString(),
    focusId: item.id,
    elapsedAtMs,
    triggeredBy: 'system'
  });
}

export async function getFocusEngine() {
  const { focusEngine } = await getStorage('focusEngine');
  const engine = focusEngine ? { ...focusEngine } : { ...DEFAULT_FOCUS_ENGINE };
  if (!engine.items) engine.items = {};
  if (!engine.history) engine.history = [];

  // 2026-07-23 self-heal (InPop "[object Object]" fix): a legacy/historical
  // write left some installs with object-valued label/funnelStage on one or
  // more items. No current writer produces this, but nothing sanitizes an
  // already-corrupted value either, so it survives every reconcile/rehydrate
  // pass indefinitely (reconcileKnownFocusRow returns non-Sidecar-sourced
  // items untouched; dataRehydrate's newest-wins merge only overwrites when
  // the cloud ref time is >=). Sanitize on every read and persist the repair
  // immediately so the very next read (including the gatekeeper's own
  // GET_FOCUS_ENGINE round trip) is clean — no reinstall, no data loss.
  const { engine: healedEngine, healed, healedIds } = sanitizeFocusEngine(engine);
  if (healed) {
    logger.warn('DATA_SANITIZE', 'Healed corrupted focus-engine item(s) (object-valued label/funnelStage/context/tags)', { healedIds });
    await setStorage({ focusEngine: healedEngine });
    return healedEngine;
  }
  return engine;
}

export async function setFocusEngine(engine) {
  const result = await setStorage({ focusEngine: engine });
  injectedDeps.triggerSync?.();
  return result;
}

function generateFocusId() {
  return `f_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

async function applyDefaultRealm(tags = {}) {
  if (tags.realm) return tags;
  try {
    // Phase A: prefer the per-install classification on _browserProfile so
    // focuses created on the Personal browser default to realm=personal,
    // independent of the user-level default_realm.
    const { _browserProfile, tabathaSettings } = await getStorage(['_browserProfile', 'tabathaSettings']);
    const fromInstall = _browserProfile?.classification;
    if (fromInstall) return { ...tags, realm: fromInstall };
    if (tabathaSettings?.defaultRealm) return { ...tags, realm: tabathaSettings.defaultRealm };
  } catch { /* ignore */ }
  return tags;
}

function addElapsedSinceResume(item, engine) {
  if (item?.lastResumedAt) {
    const delta = Date.now() - new Date(item.lastResumedAt).getTime();
    item.elapsedMs = (item.elapsedMs || 0) + delta;
    item.lastResumedAt = null;

    // Plan 031: Sub-intent parent tick — propagate elapsed to parent focus
    if (item.parentFocusId && engine?.items?.[item.parentFocusId]) {
      const parent = engine.items[item.parentFocusId];
      if (parent.focusState !== 'completed') {
        parent.elapsedMs = (parent.elapsedMs || 0) + delta;
      }
    }
  }
}

// Exported (feat/ext-live-ingest): reused by focusIngestService.js so a
// remote-driven "another surface is now current" adoption pauses the local
// item through the exact same path a manual pause takes — elapsed accounting,
// autoCheckpoint, and the 'pause' focus_event all fire identically.
export function pauseItem(item, reason, engine) {
  addElapsedSinceResume(item, engine);
  item.focusState = 'paused';
  item.pausedAt = new Date().toISOString();
  if (reason) item.pausedReason = reason;
  if (item.funnelStage === 'addressing') item.funnelStage = 'focus';
  autoCheckpoint(item, reason ? `Paused (${reason})` : 'Paused');
  if (item.id) logFocusEvent(item.id, 'pause');
}

// Ingest-driven adoption (feat/ext-live-ingest): this item is now the
// account-wide current focus because a REMOTE active row (any source) has a
// newer tags._startedAt than whatever was locally current. Mirrors
// switchFocus's activation bookkeeping (backburner clear, funnel stage,
// timer re-arm) but with two deliberate differences:
//   1. lastResumedAt is seeded from the REMOTE's own start time, not "now" —
//      elapsedMs folds to 0 (mirrors the Sidecar's back-dated _startedAt
//      model: live elapsed = now - lastResumedAt). This keeps the item's own
//      next push byte-identical to what was just ingested (no new
//      timestamp → no ping-pong; see focusIngestService.js).
//   2. It never calls logFocusEvent(id, 'start') — the originating surface
//      already logged that event; emitting a second one would duplicate the
//      cross-surface timeline.
export function adoptRemoteActive(item, engine, remoteStartedAtIso) {
  const wasBackburnered = !!item.backburnered;
  if (wasBackburnered) {
    item.backburnered = false;
    item.backburnerExpired = false;
    item.backburnerReason = null;
    item.backburnerDurationMinutes = null;
    item.backburneredAt = null;
    chrome.alarms.clear(`backburner-timer-${item.id}`);
  }

  const startIso = remoteStartedAtIso || new Date().toISOString();
  item.focusState = 'active';
  item.funnelStage = (item.funnelStage === 'todo' || item.funnelStage === 'unsorted') ? 'focus' : item.funnelStage;
  item.lastResumedAt = startIso;
  item.elapsedMs = 0;
  item.pausedAt = null;
  if (!item.startedAt) item.startedAt = startIso;
  engine.activeFocusId = item.id;

  chrome.alarms.clear(`focus-timer-${item.id}`);
  const totalTimerMs = (item.timerMinutes || 0) * 60 * 1000;
  const elapsedNow = Math.max(0, Date.now() - new Date(startIso).getTime());
  const remaining = totalTimerMs - elapsedNow;
  if (remaining > 0) {
    chrome.alarms.create(`focus-timer-${item.id}`, { delayInMinutes: remaining / 60000 });
  }

  return { wasBackburnered };
}

async function persistFocusHistoryCap(engine) {
  const settings = await getSettings();
  const cap = settings?.storage?.focusHistoryCap ?? DEFAULT_SETTINGS.storage.focusHistoryCap;
  if (!Number.isFinite(cap) || cap <= 0 || engine.history.length <= cap) return;

  const dropped = engine.history.slice(cap);
  engine.history = engine.history.slice(0, cap);
  await archiveBeforeCap('focusEngine.history', dropped, 'localArchive');
}

function fireWebhook(type, data) {
  const fn = injectedDeps.fireWebhook || defaultFireWebhook;
  return fn(type, data);
}

export async function startFocus(label, timerMinutes = 15, tags = {}) {
  const engine = await getFocusEngine();
  const id = generateFocusId();
  const resolvedTags = await applyDefaultRealm(tags);

  if (engine.activeFocusId && engine.items[engine.activeFocusId]) {
    const current = engine.items[engine.activeFocusId];
    if (current.focusState === 'active' || current.focusState === 'drifted') {
      pauseItem(current, undefined, engine);
      chrome.alarms.clear(`focus-timer-${engine.activeFocusId}`);
    }
  }

  const associatedTabIds = [];
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) associatedTabIds.push(activeTab.id);
  } catch { /* no active tab */ }

  engine.items[id] = {
    id,
    label,
    focusState: 'active',
    funnelStage: 'addressing',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    lastResumedAt: new Date().toISOString(),
    endedAt: null,
    pausedAt: null,
    timerMinutes,
    elapsedMs: 0,
    overMs: 0,
    associatedTabIds,
    tags: { realm: '', client: '', project: '', task: '', ...resolvedTags },
    parentFocusId: engine.activeFocusId || null,
    contextSwitchCount: 0,
    priority: 5,
    offDevice: false,
    // Plan 025: Checkpoint Progress Notes
    checkpoint: [],
    lastCheckpointAt: null,
    checkpointSnoozedUntil: null
  };
  autoCheckpoint(engine.items[id], 'Focus started');

  engine.activeFocusId = id;
  await setFocusEngine(engine);
  logFocusEvent(id, 'start', { label });

  if (timerMinutes > 0) {
    chrome.alarms.create(`focus-timer-${id}`, { delayInMinutes: timerMinutes });
  }

  // Plan 025: Create checkpoint prompt alarm
  const settings = await getSettings();
  const fraction = settings?.checkpointIntervalFraction ?? DEFAULT_SETTINGS.checkpointIntervalFraction;
  const intervalMin = timerMinutes * fraction;
  if (intervalMin >= 1 && settings?.checkpointNotesEnabled !== false) {
    chrome.alarms.create(`checkpoint-prompt-${id}`, { delayInMinutes: intervalMin, periodInMinutes: intervalMin });
  }

  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  fireWebhook('focus_started', { id, label, timerMinutes, tags: resolvedTags });
  return engine;
}

export async function addFocus(label, timerMinutes = 15, tags = {}) {
  const engine = await getFocusEngine();
  const id = generateFocusId();
  const resolvedTags = await applyDefaultRealm(tags);

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
    tags: { realm: '', client: '', project: '', task: '', ...resolvedTags },
    parentFocusId: engine.activeFocusId || null,
    contextSwitchCount: 0,
    offDevice: false,
    priority: 5,
    checkpoint: [],
    lastCheckpointAt: null,
    checkpointSnoozedUntil: null
  };

  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { engine, newFocusId: id };
}

export async function switchFocus(focusId) {
  const engine = await getFocusEngine();
  if (!engine.items[focusId]) return engine;

  if (engine.activeFocusId && engine.items[engine.activeFocusId]) {
    const current = engine.items[engine.activeFocusId];
    if (current.focusState === 'active' || current.focusState === 'drifted') {
      pauseItem(current, undefined, engine);
      chrome.alarms.clear(`focus-timer-${engine.activeFocusId}`);
      chrome.alarms.clear(`checkpoint-prompt-${engine.activeFocusId}`);
    }
  }

  const target = engine.items[focusId];
  // Round-trip parity gap fix: switching directly into a backburnered item
  // must clear its backburner state (mirrors the Sidecar's switchTo, which
  // clears tags._backburner on activation) — previously this left `item.
  // backburnered` stuck true after a direct switch, so it kept rendering as
  // backburnered even while active.
  const wasBackburnered = !!target.backburnered;
  if (wasBackburnered) {
    target.backburnered = false;
    target.backburnerExpired = false;
    target.backburnerReason = null;
    target.backburnerDurationMinutes = null;
    target.backburneredAt = null;
    chrome.alarms.clear(`backburner-timer-${focusId}`);
  }
  target.focusState = 'active';
  target.funnelStage = target.funnelStage === 'todo' || target.funnelStage === 'unsorted' ? 'focus' : target.funnelStage;
  target.lastResumedAt = new Date().toISOString();
  if (!target.startedAt) target.startedAt = new Date().toISOString();
  target.pausedAt = null;
  target.contextSwitchCount = (target.contextSwitchCount || 0) + 1;

  engine.activeFocusId = focusId;
  await setFocusEngine(engine);
  logFocusEvent(focusId, 'start');
  if (wasBackburnered) logFocusEvent(focusId, 'unbackburner', {});

  const totalTimerMs = target.timerMinutes * 60 * 1000;
  const remaining = totalTimerMs - (target.elapsedMs || 0);
  if (remaining > 0) {
    chrome.alarms.create(`focus-timer-${focusId}`, { delayInMinutes: remaining / 60000 });
  }

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id && !target.associatedTabIds.includes(activeTab.id)) {
      target.associatedTabIds.push(activeTab.id);
      await setFocusEngine(engine);
    }
  } catch { /* no active tab */ }

  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

export async function completeFocus(focusId) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  if (!id || !engine.items[id]) return engine;

  const item = engine.items[id];
  if (item.focusState === 'active' || item.focusState === 'drifted') {
    addElapsedSinceResume(item, engine);
  }
  autoCheckpoint(item, 'Completed / Resolved');
  logFocusEvent(id, 'resolve');
  item.focusState = 'completed';
  item.funnelStage = 'resolved';
  item.endedAt = new Date().toISOString();

  chrome.alarms.clear(`focus-timer-${id}`);
  chrome.alarms.clear(`checkpoint-prompt-${id}`);
  await clearActivePopupForFocus(id);

  engine.history.unshift({ ...item });
  delete engine.items[id];
  await persistFocusHistoryCap(engine);

  if (engine.activeFocusId === id) {
    engine.activeFocusId = null;
    // Resolving is the only path that empties the slot (pauseItem keeps the
    // intent as activeFocusId), so this toggle is what makes "nothing active"
    // reachable at all. When off, the queue stays paused — nothing pops into
    // the freed slot.
    const settings = await getSettings();
    const autoStartNext = settings?.autoStartNextOnResolve ?? DEFAULT_SETTINGS.autoStartNextOnResolve;
    const nextPaused = !autoStartNext ? null : Object.values(engine.items)
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

export async function extendFocusTimer(focusId, extraMinutes = 5) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  if (!id || !engine.items[id]) return engine;

  const item = engine.items[id];
  const fromMinutes = item.timerMinutes || 0;
  item.timerMinutes = fromMinutes + extraMinutes;
  logFocusEvent(id, 'extend', { addedMinutes: extraMinutes, fromMinutes, toMinutes: item.timerMinutes });

  if (item.focusState === 'drifted') {
    if (item.lastResumedAt) {
      item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime());
    }
    item.focusState = 'active';
    item.lastResumedAt = new Date().toISOString();
  }

  const totalTimerMs = item.timerMinutes * 60 * 1000;
  let elapsed = item.elapsedMs || 0;
  if (item.focusState === 'active' && item.lastResumedAt) {
    elapsed += Date.now() - new Date(item.lastResumedAt).getTime();
  }
  const remaining = totalTimerMs - elapsed;

  chrome.alarms.clear(`focus-timer-${id}`);
  if (remaining > 0) {
    chrome.alarms.create(`focus-timer-${id}`, { delayInMinutes: remaining / 60000 });
  }

  await clearActivePopupForFocus(id);
  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

export async function letMeCook(focusId) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  if (!id || !engine.items[id]) return engine;

  const item = engine.items[id];
  item.letMeCook = true;

  // Clear focus timer and checkpoint prompt alarms so the user is never interrupted
  chrome.alarms.clear(`focus-timer-${id}`);
  chrome.alarms.clear(`checkpoint-prompt-${id}`);

  if (item.focusState === 'drifted') {
    if (item.lastResumedAt) {
      item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime());
    }
    item.focusState = 'active';
    item.lastResumedAt = new Date().toISOString();
  }

  await clearActivePopupForFocus(id);
  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

export async function backburnerFocus(focusId, durationMinutes, reason, switchToFocusId, createNewFocusLabel) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  if (!id || !engine.items[id]) return engine;

  const item = engine.items[id];
  
  // Set backburner properties
  item.focusState = 'paused';
  item.backburnered = true;
  item.backburneredAt = new Date().toISOString();
  item.backburnerDurationMinutes = durationMinutes;
  autoCheckpoint(item, `Backburnered for ${durationMinutes}m${reason ? ': ' + reason : ''}`);
  logFocusEvent(id, 'backburner', {});
  item.backburnerReason = reason;
  item.lastPausedAt = new Date().toISOString();
  item.backburnerExpired = false; // reset expired flag
  
  // Update elapsed ms if active
  if (id === engine.activeFocusId && item.lastResumedAt) {
    item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime());
    item.lastResumedAt = null;
  }

  // Clear focus/intent timers for the backburnered focus
  chrome.alarms.clear(`focus-timer-${id}`);
  chrome.alarms.clear(`checkpoint-prompt-${id}`);

  // Create backburner alarm
  const alarmName = `backburner-timer-${id}`;
  chrome.alarms.create(alarmName, { delayInMinutes: durationMinutes });

  // Update activeFocusId in engine
  engine.activeFocusId = null;

  // Track if we need to switch or create focus
  let newActiveFocusId = null;
  const pendingEvents = [];

  if (createNewFocusLabel && createNewFocusLabel.trim() !== '') {
    // Create new focus
    const newId = generateFocusId();
    const resolvedTags = await applyDefaultRealm({});
    engine.items[newId] = {
      id: newId,
      label: createNewFocusLabel.trim(),
      description: `Temporary focus while waiting for "${item.label}"`,
      focusState: 'active',
      funnelStage: 'addressing',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      lastResumedAt: new Date().toISOString(),
      endedAt: null,
      pausedAt: null,
      timerMinutes: 15,
      elapsedMs: 0,
      overMs: 0,
      checkpoint: [],
      tags: { realm: '', client: '', project: '', task: '', ...resolvedTags },
      associatedTabIds: [...(item.associatedTabIds || [])],
      parentFocusId: null,
      contextSwitchCount: 0,
      priority: 5,
      offDevice: false,
      lastCheckpointAt: null,
      checkpointSnoozedUntil: null,
      backburnerTransitionFocusId: id
    };
    newActiveFocusId = newId;
    item.backburnerTransitionFocusId = newId;
    pendingEvents.push({ id: newId, kind: 'start', meta: { label: createNewFocusLabel.trim() } });

    // Create default 15 min focus timer for new temporary focus if desired
    chrome.alarms.create(`focus-timer-${newId}`, { delayInMinutes: 15 });
  } else if (switchToFocusId && engine.items[switchToFocusId]) {
    // Switch to existing focus
    newActiveFocusId = switchToFocusId;
    const targetItem = engine.items[switchToFocusId];
    const targetWasBackburnered = !!targetItem.backburnered;
    if (targetWasBackburnered) {
      targetItem.backburnered = false;
      targetItem.backburnerExpired = false;
      targetItem.backburnerReason = null;
      targetItem.backburnerDurationMinutes = null;
      targetItem.backburneredAt = null;
      chrome.alarms.clear(`backburner-timer-${switchToFocusId}`);
    }
    targetItem.focusState = 'active';
    targetItem.lastResumedAt = new Date().toISOString();

    // Set timer for the existing focus if it had one
    if (targetItem.timerEndAt) {
      const remainingMs = new Date(targetItem.timerEndAt).getTime() - Date.now();
      if (remainingMs > 0) {
        chrome.alarms.create(`focus-timer-${switchToFocusId}`, { delayInMinutes: remainingMs / 60000 });
      }
    }
    pendingEvents.push({ id: switchToFocusId, kind: 'start', meta: {} });
    if (targetWasBackburnered) pendingEvents.push({ id: switchToFocusId, kind: 'unbackburner', meta: {} });
  }

  engine.activeFocusId = newActiveFocusId;

  // Sync / broadcast updates
  await setFocusEngine(engine);
  for (const ev of pendingEvents) logFocusEvent(ev.id, ev.kind, ev.meta);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return engine;
}

export async function handleBackburnerTimerExpired(focusId) {
  const engine = await getFocusEngine();
  if (!engine.items[focusId]) return;

  const item = engine.items[focusId];
  if (!item.backburnered) return;

  // Mark backburner expired/alert state
  item.backburnerExpired = true;
  await setFocusEngine(engine);

  // Broadcast alert so UI (InBar/popup) shows the return prompt beautifully
  broadcastAll({
    type: 'BACKBURNER_ALERT',
    focusId,
    label: item.label,
    reason: item.backburnerReason,
    backburneredAt: item.backburneredAt
  });
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

async function renameFocus(focusId, newLabel) {
  const engine = await getFocusEngine();
  if (engine.items[focusId]) {
    engine.items[focusId].label = newLabel;
    await setFocusEngine(engine);
    broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  }
  return { focusEngine: engine };
}

function applyStageTransition(engine, item, newStage, confirmed = false) {
  const from = item.funnelStage || 'unsorted';
  const to = newStage;
  const isBackward = (STAGE_ORDER[to] ?? 0) < (STAGE_ORDER[from] ?? 0);

  if (to === 'unsorted' && from !== 'unsorted') {
    return { error: 'Cannot roll back to unsorted', needsConfirm: false };
  }
  if (from === 'resolved' && to !== 'resolved') {
    if (!confirmed) return { error: 'Resolved items cannot change stage. Confirm to undo.', needsConfirm: true };
    item.focusState = 'paused';
    item.endedAt = null;
  }
  if (item.focusState === 'completed' && to !== 'resolved') {
    if (!confirmed) return { error: 'This focus is completed. Confirm to reopen.', needsConfirm: true };
    item.focusState = 'paused';
    item.endedAt = null;
  }
  if ((from === 'addressing' || from === 'focus') && to === 'todo') {
    return { error: 'Cannot demote from focus/addressing to todo', needsConfirm: false };
  }
  if (isBackward && !(from === 'roadblocked' && to === 'focus') && !confirmed) {
    return { error: `Rolling back from ${from} to ${to} requires confirmation`, needsConfirm: true };
  }
  if (to === 'focus' && !(item.label && item.label.trim())) {
    return { error: 'Focus requires a title', needsConfirm: false };
  }

  item.funnelStage = to;

  if (to === 'resolved') {
    addElapsedSinceResume(item, engine);
    item.focusState = 'completed';
    item.endedAt = new Date().toISOString();
    if (engine.activeFocusId === item.id) engine.activeFocusId = null;
  } else if (to === 'addressing' && item.focusState !== 'active') {
    if (engine.activeFocusId && engine.activeFocusId !== item.id) {
      const prev = engine.items[engine.activeFocusId];
      if (prev?.focusState === 'active') pauseItem(prev, undefined, engine);
    }
    item.focusState = 'active';
    item.lastResumedAt = new Date().toISOString();
    item.startedAt = item.startedAt || new Date().toISOString();
    engine.activeFocusId = item.id;
  }

  return {};
}

async function setFunnelStage(focusId, stage, confirmed) {
  const engine = await getFocusEngine();
  const item = engine.items[focusId];
  if (!item) return { error: 'Focus not found', focusEngine: engine };

  const result = applyStageTransition(engine, item, stage, !!confirmed);
  if (result.error) return { ...result, focusEngine: engine };

  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { focusEngine: engine };
}

async function updateFocus(message) {
  const engine = await getFocusEngine();
  const item = engine.items[message.focusId];
  if (!item) return { error: 'Focus not found', focusEngine: engine };

  if (message.label !== undefined) item.label = message.label;
  if (message.timerMinutes !== undefined) item.timerMinutes = message.timerMinutes;
  if (message.tags !== undefined) item.tags = { ...item.tags, ...message.tags };
  if (message.offDevice !== undefined) item.offDevice = !!message.offDevice;
  if (message.priority !== undefined) item.priority = Number(message.priority);
  if (message.funnelStage !== undefined) {
    const result = applyStageTransition(engine, item, message.funnelStage, !!message.confirmed);
    if (result.error) {
      const error = result.error === 'Focus requires a title'
        ? 'A focus item requires a title before entering focus stage'
        : result.error;
      return { ...result, error, focusEngine: engine };
    }
  }

  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { focusEngine: engine };
}

async function pauseFocus(focusId) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  const item = id ? engine.items[id] : null;
  if (!item) return { error: 'Focus not found', focusEngine: engine };

  pauseItem(item, undefined, engine);
  chrome.alarms.clear(`checkpoint-prompt-${id}`);
  await clearActivePopupForFocus(id);
  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { focusEngine: engine };
}

async function resumeFocus(focusId) {
  const engine = await getFocusEngine();
  // Symmetry with pauseFocus: no id → fall back to the active focus (or, if
  // nothing is active, the most recently paused one) instead of erroring.
  let item = focusId ? engine.items[focusId] : null;
  if (!item && !focusId) {
    item = engine.items[engine.activeFocusId]
      || Object.values(engine.items)
        .filter((i) => i.focusState === 'paused' && i.pausedAt)
        .sort((a, b) => new Date(b.pausedAt) - new Date(a.pausedAt))[0]
      || null;
    focusId = item?.id;
  }
  if (!item) return { error: 'Focus not found', focusEngine: engine };

  if (engine.activeFocusId && engine.activeFocusId !== focusId) {
    const current = engine.items[engine.activeFocusId];
    if (current?.focusState === 'active') pauseItem(current, undefined, engine);
  }

  item.focusState = 'active';
  item.lastResumedAt = new Date().toISOString();
  item.pausedAt = null;
  autoCheckpoint(item, 'Resumed');
  logFocusEvent(focusId, 'resume');
  if (item.funnelStage === 'focus' || item.funnelStage === 'todo' || item.funnelStage === 'unsorted') {
    item.funnelStage = 'addressing';
  }
  engine.activeFocusId = focusId;

  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  await endBreakIfActive();
  return { focusEngine: engine };
}

// Plan 036: resolve a pending Smart Idle Engine prompt.
//   on_task  → keep the focus active (user confirms they're still working)
//   diverged → mark the active focus drifted (UI then prompts for a new focus)
//   pause    → pause the focus (legacy idle behaviour, on demand)
async function idlePromptResponse(message) {
  const response = message.response || 'pause';
  const engine = await getFocusEngine();
  const id = message.focusId || engine.activeFocusId;

  // Clear the pending marker so the idle-auto-break fallback won't double-act.
  // NB-09: capture the pending prompt first — gap-sourced prompts need the
  // marker's metadata to decide whether "on task" should credit time back.
  let pending = null;
  try {
    const { _idlePrompt } = await getStorage('_idlePrompt');
    if (_idlePrompt) {
      pending = _idlePrompt;
      await setStorage({ _idlePrompt: null });
      broadcastAll({ type: 'IDLE_PROMPT_RESOLVED', id: _idlePrompt.id, resolution: response });
    }
  } catch { /* non-critical */ }

  if (response === 'on_task') {
    // NB-09: for offline-gap prompts the focus was already retro-paused at the
    // gap start. "On task" means the user kept working through the gap —
    // credit the paused span back (bounded by wall-clock) and reactivate.
    if (pending?.source === 'gap') {
      const item = id ? engine.items[id] : null;
      if (item && item.focusState === 'paused' && item.pausedReason === 'offline_gap' && item.pausedAt) {
        const pausedFor = Math.max(0, Date.now() - new Date(item.pausedAt).getTime());
        item.elapsedMs = Math.min((item.elapsedMs || 0) + pausedFor, wallClockMax(item));

        // Pause whatever else is active so we never double-track.
        if (engine.activeFocusId && engine.activeFocusId !== id) {
          const cur = engine.items[engine.activeFocusId];
          if (cur?.focusState === 'active') pauseItem(cur, undefined, engine);
        }
        item.focusState = 'active';
        item.lastResumedAt = new Date().toISOString();
        item.pausedAt = null;
        item.pausedReason = null;
        engine.activeFocusId = id;
        autoCheckpoint(item, `🛠 Offline gap credited (+${Math.round(pausedFor / 60000)}m)`);

        await setFocusEngine(engine);
        broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
        return { focusEngine: engine, resolution: 'on_task', creditedMs: pausedFor };
      }
    }
    return { focusEngine: engine, resolution: 'on_task' };
  }
  if (response === 'diverged') {
    const r = await markFocusDrifted(id);
    return { focusEngine: r.engine, resolution: 'diverged' };
  }
  // NB-09: a gap-retro-paused focus is ALREADY paused at the backdated gap
  // start — re-pausing would overwrite pausedAt with "now" and destroy the
  // user's ability to credit the gap later via Remove-last-pause.
  {
    const item = id ? engine.items[id] : null;
    if (pending?.source === 'gap' && item?.focusState === 'paused' && item.pausedReason === 'offline_gap') {
      return { focusEngine: engine, resolution: 'pause' };
    }
  }
  const paused = await pauseFocus(id);
  return { ...paused, resolution: 'pause' };
}

// ════════════════════════════════════════════
// Plan 037 — Focus Time Editing
// ════════════════════════════════════════════

// Total displayed elapsed = stored elapsedMs + (active ? now - lastResumedAt : 0).
function liveElapsed(item) {
  let ms = item.elapsedMs || 0;
  if (item.lastResumedAt) ms += Date.now() - new Date(item.lastResumedAt).getTime();
  return ms;
}

// Wall-clock ceiling: a focus can never have more active time than has elapsed
// since it started. Guards against fat-fingered over-corrections.
function wallClockMax(item) {
  return item.startedAt ? Date.now() - new Date(item.startedAt).getTime() : Number.MAX_SAFE_INTEGER;
}

// Apply a signed delta (ms) to the stored elapsed time. Clamped so the live
// total stays within [0, wall-clock]. NB-09: never touches lastResumedAt —
// only the stored portion moves; the live active portion keeps ticking.
// Returns rich metadata mirroring setFocusStartTime's { addedMs, clamped }
// shape so callers can render honest feedback.
async function adjustFocusTime(focusId, adjustmentMs, reason) {
  const engine = await getFocusEngine();
  const item = focusId ? engine.items[focusId] : null;
  if (!item) return { error: 'Focus not found', focusEngine: engine };

  const delta = Number(adjustmentMs) || 0;
  const activePortion = item.lastResumedAt ? Date.now() - new Date(item.lastResumedAt).getTime() : 0;
  const storedCeiling = Math.max(0, wallClockMax(item) - activePortion);
  const next = Math.max(0, Math.min((item.elapsedMs || 0) + delta, storedCeiling));
  const applied = next - (item.elapsedMs || 0);
  const clamped = applied !== delta;
  // Mutate the stored portion BEFORE snapshotting the checkpoint: autoCheckpoint
  // computes elapsedAtMs = stored + live-active-portion, so with this ordering
  // the logged entry reflects the final live total exactly once (the active
  // portion is neither dropped nor double-counted).
  item.elapsedMs = next;

  const mins = Math.round(applied / 60000);
  autoCheckpoint(item, `🛠 Time ${applied >= 0 ? '+' : ''}${mins}m${reason ? ' — ' + reason : ''}`);
  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { focusEngine: engine, appliedMs: applied, clamped, liveElapsedMs: liveElapsed(item) };
}

// Set the displayed elapsed to an absolute value (ms). The target is the LIVE
// total: stored elapsed becomes max(0, target − activePortion) so the running
// portion keeps ticking from the requested total. NB-09: returns rich metadata
// (appliedMs = stored delta, clamped, liveElapsedMs = resulting live total).
async function setFocusElapsed(focusId, elapsedMs) {
  const engine = await getFocusEngine();
  const item = focusId ? engine.items[focusId] : null;
  if (!item) return { error: 'Focus not found', focusEngine: engine };

  const requested = Number(elapsedMs) || 0;
  const target = Math.max(0, Math.min(requested, wallClockMax(item)));
  const activePortion = item.lastResumedAt ? Date.now() - new Date(item.lastResumedAt).getTime() : 0;
  const prevStored = item.elapsedMs || 0;
  // Stored floor is 0: when the requested total is smaller than the live
  // active portion, the live total floors at the active portion (clamped).
  item.elapsedMs = Math.max(0, target - activePortion);
  const appliedMs = item.elapsedMs - prevStored;
  const clamped = requested !== target || target < activePortion;

  // Checkpoint AFTER the stored mutation (see adjustFocusTime ordering note) —
  // log the resulting live total, not the possibly-clamped raw request.
  const finalLive = liveElapsed(item);
  autoCheckpoint(item, `🛠 Time set to ${Math.round(finalLive / 60000)}m`);
  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { focusEngine: engine, appliedMs, clamped, liveElapsedMs: finalLive };
}

// NB-09: newest user-activity timestamp across tracked tabs, for the UI's
// "trim to last activity" action. Returns { lastActivityAt: ISO|null }.
async function getLastActivity() {
  let latest = 0;
  try {
    const tabs = injectedDeps.getTabData
      ? await injectedDeps.getTabData()
      : (await getStorage('tabs')).tabs || {};
    for (const t of Object.values(tabs || {})) {
      const ts = t?.lastActive ? new Date(t.lastActive).getTime() : 0;
      if (Number.isFinite(ts) && ts > latest) latest = ts;
    }
  } catch { /* no tab data — no trim affordance */ }
  return { lastActivityAt: latest > 0 ? new Date(latest).toISOString() : null };
}

// Remove the most recent pause: credit the time spent paused back into the
// focus's elapsed total and (if it is currently paused) reactivate it. This is
// the one-click fix for an idle/false pause that ate the user's time.
async function removeLastPause(focusId) {
  const engine = await getFocusEngine();
  const item = focusId ? engine.items[focusId] : null;
  if (!item) return { error: 'Focus not found', focusEngine: engine };

  // If currently paused, credit time-since-pause and reactivate.
  if (item.focusState === 'paused' && item.pausedAt) {
    const pausedFor = Math.max(0, Date.now() - new Date(item.pausedAt).getTime());
    item.elapsedMs = Math.min((item.elapsedMs || 0) + pausedFor, wallClockMax(item));

    // Pause whatever else is currently active so we don't double-track.
    if (engine.activeFocusId && engine.activeFocusId !== focusId) {
      const cur = engine.items[engine.activeFocusId];
      if (cur?.focusState === 'active') pauseItem(cur, undefined, engine);
    }
    item.focusState = 'active';
    item.lastResumedAt = new Date().toISOString();
    item.pausedAt = null;
    item.pausedReason = null;
    engine.activeFocusId = focusId;

    // Restore the focus timer for the remaining budget.
    const remaining = (item.timerMinutes || 0) * 60000 - (item.elapsedMs || 0);
    chrome.alarms.clear(`focus-timer-${focusId}`);
    if (remaining > 0) chrome.alarms.create(`focus-timer-${focusId}`, { delayInMinutes: remaining / 60000 });
  }

  // Splice out the most recent system "Paused…" checkpoint entry, if any.
  const cps = item.checkpoint || [];
  for (let i = cps.length - 1; i >= 0; i--) {
    if (cps[i].triggeredBy === 'system' && /^Paused/i.test(cps[i].text || '')) {
      cps.splice(i, 1);
      break;
    }
  }
  autoCheckpoint(item, '🛠 Pause removed (time restored)');

  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { focusEngine: engine };
}

// Workstream B1 — Backdate a focus's start time ("I was working before I
// created this focus"). Moves item.startedAt earlier (validated/clamped) and
// credits the newly-exposed gap into elapsedMs, bounded by the wall-clock
// ceiling so elapsed can never exceed (now - newStart). Validation clamps the
// proposed start to [clock-in, now] ONLY; overlap with other focuses' active
// intervals is reported (`overlaps`), never silently applied.
async function setFocusStartTime(focusId, startedAt, reason) {
  const engine = await getFocusEngine();
  const item = focusId ? engine.items[focusId] : null;
  if (!item) return { error: 'Focus not found', focusEngine: engine };

  const now = Date.now();
  const proposedStartMs = new Date(startedAt).getTime();
  const currentStartMs = item.startedAt ? new Date(item.startedAt).getTime() : now;

  // Clock-in lower bound (you can't have started before clocking in).
  let clockInMs = null;
  try {
    const { clockSession } = await getStorage('clockSession');
    if (clockSession?.active && clockSession?.clockedInAt) {
      clockInMs = new Date(clockSession.clockedInAt).getTime();
    }
  } catch { /* no clock session → unbounded below */ }

  // Active intervals of *other* focuses, to avoid double-counting the same
  // wall-clock window. A focus's active span is [startedAt, now] while running,
  // or [startedAt, pausedAt] when paused.
  const otherIntervals = [];
  for (const [id, other] of Object.entries(engine.items)) {
    if (id === focusId || !other?.startedAt) continue;
    const oStart = new Date(other.startedAt).getTime();
    if (!Number.isFinite(oStart)) continue;
    let oEnd;
    if (other.focusState === 'active') oEnd = now;
    else if (other.pausedAt) oEnd = new Date(other.pausedAt).getTime();
    else if (other.endedAt) oEnd = new Date(other.endedAt).getTime();
    else continue;
    if (Number.isFinite(oEnd) && oEnd > oStart) otherIntervals.push({ startMs: oStart, endMs: oEnd, label: other.label || null });
  }

  const v = validateStartTime({ proposedStartMs, currentStartMs, now, clockInMs, otherIntervals });
  if (!v.ok) return { error: v.error || 'Invalid start time', focusEngine: engine };

  const newStartMs = v.startMs;
  const oldStartMs = currentStartMs;
  item.startedAt = new Date(newStartMs).toISOString();

  // Recompute the stored ceiling against the NEW start and ALWAYS clamp (reuses
  // the elapsed/active math from adjustFocusTime :877-885: stored elapsed + live
  // active portion must stay <= wall-clock since startedAt). Moving the start
  // EARLIER credits the exposed gap; moving it LATER shrinks the wall-clock
  // window, which can leave the stored elapsed impossibly large — clamp it down.
  const addedMs = Math.max(0, oldStartMs - newStartMs);
  const wallMax = now - newStartMs; // never-started safety: bounded by now-newStart
  const activePortion = item.lastResumedAt ? now - new Date(item.lastResumedAt).getTime() : 0;
  const storedCeiling = Math.max(0, wallMax - activePortion);
  item.elapsedMs = Math.max(0, Math.min((item.elapsedMs || 0) + addedMs, storedCeiling));

  const mins = Math.round(addedMs / 60000);
  // Overlap with other focuses' time is REPORTED, not silently resolved — the
  // start the user picked always stands. Note it on the timeline so the credited
  // span is honest; a future UI lets the user trim it / move it to backburner.
  const overlaps = Array.isArray(v.overlaps) ? v.overlaps : [];
  const overlapMs = overlaps.reduce((sum, o) => sum + (o.overlapMs || 0), 0);
  const overlapNote = overlapMs >= 60000 ? ` (⚠️ overlaps ${Math.round(overlapMs / 60000)}m of other focus time)` : '';
  autoCheckpoint(item, `🛠 Start backdated +${mins}m${reason ? ' — ' + reason : ''}${overlapNote}`);
  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  // Response carries everything the UI needs to be HONEST about the edit:
  // the effective start, the credited ms, whether the [clock-in, now] bounds
  // moved it (`clamped` + which bound via `clampedBy`), and any other-focus
  // intervals the credited span overlaps (`overlaps`, informational — both
  // focuses keep their time). Additive fields only.
  return { focusEngine: engine, startedAt: item.startedAt, addedMs, clamped: v.clamped, clampedBy: v.clampedBy || null, overlaps };
}

// Edit an existing checkpoint entry's text and/or progress level.
async function editCheckpoint(message) {
  const engine = await getFocusEngine();
  const item = message.focusId ? engine.items[message.focusId] : null;
  if (!item) return { error: 'Focus not found', focusEngine: engine };
  const cp = (item.checkpoint || []).find(c => c.id === message.checkpointId);
  if (!cp) return { error: 'Checkpoint not found', focusEngine: engine };

  if (message.text !== undefined) cp.text = message.text;
  if (message.progressLevel !== undefined) {
    cp.progressLevel = message.progressLevel;
    cp.progressValue = PROGRESS_VALUES[message.progressLevel] ?? 0;
  }
  cp.editedAt = new Date().toISOString();

  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { focusEngine: engine };
}

// Remove a single checkpoint entry by id.
async function deleteCheckpoint(focusId, checkpointId) {
  const engine = await getFocusEngine();
  const item = focusId ? engine.items[focusId] : null;
  if (!item) return { error: 'Focus not found', focusEngine: engine };

  const cps = item.checkpoint || [];
  const idx = cps.findIndex(c => c.id === checkpointId);
  if (idx === -1) return { error: 'Checkpoint not found', focusEngine: engine };
  cps.splice(idx, 1);

  // Keep lastCheckpointAt honest: point it at the newest remaining user note.
  const lastUser = [...cps].reverse().find(c => c.triggeredBy !== 'system');
  item.lastCheckpointAt = lastUser?.createdAt || null;

  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { focusEngine: engine };
}

async function endBreakIfActive() {
  try {
    if (injectedDeps.endBreakIfActive) {
      await injectedDeps.endBreakIfActive();
      return;
    }

    const { clockSession } = await getStorage('clockSession');
    if (clockSession?.active && clockSession?.onBreak && injectedDeps.clockService?.toggleBreak) {
      await injectedDeps.clockService.toggleBreak();
    }
  } catch { /* ignore */ }
}

async function linkIntentToTask(message) {
  const engine = await getFocusEngine();
  const { intentId, taskId, newTaskName } = message;

  let finalTaskId = taskId;
  if (newTaskName) {
    const { tasks = [] } = await getStorage('tasks');
    finalTaskId = `task_${Date.now()}`;
    tasks.push({ id: finalTaskId, name: newTaskName, createdAt: new Date().toISOString() });
    await setStorage({ tasks });
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

async function mergeIntents(sourceIntentId, targetIntentId) {
  const engine = await getFocusEngine();

  if (engine.items[sourceIntentId] && engine.items[targetIntentId]) {
    const source = engine.items[sourceIntentId];
    const target = engine.items[targetIntentId];

    target.associatedTabIds = [...new Set([...target.associatedTabIds, ...source.associatedTabIds])];
    target.elapsedMs = (target.elapsedMs || 0) + (source.elapsedMs || 0);
    delete engine.items[sourceIntentId];

    if (engine.activeFocusId === sourceIntentId) {
      engine.activeFocusId = targetIntentId;
    }

    await setFocusEngine(engine);
    broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  }
  return { success: true };
}

export async function associateTabWithFocus(focusId, tabId) {
  const engine = await getFocusEngine();
  if (focusId && engine.items[focusId] && tabId) {
    const associated = engine.items[focusId].associatedTabIds || [];
    if (!associated.includes(tabId)) {
      engine.items[focusId].associatedTabIds = [...associated, tabId];
      await setFocusEngine(engine);
      broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
    }
  }
  return engine;
}

export async function linkTabToFocus(focusId, tabId) {
  const engine = await getFocusEngine();
  const tabs = await getTabData();

  if (engine.items[focusId]) {
    Object.values(engine.items).forEach(intent => {
      intent.associatedTabIds = (intent.associatedTabIds || []).filter(id => id !== tabId);
    });
    if (!engine.items[focusId].associatedTabIds.includes(tabId)) {
      engine.items[focusId].associatedTabIds.push(tabId);
    }
    await setFocusEngine(engine);

    if (tabs[tabId]) {
      tabs[tabId].intent = engine.items[focusId].label;
      await setTabData(tabs);
      broadcastAll({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
    }

    broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  }
  return engine;
}

export async function autoQueueFromIntent(intent, tabId) {
  if (!intent) return { skipped: true };

  try {
    const { tabathaSettings } = await getStorage('tabathaSettings');
    const bridgeMode = tabathaSettings?.intentBridgeMode || 'smart_dedup';
    if (bridgeMode === 'manual') return { skipped: true, bridgeMode };

    const engine = await getFocusEngine();
    const activeFocus = engine.activeFocusId ? engine.items[engine.activeFocusId] : null;
    const activeLabel = activeFocus?.label?.toLowerCase()?.trim() || '';
    const newLabel = intent.toLowerCase().trim();
    const existingMatch = Object.values(engine.items).find(
      item => item.label?.toLowerCase()?.trim() === newLabel && item.focusState !== 'completed'
    );
    const shouldAutoQueue = bridgeMode === 'always'
      ? !existingMatch
      : newLabel !== activeLabel && !existingMatch;

    if (shouldAutoQueue) {
      // Phase A: prefer per-install classification; fall back to legacy
      // user-level default_realm setting.
      const { _browserProfile } = await getStorage('_browserProfile');
      const defaultRealm = _browserProfile?.classification || tabathaSettings?.defaultRealm || '';
      const result = await addFocus(intent, 15, { realm: defaultRealm });
      const newItem = result.engine.items[result.newFocusId];
      if (newItem && tabId) {
        newItem.associatedTabIds = [...(newItem.associatedTabIds || []), tabId];

        // Side-quest semantics (Plan 036 QA): a tab that switches to a NEW
        // intent is no longer "on task" for the primary focus. Remove it from
        // the active focus's associatedTabIds so drift detection fires normally.
        if (result.engine.activeFocusId && result.engine.activeFocusId !== result.newFocusId) {
          const activeFocus = result.engine.items[result.engine.activeFocusId];
          if (activeFocus?.associatedTabIds) {
            activeFocus.associatedTabIds = activeFocus.associatedTabIds.filter(id => id !== tabId);
          }
        }

        await setFocusEngine(result.engine);
      }
      broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
      return { engine: result.engine, newFocusId: result.newFocusId };
    }

    if (existingMatch && tabId && !existingMatch.associatedTabIds?.includes(tabId)) {
      existingMatch.associatedTabIds = [...(existingMatch.associatedTabIds || []), tabId];
      await setFocusEngine(engine);
    }

    return { engine, linkedFocusId: existingMatch?.id || null };
  } catch (bridgeErr) {
    console.warn('[Intent Bridge] Error:', bridgeErr);
    return { error: bridgeErr.message || 'Intent bridge failed' };
  }
}

export async function pauseActiveFocus(reason) {
  const engine = await getFocusEngine();
  if (engine.activeFocusId && engine.items[engine.activeFocusId]) {
    const active = engine.items[engine.activeFocusId];
    if (active.focusState === 'active') {
      pauseItem(active, reason, engine);
      await setFocusEngine(engine);
      broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
    }
  }
  return engine;
}

// Focus-timer alarm handler. Routed from alarmService when a
// `focus-timer-<focusId>` alarm fires. Transitions the active focus into
// `drifted` state, fires the interrupting notification, and broadcasts
// FOCUS_TIMER_EXPIRED so the InBar can surface the alert.
export async function handleFocusTimerExpired(focusId) {
  const engine = await getFocusEngine();
  const item = engine.items[focusId];
  if (!item || item.focusState !== 'active') return;

  // Plan 031: Let Me Cook — suppress all timer alarms when user chose to keep cooking
  if (item.letMeCook) return;

  // Plan 025: Off-device suppression
  if (item.offDevice) return;

  item.focusState = 'drifted';
  if (item.lastResumedAt) {
    item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime());
    item.lastResumedAt = new Date().toISOString();
  }
  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });

  // Plan 025: Singleton popup coordination
  await setStorage({
    _activePopup: { type: 'FTE', id: `fte_${focusId}`, focusId, ts: Date.now() }
  });

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

  // Clear checkpoint alarm — no more prompts after timer expires
  chrome.alarms.clear(`checkpoint-prompt-${focusId}`);

  broadcastAll({
    type: 'FOCUS_TIMER_EXPIRED',
    focusId,
    label: item.label,
    timerMinutes: item.timerMinutes,
    elapsedMs: item.elapsedMs
  });
}

// Unfocused-nudge alarm handler. Routed from alarmService when the
// recurring `unfocused-nudge` alarm fires. Surfaces a notification only
// when the user is actively browsing without any active focus.
export async function handleUnfocusedNudge() {
  const engine = await getFocusEngine();
  const hasActive =
    engine.activeFocusId && engine.items[engine.activeFocusId]?.focusState === 'active';
  if (hasActive) return;

  const idleState = await chrome.idle.queryState(60);
  if (idleState !== 'active') return;

  try {
    chrome.notifications.create(`nudge-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: '🎯 Tabatha — What are you working on?',
      message: 'You\'ve been browsing without a focus set. Click to set one.',
      priority: 1
    });
  } catch (e) {
    console.warn('[Tabatha] Nudge notification error:', e);
  }

  // Inline log write — preserves the previous logEvent behavior without
  // pulling logEvent into focusService as a dep.
  try {
    const { tabathaLogs } = await getStorage('tabathaLogs');
    const logs = tabathaLogs || [];
    logs.push({
      type: 'unfocused_nudge',
      activeFocusId: engine.activeFocusId,
      ts: new Date().toISOString()
    });
    await setStorage({ tabathaLogs: logs.slice(-500) });
  } catch { /* ignore log write failures */ }
}

export async function markFocusDrifted(focusId) {
  const engine = await getFocusEngine();
  const item = engine.items[focusId];
  if (item?.focusState === 'active') {
    item.focusState = 'drifted';
    if (item.lastResumedAt) {
      item.elapsedMs = (item.elapsedMs || 0) + (Date.now() - new Date(item.lastResumedAt).getTime());
      item.lastResumedAt = new Date().toISOString();
    }
    await setFocusEngine(engine);
    broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  }
  return { engine, item };
}

export async function tryAssociateTab(tabId) {
  const engine = await getFocusEngine();
  if (!engine.activeFocusId) return;
  const active = engine.items[engine.activeFocusId];
  if (!active || active.focusState !== 'active') return;
  if (active.associatedTabIds.includes(tabId)) return;

  const tabs = await getTabData();
  const tab = tabs[tabId];
  if (!tab) return;

  if (tab.parentTabId && active.associatedTabIds.includes(tab.parentTabId)) {
    active.associatedTabIds.push(tabId);
    await setFocusEngine(engine);
    return;
  }

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
  } catch { /* invalid URLs */ }
}

async function getTabData() {
  return injectedDeps.getTabData ? injectedDeps.getTabData() : getStorage('tabs').then(({ tabs }) => tabs || {});
}

async function setTabData(tabs) {
  return injectedDeps.setTabData ? injectedDeps.setTabData(tabs) : setStorage({ tabs });
}

// ════════════════════════════════════════════
// Plan 025 — Checkpoint Progress Notes
// ════════════════════════════════════════════

async function saveCheckpointNote(message) {
  const engine = await getFocusEngine();
  const focusId = message.focusId || engine.activeFocusId;
  const item = focusId ? engine.items[focusId] : null;
  if (!item) return { error: 'Focus not found' };

  if (!item.checkpoint) item.checkpoint = [];

  const progressLevel = message.progressLevel || 'none';
  const progressValue = PROGRESS_VALUES[progressLevel] ?? 0;

  // Calculate current elapsed for this snapshot
  let elapsedAtMs = item.elapsedMs || 0;
  if (item.lastResumedAt) {
    elapsedAtMs += Date.now() - new Date(item.lastResumedAt).getTime();
  }

  const cpn = {
    id: `cpn_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    text: message.text || '',
    progressLevel,
    progressValue,
    createdAt: new Date().toISOString(),
    focusId,
    elapsedAtMs,
    triggeredBy: message.triggeredBy || 'manual'
  };

  item.checkpoint.push(cpn);
  item.lastCheckpointAt = cpn.createdAt;
  item.checkpointSnoozedUntil = null; // Clear any snooze on submission
  await setFocusEngine(engine);

  // Log to master context history
  try {
    const { tabathaLogs } = await getStorage('tabathaLogs');
    const logs = tabathaLogs || [];
    logs.push({
      type: 'checkpoint_note',
      focusId,
      focusLabel: item.label,
      progressLevel,
      progressValue,
      text: cpn.text.slice(0, 200), // Truncate for log brevity
      ts: cpn.createdAt
    });
    await setStorage({ tabathaLogs: logs.slice(-500) });
  } catch { /* log write failure is non-critical */ }

  // Asana bridge: fire webhook if configured
  try {
    const settings = await getSettings();
    if (settings?.checkpointAutoPostAsana && item.tags?.task) {
      // Check if the linked task has an asanaGid
      const { tabathaOrg } = await getStorage('tabathaOrg');
      const linkedTask = tabathaOrg?.tasks?.[item.tags.task];
      if (linkedTask?.asanaGid) {
        fireWebhook('checkpoint_note', {
          focusId,
          focusLabel: item.label,
          taskGid: linkedTask.asanaGid,
          text: cpn.text,
          progressLevel,
          progressValue
        });
      }
    }
  } catch { /* Asana bridge failure is non-critical */ }

  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { success: true, cpn };
}

async function snoozeCheckpoint(focusId, snoozeMinutes = 5) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  const item = id ? engine.items[id] : null;
  if (!item) return { error: 'Focus not found' };

  item.checkpointSnoozedUntil = new Date(Date.now() + snoozeMinutes * 60000).toISOString();
  await setFocusEngine(engine);
  return { success: true, snoozedUntil: item.checkpointSnoozedUntil };
}

async function getCheckpointStatus(focusId) {
  const engine = await getFocusEngine();
  const id = focusId || engine.activeFocusId;
  const item = id ? engine.items[id] : null;
  if (!item) return { error: 'Focus not found' };

  const settings = await getSettings();
  const staleMinutes = settings?.checkpointStaleMinutes ?? DEFAULT_SETTINGS.checkpointStaleMinutes;
  const lastAt = item.lastCheckpointAt ? new Date(item.lastCheckpointAt).getTime() : null;
  const isStale = lastAt
    ? (Date.now() - lastAt) > staleMinutes * 60000
    : item.startedAt && (Date.now() - new Date(item.startedAt).getTime()) > staleMinutes * 60000;

  return {
    focusId: id,
    lastCheckpointAt: item.lastCheckpointAt,
    isStale: !!isStale,
    staleMinutes,
    checkpoint: item.checkpoint || [],
    checkpointSnoozedUntil: item.checkpointSnoozedUntil
  };
}

// Called by alarmService when `checkpoint-prompt-{focusId}` fires
export async function handleCheckpointPrompt(focusId) {
  const engine = await getFocusEngine();
  const item = engine.items[focusId];
  if (!item || item.focusState !== 'active') {
    chrome.alarms.clear(`checkpoint-prompt-${focusId}`);
    return;
  }

  // Gate: settings
  const settings = await getSettings();
  if (settings?.checkpointNotesEnabled === false) return;

  // Gate: snoozed
  if (item.checkpointSnoozedUntil && new Date(item.checkpointSnoozedUntil).getTime() > Date.now()) {
    return;
  }

  // Gate: off-device
  if (item.offDevice) return;

  // Gate: subtask completion suppression — only check if subtasks/linked tasks exist
  if (item.tags?.task) {
    try {
      const { tabathaOrg } = await getStorage('tabathaOrg');
      const linkedTask = tabathaOrg?.tasks?.[item.tags.task];
      if (linkedTask?.completedAt) {
        const completedMs = Date.now() - new Date(linkedTask.completedAt).getTime();
        if (completedMs < 120000) return; // Completed within 2 min → suppress
      }
    } catch { /* task lookup failure is non-critical */ }
  }

  // Calculate elapsed
  let elapsedMs = item.elapsedMs || 0;
  if (item.lastResumedAt) {
    elapsedMs += Date.now() - new Date(item.lastResumedAt).getTime();
  }

  broadcastAll({
    type: 'CHECKPOINT_PROMPT',
    focusId,
    label: item.label,
    timerMinutes: item.timerMinutes,
    elapsedMs,
    lastCheckpointAt: item.lastCheckpointAt,
    checkpointCount: (item.checkpoint || []).length
  });
}

// ════════════════════════════════════════════
// Plan 025 — Popup Singleton Coordination
// ════════════════════════════════════════════

async function clearActivePopupForFocus(focusId) {
  try {
    const { _activePopup } = await getStorage('_activePopup');
    if (_activePopup?.focusId === focusId) {
      await setStorage({ _activePopup: null });
      broadcastAll({ type: 'POPUP_DISMISSED', popupId: _activePopup.id });
    }
  } catch { /* non-critical */ }
}

async function dismissActivePopup(popupId) {
  try {
    const { _activePopup } = await getStorage('_activePopup');
    if (!popupId || _activePopup?.id === popupId || !_activePopup) {
      await setStorage({ _activePopup: null });
      broadcastAll({ type: 'POPUP_DISMISSED', popupId: popupId || _activePopup?.id });
    }
  } catch { /* non-critical */ }
  return { success: true };
}

