-- ============================================================
-- Tabatha Migration 017 — Durable install identity + machine anchor
-- ============================================================
-- Root cause of "ghost stints": browser_profiles rows were keyed only by a
-- random UUID, with the stable per-install localId held client-side in
-- chrome.storage.local (browser_profile.supabaseId). Any storage reset
-- (reinstall, fresh unpacked build) or a sync race minted a brand-new row,
-- and the old row's browser_profile_status stayed frozen at 'clocked_in'.
--
-- This migration persists the install's localId as `local_id` and adds a
-- unique index so ensureBrowserProfileRow() can UPSERT on
-- (profile_id, local_id) — making the same install map to one row whenever
-- storage survives, and making concurrent inserts idempotent.
--
-- `machine_id` is the desktop-companion browser_profile id this install is
-- paired with (an extension reaching the companion on ws://localhost:9147 is
-- by definition the same machine). It is best-effort: NULL when no companion
-- is running. Core clock-in does not depend on it.
--
-- Existing rows keep local_id IS NULL (no backfill) and are reconciled via
-- the Live Stints panel.
-- ============================================================

ALTER TABLE tabatha.browser_profiles
  ADD COLUMN IF NOT EXISTS local_id TEXT;

ALTER TABLE tabatha.browser_profiles
  ADD COLUMN IF NOT EXISTS machine_id TEXT;

-- One row per (user, install). NOT partial: Postgres treats NULLs as
-- distinct, so the many pre-existing local_id IS NULL rows (and
-- companion/mobile surfaces) coexist freely, while non-null local_ids are
-- unique. A plain index (vs a partial one) also lets ensureBrowserProfileRow's
-- UPSERT reliably infer this constraint from ON CONFLICT (profile_id, local_id).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_browser_profiles_per_user_local_id
  ON tabatha.browser_profiles (profile_id, local_id);

CREATE INDEX IF NOT EXISTS idx_browser_profiles_machine
  ON tabatha.browser_profiles (profile_id, machine_id)
  WHERE machine_id IS NOT NULL;
