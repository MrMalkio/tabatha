// ============================================================
// FIX-09 (9A/9B) + v6.7.7 — invite / org / profile cloud writes.
//
// Original regression (PGRST202): the invite/org RPC wrappers called
// supabase.rpc(...) WITHOUT .schema('tabatha'), so PostgREST looked in `public`,
// didn't find the function, and invite-join broke. The RPCs live in the
// `tabatha` schema and MUST be schema-qualified.
//
// As of v6.7.7 these mutations no longer run in page context (they self-
// deadlocked the page's Supabase auth client). They are ROUTED through the
// background service worker via typed runtime messages, and the actual
// schema-qualified RPC now executes in `cloudWriteService`. This test guards
// BOTH layers:
//   A. the page wrappers send the correct message type + params and unwrap the
//      { ok, data } envelope (throwing on ok:false);
//   B. cloudWriteService still schema-qualifies every RPC with 'tabatha' and
//      forwards its params (the actual PGRST202 guard), and refuses to fire an
//      RPC when there is no session.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Shared in-memory chrome stub (storage + runtime messaging) ──────────
const store = {};
let sendMessageImpl = async () => ({ ok: true });
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
  runtime: {
    sendMessage: (...args) => sendMessageImpl(...args),
    lastError: null
  },
  alarms: { create() {}, clear() {} }
};

const client = await import('../src/services/supabaseClient.js');
const cloud = await import('../src/background/services/cloudWriteService.js');

// ── Part A: page wrappers route through the background ──────────────────
test('redeemInviteToken routes REDEEM_INVITE_TOKEN and unwraps data', async () => {
  const seen = [];
  sendMessageImpl = async (msg) => { seen.push(msg); return { ok: true, data: { success: true, org_id: 'o1' } }; };
  const res = await client.redeemInviteToken('abc-123');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, 'REDEEM_INVITE_TOKEN');
  assert.equal(seen[0].token, 'abc-123');
  assert.deepEqual(res, { success: true, org_id: 'o1' });
});

test('createOrganization routes CREATE_ORGANIZATION and unwraps data', async () => {
  const seen = [];
  sendMessageImpl = async (msg) => { seen.push(msg); return { ok: true, data: { success: true, org_id: 'o2' } }; };
  const res = await client.createOrganization('Acme Inc');
  assert.equal(seen[0].type, 'CREATE_ORGANIZATION');
  assert.equal(seen[0].name, 'Acme Inc');
  assert.equal(res.org_id, 'o2');
});

test('createInviteToken routes CREATE_INVITE_TOKEN with all params', async () => {
  const seen = [];
  sendMessageImpl = async (msg) => { seen.push(msg); return { ok: true, data: { success: true, token: 't' } }; };
  await client.createInviteToken({ orgId: 'org-1', teamId: null, role: 'user', expiresInHours: 168 });
  assert.equal(seen[0].type, 'CREATE_INVITE_TOKEN');
  assert.equal(seen[0].orgId, 'org-1');
  assert.equal(seen[0].role, 'user');
  assert.equal(seen[0].expiresInHours, 168);
});

test('wrappers throw when the background reports failure', async () => {
  sendMessageImpl = async () => ({ ok: false, error: 'Must be signed in to redeem a token.' });
  await assert.rejects(() => client.redeemInviteToken('x'), /signed in/i);
  await assert.rejects(() => client.createOrganization('x'), /signed in/i);
});

test('updateProfileName routes UPDATE_PROFILE_NAME (optimistic ack)', async () => {
  const seen = [];
  sendMessageImpl = async (msg) => { seen.push(msg); return { ok: true, success: true, queued: true, displayName: msg.displayName }; };
  const res = await client.updateProfileName({ displayName: 'Zoe', profileId: 'p1' });
  assert.equal(seen[0].type, 'UPDATE_PROFILE_NAME');
  assert.equal(seen[0].displayName, 'Zoe');
  assert.equal(res.queued, true);
});

// ── Part B: cloudWriteService schema-qualifies every RPC (PGRST202 guard) ──
function fakeSupabase({ session = { user: { id: 'auth-user-1' } }, rpcResult = { success: true, org_id: 'o', team_id: null } } = {}) {
  const calls = { rpc: [] };
  const sb = {
    auth: { async getSession() { return { data: { session } }; } },
    schema: (schemaName) => ({
      rpc: (name, params) => { calls.rpc.push({ schema: schemaName, name, params }); return Promise.resolve({ data: rpcResult, error: null }); },
      // profile read used by the REDEEM defense path — returns a profile that
      // already has an org default so applyInviteDefaults no-ops.
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', default_org_id: 'o' }, error: null }) }) })
      })
    })
  };
  return { sb, calls };
}

test('cloudWriteService.CREATE_ORGANIZATION is schema-qualified to tabatha', async () => {
  const { sb, calls } = fakeSupabase();
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() {} });
  const res = await cloud.handleMessage('CREATE_ORGANIZATION', { name: 'Acme' });
  assert.equal(res.ok, true);
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.rpc[0].schema, 'tabatha', 'must be tabatha-qualified (else PGRST202)');
  assert.equal(calls.rpc[0].name, 'create_organization');
  assert.deepEqual(calls.rpc[0].params, { p_name: 'Acme' });
});

test('cloudWriteService.REDEEM_INVITE_TOKEN is schema-qualified and forwards token', async () => {
  const { sb, calls } = fakeSupabase();
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() {} });
  const res = await cloud.handleMessage('REDEEM_INVITE_TOKEN', { token: 'abc-123' });
  assert.equal(res.ok, true);
  assert.equal(calls.rpc[0].schema, 'tabatha');
  assert.equal(calls.rpc[0].name, 'redeem_invite_token');
  assert.deepEqual(calls.rpc[0].params, { p_token: 'abc-123' });
});

test('cloudWriteService.CREATE_INVITE_TOKEN is schema-qualified with all params', async () => {
  const { sb, calls } = fakeSupabase({ rpcResult: { success: true, token: 't' } });
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() {} });
  const res = await cloud.handleMessage('CREATE_INVITE_TOKEN', { orgId: 'org-1', teamId: null, role: 'user', expiresInHours: 72 });
  assert.equal(res.ok, true);
  assert.equal(calls.rpc[0].schema, 'tabatha');
  assert.equal(calls.rpc[0].name, 'create_invite_token');
  assert.equal(calls.rpc[0].params.p_org_id, 'org-1');
  assert.equal(calls.rpc[0].params.p_expires_in_hours, 72);
});

test('cloudWriteService refuses to fire an RPC without a session', async () => {
  const { sb, calls } = fakeSupabase({ session: null });
  cloud.configureCloudWriteService({ supabase: sb, triggerSync() {} });
  const r1 = await cloud.handleMessage('REDEEM_INVITE_TOKEN', { token: 'x' });
  const r2 = await cloud.handleMessage('CREATE_ORGANIZATION', { name: 'x' });
  assert.equal(r1.ok, false);
  assert.match(r1.error, /signed in/i);
  assert.equal(r2.ok, false);
  assert.equal(calls.rpc.length, 0, 'no RPC should fire without a session');
});
