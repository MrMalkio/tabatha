// ============================================================
// React hook over the awareness cache that the background service
// keeps in chrome.storage.local under `_otherProfiles`. Returns the
// list of OTHER installs for this user with their current status.
// Re-renders reactively when the background updates the cache (which
// happens on Supabase Realtime events).
// ============================================================
import { useMemo } from 'react';
import { useChromeStorage } from './useChromeStorage';

export function useOtherProfiles() {
  const [rows] = useChromeStorage('_otherProfiles', []);
  return useMemo(() => Array.isArray(rows) ? rows : [], [rows]);
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
