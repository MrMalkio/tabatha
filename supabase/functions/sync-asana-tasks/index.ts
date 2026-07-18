// Supabase Edge Function — sync-asana-tasks (Epic 3 v1)
//
// Invoked every 5 minutes by pg_cron (migration 035, job `asana-task-sync`,
// reusing the existing `sidecar_cron_key` service-role bearer — see
// send-focus-push for the identical pattern). This is the reconcile loop:
// the guaranteed baseline whether or not connect-asana's webhook is live
// (design §3.2 — "webhook-primary, cron-reconcile").
//
// v1 scope (design §6): ONE-DIRECTIONAL Asana -> Tabatha pull only. No
// mutation pushback — a locally-newer row is defended (never overwritten)
// but never pushed to Asana either. Per-profile PATs are resolved from
// Vault at call time (tabatha.get_vault_secret via the profile's
// integration_credentials.vault_secret_name) — never a static env secret.
//
// Per-profile pull scope: tasks assigned to the PAT owner
// (`assignee=me&workspace=<gid>`), plus each such task's subtasks and
// dependencies. `completed_since` bounds the window so completed tasks still
// sync down (status flips) without pulling a user's entire task history.
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

const ASANA_API = 'https://app.asana.com/api/1.0';

// ── v1 tunables (documented in epic3-deploy-notes.md) ──
const MIN_RESYNC_INTERVAL_MS = 4 * 60 * 1000;      // guard against overlapping cron runs
const COMPLETED_SINCE_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_LIST_PAGES = 5;                           // 5 * 100 = 500 tasks/profile/pass cap
const LIST_PAGE_LIMIT = 100;
const MAX_SUBTASK_PARENTS_PER_PASS = 50;
const PROFILE_CONCURRENCY = 3;                      // different PATs = independent rate-limit buckets

const TASK_LIST_OPT_FIELDS = [
  'name', 'notes', 'completed', 'completed_at', 'modified_at', 'permalink_url',
  'dependencies', 'num_subtasks', 'custom_fields.name', 'custom_fields.enum_value.name',
].join(',');

const SUBTASK_OPT_FIELDS = ['name', 'notes', 'completed', 'completed_at', 'modified_at', 'permalink_url'].join(',');

// Best-effort Stage custom-field -> Tabatha funnel_stage mapping (design §5).
// Case-insensitive match on the enum option's display name; unmatched or
// absent Stage fields leave funnel_stage untouched (Bucket B behavior).
const STAGE_MAP: Record<string, string> = {
  unsorted: 'unsorted',
  todo: 'todo',
  'to-do': 'todo',
  focus: 'focus',
  addressing: 'addressing',
  resolved: 'resolved',
  roadblocked: 'roadblocked',
  blocked: 'roadblocked',
};

interface AsanaCustomField {
  name?: string;
  enum_value?: { name?: string } | null;
}

interface AsanaTaskCompact {
  gid: string;
}

interface AsanaTask {
  gid: string;
  name: string;
  notes?: string;
  completed?: boolean;
  completed_at?: string | null;
  modified_at: string;
  permalink_url?: string;
  dependencies?: AsanaTaskCompact[];
  num_subtasks?: number;
  custom_fields?: AsanaCustomField[];
}

interface Credential {
  profile_id: string;
  vault_secret_name: string;
  workspace_gid: string | null;
  user_task_list_gid: string | null;
  last_synced_at: string | null;
}

interface ExistingTaskRow {
  task_id: string;
  external_updated_at: string | null;
  sync_state: string;
}

function resolveFunnelStage(task: AsanaTask): string | null {
  const stageField = task.custom_fields?.find((f) => (f.name ?? '').trim().toLowerCase() === 'stage');
  const optionName = stageField?.enum_value?.name;
  if (!optionName) return null;
  return STAGE_MAP[optionName.trim().toLowerCase()] ?? null;
}

async function asanaFetch(pat: string, path: string): Promise<{ ok: boolean; status: number; body: any }> {
  try {
    const resp = await fetch(`${ASANA_API}${path}`, {
      headers: { Authorization: `Bearer ${pat}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const body = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, body };
  } catch (e) {
    console.error('[sync-asana-tasks] Asana fetch error:', e instanceof Error ? e.message : e);
    return { ok: false, status: 0, body: {} };
  }
}

async function listAssignedTasks(pat: string, workspaceGid: string): Promise<AsanaTask[] | 'unauthorized'> {
  const completedSince = new Date(Date.now() - COMPLETED_SINCE_LOOKBACK_MS).toISOString();
  const tasks: AsanaTask[] = [];
  let offset: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const params = new URLSearchParams({
      assignee: 'me',
      workspace: workspaceGid,
      completed_since: completedSince,
      opt_fields: TASK_LIST_OPT_FIELDS,
      limit: String(LIST_PAGE_LIMIT),
    });
    if (offset) params.set('offset', offset);
    const { ok, status, body } = await asanaFetch(pat, `/tasks?${params.toString()}`);
    if (!ok) {
      if (status === 401) return 'unauthorized';
      console.error('[sync-asana-tasks] list page failed:', status, JSON.stringify(body).slice(0, 300));
      break;
    }
    tasks.push(...(body.data ?? []));
    offset = body.next_page?.offset;
    if (!offset) break;
  }
  return tasks;
}

async function listSubtasks(pat: string, parentGid: string): Promise<AsanaTask[]> {
  const subtasks: AsanaTask[] = [];
  let offset: string | undefined;
  for (let page = 0; page < 2; page++) {
    const params = new URLSearchParams({ opt_fields: SUBTASK_OPT_FIELDS, limit: String(LIST_PAGE_LIMIT) });
    if (offset) params.set('offset', offset);
    const { ok, status, body } = await asanaFetch(pat, `/tasks/${parentGid}/subtasks?${params.toString()}`);
    if (!ok) {
      console.error('[sync-asana-tasks] subtasks fetch failed for', parentGid, status);
      break;
    }
    subtasks.push(...(body.data ?? []));
    offset = body.next_page?.offset;
    if (!offset) break;
  }
  return subtasks;
}

async function upsertTask(profileId: string, t: AsanaTask): Promise<void> {
  const { error } = await admin.rpc('sync_upsert_asana_task', {
    p_profile_id: profileId,
    p_task_id: t.gid,
    p_name: t.name,
    p_description: t.notes ?? '',
    p_status: t.completed ? 'completed' : 'active',
    p_completed_at: t.completed_at ?? null,
    p_funnel_stage: resolveFunnelStage(t),
    p_external_updated_at: t.modified_at,
    p_permalink: t.permalink_url ?? null,
  });
  if (error) console.error('[sync-asana-tasks] sync_upsert_asana_task failed for', t.gid, error.message);
}

async function syncDependencies(profileId: string, task: AsanaTask): Promise<void> {
  const depGids = (task.dependencies ?? []).map((d) => d.gid);
  for (const depGid of depGids) {
    const { error } = await admin.rpc('sync_upsert_task_relation', {
      p_profile_id: profileId,
      p_from_task: task.gid,
      p_to_task: depGid,
      p_kind: 'depends_on',
    });
    if (error) console.error('[sync-asana-tasks] sync_upsert_task_relation(depends_on) failed:', error.message);
  }
  const { error: tombError } = await admin.rpc('sync_tombstone_stale_relations', {
    p_profile_id: profileId,
    p_from_task: task.gid,
    p_kind: 'depends_on',
    p_keep_to_tasks: depGids,
  });
  if (tombError) console.error('[sync-asana-tasks] tombstone depends_on failed:', tombError.message);
}

async function syncSubtasks(pat: string, profileId: string, parent: AsanaTask): Promise<void> {
  const subtasks = await listSubtasks(pat, parent.gid);
  const subtaskGids: string[] = [];
  for (const st of subtasks) {
    await upsertTask(profileId, st);
    subtaskGids.push(st.gid);
    const { error } = await admin.rpc('sync_upsert_task_relation', {
      p_profile_id: profileId,
      p_from_task: parent.gid,
      p_to_task: st.gid,
      p_kind: 'subtask',
    });
    if (error) console.error('[sync-asana-tasks] sync_upsert_task_relation(subtask) failed:', error.message);
  }
  const { error: tombError } = await admin.rpc('sync_tombstone_stale_relations', {
    p_profile_id: profileId,
    p_from_task: parent.gid,
    p_kind: 'subtask',
    p_keep_to_tasks: subtaskGids,
  });
  if (tombError) console.error('[sync-asana-tasks] tombstone subtask failed:', tombError.message);
}

async function syncProfile(cred: Credential): Promise<{ profileId: string; synced: number; deleted: number; error?: string }> {
  const profileId = cred.profile_id;

  if (cred.last_synced_at && Date.now() - new Date(cred.last_synced_at).getTime() < MIN_RESYNC_INTERVAL_MS) {
    return { profileId, synced: 0, deleted: 0 };
  }
  if (!cred.workspace_gid) {
    return { profileId, synced: 0, deleted: 0, error: 'no workspace_gid on credential' };
  }

  const { data: pat, error: patError } = await admin.rpc('get_vault_secret', {
    p_secret_name: cred.vault_secret_name,
  });
  if (patError || !pat) {
    return { profileId, synced: 0, deleted: 0, error: patError?.message ?? 'PAT not resolvable' };
  }

  const listResult = await listAssignedTasks(pat as string, cred.workspace_gid);
  if (listResult === 'unauthorized') {
    await admin.from('integration_credentials').update({ status: 'error' }).eq('profile_id', profileId).eq('provider', 'asana');
    return { profileId, synced: 0, deleted: 0, error: 'Asana rejected the stored PAT (401) — marked status=error' };
  }
  const freshTasks = listResult;
  const freshGidSet = new Set(freshTasks.map((t) => t.gid));

  // Deletion detection (design §2.3's cron "poll" safety net): any
  // previously-synced, un-archived Asana task for this profile that no
  // longer appears in the current assignee=me sweep is treated as
  // remote-deleted (or unassigned/reassigned — v1 doesn't distinguish; both
  // mean it should drop out of this profile's Tasks view the same way).
  const { data: existingRows } = await admin
    .from('tasks_registry')
    .select('task_id, external_updated_at, sync_state')
    .eq('profile_id', profileId)
    .eq('external_platform', 'asana')
    .eq('archived', false);
  const existingMap = new Map<string, ExistingTaskRow>((existingRows ?? []).map((r: ExistingTaskRow) => [r.task_id, r]));

  let deleted = 0;
  for (const [taskId] of existingMap) {
    if (!freshGidSet.has(taskId)) {
      const { error } = await admin.rpc('sync_mark_remote_deleted', { p_profile_id: profileId, p_task_id: taskId });
      if (!error) deleted++;
    }
  }

  let synced = 0;
  let subtaskParentsProcessed = 0;
  for (const t of freshTasks) {
    const existing = existingMap.get(t.gid);
    const isDirty =
      !existing ||
      existing.sync_state === 'pending_pull' ||
      !existing.external_updated_at ||
      new Date(existing.external_updated_at).getTime() < new Date(t.modified_at).getTime();

    if (!isDirty) continue;

    await upsertTask(profileId, t);
    await syncDependencies(profileId, t);
    synced++;

    if ((t.num_subtasks ?? 0) > 0 && subtaskParentsProcessed < MAX_SUBTASK_PARENTS_PER_PASS) {
      await syncSubtasks(pat as string, profileId, t);
      subtaskParentsProcessed++;
    }
  }

  await admin.rpc('sync_touch_last_synced', { p_profile_id: profileId });
  return { profileId, synced, deleted };
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  async function next(): Promise<void> {
    const i = idx++;
    if (i >= items.length) return;
    results[i] = await worker(items[i]);
    await next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

Deno.serve(async () => {
  const { data: credentials, error } = await admin
    .from('integration_credentials')
    .select('profile_id, vault_secret_name, workspace_gid, user_task_list_gid, last_synced_at')
    .eq('provider', 'asana')
    .eq('status', 'active');

  if (error) {
    console.error('[sync-asana-tasks] failed to list credentials:', error.message);
    return new Response(JSON.stringify({ error: 'Failed to list credentials' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = await runWithConcurrency(
    (credentials ?? []) as Credential[],
    PROFILE_CONCURRENCY,
    syncProfile
  );

  const summary = {
    profilesScanned: results.length,
    profilesSynced: results.filter((r) => r.synced > 0 || r.deleted > 0).length,
    tasksSynced: results.reduce((sum, r) => sum + r.synced, 0),
    tasksRemoteDeleted: results.reduce((sum, r) => sum + r.deleted, 0),
    errors: results.filter((r) => r.error).map((r) => ({ profileId: r.profileId, error: r.error })),
  };

  return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } });
});
