// autoStartNextOnResolve — control whether resolving an intent auto-promotes
// the next queued (paused) intent to active.
//
// Malkio, dogfooding: resolving an intent always yanked the most-recently-paused
// one into focus, so "nothing active" was an unreachable state (pauseItem never
// clears activeFocusId either — only completeFocus nulls it, then immediately
// re-fills it). With the setting off, resolving leaves the queue paused and
// activeFocusId null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

const MIN = 60000;
const minsAgo = (m) => new Date(Date.now() - m * MIN).toISOString();

const active = (over = {}) => ({
  id: 'f1', label: 'Active work', focusState: 'active', funnelStage: 'addressing',
  elapsedMs: 5 * MIN, lastResumedAt: minsAgo(5), startedAt: minsAgo(5),
  pausedAt: null, timerMinutes: 30, checkpoint: [], createdAt: minsAgo(5),
  associatedTabIds: [], ...over,
});

const queued = (id, pausedMinsAgo, over = {}) => ({
  id, label: 'Queued ' + id, focusState: 'paused', funnelStage: 'focus',
  elapsedMs: 2 * MIN, lastResumedAt: null, startedAt: minsAgo(60),
  pausedAt: minsAgo(pausedMinsAgo), timerMinutes: 15, checkpoint: [],
  createdAt: minsAgo(60), associatedTabIds: [], ...over,
});

function seed({ settings } = {}) {
  const store = {
    focusEngine: {
      activeFocusId: 'f1',
      items: { f1: active(), q1: queued('q1', 3), q2: queued('q2', 40) },
      history: [],
    },
  };
  if (settings) store.settings = settings;
  installChromeMock({ store });
}

test('autoStartNextOnResolve=false: resolving leaves NOTHING active and the queue paused', async () => {
  seed({ settings: { autoStartNextOnResolve: false } });
  const focus = await import('../src/background/services/focusService.js');

  const engine = await focus.completeFocus('f1');

  assert.equal(engine.activeFocusId, null, 'no intent should be promoted into the empty slot');
  assert.equal(engine.items.q1.focusState, 'paused', 'most-recently-paused intent must stay paused');
  assert.equal(engine.items.q2.focusState, 'paused');
  assert.equal(engine.items.q1.lastResumedAt, null, 'a paused intent must not start accruing time');
});

test('autoStartNextOnResolve default (unset) preserves auto-promote of the newest paused intent', async () => {
  seed(); // no settings → DEFAULT_SETTINGS applies
  const focus = await import('../src/background/services/focusService.js');

  const engine = await focus.completeFocus('f1');

  assert.equal(engine.activeFocusId, 'q1', 'newest paused intent should be promoted by default');
  assert.equal(engine.items.q1.focusState, 'active');
  assert.ok(engine.items.q1.lastResumedAt, 'promoted intent starts accruing');
});

test('autoStartNextOnResolve=false still resolves the focus itself into history', async () => {
  seed({ settings: { autoStartNextOnResolve: false } });
  const focus = await import('../src/background/services/focusService.js');

  const engine = await focus.completeFocus('f1');

  assert.equal(engine.items.f1, undefined, 'resolved intent leaves the active items map');
  assert.equal(engine.history[0].id, 'f1');
  assert.equal(engine.history[0].focusState, 'completed');
  assert.equal(engine.history[0].funnelStage, 'resolved');
});
