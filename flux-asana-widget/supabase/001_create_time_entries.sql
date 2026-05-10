-- =============================================================
-- Flux Time Tracker — Supabase Schema
-- Migration: 001_create_time_entries
-- =============================================================

-- The core table for tracking time entries per task per user
CREATE TABLE IF NOT EXISTS flux_time_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_gid      TEXT NOT NULL,               -- Asana task GID
  workspace_gid TEXT NOT NULL,               -- Asana workspace GID
  user_gid      TEXT NOT NULL,               -- Asana user GID
  user_name     TEXT,                        -- Cached display name (avoid API round-trips)
  started_at    TIMESTAMPTZ NOT NULL,
  stopped_at    TIMESTAMPTZ,                 -- NULL = timer is currently running
  duration_s    INTEGER GENERATED ALWAYS AS (
    CASE WHEN stopped_at IS NOT NULL 
         THEN EXTRACT(EPOCH FROM (stopped_at - started_at))::INTEGER
         ELSE NULL
    END
  ) STORED,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate entries for same user/task/start time
  CONSTRAINT uq_time_entry UNIQUE (task_gid, user_gid, started_at)
);

-- Fast lookups: all entries for a task (widget rendering)
CREATE INDEX IF NOT EXISTS idx_time_entries_task 
  ON flux_time_entries(task_gid);

-- Fast lookups: all entries for a user (dashboard/reporting)
CREATE INDEX IF NOT EXISTS idx_time_entries_user 
  ON flux_time_entries(user_gid);

-- Fast lookups: active timers only (start/stop logic)
CREATE INDEX IF NOT EXISTS idx_time_entries_active 
  ON flux_time_entries(task_gid, user_gid) 
  WHERE stopped_at IS NULL;

-- Workspace-scoped queries (reporting across a workspace)
CREATE INDEX IF NOT EXISTS idx_time_entries_workspace 
  ON flux_time_entries(workspace_gid);

-- =============================================================
-- Row Level Security (RLS) — OPTIONAL for v1
-- Enable when auth is in place
-- =============================================================
-- ALTER TABLE flux_time_entries ENABLE ROW LEVEL SECURITY;
-- 
-- CREATE POLICY "Users can view time entries for their workspace"
--   ON flux_time_entries FOR SELECT
--   USING (workspace_gid IN (
--     SELECT workspace_gid FROM user_workspace_memberships 
--     WHERE user_id = auth.uid()
--   ));
--
-- CREATE POLICY "Users can insert their own time entries"
--   ON flux_time_entries FOR INSERT
--   WITH CHECK (user_gid = (SELECT asana_gid FROM profiles WHERE id = auth.uid()));
