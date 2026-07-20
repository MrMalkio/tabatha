// Supabase Edge Function — connect-asana (Epic 3 v1)
//
// Receives an Asana Personal Access Token from a signed-in Tabatha user
// (Settings -> Integrations -> "Connect Asana"), validates it against Asana,
// stores it in Vault (never in a client-readable table — see migration 035
// tabatha.upsert_asana_credential), and best-effort registers an Asana
// webhook on the user's "My Tasks" list so sync-asana-tasks isn't the only
// path in (design doc §3.2: webhook-primary, cron-reconcile).
//
// The raw PAT is read once from the request body and handed straight to a
// SECURITY DEFINER RPC that Vault-stores it — it is never written to any
// PostgREST-visible table, logged, or echoed back.
//
// No manual `supabase secrets set` needed: this function only uses the
// platform-provided SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY,
// auto-injected into every deployed edge function.
//
// Deploy (orchestrator runtime step, not done here):
//   supabase functions deploy connect-asana
//
// Payload contract:
//   POST { pat: string }
//   -> 200 { ok: true, workspaceGid, userTaskListGid, webhookRegistered: boolean }

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ASANA_API = 'https://app.asana.com/api/1.0';

// Same allow-list as feedback-to-asana (Workstream B2) — the extension's
// pinned key plus the Tabby Sidecar web origin. Echo the matching origin;
// browsers reject a multi-value Access-Control-Allow-Origin.
const ALLOWED_ORIGINS = new Set([
  'chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod',
  'https://tabatha.pondocean.co',
]);

function corsHeaders(reqOrigin: string | null): Record<string, string> {
  const origin =
    reqOrigin && ALLOWED_ORIGINS.has(reqOrigin)
      ? reqOrigin
      : 'chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod';
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

let CORS_HEADERS: Record<string, string> = corsHeaders(null);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'tabatha' },
  auth: { persistSession: false },
});

// Same verifyUser pattern as feedback-to-asana: exchange the caller's own
// bearer token at the auth endpoint. Rejects anonymous/anon-key-only calls.
async function verifyUser(authHeader: string | null): Promise<string | null> {
  const token = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token === SUPABASE_ANON_KEY) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!resp.ok) return null;
    const user = await resp.json().catch(() => null);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function resolveProfileId(authUserId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

interface AsanaMeResponse {
  data?: {
    gid: string;
    workspaces?: { gid: string; name: string }[];
  };
}

interface ConnectPayload {
  pat?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  CORS_HEADERS = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const userId = await verifyUser(req.headers.get('Authorization'));
  if (!userId) return json({ error: 'Authentication required' }, 401);

  const profileId = await resolveProfileId(userId);
  if (!profileId) return json({ error: 'No Tabatha profile for this account' }, 404);

  let payload: ConnectPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const pat = (payload.pat ?? '').trim();
  if (!pat || pat.length < 10 || pat.length > 512) {
    return json({ error: 'A valid Asana Personal Access Token is required' }, 400);
  }

  // Validate the PAT against Asana and resolve its first workspace. v1
  // supports one workspace per connection (the PAT owner's first) — multi-
  // workspace selection is a documented fast-follow, not this slice.
  let me: AsanaMeResponse;
  try {
    const resp = await fetch(`${ASANA_API}/users/me?opt_fields=gid,workspaces.gid,workspaces.name`, {
      headers: { Authorization: `Bearer ${pat}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error(`[connect-asana] Asana rejected PAT: ${resp.status} ${detail}`);
      return json({ error: 'Asana rejected this token' }, 400);
    }
    me = await resp.json();
  } catch (e) {
    console.error('[connect-asana] failed to reach Asana:', e instanceof Error ? e.message : e);
    return json({ error: 'Failed to reach Asana' }, 502);
  }

  const workspaceGid = me.data?.workspaces?.[0]?.gid;
  if (!workspaceGid) {
    return json({ error: 'This Asana account has no accessible workspace' }, 400);
  }

  // Resolve the "My Tasks" list resource — used both as the webhook target
  // resource (more broadly available than a workspace-level webhook, which
  // requires Business/Enterprise tier) and, semantically, as the same scope
  // sync-asana-tasks pulls (assignee=me).
  let userTaskListGid: string | null = null;
  try {
    const resp = await fetch(
      `${ASANA_API}/users/me/user_task_list?workspace=${encodeURIComponent(workspaceGid)}&opt_fields=gid`,
      { headers: { Authorization: `Bearer ${pat}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
    );
    if (resp.ok) {
      const data = await resp.json();
      userTaskListGid = data?.data?.gid ?? null;
    } else {
      console.error(`[connect-asana] user_task_list lookup failed: ${resp.status}`);
    }
  } catch (e) {
    console.error('[connect-asana] user_task_list fetch error:', e instanceof Error ? e.message : e);
  }

  const { error: rpcError } = await admin.rpc('upsert_asana_credential', {
    p_profile_id: profileId,
    p_pat: pat,
    p_workspace_gid: workspaceGid,
    p_user_task_list_gid: userTaskListGid,
  });
  if (rpcError) {
    console.error('[connect-asana] upsert_asana_credential failed:', rpcError.message);
    return json({ error: 'Failed to store Asana credential' }, 500);
  }

  // Webhook registration is best-effort. sync-asana-tasks' cron reconcile is
  // the guaranteed baseline (design §3.2); a failed/unavailable webhook
  // (e.g. tier restriction) must not fail the whole connect flow.
  let webhookRegistered = false;
  if (userTaskListGid) {
    webhookRegistered = await registerWebhook(pat, profileId, userTaskListGid);
  }

  return json({
    ok: true,
    workspaceGid,
    userTaskListGid,
    webhookRegistered,
  });
});

async function registerWebhook(pat: string, profileId: string, resourceGid: string): Promise<boolean> {
  // If a previous webhook exists for this profile (reconnect / PAT rotation),
  // best-effort delete it first so Asana doesn't accumulate orphaned hooks.
  try {
    const { data: existing } = await admin
      .from('integration_credentials')
      .select('webhook_gid')
      .eq('profile_id', profileId)
      .eq('provider', 'asana')
      .maybeSingle();
    if (existing?.webhook_gid) {
      await fetch(`${ASANA_API}/webhooks/${existing.webhook_gid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${pat}` },
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[connect-asana] pre-cleanup of old webhook failed (non-fatal):', e instanceof Error ? e.message : e);
  }

  const target = `${SUPABASE_URL}/functions/v1/asana-webhook?profile_id=${encodeURIComponent(profileId)}`;

  try {
    const resp = await fetch(`${ASANA_API}/webhooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ data: { resource: resourceGid, target } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error(`[connect-asana] webhook registration failed (non-fatal): ${resp.status} ${detail}`);
      return false;
    }
    const created = await resp.json().catch(() => ({}));
    const webhookGid = created?.data?.gid;
    if (webhookGid) {
      const { error } = await admin.rpc('set_asana_webhook_gid', {
        p_profile_id: profileId,
        p_webhook_gid: webhookGid,
      });
      if (error) console.error('[connect-asana] set_asana_webhook_gid failed:', error.message);
    }
    // The HMAC secret arrives async via the X-Hook-Secret handshake Asana
    // sends to `target` as part of processing this create call — captured
    // by asana-webhook, not here.
    return true;
  } catch (e) {
    console.error('[connect-asana] webhook registration error (non-fatal):', e instanceof Error ? e.message : e);
    return false;
  }
}
