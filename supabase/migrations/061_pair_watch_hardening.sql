-- ============================================================
-- Tabatha Migration 061 — pair-watch hardening
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- Fixes two live production problems in the device-pairing flow:
--
-- P1 (bug) — "the code expires instantly". `pair-watch` redeem set
--    `consumed_at` BEFORE minting the session. Any failure in the mint path
--    (the ES256 JWT-signing-key migration window produced 403 `bad_jwt`)
--    left the code permanently spent, so the retry reported
--    "invalid/expired". Codes were BURNED, never expired.
--    Fix: a two-phase claim. `claim_pairing_code` takes a short LEASE on the
--    row (atomic `UPDATE ... RETURNING`, so single-use is still race-proof);
--    the function only calls `consume_pairing_code` after the session is in
--    hand, and calls `release_pairing_code` on every failure path. If the
--    function dies mid-flight the lease expires on its own and the user's
--    code works again — a backend hiccup can no longer burn it.
--
-- P2 (security, Koda F-EDGE-1 High) — redeem is unauthenticated, the
--    6-digit code IS the credential, and a success returns access_token +
--    refresh_token (full account takeover). The `attempts >= 5` guard in the
--    function was dead code: lookup is by SHA-256 hash, so a WRONG guess
--    matches no row and could never increment anything. 10^6 codes over a
--    300s window is ~3,400 req/s to exhaust — a commodity attack.
--    Fix: `pair_redeem_attempts` + `pair_rate_check` count failures by IP
--    fingerprint and globally, independent of whether a row was found.
--
-- Retention/privacy: attempts store a SHA-256 fingerprint of the client IP,
-- not the IP itself, and are swept after 24h. The fingerprint exists to
-- count failures per source; it is not offered as anonymisation (the IPv4
-- space is small enough to reverse). Nothing else about the request is kept.
--
-- Version: 6.7.73 -> 6.7.74
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lease columns on the existing code table (migration 040).
-- ------------------------------------------------------------
ALTER TABLE tabatha.watch_pairing_codes
  ADD COLUMN IF NOT EXISTS claimed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_expires_at  TIMESTAMPTZ;

COMMENT ON COLUMN tabatha.watch_pairing_codes.claimed_at IS
  'Set when a redeem takes the lease. Cleared on failure, superseded by consumed_at on success.';
COMMENT ON COLUMN tabatha.watch_pairing_codes.claim_expires_at IS
  'Lease deadline. Past this the code is claimable again, so a crashed redeem cannot strand it.';
COMMENT ON COLUMN tabatha.watch_pairing_codes.attempts IS
  'Successful CLAIMS against this code (only a correct code can raise it). Hard cap in claim_pairing_code.';

-- ------------------------------------------------------------
-- 2. Attempt ledger — the counter that actually fires on wrong codes.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tabatha.pair_redeem_attempts (
  id           BIGSERIAL PRIMARY KEY,
  ip_hash      TEXT NOT NULL,               -- sha256(client ip); 'unknown' when no XFF
  reason       TEXT NOT NULL,               -- bad_format | no_match | expired | locked | mint_failed
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pra_ip_window ON tabatha.pair_redeem_attempts (ip_hash, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_pra_window    ON tabatha.pair_redeem_attempts (attempted_at DESC);

-- Service role only. RLS on with no policy = deny for every other role.
ALTER TABLE tabatha.pair_redeem_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tabatha.pair_redeem_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON tabatha.pair_redeem_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE tabatha.pair_redeem_attempts_id_seq TO service_role;

-- ------------------------------------------------------------
-- 3. Rate gate.
--    Per-IP: 10 failures / 15 min. Stops the single-host attack outright
--    (10^6/2 expected guesses would need ~50,000 distinct IPs per window).
--    Global: 500 failures / 5 min. Closes the distributed/botnet variant.
--    The global cap is deliberately high: a legitimate user's failure rate
--    is ~0, so reaching 500 means an attack is in progress, and briefly
--    refusing new pairings is strictly better than an account takeover.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tabatha.pair_rate_check(p_ip_hash TEXT)
RETURNS TABLE (allowed BOOLEAN, retry_after_seconds INT, ip_failures INT, global_failures INT)
LANGUAGE plpgsql
SET search_path = tabatha, pg_catalog
AS $$
DECLARE
  v_ip     INT;
  v_global INT;
BEGIN
  SELECT count(*) INTO v_ip
    FROM tabatha.pair_redeem_attempts
   WHERE ip_hash = p_ip_hash
     AND attempted_at > now() - interval '15 minutes';

  SELECT count(*) INTO v_global
    FROM tabatha.pair_redeem_attempts
   WHERE attempted_at > now() - interval '5 minutes';

  IF v_ip >= 10 THEN
    RETURN QUERY SELECT false, 900, v_ip, v_global;
  ELSIF v_global >= 500 THEN
    RETURN QUERY SELECT false, 300, v_ip, v_global;
  ELSE
    RETURN QUERY SELECT true, 0, v_ip, v_global;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION tabatha.pair_record_failure(p_ip_hash TEXT, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = tabatha, pg_catalog
AS $$
BEGIN
  INSERT INTO tabatha.pair_redeem_attempts (ip_hash, reason) VALUES (p_ip_hash, p_reason);
  -- Opportunistic sweep; keeps the table bounded without a cron dependency.
  IF random() < 0.01 THEN
    DELETE FROM tabatha.pair_redeem_attempts WHERE attempted_at < now() - interval '24 hours';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 4. Two-phase code lifecycle.
-- ------------------------------------------------------------

-- Claim: atomic. Only ONE caller can win the lease, so single-use survives.
-- Refuses consumed, expired, currently-leased, and over-claimed codes.
CREATE OR REPLACE FUNCTION tabatha.claim_pairing_code(p_code_hash TEXT, p_lease_seconds INT DEFAULT 30)
RETURNS TABLE (id UUID, profile_id UUID, device_label TEXT)
LANGUAGE plpgsql
SET search_path = tabatha, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  UPDATE tabatha.watch_pairing_codes w
     SET claimed_at       = now(),
         claim_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempts         = w.attempts + 1
   WHERE w.code_hash = p_code_hash
     AND w.consumed_at IS NULL
     AND w.expires_at > now()
     AND w.attempts < 10                                    -- per-code hard cap
     AND (w.claim_expires_at IS NULL OR w.claim_expires_at < now())
  RETURNING w.id, w.profile_id, w.device_label;
END;
$$;

-- Consume: only after a session actually exists.
CREATE OR REPLACE FUNCTION tabatha.consume_pairing_code(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = tabatha, pg_catalog
AS $$
DECLARE v_n INT;
BEGIN
  UPDATE tabatha.watch_pairing_codes
     SET consumed_at = now()
   WHERE id = p_id AND consumed_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

-- Release: any failure after the claim hands the code straight back.
CREATE OR REPLACE FUNCTION tabatha.release_pairing_code(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = tabatha, pg_catalog
AS $$
BEGIN
  UPDATE tabatha.watch_pairing_codes
     SET claimed_at = NULL, claim_expires_at = NULL
   WHERE id = p_id AND consumed_at IS NULL;
END;
$$;

-- ------------------------------------------------------------
-- 5. Execution is service-role only. `authenticated` must never be able to
--    claim/consume/release a code or read the attempt ledger.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION tabatha.pair_rate_check(TEXT)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabatha.pair_record_failure(TEXT, TEXT)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabatha.claim_pairing_code(TEXT, INT)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabatha.consume_pairing_code(UUID)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabatha.release_pairing_code(UUID)         FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION tabatha.pair_rate_check(TEXT)           TO service_role;
GRANT EXECUTE ON FUNCTION tabatha.pair_record_failure(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION tabatha.claim_pairing_code(TEXT, INT)   TO service_role;
GRANT EXECUTE ON FUNCTION tabatha.consume_pairing_code(UUID)      TO service_role;
GRANT EXECUTE ON FUNCTION tabatha.release_pairing_code(UUID)      TO service_role;
