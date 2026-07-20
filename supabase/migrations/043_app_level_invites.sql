-- ============================================================
-- Tabatha Migration 043 — app-level invites (Demo / Team / Founder)
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- Malkio's refinement on the invite system: "org invites and app invites
-- are not the same thing" — some invitees are just demo users, some are
-- real users joining an existing team/org, some are starting their own
-- org later. A Tabatha account (== a Flux account: one auth.users row +
-- one tabatha.profiles row) has always been separable from org/team
-- membership; this migration makes that separation a first-class invite
-- concept instead of every invite mandatorily attaching membership.
--
-- Three invite kinds (tabatha.invite_tokens.invite_kind):
--   - 'demo'    — account only, no org/team attach. Anyone can be handed
--                 one to try Tabatha with zero org exposure.
--   - 'team'    — unchanged prior behavior: account + org/team membership,
--                 role-gated exactly as migration 012 always required.
--   - 'founder' — account only, no org/team attach. The invitee creates
--                 their OWN org later via the existing
--                 tabatha.create_organization RPC (migration 020) —
--                 this migration does not touch that RPC or build any
--                 new org-creation surface.
--
-- Changes:
--   1. tabatha.invite_tokens.org_id becomes nullable (demo/founder rows
--      carry no org) and gains `invite_kind` (default 'team' so every
--      existing row — all of which are org-attached team invites —
--      stays valid with zero backfill).
--   2. tabatha.create_invite_token (migration 012) gains p_kind. 'team'
--      auth is byte-for-byte the same rule as before. 'demo'/'founder'
--      require org_id/team_id to be NULL and are gated to callers who
--      are OWNER of at least one org (keeps minting away from random
--      users; any existing org owner, e.g. Malkio, qualifies). Because
--      this adds a parameter, the old 4-arg overload is dropped first —
--      CREATE OR REPLACE alone would leave both signatures registered.
--   3. tabatha.redeem_invite_token (migration 042, kept verbatim
--      otherwise) only runs the membership-attach + profile-defaults-
--      stamp block when the token's org_id is non-null, and returns
--      the invite's `kind` in the payload.
--
-- Run order: after 042. Safe to re-run (DROP/CREATE OR REPLACE guarded).
-- ============================================================

-- ── (1) Schema: nullable org_id + invite_kind ───────────────────────────

ALTER TABLE tabatha.invite_tokens ALTER COLUMN org_id DROP NOT NULL;

ALTER TABLE tabatha.invite_tokens
  ADD COLUMN IF NOT EXISTS invite_kind TEXT NOT NULL DEFAULT 'team'
    CHECK (invite_kind IN ('demo', 'team', 'founder'));

-- ── (2) create_invite_token — adds p_kind ───────────────────────────────

-- Signature is changing (new trailing param), so CREATE OR REPLACE alone
-- would register a second overload rather than replacing the old one.
DROP FUNCTION IF EXISTS tabatha.create_invite_token(UUID, UUID, TEXT, INT);

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
  IF p_kind NOT IN ('demo', 'team', 'founder') THEN
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
    -- demo / founder: account-only invites — no org/team attach at
    -- redemption time (founder invitees create their own org later via
    -- tabatha.create_organization). Minting is gated to callers who are
    -- OWNER of at least one org, so this stays out of reach of a random
    -- freshly-signed-up user, matching the spirit of the team-invite gate
    -- without requiring the target org/team params these rows don't use.
    IF p_org_id IS NOT NULL OR p_team_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'demo/founder invites must not specify an org or team');
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
  -- demo/founder redemption since no membership row is created for them).
  IF p_role NOT IN ('owner', 'manager', 'sub_manager', 'user', 'read_only') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
  END IF;

  -- Generate token: 24 hex chars + dash + 8 hex chars (32 chars total, easy to share)
  v_token := encode(gen_random_bytes(12), 'hex') || '-' || encode(gen_random_bytes(4), 'hex');
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

-- ── (3) redeem_invite_token — skip membership attach for account-only kinds ─

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

  -- Demo/founder invites are account-only — org_id is NULL on the row, so
  -- this whole block (membership attach + profile-defaults stamp) is
  -- skipped entirely for them. Team invites (org_id NOT NULL) run 042's
  -- body verbatim.
  IF v_invite.org_id IS NOT NULL THEN
    -- ── 042/018's body, verbatim from here ────────────────────────────
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
  END IF;

  -- Mark token as used
  UPDATE tabatha.invite_tokens
  SET used_at = now(),
      used_by = v_profile_id
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true,
    'org_id', v_invite.org_id,
    'team_id', v_invite.team_id,
    'profile_id', v_profile_id,
    'kind', v_invite.invite_kind
  );
END;
$$;

REVOKE ALL ON FUNCTION tabatha.redeem_invite_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.redeem_invite_token(TEXT) TO authenticated;
