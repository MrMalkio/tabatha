-- ============================================================
-- Tabatha Migration 025 — Cortex surface CHECK incl. voice/desktop/mobile (Plan 041 follow-up)
-- ============================================================
-- Migration 022 declared `tabatha.cortex_observations.surface` as a bare
-- `surface TEXT` with only an inline COMMENT ('browser' | 'os') — there was
-- NEVER an actual CHECK constraint on it (only `partition` carried a CHECK).
-- The WHAT-REMAINS risk (docs/cortex/WHAT-REMAINS.md line 51) and the C9 HANDOFF
-- note (docs/cortex/HANDOFF.md line 51) describe the gap as voice rows falling
-- "outside migration 022's browser|os CHECK constraint" — but that CHECK did not
-- exist, so voice rows were never actually blocked; they were simply undocumented
-- and unvalidated. Rather than remove a constraint that isn't there, this
-- migration ADDS the proper CHECK the docs assumed, widened to the surfaces the
-- code actually emits today plus the ones the roadmap commits to:
--   'browser'  — extension tab capture (C1)
--   'os'       — companion OS-level capture (C1 handoff)
--   'desktop'  — companion chrome-blurred signal (captureService.js:572)
--   'voice'    — C9 voice observations / notes (surface:'voice', local-only today)
--   'mobile'   — C13 mobile parity (surface:'mobile', planned; see C13 feature doc)
-- NULL remains allowed (context/signal rows that don't name a surface).
--
-- Additive + idempotent: a guarded DO block drops any pre-existing constraint of
-- the same name before (re)adding it, so this is safe to re-run and safe even if
-- a future edit introduces its own `cortex_observations_surface_check`.
-- Migration 024 added controller-attribution columns to this same table; this is
-- the "one combined follow-up" the risk line suggested, scoped to the surface gap.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cortex_observations_surface_check'
      AND conrelid = 'tabatha.cortex_observations'::regclass
  ) THEN
    ALTER TABLE tabatha.cortex_observations
      DROP CONSTRAINT cortex_observations_surface_check;
  END IF;
END
$$;

ALTER TABLE tabatha.cortex_observations
  ADD CONSTRAINT cortex_observations_surface_check
  CHECK (surface IS NULL OR surface IN ('browser', 'os', 'desktop', 'voice', 'mobile'));
