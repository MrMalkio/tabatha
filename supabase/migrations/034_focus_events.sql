-- ============================================================
-- Tabatha Migration 034 — Focus start/stop event log (Sidecar)
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- Plan 040 §3 shared foundation: a per-focus start/stop event stream, kept
-- separate from `intent_history` (a rolling, capped action log) because
-- accurate "time worked" needs an uncapped, precisely-paired interval log.
-- Written by the Sidecar now (start/pause/resume/resolve); the extension can
-- adopt this table later for full parity (Plan 040 §3, Addendum 5 item 2).
-- Feeds Epic 2 (Context View timeline start-nodes) and Epic 4 (per-task time).
-- Additive only; owner-RLS; realtime for the live Context View.
-- ============================================================

CREATE TABLE IF NOT EXISTS tabatha.focus_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  focus_client_id TEXT NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('start', 'pause', 'resume', 'resolve')),
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'sidecar',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_focus_events_lookup
  ON tabatha.focus_events(profile_id, focus_client_id, at);

ALTER TABLE tabatha.focus_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own focus events" ON tabatha.focus_events;
CREATE POLICY "Users manage own focus events"
  ON tabatha.focus_events
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON tabatha.focus_events TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'tabatha' AND tablename = 'focus_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tabatha.focus_events;
  END IF;
END $$;
