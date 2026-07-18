// Supabase Edge Function — asana-webhook (Epic 3 v1)
//
// Two request shapes hit this one endpoint, both from Asana, neither carries
// a Supabase-compatible bearer token — this function MUST be deployed with
// JWT verification disabled (supabase/config.toml sets
// [functions.asana-webhook] verify_jwt = false; also pass --no-verify-jwt if
// deploying imperatively). Correlated to a Tabatha profile via a `profile_id`
// query param baked into the webhook's target URL at registration time
// (connect-asana). That query param is NOT treated as a secret/capability —
// authorization is the HMAC signature check below, not the profile_id value.
//
//   1. Handshake — the request Asana sends synchronously while processing
//      POST /webhooks (registration). Carries `X-Hook-Secret`; must be
//      echoed back verbatim in the response's `X-Hook-Secret` header. That
//      secret is then persisted (Vault, via set_asana_webhook_secret) and
//      used to verify every subsequent event delivery's HMAC signature.
//   2. Event delivery — carries `X-Hook-Signature` (hex HMAC-SHA256 of the
//      raw request body using the stored secret) and a JSON body of
//      `{ events: [...] }`. Verified, then each task-shaped event marks the
//      corresponding tasks_registry row dirty (`sync_mark_task_dirty`) or,
//      for `action: "removed"`, tombstoned (`sync_mark_remote_deleted`).
//      Deliberately does NOT try to fully reconstruct field-level state from
//      the event payload (Koda's breakdown: "marks tasks dirty / upserts
//      minimal") — sync-asana-tasks' next cron pass does the authoritative
//      pull for anything left in `pending_pull`.
//
// No function secrets required beyond the platform-provided
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'tabatha' },
  auth: { persistSession: false },
});

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface AsanaWebhookEvent {
  action?: string;                 // 'changed' | 'added' | 'removed' | 'undeleted'
  resource?: { gid?: string; resource_type?: string };
  parent?: { gid?: string; resource_type?: string };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const profileId = url.searchParams.get('profile_id');
  if (!profileId) {
    console.error('[asana-webhook] missing profile_id query param on target URL');
    return json({ error: 'Misconfigured webhook target' }, 400);
  }

  // ── Handshake ──
  const hookSecret = req.headers.get('X-Hook-Secret');
  if (hookSecret) {
    const { error } = await admin.rpc('set_asana_webhook_secret', {
      p_profile_id: profileId,
      p_secret: hookSecret,
    });
    if (error) {
      console.error('[asana-webhook] failed to persist handshake secret:', error.message);
      return json({ error: 'Failed to persist handshake secret' }, 500);
    }
    // Echo the secret back verbatim, no body required.
    return new Response(null, { status: 200, headers: { 'X-Hook-Secret': hookSecret } });
  }

  // ── Event delivery ──
  const rawBody = await req.text();
  const signature = req.headers.get('X-Hook-Signature');
  if (!signature) {
    console.error('[asana-webhook] event delivery missing X-Hook-Signature');
    return json({ error: 'Missing signature' }, 401);
  }

  const { data: cred, error: credError } = await admin
    .from('integration_credentials')
    .select('webhook_secret_name, status')
    .eq('profile_id', profileId)
    .eq('provider', 'asana')
    .maybeSingle();

  if (credError || !cred?.webhook_secret_name || cred.status !== 'active') {
    console.error('[asana-webhook] no active credential/secret for profile', profileId, credError?.message);
    return json({ error: 'Unknown or inactive webhook target' }, 404);
  }

  const { data: secret, error: secretError } = await admin.rpc('get_vault_secret', {
    p_secret_name: cred.webhook_secret_name,
  });
  if (secretError || !secret) {
    console.error('[asana-webhook] could not resolve webhook secret:', secretError?.message);
    return json({ error: 'Signature verification unavailable' }, 500);
  }

  const expected = await hmacSha256Hex(secret as string, rawBody);
  if (!timingSafeEqual(expected, signature.toLowerCase())) {
    console.error('[asana-webhook] signature mismatch for profile', profileId);
    return json({ error: 'Invalid signature' }, 401);
  }

  let payload: { events?: AsanaWebhookEvent[] };
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const events = payload.events ?? [];
  let processed = 0;
  let removed = 0;

  for (const evt of events) {
    const resourceType = evt.resource?.resource_type;
    const gid = evt.resource?.gid;
    if (!gid) continue;

    // Only task-shaped resources land in tasks_registry directly. Events on
    // subtask/dependency changes still surface as `resource_type: 'task'`
    // (the task whose subtasks/dependencies changed), so this single branch
    // covers all of it — the reconcile pass re-derives relation edges.
    if (resourceType !== 'task') continue;

    if (evt.action === 'removed') {
      const { error } = await admin.rpc('sync_mark_remote_deleted', {
        p_profile_id: profileId,
        p_task_id: gid,
      });
      if (error) console.error('[asana-webhook] sync_mark_remote_deleted failed:', error.message);
      else removed++;
    } else {
      const { error } = await admin.rpc('sync_mark_task_dirty', {
        p_profile_id: profileId,
        p_task_id: gid,
      });
      if (error) console.error('[asana-webhook] sync_mark_task_dirty failed:', error.message);
      else processed++;
    }
  }

  return json({ ok: true, eventsReceived: events.length, dirtied: processed, removed });
});
