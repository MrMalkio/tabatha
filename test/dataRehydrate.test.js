// Workstream A3 — cloud rehydrate-on-sign-in.
// A fresh / new-ID install must reconstruct clockHistory, intentHistory and
// focus items from Supabase rows (newest-wins merge) and set the push
// watermarks to the newest pulled row so the next push finds 0 new (no churn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';
import { createSupabaseFake } from '../testutils/supabaseFake.js';

const PROFILE = 'profile-123';

function iso(min) { return new Date(Date.now() - min * 60000).toISOString(); }

async function freshModule() {
  // Re-import with a cache-buster so module-level state doesn't leak between tests.
  return import('../src/background/services/dataRehydrate.js?b=' + Math.random());
}

function serverRows() {
  return {
    clock_sessions: [{
      profile_id: PROFILE,
      client_id: 'clk-1',
      clocked_in_at: iso(180),
      clocked_out_at: iso(120),
      total_ms: 3600000,
      break_ms: 0,
      work_ms: 3600000,
      breaks: [],
      source: 'extension',
    }],
    intent_history: [{
      profile_id: PROFILE,
      action: 'change',
      context: 'writing',
      focus_id: null,
      url: null,
      domain: null,
      timestamp: iso(90),
    }],
    focus_items: [{
      profile_id: PROFILE,
      client_id: 'foc-1',
      label: 'Ship A3',
      funnel_stage: 'active',
      focus_state: 'paused',
      timer_minutes: 25,
      tags: {},
      created_at: iso(200),
      completed_at: null,
    }],
  };
}

test('rehydrate reconstructs clockHistory and sets lastClockSync to newest', async () => {
  const chrome = installChromeMock({ store: {} });
  const rows = serverRows();
  const sb = createSupabaseFake({ selects: rows });
  const { rehydrateUserData } = await freshModule();

  const summary = await rehydrateUserData({ supabase: sb, scope: { profile_id: PROFILE } });

  const { clockHistory, lastClockSync } = chrome._storage;
  assert.equal(clockHistory.length, 1);
  assert.equal(clockHistory[0].id, 'clk-1');
  assert.equal(clockHistory[0].clockedInAt, rows.clock_sessions[0].clocked_in_at);
  assert.equal(lastClockSync, rows.clock_sessions[0].clocked_out_at);
  assert.ok(summary.clock >= 1);
});

test('rehydrate rebuilds intentHistory and sets lastIntentSync (next push finds 0 new)', async () => {
  const chrome = installChromeMock({ store: {} });
  const rows = serverRows();
  const sb = createSupabaseFake({ selects: rows });
  const { rehydrateUserData } = await freshModule();

  await rehydrateUserData({ supabase: sb, scope: { profile_id: PROFILE } });

  const { intentHistory, lastIntentSync } = chrome._storage;
  assert.equal(intentHistory.length, 1);
  assert.equal(intentHistory[0].context, 'writing');
  assert.equal(lastIntentSync, rows.intent_history[0].timestamp);
  // The watermark equals the newest timestamp → a subsequent push (strictly
  // greater than watermark) would select 0 rows.
  assert.ok(new Date(lastIntentSync).getTime() >= new Date(rows.intent_history[0].timestamp).getTime());
});

test('rehydrate reconstructs focus items into the focus engine', async () => {
  const chrome = installChromeMock({ store: {} });
  const sb = createSupabaseFake({ selects: serverRows() });
  const { rehydrateUserData } = await freshModule();

  await rehydrateUserData({ supabase: sb, scope: { profile_id: PROFILE } });

  const engine = chrome._storage.focusEngine;
  assert.ok(engine, 'focusEngine should be written');
  const item = engine.items?.['foc-1'] || (engine.history || []).find(i => i.id === 'foc-1');
  assert.ok(item, 'foc-1 should be present in items or history');
  assert.equal(item.label, 'Ship A3');
});

test('merge is newest-wins and produces no duplicates', async () => {
  // Local already has clk-1 (older view) + a local-only clk-2.
  const localClock = [
    { id: 'clk-1', clockedInAt: iso(999), clockedOutAt: iso(998), totalMs: 1 },
    { id: 'clk-2', clockedInAt: iso(50), clockedOutAt: iso(40), totalMs: 600000 },
  ];
  const chrome = installChromeMock({ store: { clockHistory: localClock } });
  const rows = serverRows();
  const sb = createSupabaseFake({ selects: rows });
  const { rehydrateUserData } = await freshModule();

  await rehydrateUserData({ supabase: sb, scope: { profile_id: PROFILE } });

  const ids = chrome._storage.clockHistory.map(s => s.id).sort();
  assert.deepEqual(ids, ['clk-1', 'clk-2'], 'no duplicate ids; local-only kept');
  const merged = chrome._storage.clockHistory.find(s => s.id === 'clk-1');
  // Server row (real timestamps) should win over the bogus local stub.
  assert.equal(merged.clockedInAt, rows.clock_sessions[0].clocked_in_at);
});

// ── P3: focus items must be newest-wins, like clock rows ──

test('P3: cloud-newer focus row overwrites the local active item', async () => {
  const chrome = installChromeMock({
    store: {
      focusEngine: {
        activeFocusId: null,
        items: {
          'foc-1': { id: 'foc-1', label: 'Stale local label', funnelStage: 'unsorted', focusState: 'paused', updatedAt: iso(500) },
        },
        history: [],
      },
    },
  });
  const rows = serverRows();
  rows.focus_items[0].synced_at = iso(5); // server row is much newer
  const sb = createSupabaseFake({ selects: rows });
  const { rehydrateUserData } = await freshModule();

  await rehydrateUserData({ supabase: sb, scope: { profile_id: PROFILE } });

  const item = chrome._storage.focusEngine.items['foc-1'];
  assert.ok(item, 'foc-1 still present in items');
  assert.equal(item.label, 'Ship A3', 'newer cloud label should win');
});

test('P3: local-newer focus metadata is NOT clobbered by an older cloud row', async () => {
  const chrome = installChromeMock({
    store: {
      focusEngine: {
        activeFocusId: null,
        items: {
          'foc-1': { id: 'foc-1', label: 'Fresh local label', funnelStage: 'addressing', focusState: 'paused', updatedAt: iso(1) },
        },
        history: [],
      },
    },
  });
  const rows = serverRows();
  rows.focus_items[0].synced_at = iso(300); // server row is older than local
  const sb = createSupabaseFake({ selects: rows });
  const { rehydrateUserData } = await freshModule();

  await rehydrateUserData({ supabase: sb, scope: { profile_id: PROFILE } });

  const item = chrome._storage.focusEngine.items['foc-1'];
  assert.equal(item.label, 'Fresh local label', 'newer local metadata must survive');
});

test('P3: completed cloud focus merges into history with no duplicate ids', async () => {
  const rows = serverRows();
  rows.focus_items[0].focus_state = 'completed';
  rows.focus_items[0].completed_at = iso(30);
  // Two server rows with the SAME client_id should not duplicate.
  rows.focus_items.push({ ...rows.focus_items[0] });
  const chrome = installChromeMock({
    store: {
      focusEngine: {
        activeFocusId: null,
        items: {},
        history: [{ id: 'foc-1', label: 'Old completed copy', focusState: 'completed', completedAt: iso(120) }],
      },
    },
  });
  const sb = createSupabaseFake({ selects: rows });
  const { rehydrateUserData } = await freshModule();

  await rehydrateUserData({ supabase: sb, scope: { profile_id: PROFILE } });

  const history = chrome._storage.focusEngine.history;
  const matches = history.filter(h => h.id === 'foc-1');
  assert.equal(matches.length, 1, 'no duplicate history entries for foc-1');
  // Newer cloud completion (iso(30)) wins over the local copy (iso(120)).
  assert.equal(matches[0].label, 'Ship A3', 'newer cloud completion should win in history');
});

test('rehydrate is idempotent — second call is gated by _dataRehydratedAt', async () => {
  const chrome = installChromeMock({ store: {} });
  const sb = createSupabaseFake({ selects: serverRows() });
  const { rehydrateUserData, isRehydrateNeeded } = await freshModule();

  assert.equal(await isRehydrateNeeded(PROFILE), true);
  await rehydrateUserData({ supabase: sb, scope: { profile_id: PROFILE } });
  assert.equal(await isRehydrateNeeded(PROFILE), false, 'watermark must gate re-run for same profile');

  // A different profile (e.g. account switch) is NOT gated.
  assert.equal(await isRehydrateNeeded('other-profile'), true);
});
