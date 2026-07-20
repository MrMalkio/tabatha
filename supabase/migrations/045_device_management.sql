-- ============================================================
-- Tabatha Migration 045 — Sidecar device management
-- ============================================================
-- Malkio (after pairing his TV, 2026-07-19): devices need NAMES at pairing
-- time, a way to SIGN OUT any device remotely, PAUSE certain devices, and
-- per-device settings. This migration adds the columns; the behavior lives
-- in supabase/functions/device-signout and the Sidecar's DevicesCard.
--
-- New columns on tabatha.browser_profiles:
--   display_name    — user-facing rename, independent of `profile_name`
--                      (which stays the device-type default, e.g. "Living
--                      room TV" vs the raw "Web Sidecar"). NULL = show
--                      profile_name || browser instead (client-side fallback,
--                      see DevicesCard.tsx).
--   auth_session_id — the GoTrue session id (JWT `session_id` claim) this
--                      install's current Supabase Auth session was minted
--                      with. Lets device-signout revoke the EXACT session at
--                      the Admin API (`DELETE /auth/v1/admin/sessions/{id}`)
--                      instead of guessing — real refresh-token invalidation,
--                      not just a client-side flag.
--   paused           — soft remote lock. A paused device's Sidecar blocks
--                       its own UI behind a full-screen "paused" screen
--                       (client-side honor logic) until unpaused from
--                       another device. Does not touch the session.
--   revoked_at        — hard remote sign-out marker. Set by device-signout
--                       alongside the real session revocation; the target
--                       device's own honor logic (poll/realtime on its own
--                       row) calls supabase.auth.signOut() locally once it
--                       observes this set, landing on the Login screen.
--   device_settings  — per-device JSONB overrides (v1: plumbing only, no
--                       editor UI yet — see DevicesCard.tsx). Highest
--                       precedence in resolveContextViewSettings (device >
--                       contextView > legacy sidecar > defaults).
--
-- RLS: migration 016 already gives every authenticated user FOR ALL
-- (via separate INSERT/UPDATE/DELETE + the migration 015 SELECT policy)
-- write access to EVERY browser_profiles row where profile_id =
-- tabatha.current_profile_id() — i.e. any of MY OWN devices, which is
-- exactly the scope DevicesCard needs (pause/rename one device from
-- another). None of those policies restrict by column, so the new columns
-- are already covered — no policy change needed here.
--
-- Realtime: migration 033 added browser_profile_status + focus_items to
-- supabase_realtime, but never browser_profiles itself (the pairing/rename/
-- pause/revoke table). Adding it here so a pause/rename/revoke from one
-- device reaches every other device's Devices card AND its own honor-logic
-- listener instantly instead of waiting on a poll interval.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE tabatha.browser_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

ALTER TABLE tabatha.browser_profiles
  ADD COLUMN IF NOT EXISTS auth_session_id UUID;

ALTER TABLE tabatha.browser_profiles
  ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tabatha.browser_profiles
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

ALTER TABLE tabatha.browser_profiles
  ADD COLUMN IF NOT EXISTS device_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'tabatha' AND tablename = 'browser_profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tabatha.browser_profiles;
  END IF;
END $$;
