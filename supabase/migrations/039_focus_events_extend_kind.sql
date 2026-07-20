-- ============================================================
-- Tabatha Migration 039 — track timer extensions (and snoozes) as focus_events
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- Malkio (2026-07-18): "time extensions to be tracked and added to the
-- timeline almost like a checkpoint. That context needs to be tracked,
-- along with all others. to be used for the user's benefit."
--
-- Migration 034 created focus_events with kind constrained to the four
-- interval-pairing kinds ('start'|'pause'|'resume'|'resolve'). This widens
-- the CHECK to admit two context kinds that do NOT open/close tracked
-- intervals (computeIntervals ignores them by design):
--   'extend' — user added time to a running focus (meta: {addedMinutes,
--              fromMinutes, toMinutes}). Rendered as a timeline node on the
--              Context View, like a checkpoint.
--   'snooze' — user deferred a backburner item (meta: {mins, until}).
--              Not rendered on the current-focus timeline; captured for
--              deferral analytics (Feature #208 groundwork).
--
-- The inline CHECK from 034 gets Postgres's default constraint name
-- (focus_events_kind_check). Safe to re-run: DROP IF EXISTS + re-ADD.
-- ============================================================

ALTER TABLE tabatha.focus_events
  DROP CONSTRAINT IF EXISTS focus_events_kind_check;

ALTER TABLE tabatha.focus_events
  ADD CONSTRAINT focus_events_kind_check
  CHECK (kind IN ('start', 'pause', 'resume', 'resolve', 'extend', 'snooze'));
