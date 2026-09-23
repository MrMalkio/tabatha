-- ============================================================
-- Tabatha Migration 059 — short invite tokens (Crockford base32)
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- NUMBERING NOTE: verified against both the live DB
-- (`supabase migration list --linked`) and the file this worktree
-- already carries at HEAD (origin/staging @ e9e0a2e, not the possibly-
-- behind main checkout — see AGENTS.md build/load constraint) before
-- picking a number:
--   - Remote applied history's last version is 050 (fix_invite_mint_
--     pgcrypto) — 046-049 are unfiled-but-applied drift, a known
--     pattern in this project.
--   - This worktree already has 058_browser_profiles_lifecycle_guard.sql
--     committed (a different, unrelated, NOT-YET-APPLIED security fix).
--     That file's own header explicitly reserves 051-057 for other
--     in-flight fleet work ("Plans 043-045") and instructs agents not
--     to reuse them. 058 itself is taken.
--   - 059 is therefore the correct next-free number, exactly as
--     originally briefed — confirmed rather than assumed. (An earlier
--     pass at this file briefly used 051 before this reservation was
--     discovered; renamed to 059 before anything was applied.)
--   - Applied directly via `supabase db query --linked -f` (raw SQL,
--     NOT `supabase db push`) specifically so that pushing this file
--     does not also apply 058, which carries its own explicit
--     "do not apply directly from an agent session" instruction and is
--     unrelated to this task. schema_migrations was updated manually
--     afterward to record 059 as applied, matching this project's
--     placeholder+repair convention for keeping migration history in
--     sync when CLI push isn't the right tool for a single file.
--
-- Problem: tabatha.create_invite_token (012/043/044) mints tokens as
-- `<24 hex>-<8 hex>` = 33 characters. Ugly to share (paste into a
-- chat, read aloud, type on a phone).
--
-- Change: mint an ~8-character Crockford base32 token instead
-- (alphabet 0123456789ABCDEFGHJKMNPQRSTVWXYZ — 32 symbols, excludes
-- I/L/O/U to avoid visual confusion with 1/0), derived from
-- pgcrypto's gen_random_bytes (5 random bytes = 40 bits = exactly 8
-- symbols of 5 bits each, no wasted/truncated entropy). Collision is
-- checked against the ENTIRE invite_tokens table (not just unredeemed
-- rows) before insert, with retry — `token` carries a bare UNIQUE
-- constraint (migration 012) that does not distinguish redeemed from
-- unredeemed, so a redeemed-but-still-present old token is just as
-- much a collision as a live one. At 32^8 (~1.1 trillion) possible
-- values against a table with (at most) low hundreds of rows, the
-- retry loop is a correctness backstop, not a load-bearing expectation
-- of frequent collisions.
--
-- Backward compatibility (CRITICAL — outstanding invites already
-- handed out as 33-char tokens must keep working):
--   tabatha.redeem_invite_token(text) and the invite-check edge
--   function both resolve a token via a plain `WHERE token = p_token`
--   / `.eq("token", token)` exact-string lookup — NEITHER validates or
--   assumes a token format/length before that lookup. They are
--   therefore ALREADY format-agnostic and need NO code change here:
--   an old 33-char token and a new 8-char token both resolve by exact
--   match against whatever string was actually stored on the row at
--   mint time. This migration only changes what create_invite_token
--   WRITES going forward; it does not touch, migrate, or invalidate
--   any existing invite_tokens rows. Verified end-to-end (see agent
--   report) that both a real new-format mint and a synthetic
--   old-format (33-char hex-dash-hex) token both redeem successfully.
--   invite-check's MIN_LEN/MAX_LEN bounds (6/128 chars) already
--   comfortably admit both shapes — no change needed there either
--   (only its documentation comment was refreshed, see
--   supabase/functions/invite-check/index.ts).
--
-- Run order: after 050 (remote-only). Idempotent — CREATE OR REPLACE
-- for both functions, IF NOT EXISTS-guarded helper creation.
-- ============================================================

-- ── (1) helper: 8-char Crockford base32 token from pgcrypto randomness ──
-- Not SECURITY DEFINER (no table access, no privilege needed beyond
-- pgcrypto's gen_random_bytes which is available to any role that can
-- reach the `extensions` schema). Locked down from PUBLIC anyway since
-- it's an internal helper, not a client-facing RPC — create_invite_token
-- (SECURITY DEFINER) can still call it regardless of grants, since it
-- executes under its owner's privileges.

CREATE OR REPLACE FUNCTION tabatha._short_invite_token()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_alphabet TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- Crockford base32 (32 symbols)
  v_bytes BYTEA;
  v_num BIGINT;
  v_out TEXT := '';
  i INT;
BEGIN
  -- Schema-qualified: pgcrypto's functions live in the `extensions` schema
  -- on this project, not `public` — a bare `gen_random_bytes` call fails
  -- under this project's `SET search_path = public` convention (this is
  -- exactly what migration 050, "fix_invite_mint_pgcrypto", already fixed
  -- once for create_invite_token's own token generation; verified live
  -- that the bare form still fails here before qualifying it).
  v_bytes := extensions.gen_random_bytes(5); -- 40 bits -> exactly 8 symbols of 5 bits, no waste

  v_num := (get_byte(v_bytes, 0)::bigint << 32)
         | (get_byte(v_bytes, 1)::bigint << 24)
         | (get_byte(v_bytes, 2)::bigint << 16)
         | (get_byte(v_bytes, 3)::bigint << 8)
         | (get_byte(v_bytes, 4)::bigint);

  FOR i IN 0..7 LOOP
    v_out := v_out || substr(v_alphabet, (((v_num >> ((7 - i) * 5)) & 31)::int) + 1, 1);
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION tabatha._short_invite_token() FROM PUBLIC;

-- ── (2) create_invite_token — mint short tokens, collision-checked ─────
-- Signature unchanged from 044 (same 5 params, same types), so
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
  v_attempt INT := 0;
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

  -- Generate token: ~8-char Crockford base32 (was 24hex-8hex/33 chars).
  -- Collision-checked against the WHOLE table (token carries a bare
  -- UNIQUE constraint with no redeemed/unredeemed distinction) with retry.
  LOOP
    v_token := tabatha._short_invite_token();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tabatha.invite_tokens WHERE token = v_token);
    v_attempt := v_attempt + 1;
    IF v_attempt >= 10 THEN
      RAISE EXCEPTION 'Failed to generate a unique invite token after % attempts', v_attempt;
    END IF;
  END LOOP;

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

-- ── (3) redeem_invite_token — UNCHANGED, no code here ───────────────────
-- tabatha.redeem_invite_token(text) (042/044) resolves the token via a
-- plain `WHERE token = p_token` exact-string match with zero format
-- assumptions. It already accepts both the new short tokens and every
-- existing 33-char token in the wild without any modification. Left
-- untouched deliberately — re-verified live via redemption of both a
-- freshly-minted short token and a synthetic old-format token (see
-- agent report for actual outputs).
