import { useCallback, useEffect, useRef, useState } from 'react';
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
};

function uuid(): string {
  return 'xxxxxxxxxxxx4xxxyxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useTasks(profileId: string | null) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!profileId) {
        setTasks([]);
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      const { data, error } = await supabase
        .from('tasks_registry')
        .select(
          'id, task_id, name, description, status, funnel_stage, created_at, completed_at, archived'
        )
        .eq('profile_id', profileId)
        .eq('archived', false)
        .order('created_at', { ascending: false });
      if (!mounted.current) return;
      if (!error && data) setTasks(data as TaskRow[]);
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

  const active = tasks.filter((t) => t.status !== 'completed');
  const completed = tasks.filter((t) => t.status === 'completed');

  return {
    tasks,
    active,
    completed,
    loading,
    refreshing,
    refresh: () => load(true),
    createTask,
    complete,
    reopen,
  };
}
