-- ============================================================
-- Tabatha Migration 022 — Org admin/role helper functions (NB-03)
-- ============================================================
-- Org roles/permissions foundation. Roles live in tabatha.org_members.role
-- (owner / manager / sub_manager / admin / user / read_only — CHECK
-- reconciled by migration 020) plus team scoping via tabatha.team_members
-- (migration 002, roles owner / manager / sub_manager / user / read_only).
--
-- SCOPING RULE (Koda-vetted, BINDING):
--   • owner / admin        → ORG-WIDE authority over the org's members.
--   • manager / sub_manager → NEVER org-wide. Authority is scoped to the
--     teams where they hold a manager-tier row in team_members.
--   This deliberately does NOT reuse migration 001's "Managers see team
--   time" policy shape (001:180), which wrongly granted org-wide reach to
--   role = 'manager'.
--
-- SHAPE (per migration 015's precedent): SECURITY DEFINER helpers so RLS
-- policies and RPCs can resolve the caller's scope WITHOUT re-entering RLS
-- (no recursion). Hardened per the migration 020 Koda review:
--   • SET search_path = '' on every function (search_path-injection surface
--     closed; every object in the bodies is fully schema-qualified).
--   • Explicit REVOKE from PUBLIC + anon, GRANT to authenticated only
--     (migration 006's schema exposure left broad default EXECUTE grants).
--
-- Reuses/extends migration 015 where signatures already exist:
--   • tabatha.current_profile_id()    — re-asserted here with search_path=''.
--   • tabatha.my_managed_team_ids()   — re-asserted here with search_path=''
--     (same body/semantics; CREATE OR REPLACE keeps the oid, so the RLS
--     policies from 015 that reference it remain valid).
--   • tabatha.my_visible_member_profile_ids(uuid) is a NEW org-scoped
--     overload; 015's zero-arg version is left untouched for its policies.
--
-- IDEMPOTENT: CREATE OR REPLACE throughout. Safe to re-run.
-- Run order: after 001 (schema), 002 (teams), 015 (helpers), 020 (role CHECK).
-- ============================================================

-- ── (1) current_profile_id — caller's profile id from auth.uid() ─────
CREATE OR REPLACE FUNCTION tabatha.current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id FROM tabatha.profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION tabatha.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tabatha.current_profile_id() TO authenticated;

-- ── (2) is_org_wide_admin — owner/admin in the given org ─────────────
-- ONLY owner and admin are org-wide. 'manager' is intentionally excluded
-- (team-scoped — see header).
CREATE OR REPLACE FUNCTION tabatha.is_org_wide_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tabatha.org_members om
    WHERE om.org_id = p_org_id
      AND om.profile_id = tabatha.current_profile_id()
      AND om.role IN ('owner', 'admin')
  )
$$;

REVOKE ALL ON FUNCTION tabatha.is_org_wide_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tabatha.is_org_wide_admin(uuid) TO authenticated;

-- ── (3) my_managed_team_ids — teams the caller manages ───────────────
-- Same semantics as migration 015's version (owner/manager/sub_manager rows
-- in team_members), re-asserted with the hardened empty search_path.
CREATE OR REPLACE FUNCTION tabatha.my_managed_team_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tm.team_id FROM tabatha.team_members tm
  WHERE tm.role IN ('owner', 'manager', 'sub_manager')
    AND tm.profile_id = tabatha.current_profile_id()
$$;

REVOKE ALL ON FUNCTION tabatha.my_managed_team_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tabatha.my_managed_team_ids() TO authenticated;

-- ── (4) my_visible_member_profile_ids(org) — org-scoped visibility ───
-- Org-wide admins (owner/admin) see every member profile of the org.
-- Everyone else sees only the profiles on teams THEY manage, and only
-- teams belonging to the requested org (team → teams.org_id join), so a
-- manager's reach never leaks across orgs.
CREATE OR REPLACE FUNCTION tabatha.my_visible_member_profile_ids(p_org_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  -- Org-wide branch: owner/admin → all org members.
  SELECT om.profile_id
  FROM tabatha.org_members om
  WHERE om.org_id = p_org_id
    AND tabatha.is_org_wide_admin(p_org_id)
  UNION
  -- Team-scoped branch: members of the caller's managed teams in this org.
  SELECT tm.profile_id
  FROM tabatha.team_members tm
  JOIN tabatha.teams t ON t.id = tm.team_id
  WHERE t.org_id = p_org_id
    AND tm.team_id IN (SELECT tabatha.my_managed_team_ids())
$$;

REVOKE ALL ON FUNCTION tabatha.my_visible_member_profile_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tabatha.my_visible_member_profile_ids(uuid) TO authenticated;

-- ── (5) can_manage_profile — single-target authorization check ───────
-- True iff the target profile is inside the caller's visible-member set
-- for that org (org-wide for owner/admin; managed-teams-only otherwise).
CREATE OR REPLACE FUNCTION tabatha.can_manage_profile(p_org_id uuid, p_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_profile_id IN (SELECT tabatha.my_visible_member_profile_ids(p_org_id))
$$;

REVOKE ALL ON FUNCTION tabatha.can_manage_profile(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tabatha.can_manage_profile(uuid, uuid) TO authenticated;
