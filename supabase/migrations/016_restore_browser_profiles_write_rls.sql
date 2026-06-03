-- ============================================================
-- Tabatha Migration 016 — Restore write RLS on browser_profiles
-- ============================================================
-- SYMPTOM (reported 2026-06-02, after 015 fixed the profile recursion):
--   browser_profile_insert_failed = "new row violates row-level security
--   policy for table browser_profiles". Sync otherwise works.
--
-- ROOT CAUSE:
--   Migration 001 gave browser_profiles a single FOR ALL policy
--   ("Users see own browser profiles") that covered SELECT + INSERT + UPDATE
--   + DELETE for own rows. Migration 012 DROPPED that policy and replaced it
--   with only a FOR SELECT manager policy — leaving NO insert/update/delete
--   policy, so every write is rejected. (browser_profile_status kept its
--   separate write policies from migration 010, so only browser_profiles
--   was affected.)
--
-- FIX:
--   Re-add own-row INSERT/UPDATE/DELETE policies, using the SECURITY DEFINER
--   helper tabatha.current_profile_id() from migration 015 so there is no
--   recursion. (The SELECT manager policy from 015 stays as-is.)
--
-- REQUIRES: migration 015 (provides tabatha.current_profile_id()).
-- IDEMPOTENT: safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "Users insert own browser_profiles" ON tabatha.browser_profiles;
CREATE POLICY "Users insert own browser_profiles"
  ON tabatha.browser_profiles FOR INSERT
  WITH CHECK (profile_id = tabatha.current_profile_id());

DROP POLICY IF EXISTS "Users update own browser_profiles" ON tabatha.browser_profiles;
CREATE POLICY "Users update own browser_profiles"
  ON tabatha.browser_profiles FOR UPDATE
  USING (profile_id = tabatha.current_profile_id())
  WITH CHECK (profile_id = tabatha.current_profile_id());

DROP POLICY IF EXISTS "Users delete own browser_profiles" ON tabatha.browser_profiles;
CREATE POLICY "Users delete own browser_profiles"
  ON tabatha.browser_profiles FOR DELETE
  USING (profile_id = tabatha.current_profile_id());
