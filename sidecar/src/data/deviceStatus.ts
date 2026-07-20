import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Device management (migration 045) — client-side "honor logic" for the two
// remote-control signals a DevicesCard on ANOTHER of the user's own devices
// can set on THIS device's browser_profiles row:
//   - `paused`      → this device should block its own UI until unpaused.
//   - `revoked_at`  → this device should sign itself out.
// Both are read here off this device's own row only (filtered by its own
// browser_profile_id — RLS already scopes reads to rows the caller owns or
// manages, but the filter keeps this specifically self-scoped regardless).
// Realtime-first (browser_profiles joined the supabase_realtime publication
// in migration 045) with a 60s poll fallback in case the channel never
// reaches SUBSCRIBED — same belt-and-suspenders pattern ContextView already
// uses for browser_profile_status.
//
// Mounted once at the app root (app/index.tsx) rather than per-screen so
// the paused/revoked check applies everywhere, not just inside one tab.

export type OwnDeviceStatus = {
  loading: boolean;
  paused: boolean;
  revoked: boolean;
  /** This device's own `device_settings` override row — passed through to
   * resolveContextViewSettings by ContextView (device > contextView >
   * legacy sidecar > defaults). */
  deviceSettings: Record<string, any>;
};

const IDLE_STATUS: OwnDeviceStatus = {
  loading: false,
  paused: false,
  revoked: false,
  deviceSettings: {},
};

export function useOwnDeviceStatus(browserProfileId: string | null): OwnDeviceStatus {
  const [status, setStatus] = useState<OwnDeviceStatus>({ ...IDLE_STATUS, loading: !!browserProfileId });

  const load = useCallback(async () => {
    if (!browserProfileId) return;
    const { data, error } = await supabase
      .from('browser_profiles')
      .select('paused, revoked_at, device_settings')
      .eq('id', browserProfileId)
      .maybeSingle();
    if (error || !data) {
      setStatus((s) => ({ ...s, loading: false }));
      return;
    }
    setStatus({
      loading: false,
      paused: !!data.paused,
      revoked: !!data.revoked_at,
      deviceSettings: (data.device_settings as Record<string, any>) || {},
    });
  }, [browserProfileId]);

  useEffect(() => {
    if (!browserProfileId) {
      setStatus(IDLE_STATUS);
      return undefined;
    }
    let alive = true;
    load();
    const ch = supabase
      .channel(`own_device_${browserProfileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'tabatha', table: 'browser_profiles', filter: `id=eq.${browserProfileId}` },
        () => {
          if (alive) load();
        }
      )
      .subscribe();
    const iv = setInterval(() => {
      if (alive) load();
    }, 60000);
    return () => {
      alive = false;
      clearInterval(iv);
      try {
        supabase.removeChannel(ch);
      } catch {
        /* best effort */
      }
    };
  }, [browserProfileId, load]);

  return status;
}
