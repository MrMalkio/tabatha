// Regression tests for what this install PUBLISHES into
// tabatha.browser_profile_status — sync forensics S9/#9 and S5/#5.
//
// These exercise the real awarenessService against the chrome + supabase
// fakes and assert on the row it actually writes, rather than on a helper.
// That matters: S9 was not a bad helper, it was the payload builder reading
// the wrong field.
//
// Run: node --test test/awarenessStatusPayload.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';
import { createSupabaseFake } from '../testutils/supabaseFake.js';
import { MAX_CONTINUOUS_RUN_MS } from '../src/utils/elapsedClamp.js';

const PROFILE = 'profile-status-1';
const SELF = 'bp-self-status';
const M = 60 * 1000;
const H = 60 * M;

// schedulePush() debounces by 500ms; give it margin.
const settle = () => new Promise(r => setTimeout(r, 700));

function isoAgo(ms) { return new Date(Date.now() - ms).toISOString(); }

async function publish({ focusEngine, clockSession }) {
  installChromeMock({ store: { focusEngine, clockSession } });
  const sb = createSupabaseFake({ selects: { browser_profile_status: [] } });
  const awareness = await import('../src/background/services/awarenessService.js');
  awareness.configureAwarenessService({ supabase: sb });
  awareness.__setActiveForTest({ profileId: PROFILE, browserProfileId: SELF });
  await awareness.notifyStateChange();
  await settle();
  return { sb, awareness };
}

function lastStatusWrite(sb) {
  const ups = sb.recorded.upserts.filter(u => u.table === 'browser_profile_status');
  if (ups.length) return ups[ups.length - 1].rows;
  const upd = sb.recorded.updates.filter(u => u.table === 'browser_profile_status');
  return upd.length ? upd[upd.length - 1].payload : null;
}

// ── S9 / bug #9 ───────────────────────────────────────────────────

test('S9: focus_elapsed_ms publishes the LIVE elapsed, not the frozen stored value', async () => {
  // The exact three-way snapshot from the audit §3 (2026-07-25T03:22:27Z):
  //   stored elapsedMs      = 249.2 min   <- what the old code published
  //   live run since resume = 201.9 min
  //   extension's own view  = 451.1 min   <- what it should have published
  const storedMs = Math.round(249.2 * M);
  const runMs = Math.round(201.9 * M);

  const { sb } = await publish({
    focusEngine: {
      activeFocusId: 'f_s9',
      items: {
        f_s9: {
          id: 'f_s9', label: 'TGC meeting 2 prep', focusState: 'active',
          elapsedMs: storedMs, lastResumedAt: isoAgo(runMs),
          createdAt: isoAgo(10 * H), startedAt: isoAgo(10 * H), timerMinutes: null
        }
      }
    },
    clockSession: null
  });

  const row = lastStatusWrite(sb);
  assert.ok(row, 'a status row must have been written');
  const publishedMin = row.focus_elapsed_ms / M;

  assert.ok(Math.abs(publishedMin - 451.1) < 1,
    `expected ~451 min (stored + live run), got ${publishedMin.toFixed(1)} min`);
  assert.ok(publishedMin > 250,
    'publishing the stored-only 249.2 min is the exact S9 defect');
});

test('S9: focus_elapsed_ms of a PAUSED focus stays frozen at the stored value', async () => {
  const storedMs = 42 * M;
  const { sb } = await publish({
    focusEngine: {
      activeFocusId: 'f_s9_paused',
      items: {
        f_s9_paused: {
          id: 'f_s9_paused', label: 'Paused thing', focusState: 'paused',
          elapsedMs: storedMs, lastResumedAt: null,
          createdAt: isoAgo(5 * H), timerMinutes: null
        }
      }
    },
    clockSession: null
  });
  assert.equal(lastStatusWrite(sb).focus_elapsed_ms, storedMs);
});

test('S9: the published elapsed is clamped, so a stuck anchor cannot publish 37h', async () => {
  const { sb } = await publish({
    focusEngine: {
      activeFocusId: 'f_s9_stuck',
      items: {
        f_s9_stuck: {
          id: 'f_s9_stuck', label: 'Tabby work', focusState: 'active',
          elapsedMs: 0, lastResumedAt: isoAgo(37.24 * H),
          createdAt: isoAgo(76.22 * H), timerMinutes: null
        }
      }
    },
    clockSession: null
  });
  assert.equal(lastStatusWrite(sb).focus_elapsed_ms, MAX_CONTINUOUS_RUN_MS);
});

test('S9: the heartbeat-only refresh still carries focus_elapsed_ms', async () => {
  // focus_elapsed_ms was removed from the identity keys (it now varies every
  // tick, and leaving it there would force a full upsert every 60s). That is
  // only safe if the cheap heartbeat UPDATE writes it — otherwise the column
  // re-freezes between full upserts, which is bug #9 all over again.
  const engine = {
    activeFocusId: 'f_s9_hb',
    items: {
      f_s9_hb: {
        id: 'f_s9_hb', label: 'Steady work', focusState: 'active',
        elapsedMs: 10 * M, lastResumedAt: isoAgo(1 * M),
        createdAt: isoAgo(3 * H), timerMinutes: null
      }
    }
  };
  const { sb, awareness } = await publish({ focusEngine: engine, clockSession: null });
  const firstUpserts = sb.recorded.upserts.filter(u => u.table === 'browser_profile_status').length;
  assert.equal(firstUpserts, 1, 'first push is a full upsert');

  // Second push with NO identity-field change → takes the heartbeat path.
  await awareness.notifyStateChange();
  await settle();

  const upserts = sb.recorded.upserts.filter(u => u.table === 'browser_profile_status');
  const updates = sb.recorded.updates.filter(u => u.table === 'browser_profile_status');
  assert.equal(upserts.length, 1, 'no second full upsert — the diff optimisation still works');
  assert.equal(updates.length, 1, 'the cheap heartbeat UPDATE ran instead');
  assert.ok('focus_elapsed_ms' in updates[0].payload,
    'the heartbeat refresh MUST carry focus_elapsed_ms or the column re-freezes');
  assert.ok(updates[0].payload.focus_elapsed_ms >= 10 * M);
});

// ── S5 / bug #5 ───────────────────────────────────────────────────

test('S5: after a break ends, the published last_clock_event_at is the break-end, not the shift start', async () => {
  const clockedInAt = isoAgo(5 * H);
  const breakEndedAt = isoAgo(30 * M);

  const { sb } = await publish({
    focusEngine: null,
    clockSession: {
      active: true, onBreak: false,
      clockedInAt, breakStartedAt: null, breakEndedAt, breaks: [],
      clockedOutAt: null
    }
  });

  const row = lastStatusWrite(sb);
  assert.equal(row.clock_state, 'clocked_in');
  assert.equal(row.last_clock_event_at, breakEndedAt,
    'pre-fix this regressed to clockedInAt, letting a stale sibling win arbitration');
  assert.notEqual(row.last_clock_event_at, clockedInAt);
});

test('S5: while ON break the published event is the break start', async () => {
  const clockedInAt = isoAgo(5 * H);
  const breakStartedAt = isoAgo(10 * M);
  const { sb } = await publish({
    focusEngine: null,
    clockSession: {
      active: true, onBreak: true,
      clockedInAt, breakStartedAt, breakEndedAt: isoAgo(3 * H), breaks: [], clockedOutAt: null
    }
  });
  const row = lastStatusWrite(sb);
  assert.equal(row.clock_state, 'on_break');
  assert.equal(row.on_break_since, breakStartedAt);
  assert.equal(row.last_clock_event_at, breakStartedAt);
});

// ── Koda P2: a PAUSED focus's timer deadline must not slide ───────
//
// `focus_timer_ends_at` is an absolute instant derived from `now + remaining`.
// Once focus_elapsed_ms moved into the 60s heartbeat refresh, recomputing the
// deadline alongside it slid it forward 60s per heartbeat — so a paused timer
// rendered as counting UP (OtherProfilesStrip.jsx, TeamActivityPanel.jsx).

test('P2: the heartbeat refresh does NOT move focus_timer_ends_at while paused', async () => {
  const engine = {
    activeFocusId: 'f_p2_paused',
    items: {
      f_p2_paused: {
        id: 'f_p2_paused', label: 'Paused with a timer', focusState: 'paused',
        elapsedMs: 5 * M, lastResumedAt: null,
        createdAt: isoAgo(3 * H), startedAt: isoAgo(3 * H), timerMinutes: 25
      }
    }
  };
  const { sb, awareness } = await publish({ focusEngine: engine, clockSession: null });

  await awareness.notifyStateChange();
  await settle();

  const updates = sb.recorded.updates.filter(u => u.table === 'browser_profile_status');
  assert.equal(updates.length, 1, 'the cheap heartbeat path ran');
  assert.ok('focus_elapsed_ms' in updates[0].payload, 'elapsed is still refreshed');
  assert.ok(!('focus_timer_ends_at' in updates[0].payload),
    'a paused timer deadline must NOT be recomputed — that made it count up');
});

test('P2: a RUNNING focus does still refresh focus_timer_ends_at', async () => {
  const engine = {
    activeFocusId: 'f_p2_run',
    items: {
      f_p2_run: {
        id: 'f_p2_run', label: 'Running with a timer', focusState: 'active',
        elapsedMs: 2 * M, lastResumedAt: isoAgo(1 * M),
        createdAt: isoAgo(3 * H), startedAt: isoAgo(3 * H), timerMinutes: 25
      }
    }
  };
  const { sb, awareness } = await publish({ focusEngine: engine, clockSession: null });

  await awareness.notifyStateChange();
  await settle();

  const updates = sb.recorded.updates.filter(u => u.table === 'browser_profile_status');
  assert.equal(updates.length, 1);
  assert.ok('focus_timer_ends_at' in updates[0].payload,
    'a live countdown must keep its deadline fresh');
});

test('P2: the internal _focusRunning flag never reaches the database row', async () => {
  const engine = {
    activeFocusId: 'f_p2_leak',
    items: {
      f_p2_leak: {
        id: 'f_p2_leak', label: 'Leak check', focusState: 'active',
        elapsedMs: 0, lastResumedAt: isoAgo(1 * M),
        createdAt: isoAgo(1 * H), startedAt: isoAgo(1 * H), timerMinutes: null
      }
    }
  };
  const { sb } = await publish({ focusEngine: engine, clockSession: null });
  const row = lastStatusWrite(sb);
  assert.ok(!Object.keys(row).includes('_focusRunning'), 'it is non-enumerable');
  assert.ok(!('_focusRunning' in JSON.parse(JSON.stringify(row))), 'and never serialised');
});
