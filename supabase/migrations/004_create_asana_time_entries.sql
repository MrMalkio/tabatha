-- =============================================================
-- Flux Asana Time Tracker — Supabase Schema
-- Migration: 004_create_asana_time_entries
-- Purpose: Track time per Asana task for the Flux widget plugin
-- Note: This is separate from tabatha.time_logs which tracks
--       browser-level time. This table bridges Asana task GIDs
--       to team time entries via the widget.
-- =============================================================

-- We use the public schema since this is an external integration
-- that doesn't require Tabatha auth (Asana handles auth via OAuth)

CREATE TABLE IF NOT EXISTS public.flux_time_entries (
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
  CONSTRAINT uq_flux_time_entry UNIQUE (task_gid, user_gid, started_at)
);

-- Fast lookups: all entries for a task (widget rendering)
CREATE INDEX IF NOT EXISTS idx_flux_time_task 
  ON public.flux_time_entries(task_gid);

-- Fast lookups: all entries for a user (dashboard/reporting)
CREATE INDEX IF NOT EXISTS idx_flux_time_user 
  ON public.flux_time_entries(user_gid);

-- Fast lookups: active timers only (start/stop logic)
CREATE INDEX IF NOT EXISTS idx_flux_time_active 
  ON public.flux_time_entries(task_gid, user_gid) 
  WHERE stopped_at IS NULL;

-- Workspace-scoped queries (reporting across a workspace)
CREATE INDEX IF NOT EXISTS idx_flux_time_workspace 
  ON public.flux_time_entries(workspace_gid);

-- =============================================================
-- RLS — Disabled for v1 (anon key used by widget server)
-- Enable and add policies when Asana OAuth user resolution is in place
-- =============================================================
-- ALTER TABLE public.flux_time_entries ENABLE ROW LEVEL SECURITY;
