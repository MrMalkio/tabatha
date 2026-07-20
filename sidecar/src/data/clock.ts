import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const CLOCK_KEY = 'tabby.sidecar.clock';

type Break = { start: string; end: string | null };
type OpenSession = {
  clockedInAt: string;
  onBreak: boolean;
  breakStartedAt: string | null;
  breaks: Break[];
};

export type ClockSessionRow = {
  id: string;
  client_id: string;
  clocked_in_at: string;
  clocked_out_at: string;
  total_ms: number;
  break_ms: number;
  work_ms: number;
  source: string;
};

function uuid(): string {
  return 'xxxxxxxxxxxx4xxxyxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function breakMsOf(s: OpenSession, now: number): number {
  let ms = 0;
  for (const b of s.breaks) {
    if (b.end) ms += new Date(b.end).getTime() - new Date(b.start).getTime();
  }
  if (s.onBreak && s.breakStartedAt)
    ms += now - new Date(s.breakStartedAt).getTime();
  return ms;
}

/**
 * The phone's own clock: an open session persisted locally + mirrored to
 * `browser_profile_status` for cross-device awareness. On clock-out a closed
 * row is written to `clock_sessions` (same shape the extension syncs). Shift
 * history reads closed `clock_sessions` rows.
 */
export function useClock(
  profileId: string | null,
  browserProfileId: string | null
) {
  const [open, setOpen] = useState<OpenSession | null>(null);
  const [history, setHistory] = useState<ClockSessionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);

  const loadHistory = useCallback(async () => {
    if (!profileId) return;
    const { data } = await supabase
      .from('clock_sessions')
      .select(
        'id, client_id, clocked_in_at, clocked_out_at, total_ms, break_ms, work_ms, source'
      )
      .eq('profile_id', profileId)
      .order('clocked_out_at', { ascending: false })
      .limit(20);
    if (mounted.current && data) setHistory(data as ClockSessionRow[]);
  }, [profileId]);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CLOCK_KEY);
        if (raw && mounted.current) setOpen(JSON.parse(raw));
      } catch {
        /* ignore */
      }
      setLoaded(true);
    })();
    loadHistory();
    return () => {
      mounted.current = false;
    };
  }, [loadHistory]);

  const persist = useCallback(async (s: OpenSession | null) => {
    setOpen(s);
    try {
      if (s) await AsyncStorage.setItem(CLOCK_KEY, JSON.stringify(s));
      else await AsyncStorage.removeItem(CLOCK_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const pushStatus = useCallback(
    async (patch: Record<string, any>) => {
      if (!profileId || !browserProfileId) return;
      await supabase.from('browser_profile_status').upsert(
        {
          browser_profile_id: browserProfileId,
          profile_id: profileId,
          online: true,
          last_heartbeat_at: new Date().toISOString(),
          last_clock_event_at: new Date().toISOString(),
          ...patch,
        },
        { onConflict: 'browser_profile_id' }
      );
    },
    [profileId, browserProfileId]
  );

  const clockIn = useCallback(async () => {
    const now = new Date().toISOString();
    await persist({
      clockedInAt: now,
      onBreak: false,
      breakStartedAt: null,
      breaks: [],
    });
    await pushStatus({ clock_state: 'clocked_in', clocked_in_at: now, on_break_since: null });
  }, [persist, pushStatus]);

  const toggleBreak = useCallback(async () => {
    if (!open) return;
    const now = new Date().toISOString();
    if (open.onBreak) {
      const breaks = open.breaks.map((b) =>
        b.end ? b : { ...b, end: now }
      );
      await persist({ ...open, onBreak: false, breakStartedAt: null, breaks });
      await pushStatus({ clock_state: 'clocked_in', on_break_since: null });
    } else {
      await persist({
        ...open,
        onBreak: true,
        breakStartedAt: now,
        breaks: [...open.breaks, { start: now, end: null }],
      });
      await pushStatus({ clock_state: 'on_break', on_break_since: now });
    }
  }, [open, persist, pushStatus]);

  const clockOut = useCallback(async () => {
    if (!open || !profileId) return;
    const now = Date.now();
    const start = new Date(open.clockedInAt).getTime();
    // close any dangling break
    const breaks = open.breaks.map((b) =>
      b.end ? b : { ...b, end: new Date(now).toISOString() }
    );
    const closed = { ...open, onBreak: false, breakStartedAt: null, breaks };
    const total = now - start;
    const brk = breakMsOf(closed, now);
    const work = Math.max(0, total - brk);
    await supabase.from('clock_sessions').insert({
      profile_id: profileId,
      client_id: `sidecar-clock-${uuid()}`,
      clocked_in_at: open.clockedInAt,
      clocked_out_at: new Date(now).toISOString(),
      total_ms: total,
      break_ms: brk,
      work_ms: work,
      breaks: breaks,
      source: 'sidecar',
      browser_profile_id: browserProfileId,
    });
    await pushStatus({ clock_state: 'clocked_out', clocked_in_at: null, on_break_since: null });
    await persist(null);
    loadHistory();
  }, [open, profileId, browserProfileId, persist, pushStatus, loadHistory]);

  return {
    open,
    history,
    loaded,
    clockIn,
    clockOut,
    toggleBreak,
    refreshHistory: loadHistory,
    breakMsOf,
  };
}
