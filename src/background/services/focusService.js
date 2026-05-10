import { DEFAULT_FOCUS_ENGINE, PRIORITY_LEVELS } from '../constants.js';
import {
  getStorage as storageGetStorage,
  getTabData as storageGetTabData,
  setStorage as storageSetStorage,
} from './storageService.js';
import { broadcastMessage } from './notificationService.js';

let dependencies = {
  getStorage: storageGetStorage,
  setStorage: storageSetStorage,
  getTabData: storageGetTabData,
  setTabData: async (tabs) => storageSetStorage({ tabs }),
  getFocusEngine: getStoredFocusEngine,
  setFocusEngine: async (engine) => storageSetStorage({ focusEngine: engine }),
};

export function configureFocusService(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export async function handleMessage(type, message, sender) {
  switch (type) {
    case 'GET_FOCUS_ENGINE':
      return { focusEngine: await getFocusEngine() };
    case 'START_FOCUS':
      return { focusEngine: await startFocus(message.label, message.timerMinutes, message.tags) };
    case 'ADD_FOCUS':
      return { focusEngine: await addFocus(message.label, message.timerMinutes, message.tags) };
    case 'SWITCH_FOCUS':
      return { focusEngine: await switchFocus(message.focusId) };
    case 'COMPLETE_FOCUS':
      return { focusEngine: await completeFocus(message.focusId) };
    case 'UPDATE_FOCUS':
      return updateFocus(message);
    case 'RENAME_FOCUS':
      return renameFocus(message);
    case 'EXTEND_FOCUS_TIMER':
      return { focusEngine: await extendFocusTimer(message.focusId, message.extraMinutes) };
    case 'UPDATE_FOCUS_TAGS':
      return { focusEngine: await updateFocusTags(message.focusId, message.tags) };
    case 'SET_FUNNEL_STAGE':
      return { focusEngine: await setFunnelStage(message.focusId, message.stage) };
    case 'SET_PRIORITY':
      return setPriority(message);
    case 'LINK_INTENT_TO_TASK':
      return linkIntentToTask(message);
    case 'MERGE_INTENTS':
      return mergeIntents(message);
    case 'ASSOCIATE_TAB_WITH_FOCUS':
      return associateTabWithFocus(message, sender);
    default:
      return null;
  }
}

async function getStorage(keys) {
  return dependencies.getStorage(keys);
}

async function setStorage(data) {
  return dependencies.setStorage(data);
}

async function getTabData() {
  return dependencies.getTabData();
}

async function setTabData(tabs) {
  return dependencies.setTabData(tabs);
}

async function getStoredFocusEngine() {
  const { focusEngine } = await storageGetStorage('focusEngine');
  if (!focusEngine) return { ...DEFAULT_FOCUS_ENGINE };
  if (!focusEngine.items) focusEngine.items = {};
  if (!focusEngine.history) focusEngine.history = [];
  return focusEngine;
}

async function getFocusEngine() {
  return dependencies.getFocusEngine();
}

async function setFocusEngine(engine) {
  return dependencies.setFocusEngine(engine);
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
export async function tryAssociateTab(tabId) {
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

async function setPriority(message) {
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

async function associateTabWithFocus(message, sender) {
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

async function linkIntentToTask(message) {
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

async function mergeIntents(message) {
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

async function renameFocus(message) {
  const engine = await getFocusEngine();
  if (engine.items[message.focusId]) {
    engine.items[message.focusId].label = message.newLabel;
    await setFocusEngine(engine);
    broadcastMessage({ type: 'FOCUS_ENGINE_UPDATED' });
  }
  return { focusEngine: engine };
}

async function updateFocus(message) {
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
