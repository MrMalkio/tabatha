// Tabatha — Asana task bridge.
//
// Owns explicit human/agent task stints, task hierarchy rollups, Asana-page
// context updates, and "Set focus" from the Asana content surface. Local
// state is canonical and works offline; Supabase's flux_time_entries table is
// a best-effort mirror so the existing Asana widget can render the same data.

import { getStorage, setStorage, getTabData } from './storageService.js';
import { broadcastAll } from './notificationService.js';
import {
  externalTaskId,
  upsertExternalTaskContext,
  updateExternalTaskState,
} from './taskService.js';
import {
  actorKey,
  buildAncestorTaskGids,
  createTaskSession,
  normalizeAsanaTask,
  stopTaskSession,
  summarizeTaskTime,
} from '../../utils/asanaTaskTracking.js';

const STORAGE_KEY = 'asanaTaskTracking';
const HISTORY_CAP = 5000;
const COMPLETE_TASK_FUNCTION = 'asana-task-action';

let injectedDeps = {};
let opChain = Promise.resolve();

export function configureAsanaService(deps = {}) {
  injectedDeps = { ...injectedDeps, ...deps };
}

function serialized(fn) {
  const run = opChain.then(fn, fn);
  opChain = run.then(() => undefined, () => undefined);
  return run;
}

function emptyState() {
  return { version: 1, active: {}, history: [], relations: {} };
}

async function readState() {
  const { [STORAGE_KEY]: raw } = await getStorage(STORAGE_KEY);
  return {
    ...emptyState(),
    ...(raw || {}),
    active: raw?.active && typeof raw.active === 'object' ? raw.active : {},
    history: Array.isArray(raw?.history) ? raw.history : [],
    relations: raw?.relations && typeof raw.relations === 'object' ? raw.relations : {},
  };
}

async function writeState(state) {
  state.history = state.history.slice(-HISTORY_CAP);
  await setStorage({ [STORAGE_KEY]: state });
}

function updateRelation(state, task) {
  state.relations[task.taskGid] = {
    taskGid: task.taskGid,
    taskName: task.taskName,
    parentTaskGid: task.parentTaskGid || state.relations[task.taskGid]?.parentTaskGid || null,
    parentTaskName: task.parentTaskName || state.relations[task.taskGid]?.parentTaskName || null,
    projectGid: task.projectGid || state.relations[task.taskGid]?.projectGid || null,
    projectName: task.projectName || state.relations[task.taskGid]?.projectName || null,
    updatedAt: new Date().toISOString(),
  };
}

async function mirrorTaskContext(task, state) {
  const sessions = [...Object.values(state.active), ...state.history];
  const localTask = await upsertExternalTaskContext({
    provider: 'asana',
    externalId: task.taskGid,
    name: task.taskName,
    url: task.taskUrl,
    workspaceId: task.workspaceGid,
    projectId: task.projectGid,
    projectName: task.projectName,
    parentExternalId: task.parentTaskGid,
    parentName: task.parentTaskName,
    focusMode: task.focusMode,
    attention: summarizeTaskTime(task.taskGid, sessions),
  });

  // Refresh any ancestor mirrors the user has already encountered. Missing
  // ancestors are intentionally not created from a breadcrumb alone.
  for (const ancestorGid of buildAncestorTaskGids(task.taskGid, state.relations)) {
    await updateExternalTaskState(externalTaskId('asana', ancestorGid), {
      attention: summarizeTaskTime(ancestorGid, sessions),
    });
  }
  return localTask;
}

async function syncTaskContext(message, sender) {
  const task = normalizeAsanaTask(message.task || message);
  if (!task) return { error: 'A valid Asana task GID is required' };

  const state = await readState();
  updateRelation(state, task);
  await writeState(state);
  const localTask = await mirrorTaskContext(task, state);

  const tabId = sender?.tab?.id;
  if (tabId) {
    const tabs = await getTabData();
    const current = tabs[tabId] || {
      url: sender.tab.url || task.taskUrl || '',
      title: sender.tab.title || task.taskName,
      openedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      activeTime: 0,
    };
    const mayReplace = task.focusMode || !current.context || current.contextSource?.startsWith?.('asana');
    tabs[tabId] = {
      ...current,
      url: sender.tab.url || task.taskUrl || current.url,
      title: sender.tab.title || task.taskName,
      ...(mayReplace ? { context: task.taskName, intent: task.taskName } : {}),
      contextSource: mayReplace ? (task.focusMode ? 'asana_focus' : 'asana_auto') : current.contextSource,
      category: 'work',
      asanaTaskGid: task.taskGid,
      asanaParentTaskGid: task.parentTaskGid,
      asanaAncestorTaskGids: buildAncestorTaskGids(task.taskGid, state.relations),
      asanaTaskName: task.taskName,
      asanaFocusMode: task.focusMode,
      startedAt: current.startedAt || new Date().toISOString(),
    };
    await setStorage({ tabs });
    broadcastAll({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
  }

  return { ...statusForTask(task.taskGid, state), localTaskId: localTask.id, localTask };
}

async function startTimer(message, sender) {
  const task = normalizeAsanaTask(message.task || message);
  if (!task) return { error: 'A valid Asana task GID is required' };
  const actorType = message.actorType === 'agent' ? 'agent' : 'human';
  const key = actorKey(actorType, message.agentName);
  const state = await readState();
  updateRelation(state, task);

  const alreadyActive = state.active[key];
  if (alreadyActive?.taskGid === task.taskGid) {
    const localTask = await mirrorTaskContext(task, state);
    return { success: true, idempotent: true, session: alreadyActive, localTaskId: localTask.id, ...statusForTask(task.taskGid, state) };
  }
  if (alreadyActive) await closeActiveSession(state, key);

  let agentSessionId = null;
  if (actorType === 'agent') {
    const response = await injectedDeps.agentSessionService?.handleMessage?.('START_AGENT_SESSION', {
      scope: 'tab',
      tabId: sender?.tab?.id ?? null,
      windowId: sender?.tab?.windowId ?? null,
      agentName: message.agentName || 'Agent',
      source: 'manual',
    });
    agentSessionId = response?.session?.id || null;
  }

  const engine = await injectedDeps.getFocusEngine?.();
  const session = createTaskSession({
    task,
    actorType,
    agentName: message.agentName,
    relations: state.relations,
    explicitAncestorTaskGids: message.ancestorTaskGids || [],
    tabId: sender?.tab?.id ?? null,
    windowId: sender?.tab?.windowId ?? null,
    focusId: engine?.activeFocusId || null,
    agentSessionId,
  });
  state.active[key] = session;
  await writeState(state);

  const cloud = await mirrorStart(session);
  if (cloud) {
    state.active[key] = { ...state.active[key], ...cloud };
    await writeState(state);
  }

  const localTask = await mirrorTaskContext(task, state);

  broadcastAll({ type: 'ASANA_TASK_TRACKING_UPDATED', taskGid: task.taskGid });
  return { success: true, session: state.active[key], localTaskId: localTask.id, ...statusForTask(task.taskGid, state) };
}

async function stopTimer(message) {
  const state = await readState();
  let key = message.actorKey;
  if (!key) key = actorKey(message.actorType === 'agent' ? 'agent' : 'human', message.agentName);
  const active = state.active[key];
  if (!active) return { success: true, idempotent: true, ...statusForTask(message.taskGid, state) };

  const taskGid = active.taskGid;
  const stopped = await closeActiveSession(state, key);
  await writeState(state);
  const relation = state.relations[taskGid] || {};
  await mirrorTaskContext({
    taskGid,
    taskName: relation.taskName || active.taskName,
    taskUrl: active.taskUrl,
    workspaceGid: active.workspaceGid,
    projectGid: relation.projectGid || active.projectGid,
    projectName: relation.projectName || active.projectName,
    parentTaskGid: relation.parentTaskGid || active.parentTaskGid,
    parentTaskName: relation.parentTaskName || active.parentTaskName,
    focusMode: false,
  }, state);
  broadcastAll({ type: 'ASANA_TASK_TRACKING_UPDATED', taskGid });
  return { success: true, session: stopped, ...statusForTask(message.taskGid || taskGid, state) };
}

async function closeActiveSession(state, key) {
  const active = state.active[key];
  if (!active) return null;
  const stopped = stopTaskSession(active);
  delete state.active[key];
  state.history.push(stopped);
  if (stopped.agentSessionId) {
    await injectedDeps.agentSessionService?.handleMessage?.('END_AGENT_SESSION', { id: stopped.agentSessionId });
  }
  const cloud = await mirrorStop(stopped);
  if (cloud) Object.assign(stopped, cloud);
  return stopped;
}

async function setTaskFocus(message) {
  const task = normalizeAsanaTask(message.task || message);
  if (!task) return { error: 'A valid Asana task GID is required' };
  const state = await readState();
  updateRelation(state, task);
  await writeState(state);
  const localTask = await mirrorTaskContext(task, state);

  const engine = await injectedDeps.getFocusEngine?.();
  const existing = Object.values(engine?.items || {}).find(item =>
    item?.tags?.asanaTaskGid === task.taskGid &&
    item.focusState !== 'completed' && item.funnelStage !== 'resolved'
  );
  if (existing) {
    if (existing.tags?.task !== localTask.id) {
      engine.items[existing.id] = {
        ...existing,
        tags: { ...existing.tags, task: localTask.id },
      };
      await injectedDeps.setFocusEngine?.(engine);
    }
    const next = await injectedDeps.switchFocus?.(existing.id);
    return { success: true, reused: true, focusId: existing.id, focusEngine: next };
  }

  const ancestorTaskGids = buildAncestorTaskGids(task.taskGid, state.relations, message.ancestorTaskGids || []);
  const next = await injectedDeps.startFocus?.(task.taskName, message.timerMinutes || 15, {
    task: localTask.id,
    asanaTaskGid: task.taskGid,
    asanaTaskUrl: task.taskUrl,
    asanaParentTaskGid: task.parentTaskGid,
    asanaAncestorTaskGids: ancestorTaskGids,
    asanaProjectGid: task.projectGid,
    asanaProjectName: task.projectName,
  });
  return { success: true, reused: false, focusId: next?.activeFocusId || null, focusEngine: next };
}

async function completeAsanaTask(message) {
  const taskGid = String(message.taskGid || message.externalId || '').trim();
  if (!/^\d+$/.test(taskGid)) return { success: false, error: 'A valid Asana task GID is required' };
  if (!injectedDeps.supabase?.functions?.invoke) {
    return { success: false, error: 'Asana completion is not configured' };
  }

  const { data: authData } = await injectedDeps.supabase.auth.getSession();
  if (!authData?.session) {
    return { success: false, error: 'Sign in to Tabatha before completing a task in Asana' };
  }

  const { data, error } = await injectedDeps.supabase.functions.invoke(COMPLETE_TASK_FUNCTION, {
    body: { taskGid, completed: true },
  });
  if (error || data?.error) {
    return { success: false, error: data?.error || error?.message || 'Asana completion failed' };
  }

  const localTaskId = message.taskId || `task_asana_${taskGid}`;
  await updateExternalTaskState(localTaskId, {
    remoteStatus: 'completed',
    remoteCompletedAt: new Date().toISOString(),
  });
  return { success: true, taskGid, remoteStatus: 'completed' };
}

function statusForTask(taskGid, state, now = Date.now()) {
  const sessions = [...Object.values(state.active), ...state.history];
  return {
    taskGid,
    active: Object.values(state.active),
    activeForTask: Object.values(state.active).filter(session => session.taskGid === taskGid),
    summary: summarizeTaskTime(taskGid, sessions, now),
    relation: state.relations[taskGid] || null,
  };
}

async function getStatus(message) {
  return statusForTask(message.taskGid, await readState());
}

async function cloudIdentity() {
  try {
    const [{ _browserProfile }, auth] = await Promise.all([
      getStorage('_browserProfile'),
      injectedDeps.supabase?.auth?.getSession?.(),
    ]);
    const userId = auth?.data?.session?.user?.id || _browserProfile?.id || 'local';
    return { userGid: `tabatha:${userId}`, userName: 'Tabatha user' };
  } catch {
    return { userGid: 'tabatha:local', userName: 'Tabatha user' };
  }
}

async function mirrorStart(session) {
  if (!injectedDeps.supabase) return null;
  try {
    const identity = await cloudIdentity();
    const row = {
      task_gid: session.taskGid,
      source_task_gid: session.taskGid,
      parent_task_gid: session.parentTaskGid,
      ancestor_task_gids: session.ancestorTaskGids,
      workspace_gid: session.workspaceGid || 'unknown',
      user_gid: identity.userGid,
      user_name: session.controller === 'ai-agent' ? `Agent: ${session.agentName}` : identity.userName,
      started_at: session.startedAt,
      controller: session.controller,
      agent_name: session.agentName,
      tabatha_focus_id: session.focusId,
      metadata: { task_name: session.taskName, task_url: session.taskUrl, project_gid: session.projectGid },
    };
    const { data, error } = await injectedDeps.supabase
      .from('flux_time_entries')
      .insert(row)
      .select('id')
      .single();
    if (error) throw error;
    return { cloudRowId: data?.id || null, cloudSyncState: 'active' };
  } catch (error) {
    console.warn('[Tabatha:Asana] Cloud timer start mirror failed; local timer remains active', error?.message || error);
    return { cloudSyncState: 'pending' };
  }
}

async function mirrorStop(session) {
  if (!injectedDeps.supabase || !session.cloudRowId) return null;
  try {
    const { error } = await injectedDeps.supabase
      .from('flux_time_entries')
      .update({ stopped_at: session.stoppedAt })
      .eq('id', session.cloudRowId);
    if (error) throw error;
    return { cloudSyncState: 'synced' };
  } catch (error) {
    console.warn('[Tabatha:Asana] Cloud timer stop mirror failed; local history is complete', error?.message || error);
    return { cloudSyncState: 'pending-stop' };
  }
}

export async function handleMessage(type, message, sender) {
  switch (type) {
    case 'SYNC_ASANA_TASK_CONTEXT':
      return serialized(() => syncTaskContext(message, sender));
    case 'GET_ASANA_TASK_STATUS':
      return serialized(() => getStatus(message));
    case 'START_ASANA_TASK_TIMER':
      return serialized(() => startTimer(message, sender));
    case 'STOP_ASANA_TASK_TIMER':
      return serialized(() => stopTimer(message));
    case 'SET_ASANA_TASK_FOCUS':
      return serialized(() => setTaskFocus(message));
    case 'COMPLETE_ASANA_TASK':
      return serialized(() => completeAsanaTask(message));
    default:
      return undefined;
  }
}
