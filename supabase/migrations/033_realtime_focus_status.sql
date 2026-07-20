-- ============================================================
-- Tabatha Migration 033 — Realtime for the Sidecar Context View
-- Project: mtdgoahskcibjbhfvofx
--
-- Adds focus_items + browser_profile_status to the supabase_realtime
-- publication so the Sidecar (esp. the large-viewport view-only Context View
-- on a TV / 3rd screen) updates live instead of polling. RLS still applies to
-- realtime, so each client only receives its own rows. Additive + idempotent.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'tabatha' AND tablename = 'focus_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tabatha.focus_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'tabatha' AND tablename = 'browser_profile_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tabatha.browser_profile_status;
  END IF;
END $$;
