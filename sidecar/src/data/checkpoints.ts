import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type Checkpoint = {
  id: string;
  focus_client_id: string;
  text: string;
  progress_level: string;
  created_at: string;
};

export const PROGRESS_LEVELS: { key: string; label: string; icon: string; color: string }[] = [
  { key: 'none', label: 'None', icon: '😐', color: '#9e9e9e' },
  { key: 'little', label: 'Little', icon: '📈', color: '#29b6f6' },
  { key: 'lot', label: 'A lot', icon: '🚀', color: '#66bb6a' },
  { key: 'almost_done', label: 'Almost', icon: '🏁', color: '#ffd54f' },
  { key: 'stuck', label: 'Stuck', icon: '🚧', color: '#ef5350' },
];

/** Checkpoint notes for a given focus (by client_id). */
export function useCheckpoints(profileId: string | null, focusClientId: string | null) {
  const [notes, setNotes] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  // QA P2 (v0.3.0 report): guard against setState-after-unmount — this hook is
  // mounted/unmounted as panels toggle while its query is in flight.
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!profileId || !focusClientId) {
      if (mounted.current) setNotes([]);
      return;
    }
    if (mounted.current) setLoading(true);
    const { data } = await supabase
      .from('focus_checkpoints')
      .select('id, focus_client_id, text, progress_level, created_at')
      .eq('profile_id', profileId)
      .eq('focus_client_id', focusClientId)
      .order('created_at', { ascending: false });
    if (!mounted.current) return;
    if (data) setNotes(data as Checkpoint[]);
    setLoading(false);
  }, [profileId, focusClientId]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const add = useCallback(
    async (text: string, level: string) => {
      if (!profileId || !focusClientId) return;
      await supabase.from('focus_checkpoints').insert({
        profile_id: profileId,
        focus_client_id: focusClientId,
        text: text.trim(),
        progress_level: level,
        source: 'sidecar',
      });
      load();
    },
    [profileId, focusClientId, load]
  );

  const remove = useCallback(
    async (id: string) => {
      await supabase.from('focus_checkpoints').delete().eq('id', id);
      load();
    },
    [load]
  );

  return { notes, loading, add, remove, reload: load };
}
