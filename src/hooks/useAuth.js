import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, dataClient, updateProfileName } from '../services/supabaseClient';

// Instant-display cache for the profile row (esp. display_name). Persisted to
// chrome.storage.local so a rename survives a page reload before the server
// confirms, and so the name renders immediately on next open without waiting
// on a network read. Reconciled against the server profile on every fetch.
const PROFILE_CACHE_KEY = '_profileCache';

async function readCachedProfile() {
  try {
    if (!chrome?.storage?.local) return null;
    const { [PROFILE_CACHE_KEY]: cached } = await chrome.storage.local.get(PROFILE_CACHE_KEY);
    return cached && typeof cached === 'object' ? cached : null;
  } catch { return null; }
}

async function writeCachedProfile(profile) {
  try {
    if (!chrome?.storage?.local || !profile) return;
    await chrome.storage.local.set({ [PROFILE_CACHE_KEY]: profile });
  } catch { /* best-effort */ }
}

// Auth diagnostics — same chrome.storage key the syncService uses, so the
// Settings → Account "Sync Status" panel can surface auth-side failures too.
async function writeAuthDiagnostic(kind, detail) {
  try {
    if (!chrome?.storage?.local) return;
    const { _syncDiagnostics } = await chrome.storage.local.get('_syncDiagnostics');
    const rows = Array.isArray(_syncDiagnostics) ? _syncDiagnostics : [];
    rows.unshift({
      kind,
      detail: typeof detail === 'string' ? detail : (detail?.message || JSON.stringify(detail)),
      at: new Date().toISOString()
    });
    await chrome.storage.local.set({ _syncDiagnostics: rows.slice(0, 20) });
  } catch { /* best effort */ }
}

// Wipe every Supabase session key across both storage layers. supabase-js's
// default storage in extension pages is window.localStorage, NOT chrome.storage.
// Calling supabase.auth.signOut alone leaves sb-* localStorage entries behind,
// so the next page load reads them and the user appears signed in again.
// We clear both, synchronously where possible, before doing anything else.
function clearAllAuthStorage({ alsoClearDiagnostics = false } = {}) {
  // localStorage — synchronous, immediate. Used by extension pages.
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const drop = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('sb-')) drop.push(k);
      }
      drop.forEach(k => window.localStorage.removeItem(k));
    }
  } catch { /* ignore */ }
  // chrome.storage.local — async. Used by the service worker.
  try {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(null).then(all => {
        const keys = Object.keys(all).filter(k =>
          k.startsWith('sb-') ||
          // A3: drop the rehydrate watermark so the next sign-in re-pulls the
          // cloud view (the account / profile may differ from this session).
          k === '_dataRehydratedAt' ||
          (alsoClearDiagnostics && (k === '_syncDiagnostics' || k === '_lastSyncSuccess'))
        );
        if (keys.length > 0) chrome.storage.local.remove(keys);
      }).catch(() => { /* ignore */ });
    }
  } catch { /* ignore */ }
}

/**
 * useAuth — Reactive hook for Supabase auth state + Tabatha profile.
 *
 * Returns:
 *   session      — Supabase auth session (or null)
 *   profile      — Tabatha profile row { id, display_name, default_org_id, default_team_id, ... }
 *   orgs         — Array of { org_id, role, org_name } memberships
 *   teams        — Array of { team_id, role, team_name } memberships
 *   loading      — true while initial auth check is in progress
 *   signIn       — (method, opts) => Promise  — method: 'google' | 'magic_link' | 'password'
 *   signOut      — () => Promise
 *   refreshProfile — () => Promise — re-fetch profile + memberships
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  // ─── Fetch profile + memberships ──────────────────────────
  const fetchProfile = useCallback(async (authUserId) => {
    if (!authUserId) {
      setProfile(null);
      setOrgs([]);
      setTeams([]);
      return null;
    }

    try {
      // 1. Get or create profile.
      // Reads go through `dataClient` (accessToken from background) — never the
      // auth client — so they can't re-enter auth-js's init lock and deadlock.
      // Defensive read: try the wide column list first; if any column is missing
      // (e.g. migration 005 not applied yet — adds default_org_id/default_team_id),
      // fall back to the minimal set so the user can still sign in and see their
      // display_name. The diagnostics row tells them what's missing.
      let prof = null;
      const WIDE = 'id, auth_user_id, display_name, avatar_url, default_org_id, default_team_id, created_at';
      const MIN = 'id, auth_user_id, display_name, avatar_url, created_at';
      // BARE = only the columns guaranteed by migration 001. Falling back to
      // this means a missing OPTIONAL column (avatar_url/default_* from
      // migrations 005/007) can never null out the profile — which previously
      // made the name appear stuck on the "Tabatha User" fallback and made
      // Save a silent no-op (it requires profile.id).
      const BARE = 'id, auth_user_id, display_name';

      const tryRead = async (cols) => dataClient
        .schema('tabatha')
        .from('profiles')
        .select(cols)
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      let readRes = await tryRead(WIDE);
      if (readRes.error) {
        await writeAuthDiagnostic('profile_wide_select_failed', readRes.error);
        readRes = await tryRead(MIN);
      }
      if (readRes.error) {
        await writeAuthDiagnostic('profile_min_select_failed', readRes.error);
        readRes = await tryRead(BARE);
      }

      if (readRes.error) {
        await writeAuthDiagnostic('profile_select_failed', readRes.error);
        console.error('Tabatha: Error fetching profile:', readRes.error);
        return null;
      }

      prof = readRes.data;

      if (!prof) {
        // No row yet — auto-provision on first login. The insert is a mutation,
        // so it runs in the background (single auth owner), not page context.
        const res = await chrome.runtime.sendMessage({ type: 'ENSURE_PROFILE' });
        if (!res?.ok || !res.profile) {
          await writeAuthDiagnostic('profile_insert_failed', res?.error || 'ENSURE_PROFILE returned no profile');
          console.error('Tabatha: Failed to create profile:', res?.error);
          return null;
        }
        prof = res.profile;
      }

      setProfile(prof);
      writeCachedProfile(prof);

      // 2. Fetch org memberships
      const { data: orgRows } = await dataClient
        .schema('tabatha')
        .from('org_members')
        .select('org_id, role, organizations:org_id(name)')
        .eq('profile_id', prof.id);

      const orgList = (orgRows || []).map(r => ({
        org_id: r.org_id,
        role: r.role,
        org_name: r.organizations?.name || 'Unknown Org',
      }));
      setOrgs(orgList);

      // 3. Fetch team memberships
      const { data: teamRows } = await dataClient
        .schema('tabatha')
        .from('team_members')
        .select('team_id, role, teams:team_id(name)')
        .eq('profile_id', prof.id);

      const teamList = (teamRows || []).map(r => ({
        team_id: r.team_id,
        role: r.role,
        team_name: r.teams?.name || 'Unknown Team',
      }));
      setTeams(teamList);

      return prof;
    } catch (err) {
      console.error('Tabatha: fetchProfile error:', err);
      return null;
    }
  }, []);

  // ─── Init: source session state from the background ───────────
  // The background service worker is the single auth owner whose client never
  // wedges. We ask IT for the current session (GET_AUTH_STATE) instead of
  // running page-local supabase.auth.getSession() — the latter can hang forever
  // on the auth-js init lock in an extension page, which produced the
  // "auth.getSession timed out after 15000ms" diagnostic. We also paint the
  // cached profile immediately so the display name renders without a round-trip.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Instant paint from the persisted profile cache (name survives reload).
      const cached = await readCachedProfile();
      if (!cancelled && cached) setProfile(cached);

      try {
        const res = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
        if (cancelled) return;
        const existing = res?.session || null;
        setSession(existing);
        if (existing?.user?.id && !hasFetched.current) {
          hasFetched.current = true;
          await fetchProfile(existing.user.id);
        }
      } catch (err) {
        await writeAuthDiagnostic('auth_init_failed', err);
        console.error('Tabatha: auth init failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Listen for auth changes (login, logout, token refresh) on the AUTH client.
    // CRITICAL: never `await` a Supabase call synchronously inside this callback
    // — doing so re-enters auth-js's init lock and self-deadlocks the client for
    // its whole lifetime. We defer all follow-up work off the callback's
    // microtask (setTimeout 0), exactly as auth-js does internally, and notify
    // the background so it can auto-sync + flush the cloud outbox on sign-in.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (cancelled) return;
        setSession(newSession);
        setTimeout(() => {
          if (cancelled) return;
          if (newSession?.user?.id) {
            hasFetched.current = true;
            fetchProfile(newSession.user.id);
          } else {
            setProfile(null);
            setOrgs([]);
            setTeams([]);
            try { if (chrome?.storage?.local) chrome.storage.local.remove(PROFILE_CACHE_KEY); } catch { /* ignore */ }
          }
          // Tell the background (single auth owner) to auto-sync + flush the
          // outbox on sign-in — the user should never have to click "Sync now".
          try {
            chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED', event, hasSession: !!newSession });
          } catch { /* SW asleep — the SW-boot flush covers this */ }
        }, 0);
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ─── Sign in ──────────────────────────────────────────────
  const signIn = useCallback(async (method, opts = {}) => {
    switch (method) {
      case 'google': {
        // Use chrome.identity for Google OAuth in extension context
        const { signInWithChromeIdentity } = await import('../services/supabaseClient');
        return signInWithChromeIdentity();
      }
      case 'magic_link': {
        const { signInWithMagicLink } = await import('../services/supabaseClient');
        return signInWithMagicLink(opts.email);
      }
      case 'password': {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: opts.email,
          password: opts.password,
        });
        if (error) throw error;
        return data;
      }
      default:
        throw new Error(`Unknown auth method: ${method}`);
    }
  }, []);

  // ─── Sign out ─────────────────────────────────────────────
  // supabase-js's default storage in extension PAGES is window.localStorage
  // (not chrome.storage), so calling supabase.auth.signOut() alone leaves
  // stale sb-* keys behind in localStorage; the next page load reads them
  // and the user appears signed in again. We clear BOTH localStorage and
  // chrome.storage.local sb-* keys synchronously, then call signOut({
  // scope: 'local' }) to drop the in-memory state. The remote /auth/v1/logout
  // is fire-and-forget — we don't await it, so the UI updates instantly.
  // Race a promise against a short timeout — if supabase-js's signOut hangs
  // for any reason (Web Locks edge case, onAuthStateChange listener firing
  // a fetchProfile that errors, etc.) we proceed with the local cleanup
  // anyway so the UI never sticks on "Signing out…".
  const RACE_TIMEOUT_MS = 1500;
  const raceWithTimeout = (p) => Promise.race([
    p,
    new Promise(resolve => setTimeout(resolve, RACE_TIMEOUT_MS))
  ]);

  const signOut = useCallback(async () => {
    clearAllAuthStorage();
    try { await raceWithTimeout(supabase.auth.signOut({ scope: 'local' })); } catch { /* ignore */ }
    setSession(null);
    setProfile(null);
    setOrgs([]);
    setTeams([]);
    hasFetched.current = false;
    // Fire-and-forget remote logout. We don't wait on it because the user
    // has already been signed out locally and the UI has updated. If the
    // network is slow or wedged it doesn't matter; the JWT will expire on
    // its own server-side.
    supabase.auth.signOut().catch(err => writeAuthDiagnostic('remote_signout_failed', err));
  }, []);

  // ─── Force reset (escape hatch for stale/wedged sessions) ──
  // Same as signOut but also wipes the sync diagnostics history so the
  // Sync Status panel is clean. Used when even signOut hasn't unstuck things.
  const forceResetAuth = useCallback(async () => {
    clearAllAuthStorage({ alsoClearDiagnostics: true });
    try { await raceWithTimeout(supabase.auth.signOut({ scope: 'local' })); } catch { /* ignore */ }
    setSession(null);
    setProfile(null);
    setOrgs([]);
    setTeams([]);
    hasFetched.current = false;
  }, []);

  // ─── Refresh (call after invite redeem, etc.) ─────────────
  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      return fetchProfile(session.user.id);
    }
  }, [session, fetchProfile]);

  // ─── Optimistic + queued display-name save ────────────────
  // Updates the local profile cache immediately (so the name survives a reload
  // before the server confirms) and hands the write to the background outbox.
  // No 10s UI timeout race: the outbox flushes with backoff and reconciles when
  // the realtime profile channel (or next refresh) reports the server value.
  const saveDisplayName = useCallback(async (rawName) => {
    const displayName = (rawName || '').trim();
    const profileId = profile?.id || null;
    const authUserId = session?.user?.id || null;
    if (!displayName || !(profileId || authUserId)) {
      return { ok: false, error: 'Enter a name first.' };
    }
    // Optimistic local update + persist.
    setProfile(prev => {
      const next = { ...(prev || {}), display_name: displayName };
      writeCachedProfile(next);
      return next;
    });
    try {
      const res = await updateProfileName({ displayName, profileId, authUserId });
      return { ok: true, queued: !!res?.queued };
    } catch (err) {
      // The write is still queued locally; surface a soft note, not a failure.
      await writeAuthDiagnostic('display_name_enqueue_failed', err);
      return { ok: true, queued: true, deferred: true };
    }
  }, [profile?.id, session?.user?.id]);

  // ─── Realtime: keep `profile` row in lockstep with the cloud ────
  // When this user's profile row changes on another install (or in
  // Studio), refetch so display_name / avatar_url / default_realm
  // propagate live without requiring a page reload.
  useEffect(() => {
    if (!profile?.id) return;
    // Realtime on the dataClient (token routed from background) so the channel's
    // auth handshake never touches the page auth client's lock machinery.
    const channel = dataClient
      .channel(`profile_${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'tabatha', table: 'profiles', filter: `id=eq.${profile.id}` },
        () => { if (session?.user?.id) fetchProfile(session.user.id); }
      )
      .subscribe();
    return () => { try { channel.unsubscribe(); } catch { /* ignore */ } };
  }, [profile?.id, session?.user?.id, fetchProfile]);

  return {
    session,
    profile,
    orgs,
    teams,
    loading,
    signIn,
    signOut,
    forceResetAuth,
    refreshProfile,
    saveDisplayName,
    isSignedIn: !!session,
  };
}
