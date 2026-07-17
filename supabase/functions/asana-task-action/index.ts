// Supabase Edge Function — explicit Asana task actions from Tabatha.
//
// Exposes a deliberately small task-context surface: resolve an existing task,
// create a basic task, or explicitly complete one. A signed-in Tabatha user
// must initiate every write. The Asana PAT remains server-side and never ships
// in the extension.

const ALLOWED_ORIGIN = "chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod";
const ASANA_TASKS_API = "https://app.asana.com/api/1.0/tasks";
const TASK_OPT_FIELDS = [
  "gid",
  "name",
  "permalink_url",
  "workspace.gid",
  "projects.gid",
  "projects.name",
  "parent.gid",
  "parent.name",
  "completed",
  "completed_at",
].join(",");

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

interface TaskActionPayload {
  action?: "get" | "create" | "complete";
  taskGid?: string;
  completed?: boolean;
  name?: string;
  notes?: string;
  workspaceGid?: string;
  projectGid?: string | null;
}

function taskShape(task: Record<string, unknown> | null | undefined) {
  const value = task ?? {};
  const workspace = value.workspace as { gid?: string } | null | undefined;
  const projects = Array.isArray(value.projects) ? value.projects as Array<{ gid?: string; name?: string }> : [];
  const parent = value.parent as { gid?: string; name?: string } | null | undefined;
  return {
    taskGid: value.gid ?? null,
    taskName: value.name ?? null,
    taskUrl: value.permalink_url ?? null,
    workspaceGid: workspace?.gid ?? null,
    projectGid: projects[0]?.gid ?? null,
    projectName: projects[0]?.name ?? null,
    parentTaskGid: parent?.gid ?? null,
    parentTaskName: parent?.name ?? null,
    completed: value.completed ?? false,
    completedAt: value.completed_at ?? null,
  };
}

async function asanaFetch(
  asanaPat: string,
  url: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${asanaPat}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, body };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const userId = await verifyUser(req.headers.get("Authorization"));
  if (!userId) return json({ error: "Authentication required" }, 401);

  const asanaPat = Deno.env.get("ASANA_PAT");
  if (!asanaPat) return json({ error: "Asana task actions are not configured" }, 500);

  let payload: TaskActionPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = payload.action ?? (payload.completed === true ? "complete" : undefined);
  if (!action || !["get", "create", "complete"].includes(action)) {
    return json({ error: "Unsupported Asana task action" }, 400);
  }

  try {
    if (action === "create") {
      const name = String(payload.name ?? "").trim().slice(0, 500);
      const notes = String(payload.notes ?? "").trim().slice(0, 4000);
      const workspaceGid = String(payload.workspaceGid ?? "").trim();
      const projectGid = String(payload.projectGid ?? "").trim();
      if (!name) return json({ error: "Task name is required" }, 400);
      if (!/^\d+$/.test(workspaceGid)) return json({ error: "A valid Asana workspace GID is required" }, 400);
      if (projectGid && !/^\d+$/.test(projectGid)) return json({ error: "Invalid Asana project GID" }, 400);

      const { response, body } = await asanaFetch(
        asanaPat,
        `${ASANA_TASKS_API}?opt_fields=${encodeURIComponent(TASK_OPT_FIELDS)}`,
        {
          method: "POST",
          body: JSON.stringify({
            data: {
              name,
              notes,
              workspace: workspaceGid,
              ...(projectGid ? { projects: [projectGid] } : {}),
            },
          }),
        },
      );
      if (!response.ok) {
        console.error(`[asana-task-action] Asana create ${response.status}: ${JSON.stringify(body)}`);
        return json({ error: `Asana rejected the task creation (${response.status})` }, 502);
      }
      return json({ ok: true, action, task: taskShape(body.data as Record<string, unknown>), actorUserId: userId }, 201);
    }

    const taskGid = String(payload.taskGid ?? "").trim();
    if (!/^\d+$/.test(taskGid)) return json({ error: "A valid Asana task GID is required" }, 400);
    const taskUrl = `${ASANA_TASKS_API}/${taskGid}?opt_fields=${encodeURIComponent(TASK_OPT_FIELDS)}`;
    const { response, body } = await asanaFetch(asanaPat, taskUrl, action === "complete" ? {
      method: "PUT",
      body: JSON.stringify({ data: { completed: true } }),
    } : { method: "GET" });

    if (!response.ok) {
      console.error(`[asana-task-action] Asana ${action} ${response.status}: ${JSON.stringify(body)}`);
      return json({ error: `Asana rejected the ${action} request (${response.status})` }, 502);
    }

    return json({
      ok: true,
      action,
      task: taskShape(body.data as Record<string, unknown>),
      actorUserId: userId,
    });
  } catch (error) {
    console.error("[asana-task-action] error:", error instanceof Error ? error.message : error);
    return json({ error: "Failed to reach Asana" }, 502);
  }
});
