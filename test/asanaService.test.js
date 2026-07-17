import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

installChromeMock();
const asana = await import('../src/background/services/asanaService.js');

function setup({ store = {}, engine = { activeFocusId: null, items: {}, history: [] } } = {}) {
  const chrome = installChromeMock({
    tabs: { 7: { url: 'https://app.asana.com/0/10/300?focus=true', title: 'Nested task — Asana', active: true, windowId: 2 } },
    store: { tabs: {}, ...store },
  });
  chrome.tabs.sendMessage = async () => undefined;
  const agentCalls = [];
  asana.configureAsanaService({
    supabase: null,
    getFocusEngine: async () => engine,
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
  return { chrome, engine, agentCalls, sender: { tab: { id: 7, windowId: 2, url: 'https://app.asana.com/0/10/300?focus=true', title: 'Nested task — Asana' } } };
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

test('SET_ASANA_TASK_FOCUS creates a linked focus then reuses it', async () => {
  const { sender } = setup();
  const created = await asana.handleMessage('SET_ASANA_TASK_FOCUS', { task }, sender);
  assert.equal(created.reused, false);
  assert.equal(created.focusEngine.items[created.focusId].tags.asanaTaskGid, '300');
  assert.deepEqual(created.focusEngine.items[created.focusId].tags.asanaAncestorTaskGids, ['200']);

  const reused = await asana.handleMessage('SET_ASANA_TASK_FOCUS', { task }, sender);
  assert.equal(reused.reused, true);
  assert.equal(reused.focusId, created.focusId);
});
