import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

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
      // 1. Get or create profile
      let { data: prof, error } = await supabase
        .schema('tabatha')
        .from('profiles')
        .select('id, auth_user_id, display_name, avatar_url, default_org_id, default_team_id, created_at')
        .eq('auth_user_id', authUserId)
        .single();

      if (error && error.code === 'PGRST116') {
        // No profile row yet — auto-provision on first login
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
          console.error('Tabatha: Failed to create profile:', insertErr);
          return null;
        }
        prof = newProf;
      } else if (error) {
        console.error('Tabatha: Error fetching profile:', error);
        return null;
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
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { session: existing } } = await supabase.auth.getSession();
      if (cancelled) return;

      setSession(existing);
      if (existing?.user?.id && !hasFetched.current) {
        hasFetched.current = true;
        await fetchProfile(existing.user.id);
      }
      setLoading(false);
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
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setOrgs([]);
    setTeams([]);
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
    refreshProfile,
    isSignedIn: !!session,
  };
}
