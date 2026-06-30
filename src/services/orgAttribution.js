// ============================================================
// Tabatha — Org attribution (client defense-in-depth) — Workstream A1
//
// The authoritative fix lives in migration 018 (redeem_invite_token sets
// profiles.default_org_id / default_team_id). This module is the client-side
// belt-and-braces: immediately after a successful invite redeem, if the local
// profile still shows no default_org_id, write the org/team returned by the
// redeem RPC straight onto the profile row. Covers the window before the
// server function is updated on an environment, and guarantees the very next
// sync attributes rows correctly without waiting for a profile refetch.
//
// COALESCE semantics: only fills when default_org_id is falsy — never clobbers
// a default the user already has.
// ============================================================

/**
 * applyInviteDefaults — set profile org/team defaults after a redeem when empty.
 *
 * @param {object}   args
 * @param {object}   args.supabase  supabase-js client
 * @param {object}   args.profile   local profile row { id, default_org_id, default_team_id }
 * @param {object}   args.result    the redeem_invite_token RPC result
 *                                   { success, org_id, team_id, error? }
 * @returns {Promise<boolean>}  true if it wrote defaults, false if it no-op'd.
 */
export async function applyInviteDefaults({ supabase, profile, result }) {
  if (!supabase || !profile?.id) return false;
  if (!result?.success) return false;
  // Only fill when the profile has no org default yet — never clobber.
  if (profile.default_org_id) return false;

  const orgId = result.org_id || null;
  const teamId = result.team_id || null;
  if (!orgId) return false;

  const patch = {
    default_org_id: orgId,
    // Don't overwrite an existing team default if one is somehow present.
    default_team_id: profile.default_team_id || teamId,
  };

  const { error } = await supabase
    .schema('tabatha')
    .from('profiles')
    .update(patch)
    .eq('id', profile.id);

  if (error) {
    // Best-effort: the server function (migration 018) is authoritative. Don't
    // throw — the redeem itself already succeeded.
    return false;
  }
  return true;
}
