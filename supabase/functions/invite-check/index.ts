// Supabase Edge Function — invite-check (Download page tester gate)
//
// A NON-CONSUMING validity check for an invite token, so the public download
// page (tabatha.pondocean.co/download) can gate the extension zip behind an
// invite key WITHOUT spending it — the same token is still expected to work
// afterwards on the real activation paths (extension Settings → Sync &
// Account → "Join via Invite Token"; Sidecar's InviteGateScreen "Redeem"),
// both of which call tabatha.redeem_invite_token (migrations 042/044/050,
// unchanged by 051's short-token mint change) and DO consume the token.
// This function only ever SELECTs.
//
// Contract: POST { token: string } -> 200 { valid: boolean, kind?: string }
//   - Always 200 (barring malformed method/JSON) so the page never has to
//     distinguish "your token is wrong" from "the server had a bad day" via
//     status code and leak which.
//   - valid:false carries NO other detail, ever — not "expired" vs "used" vs
//     "unknown", not the org/owner, nothing. A wrong guess and a used-up real
//     token must look identical from the outside.
//   - valid:true carries only `kind` ('demo' | 'personal' | 'team') — enough
//     for the page to decide it can reveal the download, nothing that
//     identifies who the invite belongs to.
//
// Anon-callable: verify_jwt = false in supabase/config.toml — a first-time
// tester has no Supabase session yet, so the platform's default JWT gate
// would 401 them before the body ever ran. Auth is therefore N/A here by
// design (there is no "caller identity" to check — anyone with a candidate
// string may ask "is this valid", same as anyone may try a login page).
//
// Rate-limit-friendly by construction: one indexed SELECT on
// tabatha.invite_tokens(token) (migration 012's PK/unique on token), no
// external calls, no branching that does extra work only on a hit — so a
// scripted guesser gains nothing timing-wise from a match vs a miss, and
// each request is cheap enough that Supabase's platform-level abuse
// throttling (not reimplemented here — this function holds no state across
// invocations) is the right layer for volume limiting.
//
// Secrets used (platform-provided to every deployed function — nothing to
// `secrets set` for these two): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Service role is required because invite_tokens has no anon-readable RLS
// policy (by design — see migration 012) and this check must work for a
// signed-out visitor.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Same first-party allow-list convention as feedback-to-asana / pair-watch.
// The download page is the only caller; the Sidecar's own activation gate
// calls redeem_invite_token directly (a real RPC, not this function).
const ALLOWED_ORIGINS = new Set([
  "https://tabatha.pondocean.co",
]);

function corsHeaders(reqOrigin: string | null): Record<string, string> {
  const origin = reqOrigin && ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : "https://tabatha.pondocean.co";
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Mint shape has changed over time: 24-hex + "-" + 8-hex (33 chars,
// migrations 012/044/050) up through migration 051, which switched new
// mints to an ~8-char Crockford base32 token. This function never
// enforces a specific shape — it only bounds length as a cheap guard
// against wildly malformed input (someone pasting a whole email, or
// nothing) before ever reaching the database. Both old 33-char tokens
// still outstanding and new ~8-char tokens resolve identically via the
// exact-match lookup below, same as tabatha.redeem_invite_token — no
// format branching needed here or there. Bounds kept generous/future-
// proof rather than pinned to either exact length.
const MIN_LEN = 6;
const MAX_LEN = 128;

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405, cors);
  }

  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ valid: false }, 200, cors);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length < MIN_LEN || token.length > MAX_LEN) {
    return json({ valid: false }, 200, cors);
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      db: { schema: "tabatha" },
      auth: { persistSession: false },
    });

    // SELECT only — this is the entire reason this function exists instead
    // of just calling redeem_invite_token from the page. No UPDATE, ever.
    const { data, error } = await admin
      .from("invite_tokens")
      .select("invite_kind, used_at, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("[invite-check] query error:", error.message);
      return json({ valid: false }, 200, cors);
    }
    if (!data || data.used_at || new Date(data.expires_at).getTime() < Date.now()) {
      return json({ valid: false }, 200, cors);
    }

    return json({ valid: true, kind: data.invite_kind }, 200, cors);
  } catch (e) {
    console.error("[invite-check] error:", e instanceof Error ? e.message : e);
    return json({ valid: false }, 200, cors);
  }
});
