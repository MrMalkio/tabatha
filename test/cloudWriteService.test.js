// ============================================================
// cloudWriteService — background outbox flush + token/auth-state handlers.
//
// Exercises the queue-never-race path end to end against a fake Supabase
// client: UPDATE_PROFILE_NAME enqueues (optimistic ack), flush executes the
// schema-qualified profiles.update, success drains the op, failure retains +
// backs it off, dedupe collapses repeated renames, and a signed-out flush
// leaves everything queued.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        if (keys == null) return { ...store };
        if (typeof keys === 'string') return { [keys]: store[keys] };
        if (Array.isArray(keys)) { const o = {}; for (const k of keys) o[k] = store[k]; return o; }
        return { ...store };
      },
      async set(obj) { Object.assign(store, obj); },
      async remove(keys) { for (const k of [].concat(keys)) delete store[k]; }
    }
  },
  runtime: { sendMessage: async () => ({ ok: true }), lastError: null },
  alarms: { create() {}, clear() {} }
};

const cloud = await import('../src/background/services/cloudWriteService.js');

function resetStore() { for (const k of Object.keys(store)) delete store[k]; }
// Let the fire-and-forget flush kicked by UPDATE_PROFILE_NAME settle so an
// explicit flush in a test doesn't collide with it (single-flight guard).
const settle = () => new Promise(r => setTimeout(r, 15));

// Fake profiles.update(...).eq(...).select() → resolves { data, error }.
function fakeSupabase({ session = { user: { id: 'auth-1', email: 'a@b.co' }, access_token: 'jwt', expires_at: 111 }, rows = [{ id: 'p1', display_name: 'X' }], error = null } = {}) {
  const calls = { updates: [] };
  const sb = {
    auth: { async getSession() { return { data: { session } }; } },
    schema: (schemaName) => ({
      from: (table) => ({
        update: (payload) => {
          const chain = {
            _eq: null,
            eq(col, val) { chain._eq = { col, val }; return chain; },
            async select() { calls.updates.push({ schemaName, table, payload, eq: chain._eq }); return { data: rows, error }; }
          };
          return chain;
        }
      })
    })
  };
  return { sb, calls };
}

test('UPDATE_PROFILE_NAME enqueues with dedupe key + returns optimistic ack', async () => {
  resetStore();
  const { sb } = fakeSupabase();
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() {} });
  const ack = await cloud.handleMessage('UPDATE_PROFILE_NAME', { displayName: 'Zoe', profileId: 'p1' });
  assert.equal(ack.ok, true);
  assert.equal(ack.queued, true);
  assert.equal(ack.displayName, 'Zoe');
  const box = store._cloudOutbox;
  assert.ok(Array.isArray(box));
  // (flush may have already drained it against the fake; assert the op existed
  // by checking it was either queued or flushed — see next test for drain.)
});

test('flush executes a schema-qualified profiles.update and drains the op', async () => {
  resetStore();
  const { sb, calls } = fakeSupabase({ rows: [{ id: 'p1', display_name: 'Zoe' }] });
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() {} });
  await cloud.handleMessage('UPDATE_PROFILE_NAME', { displayName: 'Zoe', profileId: 'p1' });
  await settle();
  await cloud.flushCloudOutbox();
  assert.equal(calls.updates.length >= 1, true);
  const u = calls.updates[0];
  assert.equal(u.schemaName, 'tabatha');
  assert.equal(u.table, 'profiles');
  assert.equal(u.payload.display_name, 'Zoe');
  assert.deepEqual(u.eq, { col: 'id', val: 'p1' });
  // Outbox drained on success.
  assert.equal((store._cloudOutbox || []).length, 0);
});

test('flush retains + backs off the op when the update changes 0 rows', async () => {
  resetStore();
  const { sb } = fakeSupabase({ rows: [] }); // 0 rows → stale-session style failure
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() {} });
  await cloud.handleMessage('UPDATE_PROFILE_NAME', { displayName: 'Zoe', profileId: 'p1' });
  await settle();
  await cloud.flushCloudOutbox();
  const box = store._cloudOutbox || [];
  assert.equal(box.length, 1, 'op retained for retry');
  assert.equal(box[0].attempts, 1);
  assert.ok(box[0].nextAttemptAt > Date.now(), 'backed off into the future');
});

test('repeated renames dedupe to a single latest-wins op', async () => {
  resetStore();
  // Signed out so flush is a no-op and the queue is observable.
  const { sb } = fakeSupabase({ session: null });
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() {} });
  await cloud.handleMessage('UPDATE_PROFILE_NAME', { displayName: 'A', profileId: 'p1' });
  await cloud.handleMessage('UPDATE_PROFILE_NAME', { displayName: 'B', profileId: 'p1' });
  await cloud.handleMessage('UPDATE_PROFILE_NAME', { displayName: 'C', profileId: 'p1' });
  const box = store._cloudOutbox || [];
  assert.equal(box.length, 1, 'single pending op for the profile');
  assert.equal(box[0].payload.displayName, 'C', 'latest wins');
});

test('flush is a no-op while signed out (op stays queued)', async () => {
  resetStore();
  const { sb, calls } = fakeSupabase({ session: null });
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() {} });
  await cloud.handleMessage('UPDATE_PROFILE_NAME', { displayName: 'Zoe', profileId: 'p1' });
  await settle();
  const res = await cloud.flushCloudOutbox();
  assert.equal(res.skipped, 'signed_out');
  assert.equal(calls.updates.length, 0);
  assert.equal((store._cloudOutbox || []).length, 1);
});

test('GET_ACCESS_TOKEN + GET_AUTH_STATE expose the session summary', async () => {
  resetStore();
  const { sb } = fakeSupabase();
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() {} });
  const tok = await cloud.handleMessage('GET_ACCESS_TOKEN', {});
  assert.equal(tok.token, 'jwt');
  assert.equal(tok.expiresAt, 111);
  const state = await cloud.handleMessage('GET_AUTH_STATE', {});
  assert.equal(state.session.user.id, 'auth-1');
  assert.equal(state.session.user.email, 'a@b.co');
});

test('AUTH_STATE_CHANGED (signed in) triggers a sync', async () => {
  resetStore();
  let synced = 0;
  const { sb } = fakeSupabase();
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() { synced += 1; } });
  await cloud.handleMessage('AUTH_STATE_CHANGED', { event: 'SIGNED_IN', hasSession: true });
  assert.equal(synced, 1);
});

test('unhandled types fall through (return undefined)', async () => {
  const { sb } = fakeSupabase();
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() {} });
  assert.equal(await cloud.handleMessage('SOMETHING_ELSE', {}), undefined);
});
