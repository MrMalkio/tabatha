-- ============================================================
-- Tabatha Migration 013 — Companion + mobile install uniqueness
-- ============================================================
-- Plan 028 Phase D₂. The companion-as-install model proxy-registers
-- the desktop companion as a row in tabatha.browser_profiles tagged
-- browser='desktop_companion'. Each Tabatha extension instance that
-- connects to the companion races to insert this row, so we need a
-- uniqueness constraint to prevent duplicate rows.
--
-- For now: one companion install per user (single machine assumption).
-- Multi-machine support arrives later via a stable host identifier
-- carried in profile_path.
--
-- Mobile installs follow the same shape: one row per (profile_id,
-- browser) for browser values in the non-browser set. Chrome /
-- Edge / Firefox browser_profiles intentionally stay free-form
-- because the same user CAN have many Chrome profiles on one machine.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_browser_profiles_per_user_per_surface
  ON tabatha.browser_profiles (profile_id, browser)
  WHERE browser IN ('desktop_companion', 'mobile_ios', 'mobile_android', 'tabatha_web');
