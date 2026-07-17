import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAsanaUrl } from '../src/utils/taskUrlResolver.js';
import {
  actorKey,
  buildAncestorTaskGids,
  createTaskSession,
  stopTaskSession,
  summarizeTaskTime,
} from '../src/utils/asanaTaskTracking.js';

test('Asana URL parser identifies focus=true and /f task views', () => {
  const query = parseAsanaUrl('https://app.asana.com/0/123/456?focus=true');
  assert.equal(query.taskGid, '456');
  assert.equal(query.focusMode, true);

  const suffix = parseAsanaUrl('https://app.asana.com/0/123/456/f');
  assert.equal(suffix.taskGid, '456');
  assert.equal(suffix.focusMode, true);

  const ordinary = parseAsanaUrl('https://app.asana.com/0/123/456');
  assert.equal(ordinary.focusMode, false);
});

test('ancestor resolution follows nested relations once and breaks cycles', () => {
  const relations = {
    '300': { parentTaskGid: '200' },
    '200': { parentTaskGid: '100' },
    '100': { parentTaskGid: '300' },
  };
  assert.deepEqual(buildAncestorTaskGids('300', relations), ['200', '100']);
  assert.deepEqual(buildAncestorTaskGids('300', relations, ['200', '100']), ['200', '100']);
});

test('parent rollup counts each child stint once and preserves controller totals', () => {
  const base = Date.UTC(2026, 6, 17, 12, 0, 0);
  const relations = { '200': { parentTaskGid: '100' }, '300': { parentTaskGid: '200' } };
  const human = stopTaskSession(createTaskSession({
    task: { taskGid: '200', taskName: 'Child' },
    relations,
    actorType: 'human',
    now: base,
  }), base + 10 * 60_000);
  const agent = stopTaskSession(createTaskSession({
    task: { taskGid: '300', taskName: 'Grandchild' },
    relations,
    actorType: 'agent',
    agentName: 'Caspera',
    now: base,
  }), base + 20 * 60_000);

  const parent = summarizeTaskTime('100', [human, agent], base + 30 * 60_000);
  assert.equal(parent.directMs, 0);
  assert.equal(parent.rolledUpMs, 30 * 60_000);
  assert.equal(parent.totalMs, 30 * 60_000);
  assert.equal(parent.humanMs, 10 * 60_000);
  assert.equal(parent.agentMs, 20 * 60_000);

  const child = summarizeTaskTime('200', [human, agent], base + 30 * 60_000);
  assert.equal(child.directMs, 10 * 60_000);
  assert.equal(child.rolledUpMs, 20 * 60_000);
  assert.equal(child.totalMs, 30 * 60_000);
});

test('named agents get independent actor keys from the human timer', () => {
  assert.equal(actorKey('human'), 'human');
  assert.equal(actorKey('agent', 'Caspera'), 'agent:caspera');
  assert.equal(actorKey('agent', '  Pondo  '), 'agent:pondo');
});
