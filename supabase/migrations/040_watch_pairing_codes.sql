-- ============================================================
-- Tabatha Migration 040 — watch pairing codes (Tabby Watch, Plan 041)
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- Spec: docs/superpowers/specs/2026-07-18-tabby-watch-design.md §6.2 (Soren).
-- CeeCee deviation from the spec's sketch: the sketch's RLS predicate was
-- `profile_id = auth.uid()`, but in this schema profile_id references
-- tabatha.profiles.id (NOT the auth user id) — rewritten to the established
-- ownership-subquery pattern (migrations 032/038). Also added an `attempts`
-- counter so the redeem edge fn can lock a code after 5 bad guesses
-- (spec's rate-limit note, made concrete).
--
-- Flow: Sidecar (user JWT) mints a 6-digit code via the pair-watch edge fn
-- (hash stored, raw code shown on the phone for 5 minutes); the watch
-- redeems it unauthenticated via the same fn, which — under the service
-- role — marks it consumed and mints a user-scoped session. Codes are
-- hashed at rest, single-use, 5-minute expiry.
-- ============================================================

CREATE TABLE IF NOT EXISTS tabatha.watch_pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,                     -- SHA-256 hex of the 6-digit code; raw never stored
  attempts INT NOT NULL DEFAULT 0,             -- bad redeem guesses; locked at >= 5
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,             -- now() + interval '5 minutes' (set by the fn)
  consumed_at TIMESTAMPTZ,                     -- set on successful redeem; single-use
  device_label TEXT                            -- optional "Galaxy Watch 6"
);

ALTER TABLE tabatha.watch_pairing_codes ENABLE ROW LEVEL SECURITY;

-- Owner manages their own codes (mint runs under the user's JWT).
-- Redeem runs under the service role and bypasses RLS.
DROP POLICY IF EXISTS wpc_owner_all ON tabatha.watch_pairing_codes;
CREATE POLICY wpc_owner_all ON tabatha.watch_pairing_codes
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

GRANT SELECT, INSERT, DELETE ON tabatha.watch_pairing_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tabatha.watch_pairing_codes TO service_role;

CREATE INDEX IF NOT EXISTS idx_wpc_live_codes
  ON tabatha.watch_pairing_codes (code_hash) WHERE consumed_at IS NULL;
