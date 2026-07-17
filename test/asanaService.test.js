import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

installChromeMock();
const asana = await import('../src/background/services/asanaService.js');
const taskService = await import('../src/background/services/taskService.js');

function setup({ store = {}, engine = { activeFocusId: null, items: {}, history: [] }, supabase = null } = {}) {
  const chrome = installChromeMock({
    tabs: { 7: { url: 'https://app.asana.com/0/10/300?focus=true', title: 'Nested task — Asana', active: true, windowId: 2 } },
    store: { tabs: {}, ...store },
  });
  chrome.tabs.sendMessage = async () => undefined;
  const agentCalls = [];
  const persistedEngines = [];
  asana.configureAsanaService({
    supabase,
    getFocusEngine: async () => engine,
    setFocusEngine: async (next) => { persistedEngines.push(next); return next; },
    startFocus: async (label, timerMinutes, tags) => {
      const id = 'focus-new';
      engine.items[id] = { id, label, timerMinutes, tags, focusState: 'active', funnelStage: 'addressing' };
      engine.activeFocusId = id;
      return engine;
    },
    switchFocus: async (id) => { engine.activeFocusId = id; return engine; },
    agentSessionService: {
      async handleMessage(type, message) {
        agentCalls.push({ type, message });
        if (type === 'START_AGENT_SESSION') return { session: { id: 'agent-span-1' } };
        return { ok: true };
      },
    },
  });
  return { chrome, engine, agentCalls, persistedEngines, sender: { tab: { id: 7, windowId: 2, url: 'https://app.asana.com/0/10/300?focus=true', title: 'Nested task — Asana' } } };
}

const task = {
  taskGid: '300',
  taskName: 'Nested task',
  taskUrl: 'https://app.asana.com/0/10/300?focus=true',
  projectGid: '10',
  parentTaskGid: '200',
  parentTaskName: 'Parent task',
  focusMode: true,
};

test('SYNC_ASANA_TASK_CONTEXT updates the InBar context and records parent relation', async () => {
  const { chrome, sender } = setup();
  const result = await asana.handleMessage('SYNC_ASANA_TASK_CONTEXT', { task }, sender);
  assert.equal(result.relation.parentTaskGid, '200');
  assert.equal(chrome._storage.tabs[7].context, 'Nested task');
  assert.equal(chrome._storage.tabs[7].contextSource, 'asana_focus');
  assert.equal(chrome._storage.tabs[7].asanaParentTaskGid, '200');
  assert.equal(result.localTaskId, 'task_asana_300');
  assert.equal(chrome._storage.tabathaOrg.tasks.task_asana_300.contextOnly, true);
  assert.equal(chrome._storage.tabathaOrg.tasks.task_asana_300.externalContext.parentName, 'Parent task');
});

test('context refresh preserves Tabatha task completion and user-owned fields', async () => {
  const { chrome, sender } = setup();
  await asana.handleMessage('SYNC_ASANA_TASK_CONTEXT', { task }, sender);
  await taskService.handleMessage('UPDATE_TASK', {
    taskId: 'task_asana_300',
    updates: { status: 'completed', completedAt: '2026-07-17T12:00:00.000Z', description: 'My local note' },
  });
  await asana.handleMessage('SYNC_ASANA_TASK_CONTEXT', { task: { ...task, taskName: 'Renamed in Asana' } }, sender);
  const mirrored = chrome._storage.tabathaOrg.tasks.task_asana_300;
  assert.equal(mirrored.name, 'Renamed in Asana');
  assert.equal(mirrored.status, 'completed');
  assert.equal(mirrored.description, 'My local note');
});

test('human and named-agent task timers run concurrently and agent span closes with its timer', async () => {
  const { sender, agentCalls } = setup();
  await asana.handleMessage('SYNC_ASANA_TASK_CONTEXT', { task }, sender);
  await asana.handleMessage('START_ASANA_TASK_TIMER', { task, actorType: 'human' }, sender);
  const started = await asana.handleMessage('START_ASANA_TASK_TIMER', { task, actorType: 'agent', agentName: 'Caspera' }, sender);
  assert.equal(started.activeForTask.length, 2);
  assert.ok(started.activeForTask.some(s => s.actorKey === 'human'));
  assert.ok(started.activeForTask.some(s => s.actorKey === 'agent:caspera'));
  assert.equal(agentCalls[0].type, 'START_AGENT_SESSION');

  await asana.handleMessage('STOP_ASANA_TASK_TIMER', { taskGid: '300', actorKey: 'agent:caspera' }, sender);
  assert.equal(agentCalls.at(-1).type, 'END_AGENT_SESSION');
  const status = await asana.handleMessage('GET_ASANA_TASK_STATUS', { taskGid: '300' }, sender);
  assert.equal(status.activeForTask.length, 1);
  assert.equal(status.activeForTask[0].actorKey, 'human');
});

test('child attention refreshes an existing parent task mirror without creating unknown ancestors', async () => {
  const { chrome, sender } = setup();
  await asana.handleMessage('SYNC_ASANA_TASK_CONTEXT', {
    task: { taskGid: '200', taskName: 'Parent task', taskUrl: 'https://app.asana.com/0/10/200' },
  }, sender);
  await asana.handleMessage('SYNC_ASANA_TASK_CONTEXT', { task }, sender);
  await asana.handleMessage('START_ASANA_TASK_TIMER', { task, actorType: 'human' }, sender);

  assert.equal(chrome._storage.tabathaOrg.tasks.task_asana_200.externalContext.attention.activeCount, 1);
  assert.equal(chrome._storage.tabathaOrg.tasks.task_asana_100, undefined);
});

test('SET_ASANA_TASK_FOCUS creates a linked focus then reuses it', async () => {
  const { sender } = setup();
  const created = await asana.handleMessage('SET_ASANA_TASK_FOCUS', { task }, sender);
  assert.equal(created.reused, false);
  assert.equal(created.focusEngine.items[created.focusId].tags.asanaTaskGid, '300');
  assert.equal(created.focusEngine.items[created.focusId].tags.task, 'task_asana_300');
  assert.deepEqual(created.focusEngine.items[created.focusId].tags.asanaAncestorTaskGids, ['200']);

  const reused = await asana.handleMessage('SET_ASANA_TASK_FOCUS', { task }, sender);
  assert.equal(reused.reused, true);
  assert.equal(reused.focusId, created.focusId);
});

test('SET_ASANA_TASK_FOCUS upgrades a pre-mirror focus link to the local task identity', async () => {
  const engine = {
    activeFocusId: null,
    history: [],
    items: {
      legacy: {
        id: 'legacy',
        label: 'Nested task',
        tags: { task: 'asana:300', asanaTaskGid: '300' },
        focusState: 'paused',
        funnelStage: 'focus',
      },
    },
  };
  const { sender, persistedEngines } = setup({ engine });
  const result = await asana.handleMessage('SET_ASANA_TASK_FOCUS', { task }, sender);
  assert.equal(result.reused, true);
  assert.equal(engine.items.legacy.tags.task, 'task_asana_300');
  assert.equal(persistedEngines.length, 1);
});

test('COMPLETE_ASANA_TASK requires an explicit signed-in remote action and records source state', async () => {
  const calls = [];
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    functions: {
      invoke: async (name, options) => {
        calls.push({ name, options });
        return { data: { ok: true, taskGid: '300', completed: true }, error: null };
      },
    },
  };
  const { chrome, sender } = setup({ supabase });
  await asana.handleMessage('SYNC_ASANA_TASK_CONTEXT', { task }, sender);
  const result = await asana.handleMessage('COMPLETE_ASANA_TASK', {
    taskId: 'task_asana_300',
    taskGid: '300',
  }, sender);

  assert.equal(result.success, true);
  assert.equal(calls[0].name, 'asana-task-action');
  assert.deepEqual(calls[0].options.body, { taskGid: '300', completed: true });
  assert.equal(chrome._storage.tabathaOrg.tasks.task_asana_300.externalContext.remoteStatus, 'completed');
});
