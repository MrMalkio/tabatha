import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getDeviceId } from '../lib/device';

export type FocusItem = {
  id: string;
  profile_id: string;
  client_id: string;
  label: string;
  funnel_stage: string;
  focus_state: string;
  timer_minutes: number;
  priority: number | null;
  tags: Record<string, any> | null;
  created_at: string;
  completed_at: string | null;
  browser_profile_id?: string | null;
};

function uuid(): string {
  return 'xxxxxxxxxxxx4xxxyxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isSidecarSourced(f: FocusItem): boolean {
  return f.tags?._src === 'sidecar';
}
export function startedAtOf(f: FocusItem): number {
  const iso = f.tags?._startedAt || f.created_at;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

/**
 * Live focus/queue state read directly from Supabase `focus_items`.
 * Polls (20s) + refetches after every mutation, and exposes a manual refresh.
 */
export function useFocus(
  profileId: string | null,
  browserProfileId: string | null
) {
  const [items, setItems] = useState<FocusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!profileId) {
        setItems([]);
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      const { data, error } = await supabase
        .from('focus_items')
        .select(
          'id, profile_id, client_id, label, funnel_stage, focus_state, timer_minutes, priority, tags, created_at, completed_at, browser_profile_id'
        )
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false });
      if (!mounted.current) return;
      if (!error && data) setItems(data as FocusItem[]);
      setLoading(false);
      setRefreshing(false);
    },
    [profileId]
  );

  useEffect(() => {
    mounted.current = true;
    load();
    const iv = setInterval(() => load(), 20000);
    return () => {
      mounted.current = false;
      clearInterval(iv);
    };
  }, [load]);

  const patch = useCallback(
    async (id: string, updates: Record<string, any>) => {
      // Optimistic
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...updates } : it))
      );
      await supabase.from('focus_items').update(updates).eq('id', id);
      load();
    },
    [load]
  );

  const createIntent = useCallback(
    async (
      label: string,
      timerMinutes: number,
      realm: string,
      opts: { active?: boolean; tags?: Record<string, any> } = {}
    ) => {
      if (!profileId) return;
      const deviceId = await getDeviceId();
      const clientId = `sidecar-${uuid()}`;
      const nowIso = new Date().toISOString();
      const active = opts.active !== false;

      // Single-active among sidecar items: pause other sidecar-active focuses.
      if (active) {
        const toPause = items.filter(
          (f) => f.focus_state === 'active' && isSidecarSourced(f)
        );
        for (const f of toPause) {
          await supabase
            .from('focus_items')
            .update({ focus_state: 'paused' })
            .eq('id', f.id);
        }
      }

      const row = {
        profile_id: profileId,
        client_id: clientId,
        label: label.trim(),
        funnel_stage: 'focus',
        focus_state: active ? 'active' : 'paused',
        timer_minutes: timerMinutes,
        priority: 5,
        browser_profile_id: browserProfileId,
        tags: {
          realm,
          _src: 'sidecar',
          _off: true,
          _startedAt: nowIso,
          ...(opts.tags || {}),
        },
      };
      await supabase.from('focus_items').insert(row);
      // Intent history breadcrumb.
      await supabase.from('intent_history').insert({
        profile_id: profileId,
        action: 'inherit',
        context: label.trim(),
        focus_id: clientId,
        browser_profile_id: browserProfileId,
        timestamp: nowIso,
      });
      load();
    },
    [profileId, browserProfileId, items, load]
  );

  // ── action helpers ─────────────────────────────────────────
  const actions = {
    switchTo: (id: string) =>
      (async () => {
        const others = items.filter(
          (f) => f.focus_state === 'active' && isSidecarSourced(f) && f.id !== id
        );
        for (const f of others)
          await supabase
            .from('focus_items')
            .update({ focus_state: 'paused' })
            .eq('id', f.id);
        await patch(id, {
          focus_state: 'active',
          tags: {
            ...(items.find((i) => i.id === id)?.tags || {}),
            _startedAt: new Date().toISOString(),
          },
        });
      })(),
    pause: (id: string) => patch(id, { focus_state: 'paused' }),
    resume: (id: string) =>
      patch(id, {
        focus_state: 'active',
        tags: {
          ...(items.find((i) => i.id === id)?.tags || {}),
          _startedAt: new Date().toISOString(),
        },
      }),
    resolve: (id: string) =>
      patch(id, {
        focus_state: 'completed',
        funnel_stage: 'resolved',
        completed_at: new Date().toISOString(),
      }),
    extend: (id: string, mins: number) => {
      const cur = items.find((i) => i.id === id);
      return patch(id, { timer_minutes: (cur?.timer_minutes || 15) + mins });
    },
    setPriority: (id: string, p: number) => patch(id, { priority: p }),
    setStage: (id: string, stage: string) => patch(id, { funnel_stage: stage }),
  };

  // ── derived views ──────────────────────────────────────────
  const activeFocus =
    items
      .filter((f) => f.focus_state === 'active')
      .sort((a, b) => startedAtOf(b) - startedAtOf(a))[0] || null;

  const queue = items
    .filter(
      (f) =>
        f.focus_state !== 'completed' &&
        f.funnel_stage !== 'resolved' &&
        (!activeFocus || f.id !== activeFocus.id)
    )
    .sort(
      (a, b) =>
        (a.priority || 5) - (b.priority || 5) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const history = items
    .filter((f) => f.focus_state === 'completed' || f.funnel_stage === 'resolved')
    .sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at).getTime() -
        new Date(a.completed_at || a.created_at).getTime()
    )
    .slice(0, 15);

  return {
    items,
    activeFocus,
    queue,
    history,
    loading,
    refreshing,
    refresh: () => load(true),
    createIntent,
    actions,
  };
}
