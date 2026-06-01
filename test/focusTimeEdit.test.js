// Plan 037 — Focus time editing regression tests.
// Guards: delta adjust + clamp, absolute set, wall-clock ceiling, and
// remove-last-pause crediting/reactivation (the idle-pause time recovery).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

installChromeMock();
const focus = await import('../src/background/services/focusService.js');

const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const MIN = 60000;

function seed(item) {
  installChromeMock({ store: { focusEngine: { activeFocusId: item.activeFocusId ?? null, items: { f1: item }, history: [] } } });
}

const baseItem = (over = {}) => ({
  id: 'f1', label: 'Code', focusState: 'active', funnelStage: 'addressing',
  elapsedMs: 10 * MIN, lastResumedAt: null, startedAt: minsAgo(120),
  pausedAt: null, timerMinutes: 30, checkpoint: [], ...over
});

test('ADJUST_FOCUS_TIME +5m increases stored elapsed', async () => {
  seed(baseItem());
  const r = await focus.handleMessage('ADJUST_FOCUS_TIME', { focusId: 'f1', adjustmentMs: 5 * MIN });
  assert.equal(r.focusEngine.items.f1.elapsedMs, 15 * MIN);
});

test('ADJUST_FOCUS_TIME cannot drive elapsed below zero', async () => {
  seed(baseItem({ elapsedMs: 2 * MIN }));
  const r = await focus.handleMessage('ADJUST_FOCUS_TIME', { focusId: 'f1', adjustmentMs: -10 * MIN });
  assert.equal(r.focusEngine.items.f1.elapsedMs, 0);
});

test('ADJUST_FOCUS_TIME is clamped to wall-clock since startedAt', async () => {
  seed(baseItem({ elapsedMs: 4 * MIN, startedAt: minsAgo(5) }));
  const r = await focus.handleMessage('ADJUST_FOCUS_TIME', { focusId: 'f1', adjustmentMs: 100 * MIN });
  // ceiling ~= 5 min of wall-clock
  assert.ok(r.focusEngine.items.f1.elapsedMs <= 5 * MIN + 1000);
  assert.ok(r.focusEngine.items.f1.elapsedMs >= 4 * MIN);
});

test('SET_FOCUS_ELAPSED sets an absolute value', async () => {
  seed(baseItem());
  const r = await focus.handleMessage('SET_FOCUS_ELAPSED', { focusId: 'f1', elapsedMs: 30 * MIN });
  assert.equal(r.focusEngine.items.f1.elapsedMs, 30 * MIN);
});

test('REMOVE_LAST_PAUSE credits paused time and reactivates the focus', async () => {
  seed(baseItem({
    activeFocusId: null,
    focusState: 'paused',
    pausedAt: minsAgo(3),
    elapsedMs: 10 * MIN,
    checkpoint: [{ id: 'c1', text: 'Paused (idle)', triggeredBy: 'system' }]
  }));
  const r = await focus.handleMessage('REMOVE_LAST_PAUSE', { focusId: 'f1' });
  const f1 = r.focusEngine.items.f1;
  assert.equal(f1.focusState, 'active');
  assert.equal(r.focusEngine.activeFocusId, 'f1');
  // ~13 min (10 stored + 3 paused credited)
  assert.ok(f1.elapsedMs >= 12.9 * MIN && f1.elapsedMs <= 13.1 * MIN, `elapsed was ${f1.elapsedMs}`);
  // the system "Paused" checkpoint entry was spliced out
  assert.equal((f1.checkpoint || []).some(c => /^Paused/.test(c.text || '')), false);
});

test('time-edit handlers reject an unknown focus', async () => {
  seed(baseItem());
  const r = await focus.handleMessage('ADJUST_FOCUS_TIME', { focusId: 'nope', adjustmentMs: MIN });
  assert.equal(r.error, 'Focus not found');
});

test('EDIT_CHECKPOINT updates note text and progress level', async () => {
  seed(baseItem({ checkpoint: [{ id: 'c1', text: 'old', progressLevel: 'none', progressValue: 0, triggeredBy: 'home' }] }));
  const r = await focus.handleMessage('EDIT_CHECKPOINT', { focusId: 'f1', checkpointId: 'c1', text: 'new text', progressLevel: 'lot' });
  const cp = r.focusEngine.items.f1.checkpoint[0];
  assert.equal(cp.text, 'new text');
  assert.equal(cp.progressLevel, 'lot');
  assert.equal(cp.progressValue, 3); // PROGRESS_VALUES.lot
  assert.ok(cp.editedAt);
});

test('DELETE_CHECKPOINT removes the entry and reindexes lastCheckpointAt', async () => {
  seed(baseItem({
    lastCheckpointAt: '2026-05-29T10:05:00Z',
    checkpoint: [
      { id: 'c1', text: 'first', triggeredBy: 'home', createdAt: '2026-05-29T10:00:00Z' },
      { id: 'c2', text: 'second', triggeredBy: 'home', createdAt: '2026-05-29T10:05:00Z' }
    ]
  }));
  const r = await focus.handleMessage('DELETE_CHECKPOINT', { focusId: 'f1', checkpointId: 'c2' });
  const f1 = r.focusEngine.items.f1;
  assert.equal(f1.checkpoint.length, 1);
  assert.equal(f1.checkpoint[0].id, 'c1');
  assert.equal(f1.lastCheckpointAt, '2026-05-29T10:00:00Z'); // now points at the newest remaining user note
});

test('DELETE_CHECKPOINT on unknown id returns an error', async () => {
  seed(baseItem({ checkpoint: [{ id: 'c1', text: 'x', triggeredBy: 'home' }] }));
  const r = await focus.handleMessage('DELETE_CHECKPOINT', { focusId: 'f1', checkpointId: 'zzz' });
  assert.equal(r.error, 'Checkpoint not found');
});
