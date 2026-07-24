// Supabase Edge Function — disconnect-asana (Asana PAT parity fast-follow)
//
// Revokes a signed-in Tabatha user's Asana Task Sync connection (Settings ->
// Integrations -> "Task Sync (Asana)" -> Disconnect, extension + Sidecar).
// Mirrors device-signout's verify-then-admin-RPC shape: resolves the
// caller's profile from their JWT, then calls the already-provisioned
// tabatha.revoke_asana_credential RPC (added in migration 035, deliberately
// left unwired to any endpoint at the time — "kept as ready infrastructure
// for the near-certain fast-follow") which flips
// integration_credentials.status to 'revoked'.
//
// Does NOT delete the Vault secret or the Asana webhook — reconnecting
// (connect-asana) overwrites both via upsert_asana_credential's ON CONFLICT
// path, same as a PAT rotation. sync-asana-tasks / the webhook handler skip
// non-'active' rows, so a revoked connection simply stops syncing.
//
// POST {} — caller must be signed in. No body fields required.
// CORS pinned to the same first-party origins as connect-asana/device-signout.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = new Set([
  "https://tabatha.pondocean.co",
  "chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod",
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

  const { error: rpcError } = await admin.rpc("revoke_asana_credential", {
    p_profile_id: profile.id,
  });
  if (rpcError) {
    console.error("[disconnect-asana] revoke_asana_credential failed:", rpcError.message);
    return json({ error: "disconnect failed" }, 500, cors);
  }

  return json({ ok: true }, 200, cors);
});
