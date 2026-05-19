-- ============================================================
-- Tabatha Migration 011 — Profiles to supabase_realtime publication
-- ============================================================
-- Lets the extension subscribe to changes on its own profile row so
-- display_name / avatar_url / default_realm / default_org_id /
-- default_team_id propagate live across browser profiles and surfaces
-- without requiring a page reload.
--
-- Existing RLS on tabatha.profiles already restricts reads to the
-- authenticated user's own row, so adding to the publication does not
-- broaden visibility. Realtime respects RLS.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'tabatha'
      AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE tabatha.profiles';
  END IF;
END $$;
