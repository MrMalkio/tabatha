import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getDeviceId } from '../lib/device';
import { insertFocusEvent } from './events';

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
 * Cross-surface current-focus arbitration (binding rule, 2026-07-20 fix
 * batch — the extension is being taught the identical rule in a parallel
 * build): the account's current focus is the `active` row with the latest
 * `tags._startedAt`, ANY source. Switching/starting anywhere pauses ALL
 * other actives regardless of source (see `pauseOtherActives` in
 * `useFocus`). This comparator is the pure, source-agnostic half of that
 * rule — used to resolve `currentFocus` below — and is exported/mirrored in
 * `tests/arbitration.test.mjs` so the selection logic itself is covered,
 * not just the elapsed-ms math around it.
 */
export function pickMostRecentActive<T extends FocusItem>(items: T[]): T | null {
  const actives = items.filter((f) => f.focus_state === 'active');
  if (!actives.length) return null;
  return actives.slice().sort((a, b) => startedAtOf(b) - startedAtOf(a))[0];
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

  // Live updates (realtime) — focus_items is in the supabase_realtime
  // publication (migration 033); RLS scopes events to this profile. Powers the
  // instant Context View on a TV / 3rd screen. Poll above stays as a fallback.
  useEffect(() => {
    if (!profileId) return;
    const ch = supabase
      .channel(`focus_${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'tabatha', table: 'focus_items', filter: `profile_id=eq.${profileId}` },
        () => load()
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [profileId, load]);

  const patch = useCallback(
    async (id: string, updates: Record<string, any>) => {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...updates } : it)));
      // "Stuck Sidecar" incident follow-up: a silently-failing write let the
      // optimistic flip get reverted by load() with zero signal. Surface it.
      const { error } = await supabase.from('focus_items').update(updates).eq('id', id);
      if (error) console.warn('focus_items update failed:', error.message, updates);
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

  // Cross-surface arbitration (binding rule): pauses EVERY other `active`
  // row for this profile, any source (sidecar or extension) — not just
  // sidecar-sourced ones. Each paused row gets its elapsed frozen into
  // `tags._elapsedMs` the same way regardless of source, so an
  // extension-sourced focus paused from the phone resumes with correct
  // elapsed time later (whichever surface resumes it). Shared by `switchTo`
  // and `createIntent(active: true)` so both entry points into "this is now
  // the one active focus" agree.
  const pauseOtherActives = useCallback(
    async (excludeId?: string | null) => {
      const others = items.filter((f) => f.focus_state === 'active' && f.id !== excludeId);
      for (const f of others) {
        await supabase
          .from('focus_items')
          .update({
            focus_state: 'paused',
            tags: { ...(f.tags || {}), _elapsedMs: Math.max(0, Date.now() - startedAtOf(f)) },
          })
          .eq('id', f.id);
        if (f.client_id) insertFocusEvent(profileId, f.client_id, 'pause');
      }
    },
    [items, profileId]
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
        await pauseOtherActives(null);
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
      if (active) insertFocusEvent(profileId, clientId, 'start', { label: label.trim() });
      if (active && data?.id) await persistCurrent(data.id);
      load();
      return data?.id || null;
    },
    [profileId, browserProfileId, items, load, persistCurrent, pauseOtherActives]
  );

  const actions = {
    switchTo: async (id: string) => {
      // Pause every OTHER active focus, any source — cross-surface
      // arbitration binding rule (was sidecar-only via isSidecarSourced,
      // which left extension actives running when switching from the
      // phone).
      await pauseOtherActives(id);
      await persistCurrent(id);
      const target = items.find((i) => i.id === id);
      const el = Number(target?.tags?._elapsedMs) || 0; // continue accumulated time
      const wasBackburnered = !!target?.tags?._backburner;
      await patch(id, {
        focus_state: 'active',
        tags: { ...(target?.tags || {}), _startedAt: new Date(Date.now() - el).toISOString(), _backburner: false, _snoozeUntil: null },
      });
      if (target?.client_id) {
        insertFocusEvent(profileId, target.client_id, 'start');
        if (wasBackburnered) insertFocusEvent(profileId, target.client_id, 'unbackburner', {});
      }
    },
    pause: (id: string) => {
      const f = items.find((i) => i.id === id);
      if (f?.client_id) insertFocusEvent(profileId, f.client_id, 'pause');
      return patch(id, {
        focus_state: 'paused',
        tags: { ...(f?.tags || {}), _elapsedMs: Math.max(0, Date.now() - startedAtOf(f as FocusItem)) },
      });
    },
    resume: (id: string) => {
      const f = items.find((i) => i.id === id);
      const el = Number(f?.tags?._elapsedMs) || 0; // resume where it left off
      if (f?.client_id) insertFocusEvent(profileId, f.client_id, 'resume');
      return patch(id, {
        focus_state: 'active',
        tags: { ...(f?.tags || {}), _startedAt: new Date(Date.now() - el).toISOString() },
      });
    },
    resolve: async (id: string) => {
      if (currentId === id) await persistCurrent(null);
      const f = items.find((i) => i.id === id);
      if (f?.client_id) insertFocusEvent(profileId, f.client_id, 'resolve');
      return patch(id, {
        focus_state: 'completed',
        funnel_stage: 'resolved',
        completed_at: new Date().toISOString(),
        // Fix Wave 3, item 2 (2026-07-20 spec): stash the pre-resolve stage
        // so `unresolve` below can restore it exactly instead of guessing
        // — the prior resolve path threw this information away entirely.
        tags: { ...(f?.tags || {}), _preResolveStage: f?.funnel_stage || 'addressing' },
      });
    },
    // Fix Wave 3, item 2 (2026-07-20 spec) — un-resolve, ported from the
    // extension's confirm-gated reopen pattern
    // (`src/background/services/focusService.js` `applyStageTransition`,
    // ~lines 716-720): changing a completed item's stage away from
    // 'resolved' requires an explicit `confirmed` flag, returning
    // `{ error, needsConfirm: true }` until the caller confirms. Restores
    // `focus_state: 'paused'` (not 'active' — matches the extension, which
    // never auto-resumes a reopened item) and `funnel_stage` to whatever was
    // stashed at resolve time (defaulting to 'addressing' if this item
    // predates the stash, same "best inferable guess" the spec calls for).
    // Koda addition (2026-07-20 vet): stamps `tags._lastUnresolvedAt` so a
    // focus resolved-and-reopened multiple times has a visible provenance
    // trail rather than silent state flipping.
    unresolve: async (
      id: string,
      confirmed = false
    ): Promise<{ error?: string; needsConfirm?: boolean; ok?: boolean }> => {
      const f = items.find((i) => i.id === id);
      if (!f) return { error: 'Focus not found' };
      const isResolved = f.focus_state === 'completed' || f.funnel_stage === 'resolved';
      if (!isResolved) return { error: 'This focus is not resolved.' };
      if (!confirmed) {
        return { error: 'This focus is completed. Confirm to reopen.', needsConfirm: true };
      }
      // No focus_events row here (deliberately) — 'resume' would mislead
      // computeIntervals into treating this as reopening a tracked run
      // (this restores 'paused', not 'active'), and the spec doesn't call
      // for a new 'unresolve' event kind. Provenance lives in tags instead
      // (Koda addition, below), visible in the edit panel.
      const restoredStage = f.tags?._preResolveStage || 'addressing';
      await patch(id, {
        focus_state: 'paused',
        funnel_stage: restoredStage,
        completed_at: null,
        tags: { ...(f.tags || {}), _preResolveStage: null, _lastUnresolvedAt: new Date().toISOString() },
      });
      return { ok: true };
    },
    extend: (id: string, mins: number) => {
      const cur = items.find((i) => i.id === id);
      const from = cur?.timer_minutes || 15;
      if (cur?.client_id)
        insertFocusEvent(profileId, cur.client_id, 'extend', {
          addedMinutes: mins,
          fromMinutes: from,
          toMinutes: from + mins,
        });
      return patch(id, { timer_minutes: from + mins });
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
      const f = items.find((i) => i.id === id);
      if (f?.client_id) insertFocusEvent(profileId, f.client_id, 'backburner', {});
      return patch(id, { focus_state: 'paused', tags: { ...(f?.tags || {}), _backburner: true } });
    },
    resumeBackburner: (id: string) => {
      const f = items.find((i) => i.id === id);
      if (f?.client_id) insertFocusEvent(profileId, f.client_id, 'unbackburner', {});
      return mergeTags(id, { _backburner: false, _snoozeUntil: null });
    },
    snoozeBackburner: (id: string, mins: number) => {
      const until = new Date(Date.now() + mins * 60000).toISOString();
      const f = items.find((i) => i.id === id);
      if (f?.client_id) insertFocusEvent(profileId, f.client_id, 'snooze', { mins, until });
      return mergeTags(id, { _backburner: true, _snoozeUntil: until });
    },
    dismissBackburner: async (id: string) => {
      if (currentId === id) await persistCurrent(null);
      return patch(id, { focus_state: 'completed', tags: { ...(items.find((i) => i.id === id)?.tags || {}), _backburner: false } });
    },
  };

  // ── derived views ──────────────────────────────────────────
  const notDone = items.filter((f) => f.focus_state !== 'completed' && f.funnel_stage !== 'resolved');
  const backburner = notDone.filter((f) => f.tags?._backburner);
  const nonBB = notDone.filter((f) => !f.tags?._backburner);

  // Current focus (B2/B2b, now cross-surface-arbitrated): an `active` focus
  // always wins, and WHICH active row wins is now fully source-agnostic and
  // device-agnostic — `pickMostRecentActive` (pure, exported above) always
  // picks the active row with the latest `tags._startedAt` regardless of
  // source or of this device's local pin. This is what makes two devices
  // agree on the same current focus: previously `currentId` (the
  // AsyncStorage pin) could win the active tier on ONE device while the
  // other device's `currentId` picked a different active row, so phone and
  // Context View could disagree about which of several actives was "the"
  // current one.
  // Else the most-recent `paused` (non-resolved) focus keeps showing —
  // paused is not gone, so a Context View running on a different device
  // shouldn't fall back to "no active focus" just because the pin lives in
  // *this* device's AsyncStorage. Only truly empty (no active and no paused
  // candidate — e.g. the last one was resolved) falls through to null, at
  // which point the caller (ContextView) renders the pending queue as B2b's
  // choose-from cards.
  // `currentId` (the local pin) is now ONLY a same-device tiebreaker within
  // the PAUSED tier (there's nothing to arbitrate in the active tier — it's
  // a single winner by recency) — e.g. choosing which paused row stays "on
  // top" for this device when nothing account-wide is active. This
  // preserves the pause-pinning UX (a paused current stays where the user
  // left it) without letting the pin override cross-surface active
  // selection.
  // Known limitation: within the paused tier, "most recent" (the fallback
  // when the pin doesn't qualify) is ordered by startedAtOf() (reflects when
  // a focus was last started/resumed, not when it was paused — there's no
  // `_pausedAt`/`updated_at` on FocusItem to rank by actual pause time).
  // With >1 paused candidate this can pick one that was started earlier but
  // paused later over one started later but paused first. Acceptable for
  // this pass (no schema change); revisit if multi-paused ordering becomes a
  // real problem.
  const pausedCandidates = nonBB.filter((f) => f.focus_state === 'paused');
  const pickPausedTier = (tier: FocusItem[]): FocusItem | null =>
    (currentId && tier.find((f) => f.id === currentId)) ||
    tier.slice().sort((a, b) => startedAtOf(b) - startedAtOf(a))[0] ||
    null;
  const currentFocus: FocusItem | null =
    pickMostRecentActive(nonBB) || pickPausedTier(pausedCandidates);

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
