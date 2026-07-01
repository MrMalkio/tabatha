// ============================================================
// React hook over the awareness cache that the background service
// keeps in chrome.storage.local under `_otherProfiles`. Returns the
// list of OTHER installs for this user with their current status.
// Re-renders reactively when the background updates the cache (which
// happens on Supabase Realtime events).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChromeStorage, sendMessage } from './useChromeStorage';

export function useOtherProfiles() {
  const [rows] = useChromeStorage('_otherProfiles', []);
  return useMemo(() => Array.isArray(rows) ? rows : [], [rows]);
}

// FIX-10: lazy read-only cross-device intent queue. Fetches on demand via the
// GET_OTHER_QUEUE background handler (a bounded pull, NOT a sync). Re-fetches
// whenever the awareness cache changes (siblings coming/going) so the queue
// stays roughly current without polling. Returns a map keyed by
// browser_profile_id → shaped device queue, plus a manual refresh().
export function useOtherQueues() {
  const others = useOtherProfiles();
  const [byDevice, setByDevice] = useState({});

  // Pull the queue and fold the device list into a lookup map. Guarded so a
  // stale in-flight response from a prior render can't clobber a newer one.
  const load = useCallback((isCancelled) => {
    return sendMessage('GET_OTHER_QUEUE').then((resp) => {
      if (isCancelled?.()) return;
      const devices = Array.isArray(resp?.devices) ? resp.devices : [];
      const next = {};
      for (const d of devices) {
        if (d?.browser_profile_id) next[d.browser_profile_id] = d;
      }
      setByDevice(next);
    });
  }, []);

  // Manual refresh (e.g. after expanding a chip). No cancel guard needed here.
  const refresh = useCallback(() => load(), [load]);

  // Refresh when the set of other installs changes (join key: their ids). The
  // setState lives inside the async .then callback, not the effect body.
  const othersKey = others.map(o => o.browser_profile_id).join(',');
  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [othersKey, load]);

  return { byDevice, refresh };
}

// Helper for formatting a focus timer remaining-time chip.
export function formatRemaining(timerEndsAt) {
  if (!timerEndsAt) return null;
  const remMs = new Date(timerEndsAt).getTime() - Date.now();
  if (!Number.isFinite(remMs)) return null;
  const sign = remMs < 0 ? '-' : '';
  const abs = Math.abs(remMs);
  const mins = Math.floor(abs / 60000);
  const secs = Math.floor((abs % 60000) / 1000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${sign}${h}h ${m}m`;
  }
  if (mins > 0) return `${sign}${mins}m`;
  return `${sign}${secs}s`;
}
