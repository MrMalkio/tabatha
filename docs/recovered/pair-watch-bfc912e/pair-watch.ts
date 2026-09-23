// Supabase Edge Function — pair-watch (Tabby Watch, Plan 041 §6.2)
//
// Two actions in one function:
//   { action: "mint" }              — called by the Sidecar with the USER's JWT.
//     Generates a 6-digit code, stores only its SHA-256 (5-min expiry,
//     single-use), returns the raw code for the phone UI to display.
//   { action: "redeem", code }      — called by the WATCH/TV, unauthenticated
//     (config.toml sets verify_jwt=false; mint re-authenticates manually).
//     Rate-gates the caller, CLAIMS the code under a short lease, mints a
//     USER-scoped session via the Admin API (generateLink → verifyOtp), and
//     only then marks the code consumed.
//
// Security posture: raw codes never stored; 5-minute expiry; single-use;
// the service-role key lives only here; the watch only ever receives a
// user-scoped session — the same trust level the phone already holds.
// Wrong-code responses stay indistinguishable from expired/consumed ones.
//
// --- 2026-07-25 hardening (Dex) -------------------------------------------
// 1. CONSUME LAST. The previous version set `consumed_at` BEFORE minting, so
//    any failure in the mint path spent the code permanently and the retry
//    read as "invalid/expired". That is the "expires instantly" bug: codes
//    were burned, not expired. Now redeem takes a short LEASE (migration 061
//    `claim_pairing_code`, an atomic UPDATE…RETURNING so single-use is still
//    race-proof), and `consume_pairing_code` runs only once a session exists.
//    Every failure path calls `release_pairing_code`; if this function dies
//    mid-flight the lease expires on its own and the user's code still works.
// 2. REAL ATTEMPT LIMITING. The old `attempts >= 5` check was dead code —
//    lookup is by hash, so a wrong guess matched no row and incremented
//    nothing. Redeem is unauthenticated and returns access+refresh tokens, so
//    the 10^6 keyspace was brute-forceable inside one 5-minute window
//    (~3,400 req/s). Failures are now counted per-IP and globally in
//    `tabatha.pair_redeem_attempts` regardless of whether a row matched, and
//    the gate FAILS CLOSED: if it cannot be evaluated, redeem is refused.
// 3. LOGGING. Every 500 branch and every failed redeem is logged with enough
//    context to diagnose (never the code, the hash, the IP, or any token).
// --------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mint is browser-called (Sidecar) → CORS pinned to first-party origins,
// mirroring feedback-to-asana. Redeem comes from the native watch (no CORS).
// NOTE: the second extension id is the Chrome Web Store build. It exists in
// the deployed function but was missing from source — dropping it would break
// pairing for every store install, so it is restored here deliberately.
const ALLOWED_ORIGINS = new Set([
  "https://tabatha.pondocean.co",
  "chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod",
  "chrome-extension://piopncjacohahbkkmockjnpenhdbmmbc",
]);

// How long a redeem holds a code before it must have produced a session.
const LEASE_SECONDS = 30;

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

function json(body: unknown, status: number, cors: Record<string, string>, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", ...(extra || {}) },
  });
}

// Fingerprint of the caller, for counting only. The raw IP is never stored or
// logged; the short prefix used in logs is just enough to correlate lines.
async function callerFingerprint(req: Request): Promise<string> {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0].trim();
  return ip ? await sha256Hex(ip) : "unknown";
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
    // fine at this scale; bias is negligible for a 5-minute code that is now
    // also per-IP rate limited on redeem).
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    const code = String(n).padStart(6, "0");

    // One live code per profile — replace any prior unconsumed ones.
    const { error: delErr } = await admin
      .from("watch_pairing_codes")
      .delete()
      .eq("profile_id", profile.id)
      .is("consumed_at", null);
    if (delErr) {
      // Not fatal on its own (the insert below still yields a usable code), but
      // it means the profile may be left holding more than one live code.
      console.error("[pair-watch][mint] stale-code cleanup failed", {
        profileId: profile.id,
        code: delErr.code,
        message: delErr.message,
      });
    }

    const { error: insErr } = await admin.from("watch_pairing_codes").insert({
      profile_id: profile.id,
      code_hash: await sha256Hex(code),
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      device_label: body.deviceLabel || null,
    });
    if (insErr) {
      console.error("[pair-watch][mint] insert failed", {
        profileId: profile.id,
        code: insErr.code,
        details: insErr.details,
        message: insErr.message,
      });
      return json({ error: "mint failed" }, 500, cors);
    }
    return json({ code, expiresInSeconds: 300 }, 200, cors);
  }

  if (body.action === "redeem") {
    const fp = await callerFingerprint(req);
    const fpTag = fp.slice(0, 8); // correlation only — never the IP itself
    const code = String(body.code || "").trim();

    const recordFailure = async (reason: string) => {
      const { error } = await admin.rpc("pair_record_failure", { p_ip_hash: fp, p_reason: reason });
      if (error) {
        console.error("[pair-watch][redeem] could not record failed attempt", {
          fp: fpTag,
          reason,
          code: error.code,
          message: error.message,
        });
      }
      console.warn("[pair-watch][redeem] failed attempt", { fp: fpTag, reason });
    };

    // --- Gate first, and FAIL CLOSED. -------------------------------------
    // Redeem hands full session tokens to an unauthenticated caller, so an
    // un-evaluable rate limit must refuse rather than wave traffic through.
    const { data: gate, error: gateErr } = await admin
      .rpc("pair_rate_check", { p_ip_hash: fp })
      .maybeSingle();
    if (gateErr || !gate) {
      console.error("[pair-watch][redeem] rate gate unavailable — refusing (fail closed)", {
        fp: fpTag,
        code: gateErr?.code,
        message: gateErr?.message ?? "no row returned",
      });
      return json({ error: "pairing temporarily unavailable" }, 503, cors, { "Retry-After": "30" });
    }
    if (!gate.allowed) {
      const retry = gate.retry_after_seconds ?? 300;
      console.warn("[pair-watch][redeem] rate limited", {
        fp: fpTag,
        ipFailures: gate.ip_failures,
        globalFailures: gate.global_failures,
        retryAfter: retry,
      });
      return json({ error: "too many attempts" }, 429, cors, { "Retry-After": String(retry) });
    }

    // A malformed code is still a guess — count it.
    if (!/^\d{6}$/.test(code)) {
      await recordFailure("bad_format");
      return json({ error: "invalid code" }, 400, cors);
    }

    // --- Claim (lease). Do NOT consume yet. -------------------------------
    const hash = await sha256Hex(code);
    const { data: claimed, error: claimErr } = await admin
      .rpc("claim_pairing_code", { p_code_hash: hash, p_lease_seconds: LEASE_SECONDS })
      .maybeSingle();
    if (claimErr) {
      console.error("[pair-watch][redeem] claim failed", {
        fp: fpTag,
        code: claimErr.code,
        message: claimErr.message,
      });
      return json({ error: "pairing temporarily unavailable" }, 503, cors, { "Retry-After": "30" });
    }
    if (!claimed) {
      // Wrong, expired, already consumed, currently leased, or over its
      // per-code claim cap — one response for all of them, all counted.
      await recordFailure("no_match");
      return json({ error: "invalid code" }, 401, cors);
    }

    const codeId = claimed.id as string;
    const release = async (why: string) => {
      const { error } = await admin.rpc("release_pairing_code", { p_id: codeId });
      if (error) {
        console.error("[pair-watch][redeem] RELEASE FAILED — code stays leased until the lease expires", {
          codeId,
          why,
          code: error.code,
          message: error.message,
        });
      }
    };

    // --- Mint the session. Any failure here hands the code back. -----------
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("id, auth_user_id")
      .eq("id", claimed.profile_id)
      .maybeSingle();
    if (profErr || !profile?.auth_user_id) {
      console.error("[pair-watch][redeem] profile lookup failed", {
        codeId,
        profileId: claimed.profile_id,
        hasProfile: !!profile,
        hasAuthUserId: !!profile?.auth_user_id,
        code: profErr?.code,
        message: profErr?.message,
      });
      await release("profile_lookup");
      await recordFailure("mint_failed");
      return json({ error: "pairing failed" }, 500, cors);
    }

    const { data: authUser, error: auErr } = await admin.auth.admin.getUserById(profile.auth_user_id);
    if (auErr || !authUser?.user?.email) {
      console.error("[pair-watch][redeem] getUserById failed", {
        codeId,
        authUserId: profile.auth_user_id,
        status: (auErr as { status?: number } | null)?.status,
        message: auErr?.message ?? "user has no email",
      });
      await release("get_user");
      await recordFailure("mint_failed");
      return json({ error: "pairing failed" }, 500, cors);
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      console.error("[pair-watch][redeem] generateLink failed", {
        codeId,
        authUserId: profile.auth_user_id,
        status: (linkErr as { status?: number } | null)?.status,
        message: linkErr?.message ?? "no hashed_token in response",
      });
      await release("generate_link");
      await recordFailure("mint_failed");
      return json({ error: "pairing failed" }, 500, cors);
    }

    const plain = createClient(SUPABASE_URL, ANON_KEY);
    const { data: session, error: otpErr } = await plain.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties.hashed_token,
    });
    if (otpErr || !session?.session) {
      console.error("[pair-watch][redeem] verifyOtp failed", {
        codeId,
        authUserId: profile.auth_user_id,
        status: (otpErr as { status?: number } | null)?.status,
        message: otpErr?.message ?? "no session in response",
      });
      await release("verify_otp");
      await recordFailure("mint_failed");
      return json({ error: "pairing failed" }, 500, cors);
    }

    // --- A session exists. NOW spend the code. ----------------------------
    const { data: consumed, error: consumeErr } = await admin.rpc("consume_pairing_code", { p_id: codeId });
    if (consumeErr || consumed !== true) {
      // The session is already live, so refusing here would only push the
      // client into minting a second one. Log loudly instead: the lease and
      // the 5-minute expiry bound any window in which the code is reusable.
      console.error("[pair-watch][redeem] CONSUME FAILED AFTER MINT — code may be redeemable again until it expires", {
        codeId,
        consumed,
        code: consumeErr?.code,
        message: consumeErr?.message,
      });
    }

    return json(
      {
        access_token: session.session.access_token,
        refresh_token: session.session.refresh_token,
        expires_at: session.session.expires_at,
        // Device management (migration 045): the redeeming device stashes
        // this so its own registerDevice() upsert can mint with the name
        // the pairing device chose, instead of a generic default.
        device_label: claimed.device_label ?? null,
      },
      200,
      cors
    );
  }

  return json({ error: "unknown action" }, 400, cors);
});

