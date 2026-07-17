// Tabatha — pure Asana task-time primitives.
//
// A stint always belongs directly to the task where it was started. Ancestor
// GIDs are stored separately so reports can roll the same stint up to every
// parent without copying rows or double-counting within a single task total.

export const ASANA_TRACKING_VERSION = 1;

export function normalizeAsanaTask(task = {}) {
  const taskGid = cleanGid(task.taskGid);
  if (!taskGid) return null;

  const parentTaskGid = cleanGid(task.parentTaskGid);
  return {
    taskGid,
    taskName: cleanText(task.taskName) || `Asana task ${taskGid}`,
    taskUrl: cleanText(task.taskUrl) || null,
    workspaceGid: cleanGid(task.workspaceGid),
    projectGid: cleanGid(task.projectGid),
    projectName: cleanText(task.projectName) || null,
    parentTaskGid: parentTaskGid && parentTaskGid !== taskGid ? parentTaskGid : null,
    parentTaskName: cleanText(task.parentTaskName) || null,
    focusMode: !!task.focusMode,
  };
}

export function actorKey(actorType, agentName) {
  if (actorType === 'agent') {
    return `agent:${(cleanText(agentName) || 'Agent').toLocaleLowerCase()}`;
  }
  return 'human';
}

export function buildAncestorTaskGids(taskGid, relations = {}, explicit = []) {
  const source = cleanGid(taskGid);
  const seen = new Set(source ? [source] : []);
  const ancestors = [];

  for (const value of explicit || []) {
    const gid = cleanGid(value);
    if (gid && !seen.has(gid)) {
      seen.add(gid);
      ancestors.push(gid);
    }
  }

  let cursor = cleanGid(relations?.[source]?.parentTaskGid);
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    ancestors.push(cursor);
    cursor = cleanGid(relations?.[cursor]?.parentTaskGid);
  }

  return ancestors;
}

export function createTaskSession({
  task,
  actorType = 'human',
  agentName = null,
  relations = {},
  explicitAncestorTaskGids = [],
  now = Date.now(),
  tabId = null,
  windowId = null,
  focusId = null,
  agentSessionId = null,
} = {}) {
  const normalized = normalizeAsanaTask(task);
  if (!normalized) throw new Error('A valid Asana task GID is required');
  const controller = actorType === 'agent' ? 'ai-agent' : 'human';
  const normalizedAgentName = controller === 'ai-agent' ? cleanText(agentName) || 'Agent' : null;

  return {
    id: `asana_${now}_${Math.random().toString(36).slice(2, 8)}`,
    version: ASANA_TRACKING_VERSION,
    ...normalized,
    ancestorTaskGids: buildAncestorTaskGids(
      normalized.taskGid,
      relations,
      [normalized.parentTaskGid, ...explicitAncestorTaskGids]
    ),
    actorKey: actorKey(actorType, normalizedAgentName),
    controller,
    agentName: normalizedAgentName,
    startedAt: new Date(now).toISOString(),
    stoppedAt: null,
    durationMs: null,
    tabId,
    windowId,
    focusId,
    agentSessionId,
    cloudRowId: null,
    cloudSyncState: 'pending',
  };
}

export function stopTaskSession(session, now = Date.now()) {
  if (!session || session.stoppedAt) return session;
  const startedMs = Date.parse(session.startedAt);
  return {
    ...session,
    stoppedAt: new Date(now).toISOString(),
    durationMs: Math.max(0, now - (Number.isFinite(startedMs) ? startedMs : now)),
  };
}

export function sessionDurationMs(session, now = Date.now()) {
  if (!session) return 0;
  if (Number.isFinite(session.durationMs)) return Math.max(0, session.durationMs);
  const start = Date.parse(session.startedAt);
  const end = session.stoppedAt ? Date.parse(session.stoppedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

export function summarizeTaskTime(taskGid, sessions = [], now = Date.now()) {
  const gid = cleanGid(taskGid);
  const result = {
    taskGid: gid,
    directMs: 0,
    rolledUpMs: 0,
    totalMs: 0,
    humanMs: 0,
    agentMs: 0,
    activeCount: 0,
  };
  if (!gid) return result;

  for (const session of sessions || []) {
    const direct = cleanGid(session?.taskGid) === gid;
    const rolled = !direct && (session?.ancestorTaskGids || []).map(cleanGid).includes(gid);
    if (!direct && !rolled) continue;

    const duration = sessionDurationMs(session, now);
    if (direct) result.directMs += duration;
    if (rolled) result.rolledUpMs += duration;
    result.totalMs += duration;
    if (session.controller === 'ai-agent') result.agentMs += duration;
    else result.humanMs += duration;
    if (!session.stoppedAt) result.activeCount += 1;
  }

  return result;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanGid(value) {
  const text = cleanText(value);
  return /^\d+$/.test(text) ? text : null;
}
