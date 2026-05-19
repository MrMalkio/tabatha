-- ============================================================
-- Tabatha Migration 012 — Manager scoping + invite-token mint RPC
-- ============================================================
-- Phase D first slice. Two concerns bundled because they're both
-- "make multi-tenant operations work end-to-end from inside the app
-- instead of requiring the cloud console":
--
--   1. Managers (org owners + team owners/managers/sub_managers) can
--      now read their members' browser_profiles + browser_profile_status
--      rows so a Team Activity dashboard works.
--
--   2. SECURITY DEFINER RPC `create_invite_token` lets authorised
--      callers mint tokens from the app. Auth rules mirror who can
--      legitimately add members:
--        - org owners can mint for their org (any team in that org)
--        - team owners/managers/sub_managers can mint for their team
--      No other roles can mint.
-- ============================================================

-- ── (1) Manager RLS expansion ───────────────────────────────

-- browser_profiles: managers can read team members' install rows.
DROP POLICY IF EXISTS "Managers see team browser_profiles" ON tabatha.browser_profiles;
CREATE POLICY "Managers see team browser_profiles"
  ON tabatha.browser_profiles FOR SELECT
  USING (
    -- own rows (existing access)
    profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
    OR
    -- members of an org where the caller is owner
    profile_id IN (
      SELECT om2.profile_id
      FROM tabatha.org_members om2
      WHERE om2.org_id IN (
        SELECT om.org_id FROM tabatha.org_members om
        WHERE om.role = 'owner'
          AND om.profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
      )
    )
    OR
    -- members of a team where the caller is owner/manager/sub_manager
    profile_id IN (
      SELECT tm2.profile_id
      FROM tabatha.team_members tm2
      WHERE tm2.team_id IN (
        SELECT tm.team_id FROM tabatha.team_members tm
        WHERE tm.role IN ('owner', 'manager', 'sub_manager')
          AND tm.profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
      )
    )
  );

-- browser_profile_status: same scoping.
DROP POLICY IF EXISTS "Managers see team browser_profile_status" ON tabatha.browser_profile_status;
CREATE POLICY "Managers see team browser_profile_status"
  ON tabatha.browser_profile_status FOR SELECT
  USING (
    profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
    OR
    profile_id IN (
      SELECT om2.profile_id
      FROM tabatha.org_members om2
      WHERE om2.org_id IN (
        SELECT om.org_id FROM tabatha.org_members om
        WHERE om.role = 'owner'
          AND om.profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
      )
    )
    OR
    profile_id IN (
      SELECT tm2.profile_id
      FROM tabatha.team_members tm2
      WHERE tm2.team_id IN (
        SELECT tm.team_id FROM tabatha.team_members tm
        WHERE tm.role IN ('owner', 'manager', 'sub_manager')
          AND tm.profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
      )
    )
  );

-- Drop the existing own-only SELECT policies — the new combined policies
-- supersede them. (Insert/update/delete policies remain own-only.)
DROP POLICY IF EXISTS "Users see own browser profiles" ON tabatha.browser_profiles;
DROP POLICY IF EXISTS "Users can read own browser_profile_status" ON tabatha.browser_profile_status;

-- We also need to give managers visibility into the profile rows of
-- their members so display_name + avatar_url + default_realm render
-- alongside each chip. Add a similar policy on tabatha.profiles.
-- (Existing own-row read policy from migration 001 is preserved.)
DROP POLICY IF EXISTS "Managers see team profiles" ON tabatha.profiles;
CREATE POLICY "Managers see team profiles"
  ON tabatha.profiles FOR SELECT
  USING (
    id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
    OR
    id IN (
      SELECT om2.profile_id
      FROM tabatha.org_members om2
      WHERE om2.org_id IN (
        SELECT om.org_id FROM tabatha.org_members om
        WHERE om.role = 'owner'
          AND om.profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
      )
    )
    OR
    id IN (
      SELECT tm2.profile_id
      FROM tabatha.team_members tm2
      WHERE tm2.team_id IN (
        SELECT tm.team_id FROM tabatha.team_members tm
        WHERE tm.role IN ('owner', 'manager', 'sub_manager')
          AND tm.profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
      )
    )
  );

-- ── (2) Invite-token mint RPC ───────────────────────────────

CREATE OR REPLACE FUNCTION tabatha.create_invite_token(
  p_org_id UUID,
  p_team_id UUID DEFAULT NULL,
  p_role TEXT DEFAULT 'user',
  p_expires_in_hours INT DEFAULT 168
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_profile_id UUID;
  v_can_mint BOOLEAN := false;
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_id UUID;
BEGIN
  -- Identify the caller
  SELECT id INTO v_caller_profile_id
  FROM tabatha.profiles
  WHERE auth_user_id = auth.uid();
  IF v_caller_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No profile for authenticated user');
  END IF;

  -- Role gating: org owner, OR team owner/manager/sub_manager for the
  -- specific team if p_team_id is supplied.
  SELECT EXISTS (
    SELECT 1 FROM tabatha.org_members
    WHERE org_id = p_org_id
      AND profile_id = v_caller_profile_id
      AND role = 'owner'
  ) INTO v_can_mint;

  IF NOT v_can_mint AND p_team_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM tabatha.team_members
      WHERE team_id = p_team_id
        AND profile_id = v_caller_profile_id
        AND role IN ('owner', 'manager', 'sub_manager')
    ) INTO v_can_mint;
  END IF;

  IF NOT v_can_mint THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorised to mint invite tokens for this org/team');
  END IF;

  -- Validate role argument
  IF p_role NOT IN ('owner', 'manager', 'sub_manager', 'user', 'read_only') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
  END IF;

  -- Generate token: 24 hex chars + dash + 8 hex chars (32 chars total, easy to share)
  v_token := encode(gen_random_bytes(12), 'hex') || '-' || encode(gen_random_bytes(4), 'hex');
  v_expires_at := now() + (LEAST(GREATEST(p_expires_in_hours, 1), 24 * 90) * interval '1 hour');

  INSERT INTO tabatha.invite_tokens (token, org_id, team_id, created_by, role, expires_at)
  VALUES (v_token, p_org_id, p_team_id, v_caller_profile_id, p_role, v_expires_at)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'id', v_id,
    'expires_at', v_expires_at,
    'role', p_role,
    'org_id', p_org_id,
    'team_id', p_team_id
  );
END;
$$;

REVOKE ALL ON FUNCTION tabatha.create_invite_token(UUID, UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.create_invite_token(UUID, UUID, TEXT, INT) TO authenticated;
