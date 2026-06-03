-- ============================================================
-- Tabatha Migration 015 — Fix infinite recursion in RLS policies
-- ============================================================
-- SYMPTOM (reported 2026-06-02):
--   sync diagnostics: profile_wide_select_failed = "infinite recursion
--   detected in policy for relation \"profiles\"", followed by no_profile_row
--   and repeated profile_*_select_failed. A user could not even read their
--   OWN profile row, so auto-provision/sync stalled in a loop.
--
-- ROOT CAUSE:
--   Migration 012's manager policies (and migration 001's org/roster policies)
--   query a table INSIDE that same table's RLS policy:
--     • "Managers see team profiles" ON profiles  → SELECT ... FROM profiles
--     • "Members see org roster"     ON org_members → SELECT ... FROM org_members
--     • "Members see own org"        ON organizations → SELECT FROM org_members
--   Evaluating a row's policy re-enters the same policy → Postgres detects the
--   cycle and aborts the WHOLE query. Because permissive policies are OR'd, the
--   recursive policy poisons every read of profiles, even the own-row read.
--
-- FIX:
--   SECURITY DEFINER helper functions resolve the caller's identity and managed
--   scopes WITHOUT triggering RLS (definer rights bypass row security), breaking
--   every cycle. All affected policies are rewritten to use them. The own-row
--   checks are direct comparisons so a user can ALWAYS read their own data.
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================

-- ── SECURITY DEFINER helpers (bypass RLS, no recursion) ─────

CREATE OR REPLACE FUNCTION tabatha.current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tabatha, public
AS $$
  SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- All org_ids the caller belongs to (any role).
CREATE OR REPLACE FUNCTION tabatha.my_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tabatha, public
AS $$
  SELECT om.org_id FROM tabatha.org_members om
  WHERE om.profile_id = tabatha.current_profile_id()
$$;

-- org_ids where the caller is owner.
CREATE OR REPLACE FUNCTION tabatha.my_owned_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tabatha, public
AS $$
  SELECT om.org_id FROM tabatha.org_members om
  WHERE om.role = 'owner' AND om.profile_id = tabatha.current_profile_id()
$$;

-- team_ids where the caller is owner/manager/sub_manager.
CREATE OR REPLACE FUNCTION tabatha.my_managed_team_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tabatha, public
AS $$
  SELECT tm.team_id FROM tabatha.team_members tm
  WHERE tm.role IN ('owner','manager','sub_manager')
    AND tm.profile_id = tabatha.current_profile_id()
$$;

-- profile_ids of members the caller is allowed to manage/see.
CREATE OR REPLACE FUNCTION tabatha.my_visible_member_profile_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tabatha, public
AS $$
  SELECT om2.profile_id FROM tabatha.org_members om2
  WHERE om2.org_id IN (SELECT tabatha.my_owned_org_ids())
  UNION
  SELECT tm2.profile_id FROM tabatha.team_members tm2
  WHERE tm2.team_id IN (SELECT tabatha.my_managed_team_ids())
$$;

GRANT EXECUTE ON FUNCTION tabatha.current_profile_id()              TO authenticated;
GRANT EXECUTE ON FUNCTION tabatha.my_org_ids()                     TO authenticated;
GRANT EXECUTE ON FUNCTION tabatha.my_owned_org_ids()               TO authenticated;
GRANT EXECUTE ON FUNCTION tabatha.my_managed_team_ids()            TO authenticated;
GRANT EXECUTE ON FUNCTION tabatha.my_visible_member_profile_ids()  TO authenticated;

-- ── profiles: non-recursive read policy ────────────────────
-- Own row is a DIRECT compare (always readable). Managers additionally see
-- their members. The recursive 012 policy is replaced.
DROP POLICY IF EXISTS "Managers see team profiles" ON tabatha.profiles;
CREATE POLICY "Managers see team profiles"
  ON tabatha.profiles FOR SELECT
  USING (
    auth_user_id = auth.uid()
    OR id IN (SELECT tabatha.my_visible_member_profile_ids())
  );

-- ── browser_profiles: non-recursive ───────────────────────
DROP POLICY IF EXISTS "Managers see team browser_profiles" ON tabatha.browser_profiles;
CREATE POLICY "Managers see team browser_profiles"
  ON tabatha.browser_profiles FOR SELECT
  USING (
    profile_id = tabatha.current_profile_id()
    OR profile_id IN (SELECT tabatha.my_visible_member_profile_ids())
  );

-- ── browser_profile_status: non-recursive ─────────────────
DROP POLICY IF EXISTS "Managers see team browser_profile_status" ON tabatha.browser_profile_status;
CREATE POLICY "Managers see team browser_profile_status"
  ON tabatha.browser_profile_status FOR SELECT
  USING (
    profile_id = tabatha.current_profile_id()
    OR profile_id IN (SELECT tabatha.my_visible_member_profile_ids())
  );

-- ── org_members: remove self-referential recursion ────────
DROP POLICY IF EXISTS "Members see org roster" ON tabatha.org_members;
CREATE POLICY "Members see org roster"
  ON tabatha.org_members FOR SELECT
  USING (
    profile_id = tabatha.current_profile_id()
    OR org_id IN (SELECT tabatha.my_org_ids())
  );

-- ── organizations: avoid recursion through org_members ────
DROP POLICY IF EXISTS "Members see own org" ON tabatha.organizations;
CREATE POLICY "Members see own org"
  ON tabatha.organizations FOR SELECT
  USING (id IN (SELECT tabatha.my_org_ids()));
