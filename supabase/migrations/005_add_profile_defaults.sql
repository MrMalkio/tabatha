-- ============================================================
-- Tabatha Migration 005 — Add default_org_id / default_team_id to profiles
-- ============================================================
-- The application code (src/hooks/useAuth.js, src/background/services/syncService.js,
-- src/services/timeTracking.js) selects `default_org_id` and `default_team_id` from
-- tabatha.profiles. These columns were referenced in code from the v3.x development
-- cycle but the corresponding ALTER TABLE was never landed alongside migrations
-- 001/002/003. The missing columns caused every profile SELECT to return an error
-- in Supabase, which the client treated as "no profile" and the entire sync chain
-- silently bailed.
--
-- Effect: after this migration runs, useAuth can read the profile, the sync alarm
-- can push focus_items + intent_history, and the Settings → Account UI surfaces
-- the real display_name instead of the "Tabatha User" fallback.
--
-- Run order: after 001, 002, 003. (004 only adds public.flux_time_entries and is
-- independent.) Safe to re-run — both columns use IF NOT EXISTS.
-- ============================================================

ALTER TABLE tabatha.profiles
  ADD COLUMN IF NOT EXISTS default_org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL;

ALTER TABLE tabatha.profiles
  ADD COLUMN IF NOT EXISTS default_team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL;

-- Indexes for the FK lookups since these will be filtered on in the team-mode UI.
CREATE INDEX IF NOT EXISTS profiles_default_org_idx ON tabatha.profiles(default_org_id);
CREATE INDEX IF NOT EXISTS profiles_default_team_idx ON tabatha.profiles(default_team_id);
