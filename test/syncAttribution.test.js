// Workstream A1 — org-attribution regression tests.
// THE sync bug: synced rows must carry org_id/team_id when the profile
// defaults are populated. Covers both the server-fed sync path
// (syncToSupabase) and the client defense-in-depth (applyInviteDefaults).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';
import { createSupabaseFake } from '../testutils/supabaseFake.js';

const ORG = 'org-aaa';
const TEAM = 'team-bbb';
const PROFILE = 'profile-123';
const AUTH = 'auth-user-1';

function isoAgo(min) { return new Date(Date.now() - min * 60000).toISOString(); }

// Build a supabase fake whose profile read returns populated defaults, plus
// the store the sync needs. Returns { sb, sync }.
async function setupSync({ profileDefaults = {}, store = {} } = {}) {
  installChromeMock({ store });
  const sb = createSupabaseFake({
    session: { user: { id: AUTH } },
    selects: {
      profiles: [{ id: PROFILE, default_org_id: profileDefaults.org ?? null, default_team_id: profileDefaults.team ?? null }],
      // browser_profiles upsert returns a row with an id (fresh-install path)
      browser_profiles: [{ id: 'bp-1' }],
      // org-registry pulls + calendar pulls resolve to empty
      operations: [], initiatives: [], clients: [], projects: [], tasks_registry: [],
      calendars: [], calendar_events: [],
    },
  });
  const sync = await import('../src/background/services/syncService.js');
  sync.configureSyncService({ supabase: sb });
  return { sb, sync };
}

test('synced clock_sessions upsert carries org_id/team_id when profile defaults set', async () => {
  const clockHistory = [{
    id: 'clk-1',
    clockedInAt: isoAgo(120),
    clockedOutAt: isoAgo(60),
    breaks: [],
  }];
  const { sb, sync } = await setupSync({
    profileDefaults: { org: ORG, team: TEAM },
    store: { clockHistory },
  });

  await sync.syncToSupabase();

  const clockUpsert = sb.recorded.upserts.find(u => u.table === 'clock_sessions');
  assert.ok(clockUpsert, 'expected a clock_sessions upsert');
  assert.equal(clockUpsert.rows.length, 1);
  assert.equal(clockUpsert.rows[0].org_id, ORG);
  assert.equal(clockUpsert.rows[0].team_id, TEAM);
  assert.equal(clockUpsert.rows[0].profile_id, PROFILE);
});

test('intent_history inline insert carries org_id/team_id', async () => {
  const intentHistory = [{ action: 'change', context: 'writing', timestamp: isoAgo(30) }];
  const { sb, sync } = await setupSync({
    profileDefaults: { org: ORG, team: TEAM },
    store: { intentHistory },
  });

  await sync.syncToSupabase();

  const intentInsert = sb.recorded.inserts.find(i => i.table === 'intent_history');
  assert.ok(intentInsert, 'expected an intent_history insert');
  assert.equal(intentInsert.rows[0].org_id, ORG);
  assert.equal(intentInsert.rows[0].team_id, TEAM);
  assert.equal(intentInsert.rows[0].profile_id, PROFILE);
});

test('clock_sessions org_id is null when profile defaults are unset (regression guard)', async () => {
  const clockHistory = [{ id: 'clk-2', clockedInAt: isoAgo(120), clockedOutAt: isoAgo(60), breaks: [] }];
  const { sb, sync } = await setupSync({
    profileDefaults: { org: null, team: null },
    store: { clockHistory },
  });

  await sync.syncToSupabase();

  const clockUpsert = sb.recorded.upserts.find(u => u.table === 'clock_sessions');
  assert.ok(clockUpsert);
  assert.equal(clockUpsert.rows[0].org_id, null);
  assert.equal(clockUpsert.rows[0].team_id, null);
});

// ── Client defense-in-depth: applyInviteDefaults ──

test('applyInviteDefaults fires profiles.update({default_org_id}) when defaults null', async () => {
  const { applyInviteDefaults } = await import('../src/services/orgAttribution.js');
  const sb = createSupabaseFake({ selects: { profiles: [] } });

  const fired = await applyInviteDefaults({
    supabase: sb,
    profile: { id: PROFILE, default_org_id: null, default_team_id: null },
    result: { success: true, org_id: ORG, team_id: TEAM },
  });

  assert.equal(fired, true, 'should report it applied');
  const upd = sb.recorded.updates.find(u => u.table === 'profiles');
  assert.ok(upd, 'expected a profiles update');
  assert.equal(upd.payload.default_org_id, ORG);
  assert.equal(upd.payload.default_team_id, TEAM);
  assert.deepEqual(upd.filters[0], ['id', PROFILE]);
});

test('applyInviteDefaults is a no-op when profile already has a default_org_id', async () => {
  const { applyInviteDefaults } = await import('../src/services/orgAttribution.js');
  const sb = createSupabaseFake();

  const fired = await applyInviteDefaults({
    supabase: sb,
    profile: { id: PROFILE, default_org_id: 'existing-org', default_team_id: null },
    result: { success: true, org_id: ORG, team_id: TEAM },
  });

  assert.equal(fired, false);
  assert.equal(sb.recorded.updates.length, 0, 'must not clobber an existing default');
});

test('applyInviteDefaults no-ops on a failed redeem result', async () => {
  const { applyInviteDefaults } = await import('../src/services/orgAttribution.js');
  const sb = createSupabaseFake();

  const fired = await applyInviteDefaults({
    supabase: sb,
    profile: { id: PROFILE, default_org_id: null },
    result: { success: false, error: 'Invalid token' },
  });

  assert.equal(fired, false);
  assert.equal(sb.recorded.updates.length, 0);
});
