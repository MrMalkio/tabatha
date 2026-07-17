// Supabase Edge Function — explicit Asana task actions from Tabatha.
//
// This intentionally exposes one narrow operation: marking a known Asana task
// complete. A signed-in Tabatha user must explicitly choose the action in the
// task UI. The Asana PAT remains server-side and never ships in the extension.

const ALLOWED_ORIGIN = "chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod";
const ASANA_TASKS_API = "https://app.asana.com/api/1.0/tasks";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Vary": "Origin",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function verifyUser(authHeader: string | null): Promise<string | null> {
  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!token || !supabaseUrl || !anonKey || token === anonKey) return null;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { "Authorization": `Bearer ${token}`, "apikey": anonKey },
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const userId = await verifyUser(req.headers.get("Authorization"));
  if (!userId) return json({ error: "Authentication required" }, 401);

  const asanaPat = Deno.env.get("ASANA_PAT");
  if (!asanaPat) return json({ error: "Asana task actions are not configured" }, 500);

  let payload: { taskGid?: string; completed?: boolean };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const taskGid = String(payload.taskGid ?? "").trim();
  if (!/^\d+$/.test(taskGid)) return json({ error: "A valid Asana task GID is required" }, 400);
  if (payload.completed !== true) {
    return json({ error: "Only explicit task completion is supported" }, 400);
  }

  try {
    const response = await fetch(`${ASANA_TASKS_API}/${taskGid}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${asanaPat}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ data: { completed: true } }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[asana-task-action] Asana ${response.status}: ${detail}`);
      return json({ error: `Asana rejected the completion (${response.status})` }, 502);
    }

    const updated = await response.json().catch(() => ({}));
    return json({
      ok: true,
      taskGid: updated?.data?.gid ?? taskGid,
      completed: updated?.data?.completed ?? true,
      completedAt: updated?.data?.completed_at ?? null,
      actorUserId: userId,
    });
  } catch (error) {
    console.error("[asana-task-action] error:", error instanceof Error ? error.message : error);
    return json({ error: "Failed to reach Asana" }, 502);
  }
});
