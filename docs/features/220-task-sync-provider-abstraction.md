# Feature #220 — Task-Sync Provider Abstraction

> **Status:** 📋 Planned · **Plan:** [045](../superpowers/specs/2026-07-20-plan-045-growth-integrations-governance-design.md)
> **Depends On:** `integration_credentials`/`tasks_registry`/`task_relations`
> (migration 035, shipped, currently Asana-hardcoded)
> **Created:** 2026-07-20

## User Context (Quotes)

> Malkio's Plan 045 brief: "Task-sync provider abstraction: current Asana-PAT
> sync becomes one provider behind an interface; add Anasa as a real second
> provider; stub Notion, ClickUp, Google Tasks, Monday.com (UI shows them as
> 'coming soon' via display_state pattern)."

## What It Does

Turns Tabatha's task sync from "an Asana integration" into "a task-sync
system with providers, of which Asana is the first." Concretely: the
`integration_credentials`/`tasks_registry`/`task_relations` CHECK
constraints widen to allow more than `'asana'`; a new `TaskProvider` client
interface (connect/sync/createTask/updateTask/disconnect) replaces
hardcoded Asana calls, with Asana as the first real implementation and
**Anasa** (Duck & Shark's own task system) as the second. Notion, ClickUp,
Google Tasks, and Monday.com appear in the Tasks connect screen as
recognizably real options with a "coming soon" badge, driven by a small
catalog table rather than hardcoded UI copy — so flipping one to "available"
later is a data change, not a UI rewrite.

## Implementation Notes

- Full design: `docs/superpowers/specs/2026-07-20-plan-045-growth-integrations-governance-design.md`
  §(b).
- New `tabatha.task_providers` catalog table (migration 057, placeholder
  number pending build-time re-verification) — deliberately separate from
  Olympus's `feature_permissions`/`display_state` (a per-user gating
  concept); this is a product-catalog fact, not a permission.
- Edge functions stay one-per-provider (`connect-anasa`, `sync-anasa-tasks`
  alongside the existing `connect-asana`/`sync-asana-tasks`) rather than one
  generalized multi-provider function, matching this repo's existing
  many-small-functions convention.
- **Anasa provider is gated on a short pre-build audit** of Anasa's own
  user-facing API/auth surface — the live `mcp__anasa-live__*` agent tools
  available in this environment are agent-facing, not confirmed to be the
  same shape a user's own PAT/API-key connection would use.
- Shares a migration coordination point with Plan 044 (§1 of that doc) —
  both widen `integration_credentials.provider` on the same column.

## Related Features

- #186 Asana Task ↔ Focus Linking (the Asana-specific work this abstracts)
- Plan 044 Scheduling (shares the same CHECK constraint, coordinate at build
  time)
