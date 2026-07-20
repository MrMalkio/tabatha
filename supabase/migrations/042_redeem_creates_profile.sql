-- ============================================================
-- Tabatha Migration 042 — redeem_invite_token creates the profile (invite signups)
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- Invite-code signups (Malkio, 2026-07-20): the Sidecar no longer
-- auto-provisions a profile on first sign-in — "profile row exists" now
-- means "has been invited". But redeem_invite_token (003→018) REQUIRES an
-- existing profile row and fails with 'Profile not found' for a genuinely
-- new user — exactly who redeems on first sign-in.
--
-- Dex's build worked around this client-side (shell insert → RPC →
-- compensating delete). CeeCee integration ruling: that leaves a crash
-- window where an orphaned shell profile bypasses the invite gate. This
-- migration moves profile creation INTO the RPC, atomically. Body is 018's
-- verbatim except:
--   1. token is looked up + validated BEFORE the profile lookup (a bad code
--      must never create a profile),
--   2. if the caller has no profile row, one is created (display name from
--      the JWT email's local part).
--
-- Run order: after 018. CREATE OR REPLACE — safe to re-run.
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
  v_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Find and lock the token (018's pattern), validated BEFORE any profile
  -- creation — a bad/used/expired code leaves zero trace for a new user.
  SELECT * INTO v_invite
  FROM tabatha.invite_tokens
  WHERE token = p_token
  FOR UPDATE;

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token');
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token already used');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token expired');
  END IF;

  -- Resolve or CREATE the caller's profile (the invite-signup path).
  SELECT id INTO v_profile_id FROM tabatha.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    INSERT INTO tabatha.profiles (auth_user_id, display_name)
    VALUES (auth.uid(), COALESCE(NULLIF(split_part(COALESCE(v_email, ''), '@', 1), ''), 'New user'))
    RETURNING id INTO v_profile_id;
  END IF;

  -- ── 018's body, verbatim from here ──────────────────────────────────────
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

  -- A1 fix: stamp the profile defaults so sync attributes rows
  UPDATE tabatha.profiles
     SET default_org_id  = COALESCE(default_org_id, v_invite.org_id),
         default_team_id = COALESCE(default_team_id, v_invite.team_id)
   WHERE id = v_profile_id;

  -- Mark token as used
  UPDATE tabatha.invite_tokens
  SET used_at = now(),
      used_by = v_profile_id
  WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true, 'org_id', v_invite.org_id, 'team_id', v_invite.team_id, 'profile_id', v_profile_id);
END;
$$;

REVOKE ALL ON FUNCTION tabatha.redeem_invite_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.redeem_invite_token(TEXT) TO authenticated;
