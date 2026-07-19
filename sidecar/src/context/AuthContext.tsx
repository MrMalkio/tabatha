import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getDeviceId, deviceLabel } from '../lib/device';

export type Profile = {
  id: string;
  auth_user_id: string;
  display_name: string;
  default_realm?: string;
  settings?: Record<string, any>;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  browserProfileId: string | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveSidecarSettings: (patch: Record<string, any>) => Promise<void>;
  saveChaperoneSettings: (patch: Record<string, any>) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// Cold-load perf (Epic 7 follow-on pass, Rook): the splash gate used to stay
// up for a full network round trip to `profiles` before FocusScreen ever
// mounted, which meant FocusScreen's own `focus_items` fetch didn't even
// *start* until the profile fetch finished — two Supabase round trips fully
// serialized. Measured against prod Supabase from a dev box: ~480ms serial
// vs ~155ms when the two requests run concurrently. Since profile.id is
// stable per user, a cached copy from the last successful fetch is safe to
// paint with immediately (hydrate-then-revalidate) — this unblocks
// FocusScreen's mount (and therefore its own fetch) without waiting on the
// network, then the real fetch below still runs and reconciles display_name
// /settings/default_realm once it lands. No data semantics change — this
// only decides how soon the *same* data appears.
const CACHED_PROFILE_KEY = 'tabby.sidecar.cachedProfile';

async function readCachedProfile(authUserId: string): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.authUserId === authUserId && parsed?.profile?.id) {
      return parsed.profile as Profile;
    }
  } catch {
    /* ignore — falls through to the network fetch as usual */
  }
  return null;
}

function writeCachedProfile(authUserId: string, prof: Profile): void {
  AsyncStorage.setItem(
    CACHED_PROFILE_KEY,
    JSON.stringify({ authUserId, profile: prof })
  ).catch(() => {
    /* best effort */
  });
}

function surfaceForDevice(): 'mobile_ios' | 'mobile_android' | 'tabatha_web' {
  const ua =
    Platform.OS === 'web' && typeof navigator !== 'undefined'
      ? navigator.userAgent
      : Platform.OS;
  if (/iphone|ipad|ipod/i.test(ua)) return 'mobile_ios';
  if (/android/i.test(ua)) return 'mobile_android';
  return 'tabatha_web';
}

/** Where the app should return after OAuth / magic-link on web. */
export function redirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Honor the /sidecar base path in production.
    return window.location.origin + window.location.pathname;
  }
  return 'sidecar://auth';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [browserProfileId, setBrowserProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const registered = useRef(false);

  const fetchProfile = useCallback(async (authUserId: string) => {
    // Read or auto-provision the Tabatha profile (mirrors the extension).
    const { data: existing, error } = await supabase
      .from('profiles')
      .select('id, auth_user_id, display_name, default_realm, settings')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) {
      console.warn('profile read failed', error.message);
    }

    let prof = existing as Profile | null;
    if (!prof) {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData?.user;
      const displayName =
        u?.user_metadata?.full_name ||
        u?.user_metadata?.name ||
        u?.email?.split('@')[0] ||
        'Tabatha User';
      const { data: created, error: insErr } = await supabase
        .from('profiles')
        .insert({ auth_user_id: authUserId, display_name: displayName })
        .select('id, auth_user_id, display_name, default_realm, settings')
        .single();
      if (insErr) {
        console.warn('profile create failed', insErr.message);
        return null;
      }
      prof = created as Profile;
    }
    setProfile(prof);
    writeCachedProfile(authUserId, prof);
    return prof;
  }, []);

  // Register the phone as its own device row (best-effort, non-blocking).
  const registerDevice = useCallback(async (prof: Profile) => {
    if (registered.current) return;
    registered.current = true;
    try {
      const deviceId = await getDeviceId();
      const surface = surfaceForDevice();
      // Key on (profile_id, local_id) — the full unique index from migration
      // 017 (the extension's own upsert target). A partial index on
      // (profile_id, browser) exists too but ON CONFLICT can't target it.
      // local_id is stable per surface so the user's mobile presence collapses
      // to one row (also satisfying the mobile-surface uniqueness in mig 013).
      const localId = `sidecar-${surface}`;
      const { data, error } = await supabase
        .from('browser_profiles')
        .upsert(
          {
            profile_id: prof.id,
            browser: surface,
            profile_name: deviceLabel(),
            classification: 'professional',
            extension_installed: false,
            local_id: localId,
            machine_id: deviceId,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'profile_id,local_id' }
        )
        .select('id')
        .maybeSingle();
      if (error) {
        console.warn('device register failed', error.message);
        return;
      }
      if (data?.id) setBrowserProfileId(data.id);
    } catch (e) {
      console.warn('device register error', e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session ?? null);
        const uid = data.session?.user?.id;
        if (uid) {
          // Cache-first paint (see CACHED_PROFILE_KEY note above): if we have
          // a last-known profile for this same user, show it and drop the
          // splash gate immediately so FocusScreen mounts and starts its own
          // fetch right away, in parallel with the fetchProfile revalidation
          // below instead of after it.
          const cached = await readCachedProfile(uid);
          if (cached && !cancelled) {
            setProfile(cached);
            setLoading(false);
          }
          const prof = await fetchProfile(uid);
          if (cancelled) return;
          if (prof) registerDevice(prof);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (cancelled) return;
      setSession(s);
      if (s?.user?.id) {
        const prof = await fetchProfile(s.user.id);
        if (prof) registerDevice(prof);
      } else {
        setProfile(null);
        setBrowserProfileId(null);
        registered.current = false;
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile, registerDevice]);

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl() },
    });
  }, []);

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl() },
    });
    return { error: error?.message };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setBrowserProfileId(null);
    registered.current = false;
    AsyncStorage.removeItem(CACHED_PROFILE_KEY).catch(() => {
      /* best effort */
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  // Epic 9 — both settings writers go through the server-side
  // `update_profile_settings` RPC (migration 038) instead of a client-side
  // read-modify-write of the whole `settings` column. That old pattern was a
  // cross-surface race: the extension (Epic 9's own first settings writer)
  // could fetch `profile.settings`, this tab could write a different
  // top-level key in between, and this write would silently clobber it
  // because `nextSettings` was computed from a stale snapshot. The RPC does
  // an atomic, server-side `jsonb_set` merge per top-level key, so two
  // concurrent writers touching different (or the same) keys never lose data
  // to each other. Local state still gets an optimistic merge on success —
  // same shape callers already rely on.
  const saveSidecarSettings = useCallback(
    async (patch: Record<string, any>) => {
      if (!profile) return;
      const { data, error } = await supabase.rpc('update_profile_settings', {
        p_profile_id: profile.id,
        p_patch: { sidecar: patch },
      });
      // The Sidecar's `supabase` client is pre-scoped `db: { schema: 'tabatha' }`
      // (sidecar/src/lib/supabase.ts:23) — no .schema('tabatha') needed here,
      // unlike the extension's default client (see ContextViewPanel.jsx).
      if (!error && data?.success) {
        setProfile({ ...profile, settings: data.settings });
      } else if (error) {
        console.warn('saveSidecarSettings RPC failed', error.message);
      } else if (data && !data.success) {
        console.warn('saveSidecarSettings RPC rejected', data.error);
      }
    },
    [profile]
  );

  // Distinct top-level `settings.chaperone` key (Plan 040 Epic 10 / #182) —
  // kept separate from `settings.sidecar` so this write never clobbers it.
  const saveChaperoneSettings = useCallback(
    async (patch: Record<string, any>) => {
      if (!profile) return;
      const { data, error } = await supabase.rpc('update_profile_settings', {
        p_profile_id: profile.id,
        p_patch: { chaperone: patch },
      });
      if (!error && data?.success) {
        setProfile({ ...profile, settings: data.settings });
      } else if (error) {
        console.warn('saveChaperoneSettings RPC failed', error.message);
      } else if (data && !data.success) {
        console.warn('saveChaperoneSettings RPC rejected', data.error);
      }
    },
    [profile]
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        browserProfileId,
        loading,
        signInWithGoogle,
        signInWithMagicLink,
        signOut,
        refreshProfile,
        saveSidecarSettings,
        saveChaperoneSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
