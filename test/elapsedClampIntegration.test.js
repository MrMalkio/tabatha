// Integration regression tests for the Koda review of 6.7.74.
//
// These deliberately go through the REAL modules and a REAL chrome.storage
// round-trip. Koda's P1 finding was precisely that a unit test on `clampStamp`
// proved nothing: the stamp was destroyed by the sanitizer on the very next
// `getFocusEngine()` read, so the "never silent" promise was false in practice
// while every unit test stayed green.
//
// Run: node --test test/elapsedClampIntegration.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';
import { MAX_CONTINUOUS_RUN_MS } from '../src/utils/elapsedClamp.js';

const M = 60 * 1000;
const H = 60 * M;
const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();

// ── K2: adopt a long cross-surface focus, then pause it ───────────

test('K2: adopting a 14h cross-surface focus and pausing 5 min later keeps all 14h', async () => {
  installChromeMock({ store: {} });
  const focus = await import('../src/background/services/focusService.js');

  // A Sidecar intent worked 14h across a week. The remote publishes a
  // BACK-DATED anchor (tags._startedAt = now - totalElapsed) — that is the
  // 6.7.71/6.7.73 contract.
  const totalMs = Math.round(14 * H);
  const remoteStartedAtIso = isoAgo(totalMs);

  const engine = {
    activeFocusId: null,
    items: {
      f_cross: {
        id: 'f_cross', label: 'Long cross-surface work', focusState: 'paused',
        createdAt: isoAgo(7 * 24 * H), startedAt: isoAgo(7 * 24 * H),
        elapsedMs: 0, lastResumedAt: null, tags: {}
      }
    },
    history: []
  };

  focus.adoptRemoteActive(engine.items.f_cross, engine, remoteStartedAtIso);
  const item = engine.items.f_cross;

  // At adoption the visible total must already be the full 14h…
  const liveAtAdoption = focus.liveElapsed(item);
  assert.ok(Math.abs(liveAtAdoption - totalMs) < 5000,
    `expected ~14h visible at adoption, got ${(liveAtAdoption / H).toFixed(2)}h`);
  assert.ok(liveAtAdoption > MAX_CONTINUOUS_RUN_MS,
    'and it must NOT be truncated to the 12h ceiling — that was the K2 data loss');

  // …and pausing must bank it, not clamp it.
  focus.pauseItem(item, null, engine);
  assert.ok(Math.abs(item.elapsedMs - totalMs) < 5000,
    `pause must bank ~14h, banked ${(item.elapsedMs / H).toFixed(2)}h`);
  assert.equal(item.tags?._elapsedClamp, undefined, 'nothing was implausible; no clamp stamp');
});

test('K2: the adopted anchor still round-trips to the identical pushed _startedAt', async () => {
  // Non-ping-pong invariant: buildFocusRows back-dates
  // _startedAt = lastResumedAt - elapsedMs, which must reproduce exactly the
  // anchor we adopted, or the remote row stays permanently newer.
  installChromeMock({ store: {} });
  const focus = await import('../src/background/services/focusService.js');
  const { buildFocusRows } = await import('../src/background/services/syncService.js');

  const remoteStartedAtIso = isoAgo(3 * H);
  const engine = {
    activeFocusId: null,
    items: {
      f_rt: {
        id: 'f_rt', label: 'Round trip', focusState: 'paused',
        createdAt: isoAgo(5 * 24 * H), startedAt: isoAgo(5 * 24 * H),
        elapsedMs: 0, lastResumedAt: null, tags: {}
      }
    },
    history: []
  };

  focus.adoptRemoteActive(engine.items.f_rt, engine, remoteStartedAtIso);
  const rows = buildFocusRows(engine, { profile_id: 'p' });
  const pushed = rows.find(r => r.client_id === 'f_rt');

  const pushedMs = new Date(pushed.tags._startedAt).getTime();
  const adoptedMs = new Date(remoteStartedAtIso).getTime();
  assert.ok(Math.abs(pushedMs - adoptedMs) < 2000,
    `pushed anchor ${pushed.tags._startedAt} must reproduce adopted ${remoteStartedAtIso}`);
});

// ── K1: backdated work survives a real pause ─────────────────────

test('K1: a backdated focus survives pauseItem through the real engine', async () => {
  installChromeMock({ store: {} });
  const focus = await import('../src/background/services/focusService.js');

  // Created 5h ago, but the user asserted it started 10h ago and credited 5h.
  const engine = {
    activeFocusId: 'f_back',
    items: {
      f_back: {
        id: 'f_back', label: 'Backdated', focusState: 'active',
        createdAt: isoAgo(5 * H),
        startedAt: isoAgo(10 * H),   // EARLIER than createdAt — the feature
        elapsedMs: 5 * H,
        lastResumedAt: isoAgo(5 * M),
        tags: {}
      }
    },
    history: []
  };

  focus.pauseItem(engine.items.f_back, null, engine);
  const banked = engine.items.f_back.elapsedMs;
  assert.ok(Math.abs(banked - (5 * H + 5 * M)) < 5000,
    `expected ~5h05m banked, got ${(banked / H).toFixed(2)}h — pre-fix this was 5 minutes`);
});

// ── P1: the clamp stamp must survive a real storage round-trip ────

test('P1: tags._elapsedClamp survives getFocusEngine() sanitisation', async () => {
  const chrome = installChromeMock({ store: {} });
  const focus = await import('../src/background/services/focusService.js');

  // A focus with a stuck anchor: 30h "run", so the ceiling fires and stamps.
  const engine = {
    activeFocusId: 'f_stamp',
    items: {
      f_stamp: {
        id: 'f_stamp', label: 'Stuck', focusState: 'active',
        createdAt: isoAgo(80 * H), startedAt: isoAgo(80 * H),
        elapsedMs: 0, lastResumedAt: isoAgo(30 * H), tags: {}
      }
    },
    history: []
  };

  focus.pauseItem(engine.items.f_stamp, null, engine);
  const stamp = engine.items.f_stamp.tags?._elapsedClamp;
  assert.ok(stamp && typeof stamp === 'object', 'the clamp must stamp provenance');
  assert.equal(stamp.reason, 'continuous_run_ceiling');
  assert.ok(stamp.requestedMs > MAX_CONTINUOUS_RUN_MS, 'the rejected value is preserved');

  // Persist, then read back through the REAL sanitising getter.
  await chrome.storage.local.set({ focusEngine: engine });
  const reloaded = await focus.getFocusEngine();
  const after = reloaded.items.f_stamp.tags?._elapsedClamp;

  assert.ok(after && typeof after === 'object',
    'pre-fix the sanitizer coerced this object to null — the "never silent" promise was false');
  assert.equal(after.reason, 'continuous_run_ceiling');
  assert.equal(after.requestedMs, stamp.requestedMs);
});

test('P1: the sanitizer still heals genuinely corrupt tag objects', async () => {
  // Guard the exemption — it must be by name, not a blanket "objects are fine".
  const { sanitizeFocusEngine } = await import('../src/utils/focusDataSanitize.js');
  const result = sanitizeFocusEngine({
    activeFocusId: null,
    items: {
      f_c: {
        id: 'f_c', label: 'x',
        tags: { realm: { bad: 'object' }, _elapsedClamp: { reason: 'continuous_run_ceiling' } }
      }
    },
    history: []
  });
  const items = result.engine.items;
  assert.equal(items.f_c.tags.realm, null, 'a corrupt realm is still coerced');
  assert.ok(items.f_c.tags._elapsedClamp, 'but the clamp stamp is exempt');
});

// ── P3: sub-intent parent credit ─────────────────────────────────

test('P3: a STRUCTURALLY clamped child credits its parent only what it banked', async () => {
  // Must discriminate against the pre-fix `delta = accrued.deltaMs`. The run
  // delta is clamped to 12h by the ceiling, but the child's own life is only
  // 6h, so the structural clamp trims it further to 6h. Pre-fix the parent was
  // credited the 12h run — over-crediting by exactly what the child was denied.
  installChromeMock({ store: {} });
  const focus = await import('../src/background/services/focusService.js');

  const engine = {
    activeFocusId: 'f_child',
    items: {
      f_parent: {
        id: 'f_parent', label: 'Parent', focusState: 'paused',
        createdAt: isoAgo(80 * H), startedAt: isoAgo(80 * H), elapsedMs: 0, tags: {}
      },
      f_child: {
        id: 'f_child', label: 'Child', focusState: 'active', parentFocusId: 'f_parent',
        createdAt: isoAgo(6 * H), startedAt: isoAgo(6 * H),   // life = 6h
        elapsedMs: 0, lastResumedAt: isoAgo(30 * H), tags: {} // stuck 30h anchor
      }
    },
    history: []
  };

  focus.pauseItem(engine.items.f_child, null, engine);

  const childBanked = engine.items.f_child.elapsedMs;
  const parentCredited = engine.items.f_parent.elapsedMs;
  assert.ok(Math.abs(childBanked - 6 * H) < 5000,
    `child must be trimmed to its 6h life, got ${(childBanked / H).toFixed(2)}h`);
  assert.equal(parentCredited, childBanked,
    'the parent must be credited exactly what the child banked');
  assert.notEqual(parentCredited, MAX_CONTINUOUS_RUN_MS,
    'crediting the 12h run delta is the pre-fix over-credit');
});

// ══════════════════════════════════════════════════════════════════
// Koda re-review: N1 / N2 / N3
// ══════════════════════════════════════════════════════════════════

// ── N1: _elapsedMs must be published on ACTIVE rows too ──────────
//
// The Sidecar recovers the current run as `(now - _startedAt) - _elapsedMs`.
// Omitting `_elapsedMs` while active made banked read as 0, so the run
// degenerated to the whole lifetime — K2 recurring across the wire on the
// extension-authored rows that are 37 of 38 of the working set.

test('N1: an ACTIVE row publishes _elapsedMs so the Sidecar can recover the run', async () => {
  installChromeMock({ store: {} });
  const { buildFocusRows } = await import('../src/background/services/syncService.js');

  const banked = Math.round(14 * H);
  const engine = {
    activeFocusId: 'f_n1',
    items: {
      f_n1: {
        id: 'f_n1', label: 'Long banked work', focusState: 'active',
        createdAt: isoAgo(30 * 24 * H), startedAt: isoAgo(30 * 24 * H),
        elapsedMs: banked, lastResumedAt: isoAgo(5 * M), tags: {}
      }
    },
    history: []
  };

  const row = buildFocusRows(engine, { profile_id: 'p' }).find(r => r.client_id === 'f_n1');
  assert.ok(row.tags._elapsedMs != null, 'active rows MUST carry _elapsedMs');
  assert.equal(row.tags._elapsedMs, banked);

  // Now replay the Sidecar's own recovery formula against what we published.
  const total = Date.now() - new Date(row.tags._startedAt).getTime();
  const run = total - row.tags._elapsedMs;
  assert.ok(Math.abs(run - 5 * M) < 5000,
    `Sidecar must recover a ~5min run, got ${(run / M).toFixed(1)}min`);
  assert.ok(run < MAX_CONTINUOUS_RUN_MS, 'so the ceiling does not fire and 14h05m survives');
});

test('N1: _startedAt and _elapsedMs are mutually consistent by construction', async () => {
  installChromeMock({ store: {} });
  const { buildFocusRows } = await import('../src/background/services/syncService.js');

  const engine = {
    activeFocusId: 'f_n1b',
    items: {
      f_n1b: {
        id: 'f_n1b', label: 'Consistency', focusState: 'active',
        createdAt: isoAgo(10 * 24 * H), startedAt: isoAgo(10 * 24 * H),
        elapsedMs: 3 * H, lastResumedAt: isoAgo(20 * M), tags: {}
      }
    },
    history: []
  };
  const row = buildFocusRows(engine, { profile_id: 'p' }).find(r => r.client_id === 'f_n1b');
  // The contract: _startedAt === lastResumedAt - _elapsedMs
  const implied = new Date(row.tags._startedAt).getTime() + row.tags._elapsedMs;
  assert.ok(Math.abs(implied - new Date(engine.items.f_n1b.lastResumedAt).getTime()) < 2000);
});

// ── N2: the published anchor must not recede across pushes ───────

test('N2: repeated pushes of a legacy corrupt row publish a STABLE anchor', async () => {
  installChromeMock({ store: {} });
  const { buildFocusRows } = await import('../src/background/services/syncService.js');

  // Legacy corrupt: 40h banked on a row only 3h old.
  const engine = {
    activeFocusId: 'f_n2',
    items: {
      f_n2: {
        id: 'f_n2', label: 'Legacy corrupt', focusState: 'active',
        createdAt: isoAgo(3 * H), startedAt: isoAgo(3 * H),
        elapsedMs: 40 * H, lastResumedAt: isoAgo(10 * M), tags: {}
      }
    },
    history: []
  };

  const a = buildFocusRows(engine, { profile_id: 'p' }).find(r => r.client_id === 'f_n2');
  await new Promise(r => setTimeout(r, 25));
  const b = buildFocusRows(engine, { profile_id: 'p' }).find(r => r.client_id === 'f_n2');

  assert.equal(a.tags._startedAt, b.tags._startedAt,
    'the anchor must not move just because time passed — it used to recede ~5min per 5min');
  assert.equal(a.tags._elapsedMs, b.tags._elapsedMs,
    'and the published banked value must not creep upward each cycle');
});

test('N2: a paused corrupt row is also stable across pushes', async () => {
  installChromeMock({ store: {} });
  const { buildFocusRows } = await import('../src/background/services/syncService.js');

  const engine = {
    activeFocusId: null,
    items: {
      f_n2p: {
        id: 'f_n2p', label: 'Paused corrupt', focusState: 'paused',
        createdAt: isoAgo(2 * H), startedAt: isoAgo(2 * H),
        elapsedMs: 40 * H, lastResumedAt: null, pausedAt: isoAgo(30 * M), tags: {}
      }
    },
    history: []
  };
  const a = buildFocusRows(engine, { profile_id: 'p' }).find(r => r.client_id === 'f_n2p');
  await new Promise(r => setTimeout(r, 25));
  const b = buildFocusRows(engine, { profile_id: 'p' }).find(r => r.client_id === 'f_n2p');
  assert.equal(a.tags._elapsedMs, b.tags._elapsedMs,
    'pre-fix this crept up each cycle until life caught up and the clamp stopped firing');
});

// ── N3b: a malformed remote anchor must not become a fresh `now` ──

test('N3: adopting a malformed remote _startedAt does not invent a new anchor', async () => {
  installChromeMock({ store: {} });
  const focus = await import('../src/background/services/focusService.js');

  const priorResumed = isoAgo(20 * M);
  const engine = {
    activeFocusId: null,
    items: {
      f_n3: {
        id: 'f_n3', label: 'Malformed remote', focusState: 'paused',
        createdAt: isoAgo(5 * H), startedAt: isoAgo(5 * H),
        elapsedMs: 90 * M, lastResumedAt: priorResumed, tags: {}
      }
    },
    history: []
  };

  assert.doesNotThrow(() => focus.adoptRemoteActive(engine.items.f_n3, engine, 'not-a-timestamp'));
  const item = engine.items.f_n3;
  assert.equal(item.lastResumedAt, priorResumed, 'must not be rewritten to now');
  assert.equal(item.elapsedMs, 90 * M, 'and must not be zeroed');
  assert.equal(item.focusState, 'active', 'the adoption itself still happens');
});
