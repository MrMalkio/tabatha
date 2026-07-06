import { useMemo } from 'react';
import { useAuth } from './useAuth';
import {
  isOA,
  isOrgWideAdmin,
  isTeamManager,
  canManageAnything,
  getOrgRole,
  getTeamRole,
  managedTeamIds,
} from '../utils/orgPermissions';

/**
 * useOrgRole — thin permission view over useAuth() (NB-03).
 *
 * Binds the pure orgPermissions helpers to the signed-in user's memberships
 * so call sites don't have to thread orgs/teams around. Does NOT fetch
 * anything itself — useAuth owns all fetching.
 *
 * Returns:
 *   orgs, teams        — pass-through membership arrays
 *   loading            — useAuth loading flag
 *   isOA(orgId?)       — broad owner/admin/manager UI gate (NOT a scope!)
 *   isOrgWideAdmin(orgId?) — owner/admin only; org-wide reach
 *   isTeamManager(teamId?) — manager-tier on a team; team-scoped reach
 *   canManageAnything  — any management surface at all (org OR team)
 *   getOrgRole(orgId) / getTeamRole(teamId) — raw role strings
 *   managedTeamIds     — team ids the caller manages
 */
export function useOrgRole() {
  const { orgs, teams, loading } = useAuth();

  return useMemo(() => ({
    orgs,
    teams,
    loading,
    isOA: (orgId) => isOA(orgs, orgId),
    isOrgWideAdmin: (orgId) => isOrgWideAdmin(orgs, orgId),
    isTeamManager: (teamId) => isTeamManager(teams, teamId),
    canManageAnything: canManageAnything(orgs, teams),
    getOrgRole: (orgId) => getOrgRole(orgs, orgId),
    getTeamRole: (teamId) => getTeamRole(teams, teamId),
    managedTeamIds: managedTeamIds(teams),
  }), [orgs, teams, loading]);
}
