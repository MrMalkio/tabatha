// Supabase Edge Function — pair-watch (Tabby Watch, Plan 041 §6.2)
//
// Two actions in one function:
//   { action: "mint" }              — called by the Sidecar with the USER's JWT.
//     Generates a 6-digit code, stores only its SHA-256 (5-min expiry,
//     single-use), returns the raw code for the phone UI to display.
//   { action: "redeem", code }      — called by the WATCH, unauthenticated
//     (config.toml sets verify_jwt=false; mint re-authenticates manually).
//     Validates the code (unexpired, unconsumed, < 5 bad attempts), marks it
//     consumed, and mints a USER-scoped session via the Admin API
//     (generateLink → verifyOtp), returning { access_token, refresh_token }.
//
// Security posture (design §6.2, CeeCee-reviewed): raw codes never stored;
// 5-minute expiry; single-use; per-code attempt lock at 5; the service-role
// key lives only here; the watch only ever receives a user-scoped session —
// same trust level the phone already holds. Wrong-code responses are
// indistinguishable from expired/consumed ones ("invalid code").

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mint is browser-called (Sidecar) → CORS pinned to first-party origins,
// mirroring feedback-to-asana. Redeem comes from the native watch (no CORS).
const ALLOWED_ORIGINS = new Set([
  "https://tabatha.pondocean.co",
  "chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod",
  // CWS store-install origin (2026-07-21) — this line was already deployed
  // to prod via commit 624031a on a branch that never made it into
  // origin/staging (reconciliation gap found during the 2026-07-24 pairing-
  // expiry investigation). Restored here so tracked source matches what's
  // actually live; not itself the pairing-expiry root cause (mint bypasses
  // CORS via the extension's <all_urls> host_permissions, and the Sidecar-
  // hosted TV redeem flow's origin was already allow-listed above).
  "chrome-extension://piopncjacohahbkkmockjnpenhdbmmbc",
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

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

  let body: { action?: string; code?: string; deviceLabel?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400, cors);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: "tabatha" } });

  if (body.action === "mint") {
    // Manual auth: verify_jwt is off for redeem's sake, so mint checks the
    // caller's JWT itself.
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401, cors);

    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!profile) return json({ error: "no profile" }, 403, cors);

    // 6 random digits from the CSPRNG (rejection-free via modulo on 32 bits is
    // fine at this scale; bias is negligible for a 5-minute, 5-attempt code).
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    const code = String(n).padStart(6, "0");

    // One live code per profile — replace any prior unconsumed ones.
    await admin.from("watch_pairing_codes").delete().eq("profile_id", profile.id).is("consumed_at", null);
    const { error: insErr } = await admin.from("watch_pairing_codes").insert({
      profile_id: profile.id,
      code_hash: await sha256Hex(code),
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      device_label: body.deviceLabel || null,
    });
    if (insErr) return json({ error: "mint failed" }, 500, cors);
    return json({ code, expiresInSeconds: 300 }, 200, cors);
  }

  if (body.action === "redeem") {
    const code = String(body.code || "").trim();
    if (!/^\d{6}$/.test(code)) return json({ error: "invalid code" }, 400, cors);

    const hash = await sha256Hex(code);
    const { data: row } = await admin
      .from("watch_pairing_codes")
      .select("id, profile_id, expires_at, consumed_at, attempts, device_label")
      .eq("code_hash", hash)
      .is("consumed_at", null)
      .maybeSingle();

    // Brute-force math (v1): a wrong guess matches no row, so per-code
    // attempt counting can't trigger on misses — protection is the 1M code
    // space × 5-minute expiry × one-live-code-per-profile × platform-level
    // request throttling. `attempts` stays in the schema for a future
    // per-IP/per-window counter if this ever needs tightening.
    if (!row || row.attempts >= 5 || new Date(row.expires_at).getTime() < Date.now()) {
      return json({ error: "invalid code" }, 401, cors);
    }

    // Consume atomically — only the first redeemer wins.
    const { data: consumed } = await admin
      .from("watch_pairing_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (!consumed) return json({ error: "invalid code" }, 401, cors);

    // Resolve the auth user and mint a user-scoped session:
    // generateLink(magiclink) → verifyOtp(token_hash) yields a full session.
    const { data: profile } = await admin
      .from("profiles")
      .select("id, auth_user_id")
      .eq("id", row.profile_id)
      .maybeSingle();
    if (!profile) return json({ error: "invalid code" }, 401, cors);

    const { data: authUser, error: auErr } = await admin.auth.admin.getUserById(profile.auth_user_id);
    if (auErr || !authUser?.user?.email) return json({ error: "pairing failed" }, 500, cors);

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email,
    });
    if (linkErr || !link?.properties?.hashed_token) return json({ error: "pairing failed" }, 500, cors);

    const plain = createClient(SUPABASE_URL, ANON_KEY);
    const { data: session, error: otpErr } = await plain.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties.hashed_token,
    });
    if (otpErr || !session?.session) return json({ error: "pairing failed" }, 500, cors);

    return json(
      {
        access_token: session.session.access_token,
        refresh_token: session.session.refresh_token,
        expires_at: session.session.expires_at,
        // Device management (migration 045): the redeeming device stashes
        // this so its own registerDevice() upsert can mint with the name
        // the pairing device chose, instead of a generic default.
        device_label: row.device_label ?? null,
      },
      200,
      cors
    );
  }

  return json({ error: "unknown action" }, 400, cors);
});
