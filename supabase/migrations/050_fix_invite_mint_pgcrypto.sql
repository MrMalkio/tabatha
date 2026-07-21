-- ============================================================
-- Tabatha Migration 050 — hotfix: invite minting broken (pgcrypto resolution)
-- Project: mtdgoahskcibjbhfvofx (schema tabatha)
--
-- Malkio (2026-07-21): creating invite tokens fails for EVERY kind with
-- "function gen_random_bytes(integer) does not exist" (42883). Root cause:
-- pgcrypto lives in the 'extensions' schema on Supabase, and
-- create_invite_token pins SET search_path = public, so the unqualified
-- gen_random_bytes() call cannot resolve. Migration 012 had the identical
-- flaw — server-side minting has likely never worked on this project; the
-- path was first exercised by the Sidecar Invites card.
--
-- Fix: ensure pgcrypto exists (extensions schema, Supabase convention) and
-- redefine create_invite_token as 044's body verbatim with the two
-- gen_random_bytes calls schema-qualified. (redeem_invite_token does not
-- use pgcrypto — no change needed there.)
--
-- Numbering note: 050 was reserved-unclaimed by Fix Wave 3; claimed here
-- for this prod hotfix (registry updated).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION tabatha.create_invite_token(
  p_org_id UUID,
  p_team_id UUID DEFAULT NULL,
  p_role TEXT DEFAULT 'user',
  p_expires_in_hours INT DEFAULT 168,
  p_kind TEXT DEFAULT 'team'
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
  v_row_org_id UUID;
  v_row_team_id UUID;
BEGIN
  IF p_kind NOT IN ('demo', 'personal', 'team') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid invite kind');
  END IF;

  -- Identify the caller
  SELECT id INTO v_caller_profile_id
  FROM tabatha.profiles
  WHERE auth_user_id = auth.uid();
  IF v_caller_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No profile for authenticated user');
  END IF;

  IF p_kind = 'team' THEN
    -- Unchanged from migration 012: org_id required, org owner OR team
    -- owner/manager/sub_manager for the specific team.
    IF p_org_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'org_id is required for a team invite');
    END IF;

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

    v_row_org_id := p_org_id;
    v_row_team_id := p_team_id;
  ELSE
    -- demo / personal: account-only invites — no org/team attach at
    -- redemption time (a personal-invite redeemer can start their own org
    -- any time via tabatha.create_organization, same as any other
    -- standard account — nothing about the invite gates that). Minting
    -- is gated to callers who are OWNER of at least one org, so this
    -- stays out of reach of a random freshly-signed-up user, matching
    -- the spirit of the team-invite gate without requiring the target
    -- org/team params these rows don't use.
    IF p_org_id IS NOT NULL OR p_team_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'demo/personal invites must not specify an org or team');
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM tabatha.org_members
      WHERE profile_id = v_caller_profile_id
        AND role = 'owner'
    ) INTO v_can_mint;

    IF NOT v_can_mint THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorised to mint invite tokens');
    END IF;

    v_row_org_id := NULL;
    v_row_team_id := NULL;
  END IF;

  -- Validate role argument (kept for all kinds — harmless/unused by
  -- demo/personal redemption since no membership row is created for them).
  IF p_role NOT IN ('owner', 'manager', 'sub_manager', 'user', 'read_only') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
  END IF;

  -- Generate token: 24 hex chars + dash + 8 hex chars (32 chars total, easy to share)
  v_token := encode(extensions.gen_random_bytes(12), 'hex') || '-' || encode(extensions.gen_random_bytes(4), 'hex');
  v_expires_at := now() + (LEAST(GREATEST(p_expires_in_hours, 1), 24 * 90) * interval '1 hour');

  INSERT INTO tabatha.invite_tokens (token, org_id, team_id, created_by, role, expires_at, invite_kind)
  VALUES (v_token, v_row_org_id, v_row_team_id, v_caller_profile_id, p_role, v_expires_at, p_kind)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'id', v_id,
    'expires_at', v_expires_at,
    'role', p_role,
    'org_id', v_row_org_id,
    'team_id', v_row_team_id,
    'kind', p_kind
  );
END;
$$;

REVOKE ALL ON FUNCTION tabatha.create_invite_token(UUID, UUID, TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.create_invite_token(UUID, UUID, TEXT, INT, TEXT) TO authenticated;
