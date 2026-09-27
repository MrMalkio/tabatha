// End-to-end guard for the 2026-09-27 Flux Disk-IO outage fix: a second sync
// cycle with nothing changed must write no focus rows, a change writes only
// the changed row, and a failed write is retried in full next cycle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';
import { createSupabaseFake } from '../testutils/supabaseFake.js';

const PROFILE = 'profile-123';
const isoAgo = (min) => new Date(Date.now() - min * 60000).toISOString();

async function setup(engine) {
  const chrome = installChromeMock({
    store: {
      _orgRegistryBootstrappedAt: isoAgo(600),
      _dataRehydratedAt: { [PROFILE]: isoAgo(600) },
      focusEngine: engine
    }
  });
  const sb = createSupabaseFake({
    session: { user: { id: 'auth-user-1' } },
    selects: {
      profiles: [{ id: PROFILE, default_org_id: null, default_team_id: null }],
      browser_profiles: [{ id: 'bp-1' }],
      operations: [], initiatives: [], clients: [], projects: [], tasks_registry: [],
      calendars: [], calendar_events: []
    }
  });
  const sync = await import('../src/background/services/syncService.js');
  sync.configureSyncService({ supabase: sb });
  return { chrome, sb, sync };
}

const engine = () => ({
  items: {
    'f-1': { id: 'f-1', label: 'One', focusState: 'paused', tags: {}, createdAt: isoAgo(90), pausedAt: isoAgo(30) },
    'f-2': { id: 'f-2', label: 'Two', focusState: 'paused', tags: {}, createdAt: isoAgo(80), pausedAt: isoAgo(20) }
  },
  history: [
    { id: 'h-1', label: 'Done', focusState: 'completed', funnelStage: 'resolved', tags: {}, createdAt: isoAgo(300), endedAt: isoAgo(200) }
  ]
});

const focusPushes = (sb) => sb.recorded.upserts.filter((u) => u.table === 'focus_items' && !u.error);

test('an unchanged second cycle writes no focus rows', async () => {
  const { sb, sync } = await setup(engine());
  await sync.syncToSupabase();
  assert.equal(focusPushes(sb).length, 1);
  assert.equal(focusPushes(sb)[0].rows.length, 3, 'first cycle pushes everything');
  await sync.syncToSupabase();
  assert.equal(focusPushes(sb).length, 1, 'second cycle must not upsert focus_items at all');
});

test('a rename writes only that row', async () => {
  const { chrome, sb, sync } = await setup(engine());
  await sync.syncToSupabase();
  const e = chrome._storage.focusEngine;
  chrome._storage.focusEngine = { ...e, items: { ...e.items, 'f-2': { ...e.items['f-2'], label: 'Two, renamed' } } };
  await sync.syncToSupabase();
  const pushes = focusPushes(sb);
  assert.equal(pushes.length, 2);
  assert.deepEqual(pushes[1].rows.map((r) => r.client_id), ['f-2']);
});

test('a failed push is retried in full on the next cycle', async () => {
  const { sb, sync } = await setup(engine());
  sb.setError('upsert', 'focus_items', { code: '57014', message: 'canceling statement due to statement timeout' });
  await sync.syncToSupabase();
  sb.setError('upsert', 'focus_items', null);
  await sync.syncToSupabase();
  const ok = focusPushes(sb);
  assert.equal(ok.length, 1);
  assert.equal(ok[0].rows.length, 3, 'nothing was recorded as pushed after the failure');
});
