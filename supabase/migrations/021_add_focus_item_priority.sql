-- ============================================================
-- Tabatha Migration 021 — Persist focus item priority (FIX-10)
-- ============================================================
-- The local focus engine stamps every item with a numeric `priority`
-- (1 = critical … 10 = low; default 5). syncService.buildFocusRows never
-- persisted it, so remote/cross-device readers of tabatha.focus_items had
-- no P-priority to show.
--
-- FIX-10 surfaces a read-only cross-device intent queue in the awareness
-- strip; for the P-priority chip to appear on OTHER devices we need the
-- priority to round-trip through Supabase. Add a nullable column (older
-- rows / older clients keep NULL, which the UI renders as "no priority").
--
-- Nullable + no backfill: intentionally consistent with migration 009's
-- treatment of browser_profile_id. Range-checked to the engine's 1..10.
-- ============================================================

ALTER TABLE tabatha.focus_items
  ADD COLUMN IF NOT EXISTS priority INTEGER
    CHECK (priority IS NULL OR (priority >= 1 AND priority <= 10));
