import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
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
};

const AuthContext = createContext<AuthState | null>(null);

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
    return prof;
  }, []);

  // Register the phone as its own device row (best-effort, non-blocking).
  const registerDevice = useCallback(async (prof: Profile) => {
    if (registered.current) return;
    registered.current = true;
    try {
      const deviceId = await getDeviceId();
      const surface = surfaceForDevice();
      const { data, error } = await supabase
        .from('browser_profiles')
        .upsert(
          {
            profile_id: prof.id,
            browser: surface,
            profile_name: deviceLabel(),
            classification: 'professional',
            extension_installed: false,
            local_id: deviceId,
            machine_id: deviceId,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'profile_id,browser' }
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
        if (data.session?.user?.id) {
          const prof = await fetchProfile(data.session.user.id);
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
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  const saveSidecarSettings = useCallback(
    async (patch: Record<string, any>) => {
      if (!profile) return;
      const nextSettings = {
        ...(profile.settings || {}),
        sidecar: { ...(profile.settings?.sidecar || {}), ...patch },
      };
      const { error } = await supabase
        .from('profiles')
        .update({ settings: nextSettings })
        .eq('id', profile.id);
      if (!error) setProfile({ ...profile, settings: nextSettings });
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
