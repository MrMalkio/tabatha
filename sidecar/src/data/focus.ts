import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const CURRENT_KEY = 'tabby.sidecar.currentFocusId';

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
export function isOffComputer(f: FocusItem): boolean {
  return !!f.tags?._off;
}
export function startedAtOf(f: FocusItem): number {
  const iso = f.tags?._startedAt || f.created_at;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Date.now();
}
// Elapsed run-time, continuing across pauses. While active it's derived from the
// (pause-shifted) start; while paused it's frozen at tags._elapsedMs.
export function elapsedMsOf(f: FocusItem, now: number): number {
  if (f.focus_state === 'active') return Math.max(0, now - startedAtOf(f));
  const frozen = f.tags?._elapsedMs;
  return Number.isFinite(frozen) ? Math.max(0, frozen) : Math.max(0, now - startedAtOf(f));
}
function snoozedUntil(f: FocusItem): number {
  const t = f.tags?._snoozeUntil ? new Date(f.tags._snoozeUntil).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Live focus/queue state read directly from Supabase `focus_items`.
 * Polls (15s) + refetches after every mutation, exposes a manual refresh.
 * Tracks a locally-pinned "current focus" so pausing keeps it at the top
 * (mirrors the extension sidebar) instead of demoting it into the queue.
 */
export function useFocus(
  profileId: string | null,
  browserProfileId: string | null
) {
  const [items, setItems] = useState<FocusItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const persistCurrent = useCallback(async (id: string | null) => {
    setCurrentId(id);
    try {
      if (id) await AsyncStorage.setItem(CURRENT_KEY, id);
      else await AsyncStorage.removeItem(CURRENT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

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
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(CURRENT_KEY);
        if (saved && mounted.current) setCurrentId(saved);
      } catch {
        /* ignore */
      }
    })();
    load();
    const iv = setInterval(() => load(), 15000);
    return () => {
      mounted.current = false;
      clearInterval(iv);
    };
  }, [load]);

  const patch = useCallback(
    async (id: string, updates: Record<string, any>) => {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...updates } : it)));
      await supabase.from('focus_items').update(updates).eq('id', id);
      load();
    },
    [load]
  );

  const mergeTags = useCallback(
    (id: string, tagPatch: Record<string, any>) => {
      const cur = items.find((i) => i.id === id);
      return patch(id, { tags: { ...(cur?.tags || {}), ...tagPatch } });
    },
    [items, patch]
  );

  const createIntent = useCallback(
    async (
      label: string,
      timerMinutes: number,
      realm: string,
      opts: { active?: boolean; parentId?: string; tags?: Record<string, any> } = {}
    ) => {
      if (!profileId) return null;
      const deviceId = await getDeviceId();
      const clientId = `sidecar-${uuid()}`;
      const nowIso = new Date().toISOString();
      const active = opts.active !== false;

      if (active) {
        const toPause = items.filter(
          (f) => f.focus_state === 'active' && isSidecarSourced(f)
        );
        for (const f of toPause)
          await supabase.from('focus_items').update({ focus_state: 'paused' }).eq('id', f.id);
      }

      const parentClient = opts.parentId
        ? items.find((i) => i.id === opts.parentId)?.client_id
        : undefined;

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
          ...(parentClient ? { _parent: parentClient } : {}),
          ...(opts.tags || {}),
        },
      };
      const { data } = await supabase.from('focus_items').insert(row).select('id').maybeSingle();
      await supabase.from('intent_history').insert({
        profile_id: profileId,
        action: opts.parentId ? 'side_quest' : 'inherit',
        context: label.trim(),
        focus_id: clientId,
        browser_profile_id: browserProfileId,
        timestamp: nowIso,
      });
      if (active && data?.id) await persistCurrent(data.id);
      load();
      return data?.id || null;
    },
    [profileId, browserProfileId, items, load, persistCurrent]
  );

  const actions = {
    switchTo: async (id: string) => {
      // Pause the currently-active one, freezing its elapsed so it can continue later.
      const others = items.filter(
        (f) => f.focus_state === 'active' && isSidecarSourced(f) && f.id !== id
      );
      for (const f of others)
        await supabase
          .from('focus_items')
          .update({ focus_state: 'paused', tags: { ...(f.tags || {}), _elapsedMs: Math.max(0, Date.now() - startedAtOf(f)) } })
          .eq('id', f.id);
      await persistCurrent(id);
      const target = items.find((i) => i.id === id);
      const el = Number(target?.tags?._elapsedMs) || 0; // continue accumulated time
      await patch(id, {
        focus_state: 'active',
        tags: { ...(target?.tags || {}), _startedAt: new Date(Date.now() - el).toISOString(), _backburner: false, _snoozeUntil: null },
      });
    },
    pause: (id: string) => {
      const f = items.find((i) => i.id === id);
      return patch(id, {
        focus_state: 'paused',
        tags: { ...(f?.tags || {}), _elapsedMs: Math.max(0, Date.now() - startedAtOf(f as FocusItem)) },
      });
    },
    resume: (id: string) => {
      const f = items.find((i) => i.id === id);
      const el = Number(f?.tags?._elapsedMs) || 0; // resume where it left off
      return patch(id, {
        focus_state: 'active',
        tags: { ...(f?.tags || {}), _startedAt: new Date(Date.now() - el).toISOString() },
      });
    },
    resolve: async (id: string) => {
      if (currentId === id) await persistCurrent(null);
      return patch(id, {
        focus_state: 'completed',
        funnel_stage: 'resolved',
        completed_at: new Date().toISOString(),
      });
    },
    extend: (id: string, mins: number) => {
      const cur = items.find((i) => i.id === id);
      return patch(id, { timer_minutes: (cur?.timer_minutes || 15) + mins });
    },
    setPriority: (id: string, p: number) => patch(id, { priority: p }),
    setStage: (id: string, stage: string) => patch(id, { funnel_stage: stage }),
    updateFocus: (
      id: string,
      u: { label?: string; timerMinutes?: number; funnelStage?: string; startedAt?: string; tags?: Record<string, any> }
    ) => {
      const cur = items.find((i) => i.id === id);
      const updates: Record<string, any> = {};
      if (u.label != null) updates.label = u.label;
      if (u.timerMinutes != null) updates.timer_minutes = u.timerMinutes;
      if (u.funnelStage != null) updates.funnel_stage = u.funnelStage;
      const nextTags = { ...(cur?.tags || {}), ...(u.tags || {}) };
      if (u.startedAt) nextTags._startedAt = u.startedAt;
      updates.tags = nextTags;
      return patch(id, updates);
    },
    toggleOffComputer: (id: string) => {
      const cur = items.find((i) => i.id === id);
      return mergeTags(id, { _off: !cur?.tags?._off });
    },
    setCurrent: (id: string | null) => persistCurrent(id),
    sendToBackburner: (id: string) => {
      if (currentId === id) persistCurrent(null);
      return patch(id, { focus_state: 'paused', tags: { ...(items.find((i) => i.id === id)?.tags || {}), _backburner: true } });
    },
    resumeBackburner: (id: string) => mergeTags(id, { _backburner: false, _snoozeUntil: null }),
    snoozeBackburner: (id: string, mins: number) =>
      mergeTags(id, { _backburner: true, _snoozeUntil: new Date(Date.now() + mins * 60000).toISOString() }),
    dismissBackburner: async (id: string) => {
      if (currentId === id) await persistCurrent(null);
      return patch(id, { focus_state: 'completed', tags: { ...(items.find((i) => i.id === id)?.tags || {}), _backburner: false } });
    },
  };

  // ── derived views ──────────────────────────────────────────
  const notDone = items.filter((f) => f.focus_state !== 'completed' && f.funnel_stage !== 'resolved');
  const backburner = notDone.filter((f) => f.tags?._backburner);
  const nonBB = notDone.filter((f) => !f.tags?._backburner);

  // Current focus: the locally-pinned one if still open, else most-recent active.
  let currentFocus: FocusItem | null =
    (currentId && nonBB.find((f) => f.id === currentId)) || null;
  if (!currentFocus) {
    currentFocus =
      nonBB.filter((f) => f.focus_state === 'active').sort((a, b) => startedAtOf(b) - startedAtOf(a))[0] || null;
  }

  const queue = nonBB
    .filter((f) => !currentFocus || f.id !== currentFocus.id)
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
    currentFocus,
    queue,
    backburner,
    history,
    loading,
    refreshing,
    refresh: () => load(true),
    createIntent,
    actions,
    snoozedUntil,
  };
}
