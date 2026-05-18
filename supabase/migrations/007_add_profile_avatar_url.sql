-- ============================================================
-- Tabatha Migration 007 — Add avatar_url column to profiles
-- ============================================================
-- The application code references `tabatha.profiles.avatar_url` in three places:
--   src/hooks/useAuth.js:88   — WIDE select includes avatar_url
--   src/hooks/useAuth.js:127  — auto-provision INSERT writes user_metadata.avatar_url
--   src/settings/index.jsx:607 — Account card renders profile.avatar_url as the avatar image
--
-- Migration 001 created profiles without this column. Every profile fetch
-- hits PGRST204 "column profiles.avatar_url does not exist" and silently bails
-- via the diagnostic path. With this column added, the wide select succeeds,
-- the profile loads, Google sign-in avatars render, and sync can proceed.
--
-- Safe to re-run — IF NOT EXISTS.
-- ============================================================

ALTER TABLE tabatha.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
