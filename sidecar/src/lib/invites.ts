import { supabase } from './supabase';

// Invite-token RPC wrappers — invite-signup gate follow-on. Mirrors the
// extension's src/services/supabaseClient.js redeemInviteToken /
// createInviteToken, minus the `.schema('tabatha')` qualifier: the
// Sidecar's `supabase` client is pre-scoped `db: { schema: 'tabatha' }`
// (./supabase.ts), so an unqualified `.rpc(...)` / `.from(...)` already
// resolves against tabatha.* — same pattern AuthContext's
// saveSidecarSettings already relies on.

export type OrgMembership = { org_id: string; role: string; org_name: string };
export type TeamMembership = { team_id: string; role: string; team_name: string };

export type RedeemResult = {
  success: boolean;
  org_id?: string;
  team_id?: string;
  error?: string;
};

/**
 * Redeem an invite token for the currently authenticated user. Calls
 * tabatha.redeem_invite_token (supabase/migrations/003 + 018) — that RPC
 * looks up the caller's profile by auth_user_id and REQUIRES the row to
 * already exist (it attaches org/team membership + stamps profile
 * defaults; it does not create the profile row itself). See
 * AuthContext.tsx#redeemInvite for how the shell-profile-then-rollback
 * flow around this constraint works.
 */
export async function redeemInviteToken(token: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc('redeem_invite_token', { p_token: token });
  if (error) return { success: false, error: error.message };
  return data as RedeemResult;
}

export type MintResult = {
  success: boolean;
  token?: string;
  id?: string;
  expires_at?: string;
  role?: string;
  org_id?: string;
  team_id?: string;
  error?: string;
};

/**
 * Mint a new invite token. Server-side gated by SECURITY DEFINER RPC
 * tabatha.create_invite_token (supabase/migrations/012) — org owners, or
 * team owners/managers/sub_managers for the given team. Callers without
 * that role get back `{ success: false, error: 'Not authorised to mint
 * invite tokens for this org/team' }`; the UI is expected to show a
 * friendly message rather than pre-hiding the mint form.
 */
export async function createInviteToken(args: {
  orgId: string;
  teamId?: string | null;
  role?: string;
  expiresInHours?: number;
}): Promise<MintResult> {
  const { data, error } = await supabase.rpc('create_invite_token', {
    p_org_id: args.orgId,
    p_team_id: args.teamId ?? null,
    p_role: args.role ?? 'user',
    p_expires_in_hours: args.expiresInHours ?? 168,
  });
  if (error) return { success: false, error: error.message };
  return data as MintResult;
}

/**
 * The caller's own org/team memberships (any role) — used to populate the
 * mint form's org/team pickers. Mirrors the extension's useAuth.js fetch
 * (org_members / team_members joined to organizations/teams for display
 * names), unqualified since this client is already schema-scoped.
 */
export async function fetchOwnScopes(
  profileId: string
): Promise<{ orgs: OrgMembership[]; teams: TeamMembership[] }> {
  const [{ data: orgRows }, { data: teamRows }] = await Promise.all([
    supabase
      .from('org_members')
      .select('org_id, role, organizations:org_id(name)')
      .eq('profile_id', profileId),
    supabase
      .from('team_members')
      .select('team_id, role, teams:team_id(name)')
      .eq('profile_id', profileId),
  ]);

  const orgs: OrgMembership[] = (orgRows || []).map((r: any) => ({
    org_id: r.org_id,
    role: r.role,
    org_name: r.organizations?.name || 'Organisation',
  }));
  const teams: TeamMembership[] = (teamRows || []).map((r: any) => ({
    team_id: r.team_id,
    role: r.role,
    team_name: r.teams?.name || 'Team',
  }));
  return { orgs, teams };
}
