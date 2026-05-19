-- ============================================================
-- Tabatha Migration 010 — Browser profile awareness status
-- ============================================================
-- Phase C of the multi-profile sync plan. Adds a per-install
-- "what is this profile doing right now" row. Each browser profile
-- (and, in future, each desktop companion install) keeps one row
-- here. Every state transition upserts immediately; an idle 60s
-- heartbeat refreshes last_heartbeat_at.
--
-- Other installs of the same user subscribe to changes via Supabase
-- Realtime and render awareness chips ("Personal: focused on Slack,
-- 6m remaining").
--
-- Clock and Focus are orthogonal axes — a profile can be clocked-in
-- AND focused at the same time. Both are nullable; null means "not
-- applicable / no current activity".
-- ============================================================

CREATE TABLE IF NOT EXISTS tabatha.browser_profile_status (
  browser_profile_id UUID PRIMARY KEY
    REFERENCES tabatha.browser_profiles(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL
    REFERENCES tabatha.profiles(id) ON DELETE CASCADE,

  -- Lifecycle / liveness
  online BOOLEAN NOT NULL DEFAULT false,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Clock axis (NULL if this install never clocks — e.g. personal browser)
  clock_state TEXT CHECK (clock_state IN ('clocked_in', 'on_break', 'clocked_out')),
  clocked_in_at TIMESTAMPTZ,
  on_break_since TIMESTAMPTZ,
  last_clock_event_at TIMESTAMPTZ,

  -- Focus axis (NULL if no active focus)
  focus_state TEXT,                    -- 'active' | 'paused' | 'drifted' | 'completed'
  active_focus_id TEXT,
  active_focus_label TEXT,
  focus_started_at TIMESTAMPTZ,
  focus_timer_minutes NUMERIC,
  focus_elapsed_ms BIGINT,
  focus_timer_ends_at TIMESTAMPTZ,

  -- Free-form extension point
  metadata JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_browser_profile_status_profile
  ON tabatha.browser_profile_status(profile_id);
CREATE INDEX IF NOT EXISTS idx_browser_profile_status_heartbeat
  ON tabatha.browser_profile_status(last_heartbeat_at);

-- RLS — own profile only for Phase C. Manager / org-member visibility
-- will arrive in a future migration alongside the manager dashboard.
ALTER TABLE tabatha.browser_profile_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own browser_profile_status" ON tabatha.browser_profile_status;
CREATE POLICY "Users can read own browser_profile_status"
  ON tabatha.browser_profile_status FOR SELECT
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can upsert own browser_profile_status" ON tabatha.browser_profile_status;
CREATE POLICY "Users can upsert own browser_profile_status"
  ON tabatha.browser_profile_status FOR INSERT
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own browser_profile_status" ON tabatha.browser_profile_status;
CREATE POLICY "Users can update own browser_profile_status"
  ON tabatha.browser_profile_status FOR UPDATE
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own browser_profile_status" ON tabatha.browser_profile_status;
CREATE POLICY "Users can delete own browser_profile_status"
  ON tabatha.browser_profile_status FOR DELETE
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON tabatha.browser_profile_status TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tabatha.browser_profile_status TO service_role;

-- Realtime — add to supabase_realtime publication so cross-install
-- awareness can subscribe via supabase.channel().
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'tabatha'
      AND tablename = 'browser_profile_status'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE tabatha.browser_profile_status';
  END IF;
END $$;
