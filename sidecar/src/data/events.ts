import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Plan 040 §3 / Lane A chunk 2 — the per-focus start/stop event log
// (migration 034). Kept separate from `intent_history` (rolling, capped)
// because the Context View timeline (Epic 2) and per-task time (Epic 4) need
// an uncapped, precisely-paired interval stream.

// 'extend' and 'snooze' (migration 039) are context kinds, not interval
// kinds — computeIntervals ignores them. 'extend' carries
// {addedMinutes, fromMinutes, toMinutes} and renders as a timeline node
// like a checkpoint; 'snooze' carries {mins, until} for deferral history.
export type FocusEventKind = 'start' | 'pause' | 'resume' | 'resolve' | 'extend' | 'snooze';

export type FocusEvent = {
  id: string;
  profile_id: string;
  focus_client_id: string;
  kind: FocusEventKind;
  at: string;
  source: string;
  meta: Record<string, any> | null;
};

/**
 * Best-effort append to `focus_events`. Never throws — a write failure here
 * (migration not yet applied on an older client, transient network blip)
 * must never break the actual start/pause/resume/resolve action it rides
 * alongside. Callers fire this without awaiting the UI on it.
 */
export async function insertFocusEvent(
  profileId: string | null | undefined,
  focusClientId: string | null | undefined,
  kind: FocusEventKind,
  meta: Record<string, any> = {}
): Promise<void> {
  if (!profileId || !focusClientId) return;
  try {
    await supabase.from('focus_events').insert({
      profile_id: profileId,
      focus_client_id: focusClientId,
      kind,
      source: 'sidecar',
      meta,
    });
  } catch {
    /* best effort — the timeline degrades gracefully without this row */
  }
}

/**
 * Live `focus_events` for one focus (by client_id), oldest first. Polls once
 * on mount/dep-change and subscribes to realtime (migration 034 adds the
 * table to the `supabase_realtime` publication) for instant updates when a
 * start/pause/resume/resolve lands from another surface. Mirrors the
 * `useCheckpoints` / `useFocus` realtime pattern already used in this app.
 */
export function useFocusEvents(profileId: string | null, focusClientId: string | null) {
  const [events, setEvents] = useState<FocusEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!profileId || !focusClientId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('focus_events')
      .select('id, profile_id, focus_client_id, kind, at, source, meta')
      .eq('profile_id', profileId)
      .eq('focus_client_id', focusClientId)
      .order('at', { ascending: true });
    if (data) setEvents(data as FocusEvent[]);
    setLoading(false);
  }, [profileId, focusClientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!profileId || !focusClientId) return;
    const ch = supabase
      .channel(`focus_events_${profileId}_${focusClientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'tabatha', table: 'focus_events', filter: `profile_id=eq.${profileId}` },
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
  }, [profileId, focusClientId, load]);

  return { events, loading, reload: load };
}

export type Interval = { start: number; end: number };

// Interval-pairing rule (Plan 040 Addendum 5, binding item 2): pair each
// opening event ('start' | 'resume') with the next closing event
// ('pause' | 'resolve'). An open interval with no closing event counts "to
// now" ONLY if the focus is currently active; otherwise it's a dangling
// interval from a stale/lost close and is discarded.
export function computeIntervals(events: FocusEvent[], isActive: boolean, now: number): Interval[] {
  const intervals: Interval[] = [];
  let openAt: number | null = null;
  for (const e of events) {
    const t = new Date(e.at).getTime();
    if (!Number.isFinite(t)) continue;
    if (e.kind === 'start' || e.kind === 'resume') {
      if (openAt == null) openAt = t;
    } else if (e.kind === 'pause' || e.kind === 'resolve') {
      if (openAt != null) {
        intervals.push({ start: openAt, end: Math.max(openAt, t) });
        openAt = null;
      }
    }
  }
  if (openAt != null && isActive) {
    intervals.push({ start: openAt, end: Math.max(openAt, now) });
  }
  return intervals;
}

/** Total "📱 Sidecar-tracked" time across all paired intervals. */
export function totalTrackedMs(intervals: Interval[]): number {
  return intervals.reduce((sum, iv) => sum + Math.max(0, iv.end - iv.start), 0);
}

/** Cumulative tracked time up to (not including) wall-clock time `t`. */
export function cumulativeTrackedAt(intervals: Interval[], t: number): number {
  let sum = 0;
  for (const iv of intervals) {
    if (iv.start >= t) continue;
    sum += Math.max(0, Math.min(iv.end, t) - iv.start);
  }
  return sum;
}
