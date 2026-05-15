import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

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
      // Defensive read: try the wide column list first; if any column is missing
      // (e.g. migration 005 not applied yet — adds default_org_id/default_team_id),
      // fall back to the minimal set so the user can still sign in and see their
      // display_name. The diagnostics row tells them what's missing.
      let prof = null;
      const WIDE = 'id, auth_user_id, display_name, avatar_url, default_org_id, default_team_id, created_at';
      const MIN = 'id, auth_user_id, display_name, avatar_url, created_at';

      const tryRead = async (cols) => supabase
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
        await writeAuthDiagnostic('profile_select_failed', readRes.error);
        console.error('Tabatha: Error fetching profile:', readRes.error);
        return null;
      }

      prof = readRes.data;

      if (!prof) {
        // No row yet — auto-provision on first login.
        const { data: { user } } = await supabase.auth.getUser();
        const displayName = user?.user_metadata?.full_name
          || user?.user_metadata?.name
          || user?.email?.split('@')[0]
          || 'Tabatha User';
        const avatarUrl = user?.user_metadata?.avatar_url || null;

        const { data: newProf, error: insertErr } = await supabase
          .schema('tabatha')
          .from('profiles')
          .insert({
            auth_user_id: authUserId,
            display_name: displayName,
            avatar_url: avatarUrl,
          })
          .select()
          .single();

        if (insertErr) {
          await writeAuthDiagnostic('profile_insert_failed', insertErr);
          console.error('Tabatha: Failed to create profile:', insertErr);
          return null;
        }
        prof = newProf;
      }

      setProfile(prof);

      // 2. Fetch org memberships
      const { data: orgRows } = await supabase
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
      const { data: teamRows } = await supabase
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

  // ─── Init: check existing session ─────────────────────────
  // Defensive: getSession() and fetchProfile() are each raced against a
  // timeout so the "Loading auth state…" UI can't hang forever if Supabase
  // is unreachable or its client is wedged. On timeout we record a diagnostic,
  // proceed signed-out, and let the user retry by reloading the page.
  useEffect(() => {
    let cancelled = false;
    const AUTH_TIMEOUT_MS = 15000;
    const withTimeout = (p, label) => Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: timed out after ${AUTH_TIMEOUT_MS}ms`)), AUTH_TIMEOUT_MS))
    ]);

    (async () => {
      try {
        const { data: { session: existing } } = await withTimeout(supabase.auth.getSession(), 'auth.getSession');
        if (cancelled) return;

        setSession(existing);
        if (existing?.user?.id && !hasFetched.current) {
          hasFetched.current = true;
          await withTimeout(fetchProfile(existing.user.id), 'fetchProfile');
        }
      } catch (err) {
        await writeAuthDiagnostic('auth_init_failed', err);
        console.error('Tabatha: auth init failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (cancelled) return;
        setSession(newSession);

        if (newSession?.user?.id) {
          await fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
          setOrgs([]);
          setTeams([]);
        }
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
  // The remote-scope signOut hits /auth/v1/logout to revoke the JWT, which
  // hangs on slow/wedged sessions. We race it against a 4s timeout; whether
  // the remote call wins or the timeout fires, we always clear the local
  // state so the UI is never stuck "Signed in" after the user clicks out.
  const signOut = useCallback(async () => {
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('remote signOut timed out — clearing local state only')), 4000))
      ]);
    } catch (err) {
      await writeAuthDiagnostic('signout_fell_back_to_local', err);
      // Local-scope signOut bypasses the network entirely and just clears the
      // client-side session. Safe to call even if the remote already cleared.
      try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
    }
    setSession(null);
    setProfile(null);
    setOrgs([]);
    setTeams([]);
    hasFetched.current = false;
  }, []);

  // ─── Force reset (escape hatch for stale/wedged sessions) ──
  // Wipes every supabase-js auth-storage key from chrome.storage.local so
  // the next page load starts from a truly clean slate. Use when signOut
  // appears to succeed but the user keeps showing as "Connected" or when
  // auth.getSession() keeps timing out.
  const forceResetAuth = useCallback(async () => {
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
    try {
      const all = await chrome.storage.local.get(null);
      const sbKeys = Object.keys(all).filter(k => k.startsWith('sb-') || k === '_syncDiagnostics' || k === '_lastSyncSuccess');
      if (sbKeys.length > 0) {
        await chrome.storage.local.remove(sbKeys);
      }
    } catch (err) {
      await writeAuthDiagnostic('force_reset_partial', err);
    }
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
    isSignedIn: !!session,
  };
}
