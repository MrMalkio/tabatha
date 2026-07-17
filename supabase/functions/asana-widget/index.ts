import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const FUNCTION_SLUG = "asana-widget";
const ASANA_ORIGIN = "https://app.asana.com";
const MAX_AGENT_NAME = 80;
const MAX_DESCRIPTION = 500;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": ASANA_ORIGIN,
  "Access-Control-Allow-Headers": "content-type, x-asana-request-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

type AppPayload = {
  attachment?: string;
  expires_at?: string;
  task?: string;
  user?: string;
  values?: Record<string, unknown>;
  workspace?: string;
};

type TimeEntry = {
  agent_name?: string | null;
  ancestor_task_gids?: string[] | null;
  controller?: "human" | "ai-agent" | null;
  description?: string | null;
  duration_s?: number | null;
  id: string;
  started_at: string;
  stopped_at?: string | null;
  task_gid: string;
  user_gid: string;
  user_name?: string | null;
};

let client: SupabaseClient | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

function getClient(): SupabaseClient {
  if (client) return client;
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) {
    throw new Error("Supabase service configuration is unavailable");
  }
  client = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export function parsePostEnvelope(rawBody: string): {
  payload: AppPayload;
  signatureMessage: string;
} {
  const envelope = JSON.parse(rawBody) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(envelope, "data")) {
    const data = envelope.data;
    const signatureMessage = typeof data === "string"
      ? data
      : JSON.stringify(data);
    const payload = typeof data === "string" ? JSON.parse(data) : data;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid app component data payload");
    }
    return { payload: payload as AppPayload, signatureMessage };
  }
  return { payload: envelope as AppPayload, signatureMessage: rawBody };
}

export async function hmacHex(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function validateAsanaRequest(
  req: Request,
  payload: AppPayload,
  signatureMessage: string,
  secret: string,
  now = Date.now(),
): Promise<string | null> {
  const expiresAt = payload.expires_at ||
    new URL(req.url).searchParams.get("expires_at") || "";
  const expiry = Date.parse(expiresAt);
  if (!expiresAt || !Number.isFinite(expiry) || now >= expiry) {
    return "Request expired or missing expiry";
  }

  const supplied = req.headers.get("x-asana-request-signature") || "";
  if (!supplied) return "Missing Asana request signature";
  const expected = await hmacHex(secret, signatureMessage);
  if (!constantTimeEqual(supplied.toLowerCase(), expected)) {
    return "Invalid Asana request signature";
  }
  return null;
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function durationSeconds(entry: TimeEntry, now = Date.now()): number {
  if (entry.stopped_at) return Math.max(0, entry.duration_s || 0);
  const started = Date.parse(entry.started_at);
  return Number.isFinite(started)
    ? Math.max(0, Math.floor((now - started) / 1000))
    : 0;
}

export function buildWidgetMetadata(
  taskGid: string,
  userGid: string,
  entries: TimeEntry[],
  now = Date.now(),
) {
  const total = entries.reduce(
    (sum, entry) => sum + durationSeconds(entry, now),
    0,
  );
  const direct = entries
    .filter((entry) => entry.task_gid === taskGid)
    .reduce((sum, entry) => sum + durationSeconds(entry, now), 0);
  const nested = Math.max(0, total - direct);
  const agentTotal = entries
    .filter((entry) => entry.controller === "ai-agent")
    .reduce((sum, entry) => sum + durationSeconds(entry, now), 0);
  const active = entries.filter((entry) => !entry.stopped_at);
  const myTimer = active.find((entry) =>
    entry.controller !== "ai-agent" && entry.user_gid === userGid
  );

  const fields: Array<Record<string, unknown>> = [{
    name: "Status",
    type: "pill",
    text: myTimer
      ? "Tracking my time"
      : active.length
      ? `${active.length} active`
      : "Idle",
    color: myTimer ? "green" : active.length ? "yellow" : "cool-gray",
  }, {
    name: "Total attention",
    type: "text_with_icon",
    text: formatDuration(total),
  }];

  if (nested > 0) {
    fields.push({
      name: "Nested rollup",
      type: "text_with_icon",
      text: formatDuration(nested),
    });
  }
  if (agentTotal > 0) {
    fields.push({
      name: "Agent attention",
      type: "text_with_icon",
      text: formatDuration(agentTotal),
    });
  }

  const actorTotals = new Map<string, number>();
  for (const entry of entries) {
    const actor = entry.controller === "ai-agent"
      ? `Agent · ${entry.agent_name || "Unnamed"}`
      : entry.user_name || `User ${entry.user_gid.slice(-4)}`;
    actorTotals.set(
      actor,
      (actorTotals.get(actor) || 0) + durationSeconds(entry, now),
    );
  }
  for (
    const [actor, seconds] of [...actorTotals.entries()].sort((a, b) =>
      b[1] - a[1]
    ).slice(0, 5)
  ) {
    fields.push({
      name: actor,
      type: "text_with_icon",
      text: formatDuration(seconds),
    });
  }

  return {
    template: "summary_with_details_v0",
    metadata: {
      title: "Tabatha attention",
      subtitle: entries.length
        ? `${formatDuration(total)} across ${actorTotals.size} attention owner${
          actorTotals.size === 1 ? "" : "s"
        }`
        : "No attention tracked yet",
      fields,
      footer: {
        footer_type: "custom_text",
        text: "Open Track attention to start or stop",
      },
    },
  };
}

export function buildFormMetadata(
  baseUrl: string,
  activeHuman: TimeEntry | null,
) {
  return {
    template: "form_metadata_v0",
    metadata: {
      title: "Track attention with Tabatha",
      on_submit_callback: `${baseUrl}/form/submit`,
      fields: [{
        type: "static_text",
        id: "status",
        name: activeHuman
          ? "Your timer is running. Submit with ‘My attention’ to stop it, or choose a named agent to toggle that agent’s attention."
          : "Submit with ‘My attention’ to start your timer, or choose a named agent to allocate attention to an agent.",
      }, {
        name: "Attention owner",
        type: "dropdown",
        id: "actor_type",
        is_required: true,
        options: [
          { id: "human", label: "My attention" },
          { id: "agent", label: "Named agent" },
        ],
        value: "human",
        width: "full",
      }, {
        name: "Agent name",
        type: "single_line_text",
        id: "agent_name",
        is_required: false,
        placeholder: "Required when Named agent is selected",
        width: "full",
      }, {
        name: "Attention note",
        type: "single_line_text",
        id: "description",
        is_required: false,
        placeholder: "Optional context for this stint",
        width: "full",
      }],
    },
  };
}

function baseUrl(req: Request): string {
  const url = new URL(req.url);
  const marker = `/functions/v1/${FUNCTION_SLUG}`;
  const index = url.pathname.indexOf(marker);
  return `${url.origin}${
    index >= 0 ? url.pathname.slice(0, index + marker.length) : ""
  }`;
}

function taskResourceUrl(req: Request, taskGid: string): string {
  return `${baseUrl(req)}/task/${taskGid}`;
}

async function fetchEntries(taskGid: string): Promise<TimeEntry[]> {
  const { data, error } = await getClient()
    .from("flux_time_entries")
    .select("*")
    .or(`task_gid.eq.${taskGid},ancestor_task_gids.cs.{${taskGid}}`)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data || []) as TimeEntry[];
}

async function activeHuman(
  taskGid: string,
  userGid: string,
): Promise<TimeEntry | null> {
  const { data, error } = await getClient()
    .from("flux_time_entries")
    .select("*")
    .eq("task_gid", taskGid)
    .eq("user_gid", userGid)
    .eq("controller", "human")
    .is("stopped_at", null)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] || null) as TimeEntry | null;
}

async function toggleAttention(
  req: Request,
  payload: AppPayload,
): Promise<Response> {
  const taskGid = String(payload.task || "");
  const userGid = String(payload.user || "");
  const workspaceGid = String(payload.workspace || "");
  if (
    !/^\d+$/.test(taskGid) || !/^\d+$/.test(userGid) ||
    !/^\d+$/.test(workspaceGid)
  ) {
    return json({ error: "Invalid task, user, or workspace context" }, 400);
  }

  const values = payload.values || {};
  const actorType = values.actor_type === "agent" ? "agent" : "human";
  const agentName = String(values.agent_name || "").trim().slice(
    0,
    MAX_AGENT_NAME,
  );
  const description =
    String(values.description || "").trim().slice(0, MAX_DESCRIPTION) || null;
  if (actorType === "agent" && !agentName) {
    return json(
      { error: "Agent name is required for named-agent attention" },
      400,
    );
  }

  let query = getClient()
    .from("flux_time_entries")
    .select("*")
    .eq("task_gid", taskGid)
    .eq("user_gid", userGid)
    .eq("controller", actorType === "agent" ? "ai-agent" : "human")
    .is("stopped_at", null)
    .order("started_at", { ascending: false })
    .limit(1);
  if (actorType === "agent") query = query.eq("agent_name", agentName);
  const { data: activeRows, error: activeError } = await query;
  if (activeError) throw activeError;

  const active = activeRows?.[0] as TimeEntry | undefined;
  if (active) {
    const { error } = await getClient()
      .from("flux_time_entries")
      .update({
        stopped_at: new Date().toISOString(),
        description: description || active.description,
      })
      .eq("id", active.id);
    if (error) throw error;
  } else {
    const { error } = await getClient().from("flux_time_entries").insert({
      task_gid: taskGid,
      source_task_gid: taskGid,
      workspace_gid: workspaceGid,
      user_gid: userGid,
      user_name: actorType === "agent"
        ? `Agent · ${agentName}`
        : `User ${userGid.slice(-4)}`,
      controller: actorType === "agent" ? "ai-agent" : "human",
      agent_name: actorType === "agent" ? agentName : null,
      started_at: new Date().toISOString(),
      description,
      metadata: {
        source: "asana-app-component",
        allocated_by_user_gid: userGid,
      },
    });
    if (error) throw error;
  }

  return json({
    resource_name: "Tabatha attention",
    resource_url: taskResourceUrl(req, taskGid),
  });
}

const AUTH_SUCCESS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Tabatha connected</title></head>
<body><p>Tabatha is connected to Asana. This window will close.</p>
<script>window.opener?.postMessage("success", "https://app.asana.com"); window.close();</script></body></html>`;

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "GET" && path.endsWith("/health")) {
    return json({ app: "Tabatha Asana App Component", status: "ok" });
  }
  if (req.method === "GET" && path.endsWith("/auth")) {
    return html(AUTH_SUCCESS_HTML);
  }
  const taskResourceMatch = path.match(/\/task\/(\d+)$/);
  if (req.method === "GET" && taskResourceMatch) {
    return Response.redirect(
      `https://app.asana.com/0/0/${taskResourceMatch[1]}/f`,
      302,
    );
  }

  let payload: AppPayload;
  let signatureMessage: string;
  try {
    if (req.method === "GET") {
      payload = Object.fromEntries(url.searchParams.entries()) as AppPayload;
      signatureMessage = url.search.slice(1);
    } else if (req.method === "POST") {
      ({ payload, signatureMessage } = parsePostEnvelope(await req.text()));
    } else {
      return json({ error: "Method not allowed" }, 405);
    }
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const secret = Deno.env.get("ASANA_CLIENT_SECRET") || "";
  if (!secret) {
    return json(
      { error: "App component signature secret is not configured" },
      500,
    );
  }
  const validationError = await validateAsanaRequest(
    req,
    payload,
    signatureMessage,
    secret,
  );
  if (validationError) return json({ error: validationError }, 400);

  try {
    const taskGid = String(payload.task || "");
    const userGid = String(payload.user || "");
    if (!/^\d+$/.test(taskGid) || !/^\d+$/.test(userGid)) {
      return json({ error: "Invalid task or user context" }, 400);
    }

    if (req.method === "GET" && path.endsWith("/widget")) {
      return json(
        buildWidgetMetadata(taskGid, userGid, await fetchEntries(taskGid)),
      );
    }
    if (req.method === "GET" && path.endsWith("/form/metadata")) {
      return json(
        buildFormMetadata(baseUrl(req), await activeHuman(taskGid, userGid)),
      );
    }
    if (req.method === "POST" && path.endsWith("/form/submit")) {
      return await toggleAttention(req, payload);
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error(
      "[asana-widget]",
      error instanceof Error ? error.message : error,
    );
    return json({ error: "Tabatha attention service is unavailable" }, 500);
  }
}

if (Deno.env.get("DENO_DEPLOYMENT_ID") || import.meta.main) {
  Deno.serve(handler);
}
