// ============================================================
// Tabatha — Asana Task Sync Integration Service (extension parity, #Asana-PAT)
//
// The extension had no way to connect Asana Task Sync — that flow existed
// ONLY in the Tabby Sidecar (sidecar/src/data/integrations.ts, Epic 3 v1).
// This service is the extension-side counterpart: same edge-function
// contracts, same never-log/never-persist handling of the PAT.
//
// The user's Asana Personal Access Token is a credential: it arrives here
// once in the CONNECT_ASANA message body, is forwarded verbatim to the
// `connect-asana` edge function over the authed session, and is never
// logged, never written to chrome.storage, and never echoed back — this
// module holds no PAT state beyond the in-flight request. Server-side it
// lives only in Vault (migration 035); GET_ASANA_INTEGRATION reads back only
// the RLS-scoped `integration_credentials` status row, never the secret.
//
// Contracts (identical to the Sidecar's integrations.ts):
//   CONNECT_ASANA         -> POST {SUPABASE_URL}/functions/v1/connect-asana     { pat }
//   DISCONNECT_ASANA       -> POST {SUPABASE_URL}/functions/v1/disconnect-asana  {}
//   SYNC_ASANA_NOW         -> POST {SUPABASE_URL}/functions/v1/sync-asana-tasks  {}
//   GET_ASANA_INTEGRATION  -> supabase.schema('tabatha').from('integration_credentials')...
//
// Auth pattern mirrors feedbackService.js / deviceService.js: the user's own
// Supabase access token as Bearer (the edge function verifies the caller),
// the embedded anon key as apikey so the gateway routes the call. The
// service-role key never leaves the edge function.
// ============================================================

// Embedded Supabase project URL + publishable (anon) key — identical to
// src/services/supabaseClient.js / feedbackService.js / deviceService.js.
const SUPABASE_URL = 'https://mtdgoahskcibjbhfvofx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lPmWAzfBqbHkyGslkhohQA_8QgdBCu_';
const CONNECT_FN_PATH = '/functions/v1/connect-asana';
const DISCONNECT_FN_PATH = '/functions/v1/disconnect-asana';
const SYNC_FN_PATH = '/functions/v1/sync-asana-tasks';
const TIMEOUT_MS = 20000; // connect validates the PAT against Asana server-side

let deps = {};

export function configureAsanaIntegrationService(injected = {}) {
  deps = { ...deps, ...injected };
}

// Test-only reset, mirrors other services' __setActiveForTest helpers.
export function __resetForTest() {
  deps = {};
}

function getFetch() {
  return deps.fetchImpl || globalThis.fetch;
}

// The signed-in user's Supabase access token (NOT the world-readable anon
// key). Injectable via configureAsanaIntegrationService({ getAccessToken })
// for tests; otherwise read from the shared supabase-js client's session.
async function getAccessToken() {
  if (deps.getAccessToken) return deps.getAccessToken();
  if (!deps.supabase) return null;
  try {
    const { data } = await deps.supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

// Pure — trims/validates the raw PAT input. Exported so its edge cases
// (empty, whitespace-only) are unit-testable without any network mocking.
export function shapePat(rawPat) {
  return typeof rawPat === 'string' ? rawPat.trim() : '';
}

// Pure — builds the exact request shape sent to an edge function. Exported
// so the "what do we actually POST" contract is testable independent of
// fetch/network plumbing.
export function buildRequest(path, token, body) {
  return {
    url: `${SUPABASE_URL}${path}`,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body ?? {}),
    },
  };
}

async function callFn(path, body) {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'You must be signed in to manage Asana Task Sync.' };

  const { url, options } = buildRequest(path, token, body);
  const fetchImpl = getFetch();
  try {
    const resp = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const out = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: out?.error || `Request failed (${resp.status}).` };
    }
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, error: e?.message || "Couldn't reach the sync service — try again." };
  }
}

async function connectAsana(rawPat) {
  const pat = shapePat(rawPat);
  if (!pat) return { ok: false, error: 'Paste your Asana access token first.' };
  return callFn(CONNECT_FN_PATH, { pat });
}

async function disconnectAsana() {
  return callFn(DISCONNECT_FN_PATH, {});
}

async function syncAsanaNow() {
  return callFn(SYNC_FN_PATH, {});
}

// RLS-scoped read of this profile's Task Sync connection status — never the
// secret (integration_credentials only exposes vault_secret_name, which is
// itself just a Vault key NAME, and only SELECTable, not the vault contents).
async function getIntegrationStatus() {
  if (!deps.supabase) return { integration: null, error: 'not_ready' };
  try {
    const { data: sessionData } = await deps.supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session) return { integration: null, error: null };

    const { data: profile } = await deps.supabase
      .schema('tabatha')
      .from('profiles')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (!profile?.id) return { integration: null, error: null };

    const { data, error } = await deps.supabase
      .schema('tabatha')
      .from('integration_credentials')
      .select('provider, workspace_gid, connected_at, last_synced_at, status')
      .eq('profile_id', profile.id)
      .eq('provider', 'asana')
      .maybeSingle();
    // Pre-035 DBs (table absent) surface as an error — render as
    // not-connected rather than crashing Settings (mirrors the Sidecar's
    // useAsanaIntegration hook).
    return { integration: !error && data ? data : null, error: null };
  } catch (e) {
    return { integration: null, error: e?.message || 'lookup failed' };
  }
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'CONNECT_ASANA':
      return connectAsana(message?.pat);
    case 'DISCONNECT_ASANA':
      return disconnectAsana();
    case 'SYNC_ASANA_NOW':
      return syncAsanaNow();
    case 'GET_ASANA_INTEGRATION':
      return getIntegrationStatus();
    default:
      return undefined;
  }
}
