# C6 — Optimization Loop

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: video V6/V7/V15
Phase: Phase 1

## Purpose
The second half of the THINK layer. C6 runs the master "how do I economize this workflow?" optimization prompts over the ledger's validated patterns on a schedule tuned to model/session limits, producing the recommendations the ACT layer surfaces.

## Key behaviors
- **Multi-cadence** — low-level passes throughout the day, a high-level pass at end-of-day to guide tomorrow and feed an autonomous agent overnight.
- **Master optimization prompts** — versioned "economize this workflow" system prompts (see `docs/cortex/prompts/`).
- **Cost-aware scheduling** — timed to model/session limits for token efficiency.
- Phase 1 runs via cron-in-harness (see C8) over the nightly ledger export.

## Dependencies
- C5 (Pattern Engine) — supplies validated patterns.
- C4 (Observations Ledger) — reads the nightly export.
- C8 (Agent Orchestration & Routing) — provides the execution/routing surface (cron-in-harness in Phase 1).
- C7 (Recommendation & Action Layer) — receives C6's output.
