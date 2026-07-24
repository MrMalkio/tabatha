// fix/sync-drift — cross-surface elapsed-time drift.
//
// syncService.buildFocusRows's doc comment (and liveIngestArbitration.js's
// header) both assert the extension mirrors the Sidecar's tags._startedAt
// convention: "back-dated across pauses so it doubles as an elapsed-time
// anchor" (sidecar/src/data/focus.ts resumes via
// `_startedAt = new Date(Date.now() - accumulatedElapsedMs).toISOString()`,
// so `now - _startedAt` always reproduces TOTAL elapsed on any reading
// surface).
//
// The extension's own resume paths (switchFocus/resumeFocus/adoptRemoteActive
// in focusService.js) use a different, perfectly valid LOCAL model —
// `elapsedMs` (accumulated across prior pauses) + `lastResumedAt` (raw
// wall-clock resume time, never back-dated) — and buildFocusRows pushed
// `tags._startedAt = item.lastResumedAt` verbatim. That drops the
// accumulated `elapsedMs` entirely from the cross-surface signal: any other
// surface (Sidecar, Context View, another extension install) computing
// elapsed as `now - tags._startedAt` undercounts by exactly the item's prior
// accumulated elapsedMs — worse with every pause/resume cycle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFocusRows } from '../src/background/services/syncService.js';

test('buildFocusRows: active item with prior accumulated elapsedMs pushes a back-dated tags._startedAt (Sidecar parity)', () => {
  const now = Date.now();
  const priorElapsedMs = 20 * 60000; // 20 min accumulated across earlier pause(s)
  const resumedAgoMs = 2 * 60000;    // resumed 2 min ago
  const lastResumedAt = new Date(now - resumedAgoMs).toISOString();

  const engine = {
    items: {
      f1: {
        id: 'f1',
        label: 'Ship the thing',
        focusState: 'active',
        elapsedMs: priorElapsedMs,
        lastResumedAt,
        createdAt: new Date(now - 60 * 60000).toISOString(),
        tags: {}
      }
    },
    history: []
  };

  const rows = buildFocusRows(engine, { profile_id: 'p1' });
  const row = rows.find(r => r.client_id === 'f1');
  const actualStartedAtMs = new Date(row.tags._startedAt).getTime();

  // Sidecar's elapsedMsOf() reads exactly this: `now - startedAtOf(row)`.
  // For this to equal the item's TRUE total elapsed (accumulated + time
  // since resume), _startedAt must be back-dated by priorElapsedMs.
  const impliedElapsed = Date.now() - actualStartedAtMs;
  const trueTotalElapsed = priorElapsedMs + resumedAgoMs;

  assert.ok(
    Math.abs(impliedElapsed - trueTotalElapsed) < 2000,
    `cross-surface elapsed drift: a surface reading this row would compute ` +
    `elapsed=${impliedElapsed}ms but the item's true total elapsed is ` +
    `${trueTotalElapsed}ms (missing the ${priorElapsedMs}ms accumulated ` +
    `before this resume — tags._startedAt was not back-dated)`
  );
});

test('buildFocusRows: active item with NO prior elapsed (fresh start) still pushes lastResumedAt unchanged', () => {
  const now = Date.now();
  const lastResumedAt = new Date(now - 5000).toISOString();
  const engine = {
    items: {
      f2: {
        id: 'f2',
        label: 'Fresh start',
        focusState: 'active',
        elapsedMs: 0,
        lastResumedAt,
        createdAt: lastResumedAt,
        tags: {}
      }
    },
    history: []
  };
  const rows = buildFocusRows(engine, { profile_id: 'p1' });
  const row = rows.find(r => r.client_id === 'f2');
  assert.equal(row.tags._startedAt, lastResumedAt);
});

test('buildFocusRows: paused item is unaffected (existing _elapsedMs/_startedAt tag behavior preserved)', () => {
  const now = Date.now();
  const engine = {
    items: {
      f3: {
        id: 'f3',
        label: 'Paused thing',
        focusState: 'paused',
        elapsedMs: 12345,
        lastResumedAt: null,
        startedAt: new Date(now - 100000).toISOString(),
        createdAt: new Date(now - 200000).toISOString(),
        tags: { _startedAt: new Date(now - 90000).toISOString() }
      }
    },
    history: []
  };
  const rows = buildFocusRows(engine, { profile_id: 'p1' });
  const row = rows.find(r => r.client_id === 'f3');
  assert.equal(row.tags._startedAt, engine.items.f3.tags._startedAt);
  assert.equal(row.tags._elapsedMs, 12345);
});
