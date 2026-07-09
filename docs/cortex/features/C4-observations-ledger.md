# C4 — Observations Ledger

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: video V2/V4
Phase: Phase 1

## Purpose
The LEDGER layer — one normalized event/observation store fusing all of Tabatha's telemetry with capture references and vision/audio extractions. This is the equivalent of the source video's "~8,640 lines/day" digital trail, much of which Tabatha already records; C4 unifies it so the THINK layer has a single source.

## Key behaviors
- **Normalized fusion** — window titles, categories, intent, tabs, domains, clock + capture references + vision/audio extractions in one store.
- **Nightly plain-file export** — a flat file the harness/agents can read (feeds C6 cron-in-harness).
- **Migration 022** — adds ledger + capture-reference tables, personal vs org partitioned, RLS mirroring existing `syncService.js` patterns.
- Reuses existing telemetry services (tabTracking, domainHistory, clock, focus, activityAudit).

## Dependencies
- C1/C2/C3 — supply capture references and their storage locations.
- C5 (Pattern Engine) — primary consumer of the ledger.
- C6 (Optimization Loop) — reads the nightly export.
- C10 (Passive Self-Correction) — writes corrections back into the ledger.
- C14 (Agent Data Map & Governance) — catalogs every ledger signal.
