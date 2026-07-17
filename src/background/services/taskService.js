import { STAGE_ORDER } from '../constants.js';
import { getSettings, getStorage, setStorage } from './storageService.js';
import { broadcastToExtension } from './notificationService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_TASKS':
      return { tasks: await getTasks() };

    case 'CREATE_TASK':
      return createTask(message);

    case 'UPDATE_TASK':
      return updateTask(message);

    case 'DELETE_TASK':
      return deleteTask(message);

    default:
      return undefined;
  }
}

/**
 * Upsert a deliberately small external-task mirror into Tabatha's task store.
 * The mirror carries context needed for attention/focus without importing the
 * source system's project-management surface (assignees, due dates, comments,
 * sections, dependencies, and custom fields intentionally stay external).
 */
export async function upsertExternalTaskContext(context = {}) {
  const provider = cleanExternalToken(context.provider);
  const externalId = cleanExternalToken(context.externalId);
  if (!provider || !externalId) throw new Error('External task provider and ID are required');

  const { tabathaOrg } = await getStorage('tabathaOrg');
  const org = normalizeOrg(tabathaOrg);
  const id = externalTaskId(provider, externalId);
  const existing = org.tasks[id] || null;
  const now = context.lastSeenAt || new Date().toISOString();
  const externalContext = {
    ...(existing?.externalContext || {}),
    provider,
    externalId,
    url: context.url || existing?.externalContext?.url || null,
    workspaceId: context.workspaceId || existing?.externalContext?.workspaceId || null,
    projectId: context.projectId || existing?.externalContext?.projectId || null,
    projectName: context.projectName || existing?.externalContext?.projectName || null,
    parentExternalId: context.parentExternalId || existing?.externalContext?.parentExternalId || null,
    parentName: context.parentName || existing?.externalContext?.parentName || null,
    focusMode: !!context.focusMode,
    lastSeenAt: now,
    ...(context.attention ? { attention: context.attention } : {}),
  };

  const task = {
    id,
    description: existing?.description || '',
    projectId: existing?.projectId || null,
    clientId: existing?.clientId || null,
    status: existing?.status || 'active',
    funnelStage: existing?.funnelStage || 'unsorted',
    linkedIntents: existing?.linkedIntents || [],
    createdAt: existing?.createdAt || now,
    completedAt: existing?.completedAt || null,
    archived: existing?.archived || false,
    ...existing,
    name: context.name || existing?.name || `${provider} task ${externalId}`,
    source: 'external-context',
    contextOnly: true,
    externalContext,
    updatedAt: now,
  };

  // Compatibility aliases used by the existing task editor and older links.
  if (provider === 'asana') {
    task.asanaGid = externalId;
    task.asanaTaskGid = externalId;
    task.asanaUrl = externalContext.url;
  }

  org.tasks[id] = task;
  await setStorage({ tabathaOrg: org });
  broadcastTasksUpdated(getActiveOrgTasks(org));
  return task;
}

export async function updateExternalTaskState(taskId, updates = {}) {
  const { tabathaOrg } = await getStorage('tabathaOrg');
  const org = normalizeOrg(tabathaOrg);
  const task = org.tasks[taskId];
  if (!task?.externalContext) return null;

  org.tasks[taskId] = {
    ...task,
    externalContext: { ...task.externalContext, ...updates },
    updatedAt: new Date().toISOString(),
  };
  await setStorage({ tabathaOrg: org });
  broadcastTasksUpdated(getActiveOrgTasks(org));
  return org.tasks[taskId];
}

export function externalTaskId(provider, externalId) {
  return `task_${cleanExternalToken(provider)}_${cleanExternalToken(externalId)}`;
}

async function getTasks() {
  const { org } = await coldStoreArchivedTasks();
  const { tasks: legacyTasks } = await getStorage('tasks');
  const orgTasks = getActiveOrgTasks(org);
  const orgIds = new Set(orgTasks.map(t => t.id));
  return [...orgTasks, ...(legacyTasks || []).filter(t => !orgIds.has(t.id))];
}

async function createTask(message) {
  const { tabathaOrg } = await getStorage('tabathaOrg');
  const org = normalizeOrg(tabathaOrg);
  const id = `task_${Date.now()}`;
  const newTask = {
    id,
    name: message.name,
    description: message.description || '',
    projectId: message.projectId || null,
    clientId: message.clientId || null,
    status: 'active',
    funnelStage: 'unsorted',
    linkedIntents: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
    archived: false,
  };

  org.tasks[id] = newTask;
  await setStorage({ tabathaOrg: org });
  broadcastTasksUpdated(getActiveOrgTasks(org));
  return { success: true, task: newTask };
}

async function updateTask(message) {
  const { org } = await coldStoreArchivedTasks();
  const task = org.tasks[message.taskId];

  if (task) {
    const updates = normalizeArchiveUpdates(task, message.updates || {});
    const transition = canTransitionStage(task, updates.funnelStage, !!message.confirmed);
    if (transition.error) return transition;

    org.tasks[message.taskId] = { ...task, ...updates };
    await setStorage({ tabathaOrg: org });
    await coldStoreArchivedTasks();
    broadcastTasksUpdated(getActiveOrgTasks(org));
    return { success: true };
  }

  const { tasks: legacyAll } = await getStorage('tasks');
  const taskArr = legacyAll || [];
  const idx = taskArr.findIndex(t => t.id === message.taskId);
  if (idx >= 0) {
    taskArr[idx] = { ...taskArr[idx], ...message.updates };
    await setStorage({ tasks: taskArr });
    broadcastTasksUpdated(taskArr);
    return { success: true };
  }

  return { error: 'Task not found' };
}

async function deleteTask(message) {
  const { org } = await coldStoreArchivedTasks();

  if (org.tasks[message.taskId]) {
    org.tasks[message.taskId].archived = true;
    org.tasks[message.taskId].archivedAt = org.tasks[message.taskId].archivedAt || new Date().toISOString();
    await setStorage({ tabathaOrg: org });
    await coldStoreArchivedTasks();
    broadcastTasksUpdated(getActiveOrgTasks(org));
    return { success: true };
  }

  const { tasks: tAll } = await getStorage('tasks');
  const filtered = (tAll || []).filter(t => t.id !== message.taskId);
  await setStorage({ tasks: filtered });
  broadcastTasksUpdated(filtered);
  return { success: true };
}

export function canTransitionStage(task, nextStage, confirmed = false) {
  if (nextStage === undefined) return {};

  const from = task.funnelStage || 'unsorted';
  const to = nextStage;
  const fromOrder = STAGE_ORDER[from] ?? 0;
  const toOrder = STAGE_ORDER[to] ?? 0;
  const isBackward = toOrder < fromOrder;

  if (to === 'unsorted' && from !== 'unsorted') {
    return { error: 'Tasks cannot roll back to unsorted', needsConfirm: false };
  }

  if (to === 'focus' && from === 'todo') {
    if (!(task.name && task.name.trim()) || !(task.description && task.description.trim())) {
      return { error: 'Task needs a name and description before entering focus', needsConfirm: false };
    }
  }

  if (to === 'addressing' && (from === 'focus' || from === 'todo')) {
    if (!confirmed) {
      return { error: 'Moving to addressing will make this your active task. Confirm?', needsConfirm: true };
    }
  }

  if (isBackward && !(from === 'roadblocked' && to === 'focus')) {
    if (!confirmed) {
      return { error: `Rolling task back from ${from} to ${to} requires confirmation`, needsConfirm: true };
    }
  }

  return {};
}

async function coldStoreArchivedTasks(now = new Date()) {
  const [{ tabathaOrg, _archivedTasks }, settings] = await Promise.all([
    getStorage(['tabathaOrg', '_archivedTasks']),
    getSettings()
  ]);
  const org = normalizeOrg(tabathaOrg);
  const coldAfterDays = settings?.storage?.archivedTasksColdAfterDays;
  if (!Number.isFinite(coldAfterDays) || coldAfterDays < 0) return { org, moved: 0 };

  const cutoffMs = now.getTime() - coldAfterDays * DAY_MS;
  const archivedTasks = normalizeArchivedTasks(_archivedTasks);
  let moved = 0;
  let changed = false;

  for (const [id, task] of Object.entries(org.tasks || {})) {
    if (!task?.archived) continue;

    if (!task.archivedAt) {
      task.archivedAt = now.toISOString();
      changed = true;
    }

    const archivedAtMs = Date.parse(task.archivedAt);
    if (Number.isFinite(archivedAtMs) && archivedAtMs <= cutoffMs) {
      archivedTasks[id] = { ...task, coldStoredAt: now.toISOString() };
      delete org.tasks[id];
      moved++;
      changed = true;
    }
  }

  if (changed) {
    await setStorage({ tabathaOrg: org, _archivedTasks: archivedTasks });
  }

  return { org, moved };
}

function normalizeOrg(org) {
  return org || { clients: {}, projects: {}, tasks: {}, operations: {}, initiatives: {} };
}

function normalizeArchivedTasks(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (!Array.isArray(value)) return {};

  return value.reduce((acc, task) => {
    if (task?.id) acc[task.id] = task;
    return acc;
  }, {});
}

function normalizeArchiveUpdates(task, updates) {
  if (updates.archived === true && !task.archived && !updates.archivedAt) {
    return { ...updates, archivedAt: new Date().toISOString() };
  }
  if (updates.archived === false) {
    return { ...updates, archivedAt: null };
  }
  return updates;
}

function getActiveOrgTasks(org) {
  return Object.values(org?.tasks || {}).filter(t => !t.archived);
}

function broadcastTasksUpdated(tasks) {
  broadcastToExtension({ type: 'TASKS_UPDATED', tasks });
}

function cleanExternalToken(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : '';
}
