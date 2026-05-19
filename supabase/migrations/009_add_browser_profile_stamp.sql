-- ============================================================
-- Tabatha Migration 009 — Stamp browser_profile_id on synced tables
-- ============================================================
-- Adds a nullable browser_profile_id FK to every push-sync table so the
-- server can attribute each row to the install that produced it. The
-- multi-profile awareness model (Phase A) ensures every install upserts
-- a row in tabatha.browser_profiles and stamps that id on subsequent
-- pushes.
--
-- Existing rows pre-multi-profile keep browser_profile_id IS NULL.
-- That's intentional and acceptable; we don't backfill.
--
-- Tables touched (9):
--   focus_items, intent_history, clock_sessions, desktop_activity,
--   operations, initiatives, clients, projects, tasks_registry
--
-- time_entries and time_logs are intentionally deferred. They have
-- secondary writers (Asana widget) and will be addressed in Phase C.
-- ============================================================

-- focus_items -------------------------------------------------
ALTER TABLE tabatha.focus_items
  ADD COLUMN IF NOT EXISTS browser_profile_id UUID
    REFERENCES tabatha.browser_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_focus_items_profile_install
  ON tabatha.focus_items(profile_id, browser_profile_id);

-- intent_history ----------------------------------------------
ALTER TABLE tabatha.intent_history
  ADD COLUMN IF NOT EXISTS browser_profile_id UUID
    REFERENCES tabatha.browser_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_intent_history_profile_install
  ON tabatha.intent_history(profile_id, browser_profile_id);

-- clock_sessions ----------------------------------------------
ALTER TABLE tabatha.clock_sessions
  ADD COLUMN IF NOT EXISTS browser_profile_id UUID
    REFERENCES tabatha.browser_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clock_sessions_profile_install
  ON tabatha.clock_sessions(profile_id, browser_profile_id);

-- desktop_activity --------------------------------------------
ALTER TABLE tabatha.desktop_activity
  ADD COLUMN IF NOT EXISTS browser_profile_id UUID
    REFERENCES tabatha.browser_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_desktop_activity_profile_install
  ON tabatha.desktop_activity(profile_id, browser_profile_id);

-- operations --------------------------------------------------
ALTER TABLE tabatha.operations
  ADD COLUMN IF NOT EXISTS browser_profile_id UUID
    REFERENCES tabatha.browser_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_operations_profile_install
  ON tabatha.operations(profile_id, browser_profile_id);

-- initiatives -------------------------------------------------
ALTER TABLE tabatha.initiatives
  ADD COLUMN IF NOT EXISTS browser_profile_id UUID
    REFERENCES tabatha.browser_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_initiatives_profile_install
  ON tabatha.initiatives(profile_id, browser_profile_id);

-- clients -----------------------------------------------------
ALTER TABLE tabatha.clients
  ADD COLUMN IF NOT EXISTS browser_profile_id UUID
    REFERENCES tabatha.browser_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_profile_install
  ON tabatha.clients(profile_id, browser_profile_id);

-- projects ----------------------------------------------------
ALTER TABLE tabatha.projects
  ADD COLUMN IF NOT EXISTS browser_profile_id UUID
    REFERENCES tabatha.browser_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_profile_install
  ON tabatha.projects(profile_id, browser_profile_id);

-- tasks_registry ----------------------------------------------
ALTER TABLE tabatha.tasks_registry
  ADD COLUMN IF NOT EXISTS browser_profile_id UUID
    REFERENCES tabatha.browser_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_registry_profile_install
  ON tabatha.tasks_registry(profile_id, browser_profile_id);
