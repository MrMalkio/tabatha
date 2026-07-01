// ============================================================
// FIX-09 (9A/9B) — invite / org client wrappers must be schema-qualified.
//
// Regression guard for the PGRST202 bug: redeemInviteToken called
// supabase.rpc(...) WITHOUT .schema('tabatha'), so PostgREST looked for the
// function in `public`, didn't find it, and invite-join was broken. The RPCs
// live in the `tabatha` schema, so every wrapper MUST route through
// supabase.schema('tabatha').rpc(name, params).
//
// We can't hit a live DB here, so we monkey-patch the exported supabase
// singleton to record which schema each rpc() call was made against, then
// assert each wrapper qualifies with 'tabatha' and forwards its params.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../src/services/supabaseClient.js';

// Install a recording spy over the real singleton's methods. Returns the call
// log plus a restore() to undo the patch.
function patchSupabase({ session = { user: { id: 'auth-user-1' } } } = {}) {
  const sb = client.supabase;
  const original = { auth: sb.auth, schema: sb.schema, rpc: sb.rpc };
  const calls = { rpc: [] }; // { schema, name, params }

  // getSession() (used by the wrappers) reads supabase.auth.getSession().
  sb.auth = { async getSession() { return { data: { session }, error: null }; } };

  // Top-level .rpc() — if a wrapper ever calls this it means it FAILED to
  // schema-qualify. Record schema as 'public' (PostgREST's default) so the
  // assertion fails loudly with a meaningful value.
  sb.rpc = (name, params) => {
    calls.rpc.push({ schema: 'public', name, params });
    return Promise.resolve({ data: { success: true }, error: null });
  };

  // .schema(name).rpc(...) — the correct path.
  sb.schema = (schemaName) => ({
    rpc: (name, params) => {
      calls.rpc.push({ schema: schemaName, name, params });
      return Promise.resolve({ data: { success: true }, error: null });
    },
  });

  return {
    calls,
    restore() { sb.auth = original.auth; sb.schema = original.schema; sb.rpc = original.rpc; },
  };
}

test('redeemInviteToken calls tabatha.redeem_invite_token (schema-qualified)', async () => {
  const spy = patchSupabase();
  try {
    await client.redeemInviteToken('abc-123');
    assert.equal(spy.calls.rpc.length, 1);
    const [c] = spy.calls.rpc;
    assert.equal(c.schema, 'tabatha', 'redeem RPC must be qualified with the tabatha schema (else PGRST202)');
    assert.equal(c.name, 'redeem_invite_token');
    assert.deepEqual(c.params, { p_token: 'abc-123' });
  } finally {
    spy.restore();
  }
});

test('createOrganization calls tabatha.create_organization (schema-qualified)', async () => {
  const spy = patchSupabase();
  try {
    await client.createOrganization('Acme Inc');
    assert.equal(spy.calls.rpc.length, 1);
    const [c] = spy.calls.rpc;
    assert.equal(c.schema, 'tabatha');
    assert.equal(c.name, 'create_organization');
    assert.deepEqual(c.params, { p_name: 'Acme Inc' });
  } finally {
    spy.restore();
  }
});

test('createInviteToken remains schema-qualified (guard against regression)', async () => {
  const spy = patchSupabase();
  try {
    await client.createInviteToken({ orgId: 'org-1', teamId: null, role: 'user', expiresInHours: 168 });
    assert.equal(spy.calls.rpc.length, 1);
    const [c] = spy.calls.rpc;
    assert.equal(c.schema, 'tabatha');
    assert.equal(c.name, 'create_invite_token');
    assert.equal(c.params.p_org_id, 'org-1');
  } finally {
    spy.restore();
  }
});

test('wrappers throw when there is no session', async () => {
  const spy = patchSupabase({ session: null });
  try {
    await assert.rejects(() => client.redeemInviteToken('x'), /logged in/i);
    await assert.rejects(() => client.createOrganization('x'), /logged in/i);
    assert.equal(spy.calls.rpc.length, 0, 'no RPC should fire without a session');
  } finally {
    spy.restore();
  }
});
