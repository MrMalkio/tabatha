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

// ── NB-09: rich metadata on a RUNNING focus (lastResumedAt set!) ──
// The vetted fix: never reset lastResumedAt; clamp against the stored ceiling
// (wall-clock minus the live active portion) and report exactly what happened.

test('NB-09: ADJUST_FOCUS_TIME returns appliedMs/clamped/liveElapsedMs metadata (unclamped)', async () => {
  seed(baseItem());
  const r = await focus.handleMessage('ADJUST_FOCUS_TIME', { focusId: 'f1', adjustmentMs: 5 * MIN });
  assert.equal(r.appliedMs, 5 * MIN);
  assert.equal(r.clamped, false);
  assert.ok(r.liveElapsedMs >= 15 * MIN && r.liveElapsedMs <= 15 * MIN + 1000, `live was ${r.liveElapsedMs}`);
});

test('NB-09: ADJUST_FOCUS_TIME on a running focus with a LARGE active portion clamps, reports metadata, and never resets lastResumedAt', async () => {
  // Started 30m ago, resumed 25m ago (active portion ≈ 25m), 4m stored.
  // Stored ceiling = 30m − 25m = 5m → +60m applies only ~1m and clamps.
  const resumedAt = minsAgo(25);
  seed(baseItem({ startedAt: minsAgo(30), lastResumedAt: resumedAt, elapsedMs: 4 * MIN, focusState: 'active' }));
  const r = await focus.handleMessage('ADJUST_FOCUS_TIME', { focusId: 'f1', adjustmentMs: 60 * MIN });
  const f1 = r.focusEngine.items.f1;
  assert.equal(r.clamped, true);
  assert.ok(r.appliedMs >= 0.9 * MIN && r.appliedMs <= 1.1 * MIN, `appliedMs was ${r.appliedMs}`);
  assert.ok(f1.elapsedMs <= 5 * MIN + 1000, `stored elapsed ${f1.elapsedMs} exceeded the stored ceiling`);
  // live total = stored + active portion ≈ wall-clock (30m)
  assert.ok(r.liveElapsedMs >= 29.8 * MIN && r.liveElapsedMs <= 30.2 * MIN, `live was ${r.liveElapsedMs}`);
  assert.equal(f1.lastResumedAt, resumedAt, 'lastResumedAt must NOT be reset by a time edit');
});

test('NB-09: ADJUST_FOCUS_TIME negative clamp at zero reports clamped + partial appliedMs', async () => {
  seed(baseItem({ elapsedMs: 2 * MIN }));
  const r = await focus.handleMessage('ADJUST_FOCUS_TIME', { focusId: 'f1', adjustmentMs: -10 * MIN });
  assert.equal(r.appliedMs, -2 * MIN);
  assert.equal(r.clamped, true);
  assert.equal(r.focusEngine.items.f1.elapsedMs, 0);
});

test('NB-09: SET_FOCUS_ELAPSED targets the LIVE total on a running focus (stored = target − active portion)', async () => {
  // Resumed 20m ago (active portion ≈ 20m), 10m stored → live ≈ 30m. Set live to 25m.
  const resumedAt = minsAgo(20);
  seed(baseItem({ startedAt: minsAgo(60), lastResumedAt: resumedAt, elapsedMs: 10 * MIN, focusState: 'active' }));
  const r = await focus.handleMessage('SET_FOCUS_ELAPSED', { focusId: 'f1', elapsedMs: 25 * MIN });
  const f1 = r.focusEngine.items.f1;
  assert.ok(f1.elapsedMs >= 4.9 * MIN && f1.elapsedMs <= 5.1 * MIN, `stored was ${f1.elapsedMs}`);
  assert.ok(r.liveElapsedMs >= 24.9 * MIN && r.liveElapsedMs <= 25.1 * MIN, `live was ${r.liveElapsedMs}`);
  assert.equal(r.clamped, false);
  assert.ok(r.appliedMs <= -4.9 * MIN && r.appliedMs >= -5.1 * MIN, `appliedMs was ${r.appliedMs}`);
  assert.equal(f1.lastResumedAt, resumedAt, 'lastResumedAt must NOT be reset by a time edit');
});

test('NB-09: SET_FOCUS_ELAPSED below the running active portion floors at the active portion and reports clamped', async () => {
  // Active portion ≈ 20m; requesting a 5m live total is impossible without
  // un-living the running span → stored floors at 0, live ≈ 20m, clamped.
  seed(baseItem({ startedAt: minsAgo(60), lastResumedAt: minsAgo(20), elapsedMs: 10 * MIN, focusState: 'active' }));
  const r = await focus.handleMessage('SET_FOCUS_ELAPSED', { focusId: 'f1', elapsedMs: 5 * MIN });
  const f1 = r.focusEngine.items.f1;
  assert.equal(f1.elapsedMs, 0);
  assert.equal(r.clamped, true);
  assert.ok(r.liveElapsedMs >= 19.8 * MIN && r.liveElapsedMs <= 20.2 * MIN, `live was ${r.liveElapsedMs}`);
});

test('NB-09: SET_FOCUS_ELAPSED above wall-clock clamps to wall-clock and reports clamped', async () => {
  seed(baseItem({ startedAt: minsAgo(30), lastResumedAt: minsAgo(10), elapsedMs: 5 * MIN, focusState: 'active' }));
  const r = await focus.handleMessage('SET_FOCUS_ELAPSED', { focusId: 'f1', elapsedMs: 500 * MIN });
  assert.equal(r.clamped, true);
  assert.ok(r.liveElapsedMs <= 30 * MIN + 1000, `live ${r.liveElapsedMs} exceeded wall-clock`);
});

test('NB-09: time-edit checkpoint entry logs the final live total exactly once (no double-counted active portion)', async () => {
  // Running focus: resumed 10m ago, 5m stored. +2m adjust → stored 7m, live ≈ 17m.
  seed(baseItem({ startedAt: minsAgo(30), lastResumedAt: minsAgo(10), elapsedMs: 5 * MIN, focusState: 'active', checkpoint: [] }));
  const r = await focus.handleMessage('ADJUST_FOCUS_TIME', { focusId: 'f1', adjustmentMs: 2 * MIN });
  const cp = r.focusEngine.items.f1.checkpoint.at(-1);
  assert.ok(cp, 'expected a system checkpoint');
  // elapsedAtMs must equal the FINAL live total (~17m) — not 17m+10m (double
  // count) and not 7m (dropped active portion).
  assert.ok(cp.elapsedAtMs >= 16.8 * MIN && cp.elapsedAtMs <= 17.2 * MIN, `checkpoint elapsedAtMs was ${cp.elapsedAtMs}`);
});

test('NB-09: GET_LAST_ACTIVITY returns the newest tab lastActive', async () => {
  const newest = minsAgo(7);
  installChromeMock({
    store: {
      focusEngine: { activeFocusId: null, items: { f1: baseItem() }, history: [] },
      tabs: {
        1: { url: 'https://a.example', lastActive: minsAgo(40) },
        2: { url: 'https://b.example', lastActive: newest },
        3: { url: 'https://c.example' }
      }
    }
  });
  const r = await focus.handleMessage('GET_LAST_ACTIVITY', {});
  assert.equal(new Date(r.lastActivityAt).getTime(), new Date(newest).getTime());
});

test('NB-09: GET_LAST_ACTIVITY returns null when no tab activity exists', async () => {
  installChromeMock({ store: { focusEngine: { activeFocusId: null, items: {}, history: [] }, tabs: {} } });
  const r = await focus.handleMessage('GET_LAST_ACTIVITY', {});
  assert.equal(r.lastActivityAt, null);
});

test('NB-09: IDLE_PROMPT_RESPONSE on_task for a gap prompt credits the trimmed span back and reactivates', async () => {
  // Gap-retro-paused 12m ago with 20m stored; user says "I kept working".
  installChromeMock({
    store: {
      focusEngine: {
        activeFocusId: null,
        items: {
          f1: baseItem({
            focusState: 'paused', pausedAt: minsAgo(12), pausedReason: 'offline_gap',
            elapsedMs: 20 * MIN, lastResumedAt: null, startedAt: minsAgo(120)
          })
        },
        history: []
      },
      _idlePrompt: { id: 'gap_f1_1', focusId: 'f1', ts: Date.now(), source: 'gap', gapMs: 12 * MIN, trimmed: true }
    }
  });
  const r = await focus.handleMessage('IDLE_PROMPT_RESPONSE', { focusId: 'f1', response: 'on_task' });
  const f1 = r.focusEngine.items.f1;
  assert.equal(r.resolution, 'on_task');
  assert.equal(f1.focusState, 'active');
  assert.equal(r.focusEngine.activeFocusId, 'f1');
  assert.equal(f1.pausedReason, null);
  // 20m stored + ~12m gap credited back ≈ 32m
  assert.ok(f1.elapsedMs >= 31.8 * MIN && f1.elapsedMs <= 32.2 * MIN, `elapsed was ${f1.elapsedMs}`);
  assert.ok(r.creditedMs >= 11.8 * MIN && r.creditedMs <= 12.2 * MIN, `creditedMs was ${r.creditedMs}`);
});

test('NB-09: IDLE_PROMPT_RESPONSE pause for a gap-retro-paused focus keeps the backdated pausedAt', async () => {
  const backdated = minsAgo(12);
  installChromeMock({
    store: {
      focusEngine: {
        activeFocusId: null,
        items: {
          f1: baseItem({
            focusState: 'paused', pausedAt: backdated, pausedReason: 'offline_gap',
            elapsedMs: 20 * MIN, lastResumedAt: null
          })
        },
        history: []
      },
      _idlePrompt: { id: 'gap_f1_2', focusId: 'f1', ts: Date.now(), source: 'gap', gapMs: 12 * MIN, trimmed: true }
    }
  });
  const r = await focus.handleMessage('IDLE_PROMPT_RESPONSE', { focusId: 'f1', response: 'pause' });
  const f1 = r.focusEngine.items.f1;
  assert.equal(r.resolution, 'pause');
  assert.equal(f1.focusState, 'paused');
  // pausedAt must stay at the gap start — re-pausing to "now" would destroy
  // the remove-last-pause credit window.
  assert.equal(f1.pausedAt, backdated);
});

test('time-edit handlers reject an unknown focus', async () => {
  seed(baseItem());
  const r = await focus.handleMessage('ADJUST_FOCUS_TIME', { focusId: 'nope', adjustmentMs: MIN });
  assert.equal(r.error, 'Focus not found');
});

// ── Workstream B1: SET_FOCUS_START_TIME (backdating) ──

test('SET_FOCUS_START_TIME backdates startedAt and credits the gap into elapsed', async () => {
  // Focus started 60m ago, paused (no live portion), 10m stored.
  seed(baseItem({ startedAt: minsAgo(60), elapsedMs: 10 * MIN, lastResumedAt: null }));
  const newStart = minsAgo(90); // move 30m earlier
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'f1', startedAt: newStart });
  const f1 = r.focusEngine.items.f1;
  assert.equal(f1.startedAt, newStart);
  // credited +30m → 40m, bounded by wall-clock (90m) so it stands
  assert.ok(f1.elapsedMs >= 39.9 * MIN && f1.elapsedMs <= 40.1 * MIN, `elapsed was ${f1.elapsedMs}`);
});

test('SET_FOCUS_START_TIME credited elapsed never exceeds wall-clock since new start', async () => {
  // Started 5m ago, only push back to 8m ago → credit 3m, but stored already 4m.
  seed(baseItem({ startedAt: minsAgo(5), elapsedMs: 4 * MIN, lastResumedAt: null }));
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'f1', startedAt: minsAgo(8) });
  const f1 = r.focusEngine.items.f1;
  assert.ok(f1.elapsedMs <= 8 * MIN + 1000, `elapsed ${f1.elapsedMs} exceeded wall-clock`);
});

test('P2: moving start LATER reclamps elapsed to wall-clock since the new start', async () => {
  // Focus has 90m stored elapsed, started 120m ago (paused, no live portion).
  // Move the start to 10m ago → elapsed is now impossible and must clamp to ~10m.
  seed(baseItem({ startedAt: minsAgo(120), elapsedMs: 90 * MIN, lastResumedAt: null, focusState: 'paused' }));
  const newStart = minsAgo(10);
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'f1', startedAt: newStart });
  const f1 = r.focusEngine.items.f1;
  assert.equal(f1.startedAt, newStart);
  assert.ok(f1.elapsedMs <= 10 * MIN + 1000, `elapsed ${f1.elapsedMs} should clamp to <= ~10m after moving start later`);
});

test('P2: moving start later on an ACTIVE focus clamps elapsed below the live wall-clock', async () => {
  // 90m stored, live portion is small (resumed 2m ago). Move start to 10m ago.
  // stored elapsed + 2m live portion must stay <= 10m wall clock.
  seed(baseItem({ startedAt: minsAgo(120), elapsedMs: 90 * MIN, lastResumedAt: minsAgo(2), focusState: 'active' }));
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'f1', startedAt: minsAgo(10) });
  const f1 = r.focusEngine.items.f1;
  // stored ceiling = (now - newStart) - activePortion ≈ 10m - 2m = 8m
  assert.ok(f1.elapsedMs <= 8 * MIN + 1000, `stored elapsed ${f1.elapsedMs} should clamp to <= ~8m`);
});

test('SET_FOCUS_START_TIME clamps a too-early start up to clock-in', async () => {
  const clockInIso = minsAgo(60);
  installChromeMock({
    store: {
      focusEngine: { activeFocusId: null, items: { f1: baseItem({ startedAt: minsAgo(30) }) }, history: [] },
      clockSession: { active: true, clockedInAt: clockInIso },
    },
  });
  // Try to backdate to 120m ago — before clock-in (60m). Should clamp to clock-in.
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'f1', startedAt: minsAgo(120) });
  const f1 = r.focusEngine.items.f1;
  const clockIn = new Date(clockInIso).getTime();
  assert.equal(new Date(f1.startedAt).getTime(), clockIn);
});

test('SET_FOCUS_START_TIME rejects a future start (clamps to now)', async () => {
  seed(baseItem({ startedAt: minsAgo(30) }));
  const future = new Date(Date.now() + 30 * MIN).toISOString();
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'f1', startedAt: future });
  const f1 = r.focusEngine.items.f1;
  assert.ok(new Date(f1.startedAt).getTime() <= Date.now() + 1000);
});

test('SET_FOCUS_START_TIME rejects an unknown focus', async () => {
  seed(baseItem());
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'nope', startedAt: minsAgo(30) });
  assert.equal(r.error, 'Focus not found');
});

test('SET_FOCUS_START_TIME on a never-started focus bounds elapsed by now-newStart', async () => {
  // startedAt null, wallClockMax would be MAX_SAFE_INTEGER without the new start.
  seed(baseItem({ startedAt: null, elapsedMs: 0, lastResumedAt: null }));
  const newStart = minsAgo(20);
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'f1', startedAt: newStart });
  const f1 = r.focusEngine.items.f1;
  assert.equal(f1.startedAt, newStart);
  assert.ok(f1.elapsedMs <= 20 * MIN + 1000, `elapsed ${f1.elapsedMs} exceeded new wall-clock`);
});

test('SET_FOCUS_START_TIME logs a backdated checkpoint', async () => {
  seed(baseItem({ startedAt: minsAgo(30), elapsedMs: 5 * MIN, lastResumedAt: null }));
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'f1', startedAt: minsAgo(45) });
  const f1 = r.focusEngine.items.f1;
  assert.ok((f1.checkpoint || []).some(c => /backdated|start/i.test(c.text || '')), 'expected a start-edit checkpoint');
});

// ── Multi-focus clamp coverage: the anti-double-count overlap path ──
// (previously untested — every earlier test seeded a single focus item, so the
// clamp-vs-sibling branch of validateStartTime had zero coverage.)

function seedWithSibling(f1over, f2over = {}) {
  installChromeMock({
    store: {
      focusEngine: {
        activeFocusId: null,
        items: {
          f1: baseItem(f1over),
          f2: {
            id: 'f2', label: 'Email triage', focusState: 'paused', funnelStage: 'addressing',
            startedAt: minsAgo(120), pausedAt: minsAgo(10), elapsedMs: 0,
            lastResumedAt: null, timerMinutes: 30, checkpoint: [], ...f2over,
          },
        },
        history: [],
      },
    },
  });
}

test('SET_FOCUS_START_TIME overlapping a sibling: start moves in full, overlap reported (not blocked)', async () => {
  // f2 occupied [120m ago, 10m ago]; f1 started right at 10m ago. Backdating f1
  // to 60m ago lands inside f2's span. The start the user picked always takes
  // effect (no clock-in floor here, so it's unbounded below) — the 50m
  // overlap with f2 is reported, not clamped away.
  seedWithSibling({ startedAt: minsAgo(10), elapsedMs: 5 * MIN, lastResumedAt: null });
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'f1', startedAt: minsAgo(60) });
  assert.equal(r.clamped, false);
  assert.equal(r.clampedBy, null);
  assert.ok(r.addedMs >= 49.9 * MIN && r.addedMs <= 50.1 * MIN, `expected ~50m credited, got ${r.addedMs}`);
  assert.equal(r.overlaps.length, 1);
  assert.equal(r.overlaps[0].label, 'Email triage');
  assert.ok(r.overlaps[0].overlapMs >= 49.9 * MIN && r.overlaps[0].overlapMs <= 50.1 * MIN, `overlapMs was ${r.overlaps[0].overlapMs}`);
  // start actually moved to the requested time
  const f1 = r.focusEngine.items.f1;
  assert.ok(Math.abs(new Date(f1.startedAt).getTime() - (Date.now() - 60 * MIN)) < 2000, `startedAt was ${f1.startedAt}`);
  // 5m stored + 50m credited = 55m, under the 60m wall-clock ceiling
  assert.ok(f1.elapsedMs >= 54.9 * MIN && f1.elapsedMs <= 55.1 * MIN, `elapsed was ${f1.elapsedMs}`);
});

test('SET_FOCUS_START_TIME overlapping a sibling with a narrower interval: start moves in full, smaller overlap reported', async () => {
  // f2 occupied [120m ago, 30m ago]; f1 started 10m ago. Backdating to 60m ago
  // moves the start fully to 60m ago (still unbounded below) and reports the
  // 30m overlap with f2's [120m, 30m] span — not a 20m clamp-shortfall.
  seedWithSibling(
    { startedAt: minsAgo(10), elapsedMs: 5 * MIN, lastResumedAt: null },
    { pausedAt: minsAgo(30) },
  );
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'f1', startedAt: minsAgo(60) });
  assert.equal(r.clamped, false);
  assert.equal(r.clampedBy, null);
  assert.ok(r.addedMs >= 49.9 * MIN && r.addedMs <= 50.1 * MIN, `addedMs was ${r.addedMs}`);
  assert.equal(r.overlaps.length, 1);
  assert.equal(r.overlaps[0].label, 'Email triage');
  assert.ok(r.overlaps[0].overlapMs >= 29.9 * MIN && r.overlaps[0].overlapMs <= 30.1 * MIN, `overlapMs was ${r.overlaps[0].overlapMs}`);
  const f1 = r.focusEngine.items.f1;
  assert.ok(Math.abs(new Date(f1.startedAt).getTime() - (Date.now() - 60 * MIN)) < 2000, `startedAt was ${f1.startedAt}`);
  // 5m stored + 50m credited = 55m, under the 60m wall-clock ceiling
  assert.ok(f1.elapsedMs >= 54.9 * MIN && f1.elapsedMs <= 55.1 * MIN, `elapsed was ${f1.elapsedMs}`);
});

test('SET_FOCUS_START_TIME with a non-overlapping sibling is unclamped and unchanged', async () => {
  // f2 occupied [120m ago, 90m ago] — clear of the requested [60m ago, now] span.
  seedWithSibling(
    { startedAt: minsAgo(10), elapsedMs: 5 * MIN, lastResumedAt: null },
    { pausedAt: minsAgo(90) },
  );
  const newStart = minsAgo(60);
  const r = await focus.handleMessage('SET_FOCUS_START_TIME', { focusId: 'f1', startedAt: newStart });
  assert.equal(r.clamped, false);
  assert.equal(r.clampedBy, null);
  assert.ok(r.addedMs >= 49.9 * MIN && r.addedMs <= 50.1 * MIN, `addedMs was ${r.addedMs}`);
  const f1 = r.focusEngine.items.f1;
  assert.equal(f1.startedAt, newStart);
  assert.ok(f1.elapsedMs >= 54.9 * MIN && f1.elapsedMs <= 55.1 * MIN, `elapsed was ${f1.elapsedMs}`);
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
