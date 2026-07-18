-- ============================================================
-- Tabatha Migration 036 — push_log (Epic 8 dedup v2)
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- New dedup table for schedule-driven Sidecar nudges (#194), sitting
-- alongside — not replacing — `push_dedup` (migration 030). `push_dedup`
-- is NOT NULL-FK'd to `focus_items` and fires a given (focus, kind) pair
-- once *forever*, which is correct for the existing focus-scoped kinds
-- (`timer_expired`, `drifted`, `checkpoint_stale`) but wrong for a
-- recurring daily nudge like "clocked in yet?" that has no focus row at
-- all and must be able to fire again tomorrow.
--
-- `push_log` is keyed (profile_id, kind, scope_key, day):
--   - `day` makes the dedup calendar-day-scoped instead of forever.
--   - `scope_key` (default '') disambiguates repeats of the same kind
--     within one day — e.g. multiple calendar_events for a future
--     `block_start` nudge, or successive idle episodes for a future
--     `idle_nudge`. Kinds that are true day-level singletons (v1's
--     `clock_in_check`) just use the default ''.
--
-- See docs/superpowers/specs/2026-07-18-epic8-dedup-nudges-design.md §1
-- for the full design (Dex) + Koda's vet. Binding revision from that vet:
-- this file is migration 036 (not 034 as drafted in the design doc —
-- 034/035 were taken by unrelated work that landed first).
--
-- Additive + idempotent. Safe to re-run. Service-role only, like
-- push_dedup: no authenticated policy — users never read/write this
-- table directly, only the cron edge function does.
-- ============================================================

CREATE TABLE IF NOT EXISTS tabatha.push_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                  -- 'clock_in_check' | 'block_start' | 'idle_nudge'
  scope_key TEXT NOT NULL DEFAULT '',  -- disambiguates repeats of the same kind within
                                        -- one day (e.g. a calendar_events.event_id for
                                        -- block_start, an idle-episode marker for
                                        -- idle_nudge); '' for day-level singletons
                                        -- (v1's clock_in_check)
  day DATE NOT NULL,                   -- the profile's local calendar day this firing
                                        -- belongs to (per profiles.timezone + the
                                        -- existing settings.sidecar.dayResetHour
                                        -- boundary), not UTC
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, kind, scope_key, day)
);

ALTER TABLE tabatha.push_log ENABLE ROW LEVEL SECURITY;
-- No authenticated policy — service-role only, same as push_dedup.

CREATE INDEX IF NOT EXISTS idx_push_log_profile_day
  ON tabatha.push_log(profile_id, day);

GRANT SELECT, INSERT, UPDATE, DELETE ON tabatha.push_log TO service_role;
