-- ============================================================
-- Tabatha Migration 044 — invite kind remodel (Demo / Personal / Team)
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- CeeCee's ruling on 043's Demo/Team/Founder split: "founder" is not an
-- invite kind — founding an org is an action any personal user can take
-- (org-creation gating, if it's ever needed, is a future capability, not
-- an invite property). The three invite kinds become:
--
--   - 'demo'     — account only, no org/team attach. Distinguished from
--                  'personal' ONLY by a durable account marker
--                  (tabatha.profiles.account_type = 'demo') for future
--                  treatment/limits/cleanup — no behavioral difference
--                  today.
--   - 'personal' — account only, no org/team attach. Was 'founder' in
--                  043; renamed because "founder" implied an org-creation
--                  destiny that isn't actually gated by the invite. A
--                  personal-invite redeemer can start their own org any
--                  time via tabatha.create_organization (migration 020),
--                  same as any other standard account.
--   - 'team'     — unchanged: account + org/team membership, role-gated
--                  exactly as migration 012/043 always required.
--
-- Changes:
--   1. tabatha.profiles gains `account_type` ('standard' | 'demo',
--      default 'standard') — the durable marker distinguishing demo
--      accounts from every other account, independent of how the
--      account was created.
--   2. Existing invite_tokens rows with invite_kind = 'founder' are
--      relabeled 'personal' (pure rename, zero behavior change — those
--      rows were already account-only). The CHECK constraint is
--      dropped and re-added (named explicitly) to accept
--      ('demo', 'personal', 'team') instead of ('demo', 'team',
--      'founder').
--   3. tabatha.create_invite_token (migration 012 + 043) — same body,
--      p_kind now validated against ('demo', 'personal', 'team').
--      Auth unchanged: 'team' is 012's org/team-role gate; 'demo' and
--      'personal' both use 043's "caller is OWNER of at least one org"
--      gate.
--   4. tabatha.redeem_invite_token (migration 042 + 043) — same body,
--      plus: when the redemption path CREATES a new profile row, it now
--      stamps account_type = 'demo' iff the invite's kind is 'demo'
--      (else 'standard'). If the profile already existed (redeemer
--      already had an account), account_type is left untouched — a
--      'demo' invite must never downgrade an existing standard account.
--      Return payload still carries 'kind' verbatim from the row.
--
-- Run order: after 043. Write-only migration — no down/rollback (matches
-- 043's convention; guarded so it is also safe to re-run).
-- ============================================================

-- ── (1) tabatha.profiles.account_type ───────────────────────────────────

ALTER TABLE tabatha.profiles
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (account_type IN ('standard', 'demo'));

-- ── (2) invite_tokens: rename 'founder' -> 'personal', swap CHECK ──────

UPDATE tabatha.invite_tokens
   SET invite_kind = 'personal'
 WHERE invite_kind = 'founder';

-- 043 added this CHECK inline via ADD COLUMN, so Postgres auto-named it
-- <table>_<column>_check. Drop by that name, re-add named explicitly so
-- future migrations don't have to guess.
ALTER TABLE tabatha.invite_tokens
  DROP CONSTRAINT IF EXISTS invite_tokens_invite_kind_check;

ALTER TABLE tabatha.invite_tokens
  ADD CONSTRAINT invite_tokens_invite_kind_check
    CHECK (invite_kind IN ('demo', 'personal', 'team'));

-- ── (3) create_invite_token — p_kind now demo/personal/team ────────────
-- Signature is unchanged from 043 (same 5 params, same types), so
-- CREATE OR REPLACE alone replaces it cleanly — no DROP needed.

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

-- ── (4) redeem_invite_token — stamp account_type on profile creation ───

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

  -- Resolve or CREATE the caller's profile (the invite-signup path). Only
  -- a NEWLY CREATED profile gets its account_type stamped from the
  -- invite's kind — a redeemer who already had a profile keeps whatever
  -- account_type they already had. This is what stops a 'demo' invite
  -- from downgrading an existing standard account.
  SELECT id INTO v_profile_id FROM tabatha.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    INSERT INTO tabatha.profiles (auth_user_id, display_name, account_type)
    VALUES (
      auth.uid(),
      COALESCE(NULLIF(split_part(COALESCE(v_email, ''), '@', 1), ''), 'New user'),
      CASE WHEN v_invite.invite_kind = 'demo' THEN 'demo' ELSE 'standard' END
    )
    RETURNING id INTO v_profile_id;
  END IF;

  -- Demo/personal invites are account-only — org_id is NULL on the row, so
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
