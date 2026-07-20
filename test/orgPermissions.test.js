// NB-03 — org roles/permissions foundation.
// Pure tests for src/utils/orgPermissions.js over useAuth()'s orgs/teams
// shape. The load-bearing invariant (Koda-vetted): 'manager' is NEVER
// org-wide — owner/admin are org-wide, manager/sub_manager are scoped to
// their teams via team_members.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORG_WIDE_ADMIN_ROLES,
  OA_ROLES,
  TEAM_MANAGER_ROLES,
  getOrgRole,
  getTeamRole,
  isOrgWideAdmin,
  isTeamManager,
  managedTeamIds,
  isOA,
  canManageAnything,
} from '../src/utils/orgPermissions.js';

const ORG_A = 'org-aaaa';
const ORG_B = 'org-bbbb';
const TEAM_1 = 'team-1111';
const TEAM_2 = 'team-2222';

const org = (org_id, role) => ({ org_id, role, org_name: `Org ${org_id}` });
const team = (team_id, role) => ({ team_id, role, team_name: `Team ${team_id}` });

// ─── role constant matrices ─────────────────────────────────

test('role constants match the migration 020/002 role sets', () => {
  assert.deepEqual([...ORG_WIDE_ADMIN_ROLES], ['owner', 'admin']);
  assert.deepEqual([...OA_ROLES], ['owner', 'admin', 'manager']);
  assert.deepEqual([...TEAM_MANAGER_ROLES], ['owner', 'manager', 'sub_manager']);
});

// ─── isOrgWideAdmin — the manager-is-not-org-wide invariant ─

test('isOrgWideAdmin role matrix for a specific org', () => {
  const expectations = {
    owner: true,
    admin: true,
    manager: false, // NEVER org-wide (Koda-binding)
    sub_manager: false,
    user: false,
    read_only: false,
  };
  for (const [role, expected] of Object.entries(expectations)) {
    assert.equal(
      isOrgWideAdmin([org(ORG_A, role)], ORG_A),
      expected,
      `org role '${role}' → isOrgWideAdmin should be ${expected}`
    );
  }
});

test('isOrgWideAdmin without orgId means "org-wide admin ANYWHERE"', () => {
  assert.equal(isOrgWideAdmin([org(ORG_A, 'user'), org(ORG_B, 'admin')]), true);
  assert.equal(isOrgWideAdmin([org(ORG_A, 'manager'), org(ORG_B, 'manager')]), false);
  assert.equal(isOrgWideAdmin([]), false);
});

test('isOrgWideAdmin is scoped to the asked org', () => {
  const orgs = [org(ORG_A, 'owner'), org(ORG_B, 'user')];
  assert.equal(isOrgWideAdmin(orgs, ORG_A), true);
  assert.equal(isOrgWideAdmin(orgs, ORG_B), false, 'owner of A must not be admin of B');
  assert.equal(isOrgWideAdmin(orgs, 'org-unknown'), false);
});

// ─── isTeamManager — team-scoped authority ──────────────────

test('isTeamManager role matrix for a specific team', () => {
  const expectations = {
    owner: true,
    manager: true,
    sub_manager: true,
    user: false,
    read_only: false,
  };
  for (const [role, expected] of Object.entries(expectations)) {
    assert.equal(
      isTeamManager([team(TEAM_1, role)], TEAM_1),
      expected,
      `team role '${role}' → isTeamManager should be ${expected}`
    );
  }
});

test('isTeamManager is scoped to the asked team', () => {
  const teams = [team(TEAM_1, 'manager'), team(TEAM_2, 'user')];
  assert.equal(isTeamManager(teams, TEAM_1), true);
  assert.equal(isTeamManager(teams, TEAM_2), false, 'manager of team 1 has no reach into team 2');
  assert.equal(isTeamManager(teams), true, 'no teamId → manager anywhere');
  assert.equal(isTeamManager([team(TEAM_1, 'user')]), false);
});

test('an org manager with no team rows manages NO teams', () => {
  // The trap migration 001:180 fell into: org role 'manager' granting
  // org-wide reads. Client-side the same person must scope to zero teams.
  const orgs = [org(ORG_A, 'manager')];
  const teams = [];
  assert.equal(isOrgWideAdmin(orgs, ORG_A), false);
  assert.equal(isTeamManager(teams), false);
  assert.deepEqual(managedTeamIds(teams), []);
});

// ─── managedTeamIds ─────────────────────────────────────────

test('managedTeamIds returns only manager-tier team ids', () => {
  const teams = [
    team(TEAM_1, 'manager'),
    team(TEAM_2, 'user'),
    team('team-3333', 'sub_manager'),
    team('team-4444', 'owner'),
    team('team-5555', 'read_only'),
  ];
  assert.deepEqual(managedTeamIds(teams), [TEAM_1, 'team-3333', 'team-4444']);
});

// ─── isOA — broad UI gate, distinct from org-wide scope ─────

test('isOA role matrix (owner/admin/manager pass; others do not)', () => {
  const expectations = {
    owner: true,
    admin: true,
    manager: true, // passes the UI gate…
    sub_manager: false,
    user: false,
    read_only: false,
  };
  for (const [role, expected] of Object.entries(expectations)) {
    assert.equal(isOA([org(ORG_A, role)], ORG_A), expected, `org role '${role}' → isOA ${expected}`);
  }
  // …but isOA(manager) === true must NOT imply org-wide admin.
  assert.equal(isOA([org(ORG_A, 'manager')], ORG_A), true);
  assert.equal(isOrgWideAdmin([org(ORG_A, 'manager')], ORG_A), false);
});

test('isOA without orgId checks any org', () => {
  assert.equal(isOA([org(ORG_A, 'user'), org(ORG_B, 'manager')]), true);
  assert.equal(isOA([org(ORG_A, 'user'), org(ORG_B, 'read_only')]), false);
});

// ─── canManageAnything ──────────────────────────────────────

test('canManageAnything: org-wide admin, OA manager, or team manager', () => {
  assert.equal(canManageAnything([org(ORG_A, 'admin')], []), true);
  assert.equal(canManageAnything([org(ORG_A, 'manager')], []), true, 'OA gate counts');
  assert.equal(
    canManageAnything([org(ORG_A, 'user')], [team(TEAM_1, 'sub_manager')]),
    true,
    'plain org user who manages a team still has a management surface'
  );
  assert.equal(canManageAnything([org(ORG_A, 'user')], [team(TEAM_1, 'user')]), false);
  assert.equal(canManageAnything([], []), false);
});

// ─── getOrgRole / getTeamRole ───────────────────────────────

test('getOrgRole / getTeamRole return raw role or null', () => {
  assert.equal(getOrgRole([org(ORG_A, 'sub_manager')], ORG_A), 'sub_manager');
  assert.equal(getOrgRole([org(ORG_A, 'owner')], ORG_B), null);
  assert.equal(getOrgRole([], ORG_A), null);
  assert.equal(getTeamRole([team(TEAM_1, 'read_only')], TEAM_1), 'read_only');
  assert.equal(getTeamRole([team(TEAM_1, 'owner')], TEAM_2), null);
});

// ─── defensive inputs ───────────────────────────────────────

test('helpers are safe on null/undefined/malformed inputs', () => {
  assert.equal(isOrgWideAdmin(null, ORG_A), false);
  assert.equal(isOrgWideAdmin(undefined), false);
  assert.equal(isTeamManager(null, TEAM_1), false);
  assert.equal(isOA(null), false);
  assert.equal(canManageAnything(null, null), false);
  assert.deepEqual(managedTeamIds(undefined), []);
  assert.equal(getOrgRole(null, ORG_A), null);
  assert.equal(getOrgRole([null, {}, org(ORG_A, 'admin')], ORG_A), 'admin');
  assert.equal(isOrgWideAdmin([null, {}, org(ORG_A, 'admin')], ORG_A), true);
  // missing orgId/teamId on the lookup itself
  assert.equal(getOrgRole([org(ORG_A, 'admin')], undefined), null);
  assert.equal(getTeamRole([team(TEAM_1, 'owner')], null), null);
});
