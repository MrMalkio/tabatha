// Supabase Edge Function — device-signout (Plan: Sidecar device management,
// migration 045)
//
// POST { browser_profile_id } — caller must be signed in (default
// verify_jwt = true; no config.toml override, unlike pair-watch's redeem
// action which is intentionally unauthenticated).
//
// Remotely signs another one of the caller's OWN devices out:
//   1. Resolves the caller's profile from their JWT.
//   2. Verifies the target browser_profiles row belongs to that profile
//      (403 otherwise — this can only ever act on your own devices, never
//      a teammate's, even though managers can READ team browser_profiles
//      rows per migration 015).
//   3. Stamps `revoked_at = now()` on the row — the target device's own
//      honor-logic listener (sidecar/src/data/deviceStatus.ts) observes
//      this (realtime, migration 045's publication add) and calls
//      supabase.auth.signOut() locally.
//   4. If the row carries an `auth_session_id` (the GoTrue session id the
//      target install's current session was minted with — captured at
//      registerDevice time from the session JWT's `session_id` claim), also
//      revokes that session for real via the GoTrue Admin API
//      (`DELETE /auth/v1/admin/sessions/{id}`) so its refresh token stops
//      working even if the target device is offline or its honor-logic
//      listener never gets to run. Belt-and-suspenders: revoked_at alone
//      covers the common "app is open" case instantly; the Admin API call
//      covers the "app is closed / never reconnects" case.
//
// The service-role key never leaves this function. CORS pinned to the same
// first-party origins as pair-watch/feedback-to-asana.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = new Set([
  "https://tabatha.pondocean.co",
  "chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod",
  "chrome-extension://piopncjacohahbkkmockjnpenhdbmmbc", // CWS store install (2026-07-21)
]);

function corsHeaders(reqOrigin: string | null): Record<string, string> {
  const origin = reqOrigin && ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : "https://tabatha.pondocean.co";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);

  let body: { browser_profile_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400, cors);
  }
  const targetId = String(body.browser_profile_id || "").trim();
  if (!targetId) return json({ error: "browser_profile_id required" }, 400, cors);

  // Resolve the caller (verify_jwt already validated the JWT's signature
  // before this handler ran; this call just reads who it belongs to).
  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: "tabatha" } });

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!profile) return json({ error: "no profile" }, 403, cors);

  const { data: target } = await admin
    .from("browser_profiles")
    .select("id, profile_id, auth_session_id")
    .eq("id", targetId)
    .maybeSingle();
  if (!target || target.profile_id !== profile.id) {
    // Same "not found" shape whether the row doesn't exist or belongs to
    // someone else — no need to leak which.
    return json({ error: "device not found" }, 403, cors);
  }

  const { error: updateErr } = await admin
    .from("browser_profiles")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", targetId);
  if (updateErr) return json({ error: "sign-out failed" }, 500, cors);

  let revokedSession = false;
  if (target.auth_session_id) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/sessions/${target.auth_session_id}`, {
        method: "DELETE",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      });
      // GoTrue returns 204 on success; a 404 just means the session already
      // expired/rotated away on its own — either way the device is signed
      // out, so this isn't treated as a failure of the overall request.
      revokedSession = resp.ok || resp.status === 404;
    } catch {
      revokedSession = false;
    }
  }

  return json({ ok: true, revokedSession }, 200, cors);
});
