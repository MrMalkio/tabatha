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
import { getDeviceId, deviceLabel, PAIRED_DEVICE_NAME_KEY } from '../lib/device';
import { redeemInviteToken, type InviteKind } from '../lib/invites';
import { sessionIdFromAccessToken } from '../lib/jwt';

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
  // Invite-signup gate: true once we know the authed user has no Tabatha
  // profile row yet (see fetchProfile below — we no longer auto-provision
  // one). False for every existing profiled account (back-compat: zero
  // behavior change for them) and flips back to false once redeemInvite
  // succeeds.
  needsInvite: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  redeemInvite: (code: string) => Promise<{ ok: boolean; error?: string; kind?: InviteKind }>;
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
  const [needsInvite, setNeedsInvite] = useState(false);
  const registered = useRef(false);

  // Invite-signup gate. Previously this auto-created a bare profiles row
  // for ANY authenticated user, which meant sign-in alone was enough to
  // reach the full app with no invite required. Now: read-only. If no row
  // exists, surface `needsInvite: true` instead of provisioning one —
  // existing accounts (row already present) see zero behavior change.
  // Provisioning now only happens as a direct result of a successful
  // invite-code redemption (see redeemInvite below), not on every sign-in.
  const fetchProfile = useCallback(async (authUserId: string) => {
    const { data: existing, error } = await supabase
      .from('profiles')
      .select('id, auth_user_id, display_name, default_realm, settings')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) {
      console.warn('profile read failed', error.message);
    }

    const prof = existing as Profile | null;
    if (!prof) {
      setNeedsInvite(true);
      return null;
    }
    setNeedsInvite(false);
    setProfile(prof);
    writeCachedProfile(authUserId, prof);
    return prof;
  }, []);

  // Register the phone as its own device row (best-effort, non-blocking).
  //
  // Device management (migration 045) additions on top of the original
  // upsert:
  //   (a) auth_session_id — decoded off the CURRENT session's access token
  //       (the `session_id` GoTrue claim), so device-signout can revoke
  //       this exact session later even if this device is offline.
  //   (b) a name minted on ANOTHER device via PairWatchCard's free-text
  //       input survives the redeem round-trip in AsyncStorage
  //       (PAIRED_DEVICE_NAME_KEY, written by CodeSignIn.tsx just before
  //       setSession fires this whole flow) — read it once, apply it as
  //       both display_name and profile_name, then clear it so it can't
  //       leak into a LATER re-register on this same device after a rename
  //       from elsewhere.
  //   (c) display_name is otherwise sticky: this runs on every sign-in
  //       (once per app lifetime via the `registered` guard, but a fresh
  //       reinstall/relaunch means "every sign-in" in practice), and a
  //       plain upsert would silently re-blank a user's rename back to
  //       nothing every time. Fetching the existing row's display_name
  //       first and omitting the key entirely from the upsert payload when
  //       there's nothing new to set means Postgres's ON CONFLICT DO
  //       UPDATE never touches that column — supabase-js only emits
  //       `SET col = excluded.col` for keys present in the payload object.
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

      const { data: existing } = await supabase
        .from('browser_profiles')
        .select('display_name')
        .eq('profile_id', prof.id)
        .eq('local_id', localId)
        .maybeSingle();

      let pairedName: string | null = null;
      try {
        pairedName = await AsyncStorage.getItem(PAIRED_DEVICE_NAME_KEY);
      } catch {
        /* ignore — falls through to no override */
      }

      let profileName = deviceLabel();
      const namePatch: { display_name?: string } = {};
      if (pairedName) {
        profileName = pairedName;
        namePatch.display_name = pairedName;
        AsyncStorage.removeItem(PAIRED_DEVICE_NAME_KEY).catch(() => {
          /* best effort */
        });
      } else if (!existing?.display_name) {
        // No prior custom name and nothing new to set — leave the column
        // out of the payload so INSERT gets NULL (client-side fallback to
        // profile_name/browser, see DevicesCard's surfaceLabel) and UPDATE
        // leaves whatever's already there (also NULL in this branch) alone.
      }
      // else: existing.display_name is set and there's no new pairedName —
      // namePatch stays empty, so the upsert below omits display_name
      // entirely and the existing value survives untouched.

      const { data: sessionData } = await supabase.auth.getSession();
      const sessionId = sessionIdFromAccessToken(sessionData.session?.access_token);

      const { data, error } = await supabase
        .from('browser_profiles')
        .upsert(
          {
            profile_id: prof.id,
            browser: surface,
            profile_name: profileName,
            classification: 'professional',
            extension_installed: false,
            local_id: localId,
            machine_id: deviceId,
            last_seen_at: new Date().toISOString(),
            // 0.13.4 — reclaim on sign-in. The upsert keys on
            // (profile_id, local_id), so a device that was remotely signed
            // out lands back on its own REVOKED row; without clearing
            // revoked_at the honor logic (app/index.tsx) sees "revoked →
            // sign yourself out" and boots the fresh session immediately —
            // the 2026-07-21 magic-link sign-in/sign-out loop. A registration
            // only ever runs under a live authenticated session for this
            // profile, and signing in IS the re-authorization of this
            // device, so clearing the flag here is exactly right.
            revoked_at: null,
            ...(sessionId ? { auth_session_id: sessionId } : {}),
            ...namePatch,
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
    setNeedsInvite(false);
    registered.current = false;
    AsyncStorage.removeItem(CACHED_PROFILE_KEY).catch(() => {
      /* best effort */
    });
  }, []);

  // Also registers the device the first time this resolves a profile — the
  // initial mount effect only calls registerDevice when fetchProfile found
  // a row *then*; a needsInvite user's first successful profile only shows
  // up via redeemInvite's own refreshProfile() call below, so this has to
  // pick up that case too. registerDevice no-ops after its first call
  // (registered.current guard), so this is a no-op for already-registered
  // existing accounts calling refreshProfile for any other reason.
  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      const prof = await fetchProfile(session.user.id);
      if (prof) registerDevice(prof);
    }
  }, [session, fetchProfile, registerDevice]);

  // Invite-signup gate redeem flow.
  //
  // tabatha.redeem_invite_token (migrations 003 + 018) looks up the caller's
  // profile by auth_user_id and REQUIRES that row to already exist — it
  // attaches org/team membership + stamps profile defaults onto an existing
  // profile, it does not create one. Since fetchProfile above no longer
  // auto-provisions a profile on sign-in (that's the entire point of the
  // gate), redemption has to create a minimal shell profile first so the
  // RPC has something to find.
  //
  // That shell creation is gated behind this explicit, user-initiated
  // Redeem action — never behind mere sign-in — so an un-invited user can't
  // get a usable profile row (the gate's own signal) just by loading the
  // screen. If the code turns out to be invalid/used/expired, the shell is
  // rolled back (deleted) so needsInvite flips back to true rather than
  // silently letting a failed attempt still open the gate.
  const redeemInvite = useCallback(
    async (rawCode: string): Promise<{ ok: boolean; error?: string; kind?: InviteKind }> => {
      const uid = session?.user?.id;
      if (!uid) return { ok: false, error: 'Not signed in.' };
      const code = rawCode.trim();
      if (!code) return { ok: false, error: 'Enter your invite code.' };

      // Migration 042 (CeeCee integration ruling): the RPC itself creates the
      // caller's profile atomically AFTER validating the token — the earlier
      // client-side shell-insert + compensating-delete had a crash window
      // that could orphan a profile and bypass the invite gate. One call,
      // no client-side provisioning.
      //
      // Migration 043 adds `kind` ('demo' | 'personal' | 'team', remodeled
      // from 'demo' | 'team' | 'founder' in migration 044) to the
      // payload — passed through here so a caller COULD show kind-specific
      // copy, but InviteGateScreen doesn't today: `needsInvite` flips to
      // false as soon as this resolves `ok: true`, and app/index.tsx
      // re-renders straight past this screen into the normal app in the
      // same tick, so there's no frame in which a success message here
      // would actually be visible.
      const result = await redeemInviteToken(code);
      if (!result.success) {
        return { ok: false, error: result.error || 'That code isn’t valid or was already used.' };
      }

      const fresh = await fetchProfile(uid);
      if (fresh) registerDevice(fresh);
      return { ok: true, kind: result.kind };
    },
    [session, profile, fetchProfile, registerDevice]
  );

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
        needsInvite,
        signInWithGoogle,
        signInWithMagicLink,
        signOut,
        refreshProfile,
        redeemInvite,
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
