import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export type TaskRow = {
  id: string;
  task_id: string;
  name: string;
  description: string;
  status: string;
  funnel_stage: string;
  created_at: string;
  completed_at: string | null;
  archived: boolean;
  // Epic 3 (migration 035) sync bookkeeping. Optional so this hook still
  // works against a DB that predates the migration (columns simply absent).
  external_platform?: 'tabatha' | 'asana' | null;
  sync_state?: string | null;
  linked_intents?: string[] | null;
  metadata?: Record<string, any> | null;
};

// task_relations edge (migration 035). kind is only ever subtask/depends_on —
// "blocks" is derived by reverse-reading depends_on, never stored (Koda's
// binding revision on the Epic 3 design).
export type TaskRelation = {
  from_task: string;
  to_task: string;
  kind: 'subtask' | 'depends_on';
};

export function isAsanaTask(t: TaskRow): boolean {
  return t.external_platform === 'asana';
}

export function taskPermalink(t: TaskRow): string | null {
  const p = t.metadata?.permalink;
  return typeof p === 'string' && p ? p : null;
}

function uuid(): string {
  return 'xxxxxxxxxxxx4xxxyxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useTasks(profileId: string | null) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [relations, setRelations] = useState<TaskRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!profileId) {
        setTasks([]);
        setRelations([]);
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      const [taskRes, relRes] = await Promise.all([
        supabase
          .from('tasks_registry')
          .select(
            'id, task_id, name, description, status, funnel_stage, created_at, completed_at, archived, external_platform, sync_state, linked_intents, metadata'
          )
          .eq('profile_id', profileId)
          .eq('archived', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('task_relations')
          .select('from_task, to_task, kind')
          .eq('profile_id', profileId)
          .is('deleted_at', null),
      ]);
      if (!mounted.current) return;
      if (!taskRes.error && taskRes.data) setTasks(taskRes.data as TaskRow[]);
      // Pre-035 DBs have no task_relations — treat the error as "no edges"
      // so the screen still renders a flat list.
      if (!relRes.error && relRes.data) setRelations(relRes.data as TaskRelation[]);
      setLoading(false);
      setRefreshing(false);
    },
    [profileId]
  );

  useEffect(() => {
    mounted.current = true;
    load();
    const iv = setInterval(() => load(), 30000);
    return () => {
      mounted.current = false;
      clearInterval(iv);
    };
  }, [load]);

  // Reload-on-focus. `tasks_registry` / `task_relations` are NOT in the
  // supabase_realtime publication (033 covers focus_items +
  // browser_profile_status, 034 covers focus_events), so instead of a
  // realtime channel this refetches the moment the tab becomes visible
  // again — which is exactly when a webhook/cron sync is most likely to
  // have landed while the phone was pocketed. The 30s poll above remains
  // the steady-state fallback. Deliberately no migration here (build brief:
  // do NOT write one); flip to a channel if a later migration adds the
  // tables to the publication.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [load]);

  const createTask = useCallback(
    async (name: string) => {
      if (!profileId || !name.trim()) return;
      await supabase.from('tasks_registry').insert({
        profile_id: profileId,
        task_id: `sidecar-${uuid()}`,
        name: name.trim(),
        status: 'active',
        funnel_stage: 'unsorted',
      });
      load();
    },
    [profileId, load]
  );

  const complete = useCallback(
    async (id: string) => {
      setTasks((p) =>
        p.map((t) => (t.id === id ? { ...t, status: 'completed' } : t))
      );
      await supabase
        .from('tasks_registry')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);
      load();
    },
    [load]
  );

  const reopen = useCallback(
    async (id: string) => {
      setTasks((p) =>
        p.map((t) => (t.id === id ? { ...t, status: 'active' } : t))
      );
      await supabase
        .from('tasks_registry')
        .update({ status: 'active', completed_at: null })
        .eq('id', id);
      load();
    },
    [load]
  );

  // #186 pattern (Epic 3 design §5): when a focus is started from a task,
  // the task row's linked_intents JSONB gets the focus's client_id appended.
  // Bucket-B write — the sync engine never overwrites linked_intents.
  const linkFocusToTask = useCallback(
    async (taskDbId: string, focusClientId: string) => {
      const t = tasks.find((x) => x.id === taskDbId);
      const existing = Array.isArray(t?.linked_intents) ? t.linked_intents : [];
      if (existing.includes(focusClientId)) return;
      await supabase
        .from('tasks_registry')
        .update({ linked_intents: [...existing, focusClientId] })
        .eq('id', taskDbId);
      load();
    },
    [tasks, load]
  );

  // ── derived views ──────────────────────────────────────────
  const active = tasks.filter((t) => t.status !== 'completed');
  const completed = tasks.filter((t) => t.status === 'completed');

  const byTaskId = new Map(tasks.map((t) => [t.task_id, t]));

  // parent task_id -> child TaskRows (nested render). A child whose parent
  // isn't in the registry (e.g. parent not assigned to this user) renders
  // top-level instead of vanishing.
  const subtaskChildren = new Map<string, TaskRow[]>();
  const childTaskIds = new Set<string>();
  for (const r of relations) {
    if (r.kind !== 'subtask') continue;
    const child = byTaskId.get(r.to_task);
    if (!child || !byTaskId.has(r.from_task)) continue;
    childTaskIds.add(r.to_task);
    const list = subtaskChildren.get(r.from_task) || [];
    list.push(child);
    subtaskChildren.set(r.from_task, list);
  }

  // Blocked = has a depends_on edge whose target is KNOWN here and not
  // completed. A dep target we never synced (someone else's task) is
  // skipped rather than guessed at — per the "show nothing rather than a
  // wrong answer" rule for this slice.
  const blockedTaskIds = new Set<string>();
  for (const r of relations) {
    if (r.kind !== 'depends_on') continue;
    const dep = byTaskId.get(r.to_task);
    if (dep && dep.status !== 'completed' && !dep.archived) {
      blockedTaskIds.add(r.from_task);
    }
  }

  return {
    tasks,
    active,
    completed,
    relations,
    subtaskChildren,
    childTaskIds,
    blockedTaskIds,
    loading,
    refreshing,
    refresh: () => load(true),
    createTask,
    complete,
    reopen,
    linkFocusToTask,
  };
}
