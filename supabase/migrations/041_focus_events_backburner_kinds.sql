-- ============================================================
-- Tabatha Migration 041 — track backburner transitions as focus_events
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- Malkio (2026-07-18, follow-on): "backburning should be on the timeline
-- and added to the checkpoint when an intent goes in or out of
-- backburner."
--
-- Migration 039 widened focus_events.kind to admit 'extend' and 'snooze' as
-- context kinds (computeIntervals ignores them by design — they don't
-- open/close tracked intervals). This widens it further with two more
-- context kinds for the backburner lifecycle:
--   'backburner'   — the focus was sent to the backburner (meta: {}).
--                    Rendered as a 🔥 timeline node ("To backburner") and
--                    interleaved into the checkpoint stream.
--   'unbackburner' — the focus came back off the backburner, either via an
--                    explicit "resume from backburner" action or by being
--                    switched to directly while still tagged _backburner
--                    (meta: {}). Rendered as a distinct timeline node
--                    ("Back from backburner").
--
-- The inline CHECK from 034 (widened by 039) gets Postgres's default
-- constraint name (focus_events_kind_check). Safe to re-run: DROP IF
-- EXISTS + re-ADD.
-- ============================================================

ALTER TABLE tabatha.focus_events
  DROP CONSTRAINT IF EXISTS focus_events_kind_check;

ALTER TABLE tabatha.focus_events
  ADD CONSTRAINT focus_events_kind_check
  CHECK (kind IN ('start', 'pause', 'resume', 'resolve', 'extend', 'snooze', 'backburner', 'unbackburner'));
