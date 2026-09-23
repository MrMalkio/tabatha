// Asana PAT parity — extension-side Task Sync (Asana) connect card.
// Verifies CONNECT_ASANA / DISCONNECT_ASANA / SYNC_ASANA_NOW post well-formed
// requests to the right edge functions with the user's access token (never
// the anon key) as Bearer, that a missing/blank PAT never reaches fetch, and
// that GET_ASANA_INTEGRATION reads back status without ever seeing a secret.
// fetch and the supabase client are both mocked — no real network calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const asana = await import('../src/background/services/asanaIntegrationService.js');

function mockFetch(impl) {
  const calls = [];
  const fn = async (url, opts) => { calls.push({ url, opts }); return impl(url, opts); };
  fn.calls = calls;
  return fn;
}

const okResponse = (body = {}) => ({ ok: true, status: 200, async json() { return body; } });

const USER_TOKEN = 'user-access-token-abc123';
const getTokenOk = async () => USER_TOKEN;

test('shapePat trims whitespace and rejects non-string / blank input', () => {
  assert.equal(asana.shapePat('  abc123  '), 'abc123');
  assert.equal(asana.shapePat('   '), '');
  assert.equal(asana.shapePat(undefined), '');
  assert.equal(asana.shapePat(null), '');
  assert.equal(asana.shapePat(42), '');
});

test('buildRequest shapes a well-formed POST with Bearer + apikey headers', () => {
  const { url, options } = asana.buildRequest('/functions/v1/connect-asana', USER_TOKEN, { pat: 'tok' });
  assert.match(url, /\/functions\/v1\/connect-asana$/);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.headers['Authorization'], `Bearer ${USER_TOKEN}`);
  assert.ok(options.headers['apikey'], 'apikey header present');
  assert.equal(JSON.parse(options.body).pat, 'tok');
});

test('CONNECT_ASANA posts { pat } to connect-asana with the user access token', async () => {
  const fetchImpl = mockFetch(() => okResponse({ ok: true, workspaceGid: 'ws1', webhookRegistered: true }));
  asana.configureAsanaIntegrationService({ fetchImpl, getAccessToken: getTokenOk });

  const r = await asana.handleMessage('CONNECT_ASANA', { pat: '  my-secret-token  ' });

  assert.equal(r.ok, true);
  assert.equal(r.workspaceGid, 'ws1');
  assert.equal(fetchImpl.calls.length, 1);
  const { url, opts } = fetchImpl.calls[0];
  assert.match(url, /\/functions\/v1\/connect-asana$/);
  assert.equal(opts.headers['Authorization'], `Bearer ${USER_TOKEN}`);
  const body = JSON.parse(opts.body);
  // Trimmed before it ever reaches the wire.
  assert.equal(body.pat, 'my-secret-token');
});

test('CONNECT_ASANA rejects a blank PAT before calling fetch', async () => {
  const fetchImpl = mockFetch(() => okResponse());
  asana.configureAsanaIntegrationService({ fetchImpl, getAccessToken: getTokenOk });

  const r = await asana.handleMessage('CONNECT_ASANA', { pat: '   ' });
  assert.equal(r.ok, false);
  assert.ok(r.error);
  assert.equal(fetchImpl.calls.length, 0, 'must not call the edge function with a blank PAT');
});

test('CONNECT_ASANA rejects (no fetch) when there is no signed-in session', async () => {
  const fetchImpl = mockFetch(() => okResponse());
  asana.configureAsanaIntegrationService({ fetchImpl, getAccessToken: async () => null });

  const r = await asana.handleMessage('CONNECT_ASANA', { pat: 'abc' });
  assert.equal(r.ok, false);
  assert.ok(r.error);
  assert.equal(fetchImpl.calls.length, 0);
});

test('CONNECT_ASANA surfaces the edge function error on a non-OK response', async () => {
  const fetchImpl = mockFetch(async () => ({ ok: false, status: 400, async json() { return { error: 'Asana rejected this token' }; } }));
  asana.configureAsanaIntegrationService({ fetchImpl, getAccessToken: getTokenOk });

  const r = await asana.handleMessage('CONNECT_ASANA', { pat: 'bad-token' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Asana rejected this token');
});

test('CONNECT_ASANA surfaces a network/timeout error', async () => {
  const fetchImpl = mockFetch(async () => { throw new Error('timeout'); });
  asana.configureAsanaIntegrationService({ fetchImpl, getAccessToken: getTokenOk });

  const r = await asana.handleMessage('CONNECT_ASANA', { pat: 'abc' });
  assert.equal(r.ok, false);
  assert.match(r.error, /timeout/i);
});

test('DISCONNECT_ASANA posts an empty body to disconnect-asana', async () => {
  const fetchImpl = mockFetch(() => okResponse({ ok: true }));
  asana.configureAsanaIntegrationService({ fetchImpl, getAccessToken: getTokenOk });

  const r = await asana.handleMessage('DISCONNECT_ASANA', {});
  assert.equal(r.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
  assert.match(fetchImpl.calls[0].url, /\/functions\/v1\/disconnect-asana$/);
  assert.equal(fetchImpl.calls[0].opts.body, '{}');
});

test('SYNC_ASANA_NOW posts to sync-asana-tasks and returns tasksSynced', async () => {
  const fetchImpl = mockFetch(() => okResponse({ ok: true, tasksSynced: 7 }));
  asana.configureAsanaIntegrationService({ fetchImpl, getAccessToken: getTokenOk });

  const r = await asana.handleMessage('SYNC_ASANA_NOW', {});
  assert.equal(r.ok, true);
  assert.equal(r.tasksSynced, 7);
  assert.match(fetchImpl.calls[0].url, /\/functions\/v1\/sync-asana-tasks$/);
});

// ── GET_ASANA_INTEGRATION (RLS-scoped status read, never the secret) ──

function fakeSupabase({ session, profile, integrationRow, integrationError = null }) {
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
    },
    schema(name) {
      assert.equal(name, 'tabatha');
      return {
        from(table) {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: profile, error: null }),
                }),
              }),
            };
          }
          if (table === 'integration_credentials') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: integrationRow, error: integrationError }),
                  }),
                }),
              }),
            };
          }
          throw new Error(`unexpected table: ${table}`);
        },
      };
    },
  };
}

test('GET_ASANA_INTEGRATION returns null (not an error) when signed out', async () => {
  const supabase = fakeSupabase({ session: null, profile: null, integrationRow: null });
  asana.configureAsanaIntegrationService({ supabase, getAccessToken: undefined });

  const r = await asana.handleMessage('GET_ASANA_INTEGRATION', {});
  assert.equal(r.integration, null);
  assert.equal(r.error, null);
});

test('GET_ASANA_INTEGRATION returns the connection status row when connected', async () => {
  const row = { provider: 'asana', workspace_gid: 'ws1', connected_at: '2026-07-01T00:00:00Z', last_synced_at: null, status: 'active' };
  const supabase = fakeSupabase({
    session: { user: { id: 'u1' }, access_token: 'x' },
    profile: { id: 'p1' },
    integrationRow: row,
  });
  asana.configureAsanaIntegrationService({ supabase });

  const r = await asana.handleMessage('GET_ASANA_INTEGRATION', {});
  assert.deepEqual(r.integration, row);
  // Never a `pat` or `vault_secret_name` field on the returned object.
  assert.equal('pat' in r.integration, false);
  assert.equal('vault_secret_name' in r.integration, false);
});

test('GET_ASANA_INTEGRATION renders not-connected (not a crash) on a pre-035 DB (table absent)', async () => {
  const supabase = fakeSupabase({
    session: { user: { id: 'u1' }, access_token: 'x' },
    profile: { id: 'p1' },
    integrationRow: null,
    integrationError: { message: 'relation "integration_credentials" does not exist' },
  });
  asana.configureAsanaIntegrationService({ supabase });

  const r = await asana.handleMessage('GET_ASANA_INTEGRATION', {});
  assert.equal(r.integration, null);
  assert.equal(r.error, null);
});

test('handleMessage ignores unrelated message types', async () => {
  const r = await asana.handleMessage('SOMETHING_ELSE', {});
  assert.equal(r, undefined);
});
