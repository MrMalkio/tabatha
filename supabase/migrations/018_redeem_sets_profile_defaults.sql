-- ============================================================
-- Tabatha Migration 018 — redeem_invite_token sets profile defaults
-- ============================================================
-- THE sync-attribution bug (Workstream A1).
--
-- Root cause: redeem_invite_token (migration 003) inserts org_members /
-- team_members rows but never populates tabatha.profiles.default_org_id /
-- default_team_id. Nothing else writes them either. syncToSupabase()
-- (src/background/services/syncService.js) stamps org_id / team_id on every
-- pushed row FROM the profile defaults — so when the defaults stay NULL,
-- every synced row lands with org_id = NULL and is never attributed to the
-- organization. The owner's team views then show nothing.
--
-- Fix (authoritative, server side): after the membership inserts, populate
-- the profile defaults with COALESCE so we only fill them when they're still
-- empty (never clobber a default the user already has from a prior org).
--
-- CREATE OR REPLACE for idempotency (matches migration 012's approach). Safe
-- to re-run. Run order: after 003 (defines the function) and 005 (adds the
-- default_org_id / default_team_id columns).
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

  -- ── A1 FIX: stamp the profile defaults so sync attributes rows ──
  -- COALESCE preserves any default the user already had; only fills the
  -- gap. This is the authoritative half of the two-layer fix; the client
  -- (src/services/orgAttribution.js#applyInviteDefaults) is defense-in-depth.
  UPDATE tabatha.profiles
     SET default_org_id  = COALESCE(default_org_id, v_invite.org_id),
         default_team_id = COALESCE(default_team_id, v_invite.team_id)
   WHERE id = v_profile_id;

  -- Mark token as used
  UPDATE tabatha.invite_tokens
  SET used_at = now(),
      used_by = v_profile_id
  WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true, 'org_id', v_invite.org_id, 'team_id', v_invite.team_id);
END;
$$;
