# Feature #218 — Preset Checkpoints

> **Status:** 📋 Planned · **Plan:** [044](../superpowers/specs/2026-07-20-plan-044-scheduling-calendar-preset-checkpoints-design.md)
> **Depends On:** `focus_checkpoints` (migration 032, shipped)
> **Created:** 2026-07-20

## User Context (Quotes)

> Malkio's Plan 044 brief: "Preset checkpoints: user or AI pre-defines
> checkpoints for an intent, auto-linked to subtasks (both directions), each
> with an expected time, tracked hit/miss."

## What It Does

Lets a user (or, eventually, the AI) lay out the checkpoints they expect to
hit *before* starting an intent — "by 20 minutes in, I should have the schema
drafted; by 40, the migration written" — instead of only ever logging
checkpoints reactively. Each preset carries an expected time (relative offset
from focus start, or absolute for scheduled intents) and can be linked to a
specific subtask. As the intent actually runs, a background sweep matches
real logged checkpoints against pending presets and marks each `hit` or
`missed`, giving the user (and eventually Tabatha itself) a concrete signal
for how well an intent tracked against its own plan — feeding directly into
Smart Deferral's split-suggestion logic (#208) as a future input.

## Implementation Notes

- Full design: `docs/superpowers/specs/2026-07-20-plan-044-scheduling-calendar-preset-checkpoints-design.md`
  §4.
- New table `tabatha.preset_checkpoints` (migration 055, placeholder number
  pending build-time re-verification) — `status IN ('pending','hit','missed','skipped')`,
  optional `linked_task_id`, optional `hit_checkpoint_id` back-reference once
  matched.
- "Auto-linked to subtasks, both directions" is satisfied by one FK plus a
  bidirectional creation flow (creating from a task auto-links; creating
  fresh offers to match an existing subtask) — not two DB columns.
- AI-authored presets are explicitly v2, gated on Plan 042's realtime AI
  layer existing first.

## Related Features

- #208 Smart Deferral & Splitting Engine (a future consumer of hit/miss data)
- #196 Intent Countdown Timer
- Plan 042 Conversational Tabatha (AI-authored presets, v2)
