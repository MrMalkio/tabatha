// orgPermissions — pure client-side role/permission helpers (NB-03).
//
// Operates on the memberships shape returned by useAuth():
//   orgs  — Array<{ org_id, role, org_name }>   (tabatha.org_members)
//   teams — Array<{ team_id, role, team_name }> (tabatha.team_members)
//
// SCOPING RULE (Koda-vetted, mirrors migration 026 — the org_admin_helpers
// migration, renumbered from 022 during the cortex-branch merge):
//   • owner / admin         → ORG-WIDE authority over that org's members.
//   • manager / sub_manager → NEVER org-wide. Their authority is scoped to
//     the teams where they hold a manager-tier team_members row.
//
// isOA() is the broad "show me the admin-ish surface" gate (owner/admin/
// manager, per Malkio's decision) — use it ONLY for UI entry points. For
// anything that scopes DATA, use isOrgWideAdmin() vs isTeamManager() so
// managers stay confined to their teams. The server enforces the same split
// via tabatha.is_org_wide_admin / tabatha.my_visible_member_profile_ids.
//
// All helpers are pure and defensive: null/undefined/malformed inputs are
// treated as "no membership" and return false / [] / null.

/** Roles with org-wide authority (org_members.role). */
export const ORG_WIDE_ADMIN_ROLES = Object.freeze(['owner', 'admin']);

/** org_members roles that gate the admin-ish UI surface (isOA). */
export const OA_ROLES = Object.freeze(['owner', 'admin', 'manager']);

/** team_members roles that manage a team (migration 002/015 tier). */
export const TEAM_MANAGER_ROLES = Object.freeze(['owner', 'manager', 'sub_manager']);

const asArray = (v) => (Array.isArray(v) ? v : []);

/**
 * The caller's role in a specific org, or null if not a member.
 * @param {Array} orgs — useAuth().orgs
 * @param {string} orgId
 * @returns {string|null}
 */
export function getOrgRole(orgs, orgId) {
  if (!orgId) return null;
  const row = asArray(orgs).find(o => o?.org_id === orgId);
  return row?.role ?? null;
}

/**
 * The caller's role in a specific team, or null if not a member.
 * @param {Array} teams — useAuth().teams
 * @param {string} teamId
 * @returns {string|null}
 */
export function getTeamRole(teams, teamId) {
  if (!teamId) return null;
  const row = asArray(teams).find(t => t?.team_id === teamId);
  return row?.role ?? null;
}

/**
 * ORG-WIDE admin check: owner/admin in the given org (or, with no orgId,
 * in ANY org). 'manager' deliberately returns false — managers are
 * team-scoped, never org-wide.
 * @param {Array} orgs — useAuth().orgs
 * @param {string} [orgId] — omit to ask "org-wide admin anywhere?"
 * @returns {boolean}
 */
export function isOrgWideAdmin(orgs, orgId) {
  if (orgId !== undefined && orgId !== null) {
    return ORG_WIDE_ADMIN_ROLES.includes(getOrgRole(orgs, orgId));
  }
  return asArray(orgs).some(o => ORG_WIDE_ADMIN_ROLES.includes(o?.role));
}

/**
 * TEAM manager check: owner/manager/sub_manager on the given team (or, with
 * no teamId, on ANY team). This is the scoped counterpart to isOrgWideAdmin —
 * a true result grants authority over THAT team's members only.
 * @param {Array} teams — useAuth().teams
 * @param {string} [teamId] — omit to ask "manager of any team?"
 * @returns {boolean}
 */
export function isTeamManager(teams, teamId) {
  if (teamId !== undefined && teamId !== null) {
    return TEAM_MANAGER_ROLES.includes(getTeamRole(teams, teamId));
  }
  return asArray(teams).some(t => TEAM_MANAGER_ROLES.includes(t?.role));
}

/**
 * Team ids the caller manages (owner/manager/sub_manager rows).
 * Client mirror of tabatha.my_managed_team_ids().
 * @param {Array} teams — useAuth().teams
 * @returns {string[]}
 */
export function managedTeamIds(teams) {
  return asArray(teams)
    .filter(t => TEAM_MANAGER_ROLES.includes(t?.role) && t?.team_id)
    .map(t => t.team_id);
}

/**
 * isOA — broad "owner/admin/manager" gate (per Malkio's decision) for UI
 * entry points like showing a Team/Admin section at all.
 *
 * WARNING: a true result does NOT mean org-wide reach. A 'manager' passes
 * this gate but must still be scoped by isTeamManager()/managedTeamIds()
 * when reading or acting on member data. Use isOrgWideAdmin() when the
 * question is "can this caller see the WHOLE org?".
 * @param {Array} orgs — useAuth().orgs
 * @param {string} [orgId] — omit to ask "OA in any org?"
 * @returns {boolean}
 */
export function isOA(orgs, orgId) {
  if (orgId !== undefined && orgId !== null) {
    return OA_ROLES.includes(getOrgRole(orgs, orgId));
  }
  return asArray(orgs).some(o => OA_ROLES.includes(o?.role));
}

/**
 * True if the caller has ANY management surface at all: org-wide admin of
 * some org, OR manager-tier on some team. Useful to decide whether to render
 * management UI (Live Stints roster, member panels, invite minting) at all.
 *
 * `teams` is optional for callers that only have orgs handy, but pass both
 * when possible — a team manager whose org role is plain 'user' is only
 * discoverable through their team rows.
 * @param {Array} orgs — useAuth().orgs
 * @param {Array} [teams] — useAuth().teams
 * @returns {boolean}
 */
export function canManageAnything(orgs, teams = []) {
  return isOA(orgs) || isTeamManager(teams);
}
