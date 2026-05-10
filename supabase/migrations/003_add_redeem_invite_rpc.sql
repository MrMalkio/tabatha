-- ============================================================
-- Migration: 003_add_redeem_invite_rpc
-- Purpose: Stored procedure for secure token redemption and team joining
-- ============================================================

CREATE OR REPLACE FUNCTION tabatha.redeem_invite_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite tabatha.invite_tokens%ROWTYPE;
  v_profile_id UUID;
  v_org_member_exists BOOLEAN;
  v_team_member_exists BOOLEAN;
BEGIN
  -- Get the profile ID of the currently authenticated user
  SELECT id INTO v_profile_id FROM tabatha.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found for authenticated user');
  END IF;

  -- Find and lock the token
  SELECT * INTO v_invite
  FROM tabatha.invite_tokens
  WHERE token = p_token
  FOR UPDATE;

  -- Validate token
  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token');
  END IF;
  
  IF v_invite.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token already used');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token expired');
  END IF;

  -- Add to organization if not already a member
  SELECT EXISTS (
    SELECT 1 FROM tabatha.org_members 
    WHERE org_id = v_invite.org_id AND profile_id = v_profile_id
  ) INTO v_org_member_exists;

  IF NOT v_org_member_exists THEN
    INSERT INTO tabatha.org_members (org_id, profile_id, role)
    VALUES (v_invite.org_id, v_profile_id, v_invite.role);
  END IF;

  -- Add to team if specified
  IF v_invite.team_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM tabatha.team_members
      WHERE team_id = v_invite.team_id AND profile_id = v_profile_id
    ) INTO v_team_member_exists;

    IF NOT v_team_member_exists THEN
      INSERT INTO tabatha.team_members (team_id, profile_id, role)
      VALUES (v_invite.team_id, v_profile_id, v_invite.role);
    END IF;
  END IF;

  -- Mark token as used
  UPDATE tabatha.invite_tokens
  SET used_at = now(),
      used_by = v_profile_id
  WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true, 'org_id', v_invite.org_id, 'team_id', v_invite.team_id);
END;
$$;
