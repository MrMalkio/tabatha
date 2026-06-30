// Supabase Edge Function — feedback-to-asana (Workstream B2)
//
// Brokers in-app feedback from the Tabatha extension to an Asana project. The
// extension calls this with its Supabase anon-key Bearer; the Asana PAT lives
// ONLY here as a function secret and never ships in the (world-readable,
// unpacked) extension.
//
// Required secrets (set via `supabase secrets set`, NEVER hardcoded):
//   ASANA_PAT          — Asana Personal Access Token (Bearer for app.asana.com)
//   ASANA_PROJECT_GID  — the target Asana project GID for feedback tasks
//
// Deploy (orchestrator runtime step, not done here):
//   supabase secrets set ASANA_PAT=… ASANA_PROJECT_GID=…
//   supabase functions deploy feedback-to-asana
//
// Payload contract (from feedbackService.js):
//   { kind, text, version, context:{surface,localId,machineId,url}, submittedAt }

const ASANA_API = "https://app.asana.com/api/1.0/tasks";

// Tighten CORS to the pinned extension origin (A2 key pin) — not "*". Only the
// real extension may invoke this from a browser context.
const ALLOWED_ORIGIN =
  "chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Vary": "Origin",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Input bounds — mirror feedbackService so the contract is enforced on BOTH
// ends (the client can be bypassed; the function cannot).
const MAX_TEXT_LEN = 4000;
const VALID_KINDS = new Set(["bug", "idea"]);

// Verify the caller is a signed-in Supabase user by exchanging their access
// token at the auth endpoint. Returns the user id, or null if anonymous/invalid.
async function verifyUser(authHeader: string | null): Promise<string | null> {
  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  // The anon key alone (no user JWT) must NOT count as authenticated.
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY || token === SUPABASE_ANON_KEY) {
    return null;
  }
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
    });
    if (!resp.ok) return null;
    const user = await resp.json().catch(() => null);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface FeedbackPayload {
  kind?: string;
  text?: string;
  version?: string;
  context?: {
    surface?: string;
    localId?: string | null;
    machineId?: string | null;
    url?: string | null;
  };
  submittedAt?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Reject anonymous callers: a valid signed-in user JWT is required. This stops
  // anyone who extracts the bundled anon key from spamming Asana.
  const userId = await verifyUser(req.headers.get("Authorization"));
  if (!userId) {
    return json({ error: "Authentication required" }, 401);
  }

  const ASANA_PAT = Deno.env.get("ASANA_PAT");
  const ASANA_PROJECT_GID = Deno.env.get("ASANA_PROJECT_GID");
  if (!ASANA_PAT || !ASANA_PROJECT_GID) {
    console.error("[feedback-to-asana] missing ASANA_PAT / ASANA_PROJECT_GID secret");
    return json({ error: "Feedback pipeline not configured" }, 500);
  }

  let payload: FeedbackPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const text = (payload.text ?? "").trim();
  if (!text) {
    return json({ error: "Feedback text is required" }, 400);
  }
  if (text.length > MAX_TEXT_LEN) {
    return json({ error: `Feedback text must be ${MAX_TEXT_LEN} characters or fewer` }, 400);
  }
  if (!VALID_KINDS.has(payload.kind ?? "")) {
    return json({ error: 'Feedback kind must be "bug" or "idea"' }, 400);
  }
  const kind = payload.kind as string;
  const ctx = payload.context ?? {};

  const emoji = kind === "bug" ? "🐛" : "💡";
  const title = `${emoji} [${kind}] ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}`;
  const notes = [
    text,
    "",
    "— Submitted from Tabatha —",
    `kind: ${kind}`,
    `version: ${payload.version ?? "unknown"}`,
    `surface: ${ctx.surface ?? "unknown"}`,
    `url: ${ctx.url ?? "n/a"}`,
    `localId: ${ctx.localId ?? "n/a"}`,
    `machineId: ${ctx.machineId ?? "n/a"}`,
    `userId: ${userId}`,
    `submittedAt: ${payload.submittedAt ?? new Date().toISOString()}`,
  ].join("\n");

  try {
    const asanaResp = await fetch(ASANA_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ASANA_PAT}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        data: {
          name: title,
          notes,
          projects: [ASANA_PROJECT_GID],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!asanaResp.ok) {
      const detail = await asanaResp.text().catch(() => "");
      console.error(`[feedback-to-asana] Asana ${asanaResp.status}: ${detail}`);
      return json({ error: `Asana rejected the task (${asanaResp.status})` }, 502);
    }

    const created = await asanaResp.json().catch(() => ({}));
    return json({ ok: true, taskGid: created?.data?.gid ?? null }, 201);
  } catch (e) {
    console.error("[feedback-to-asana] error:", e instanceof Error ? e.message : e);
    return json({ error: "Failed to reach Asana" }, 502);
  }
});
