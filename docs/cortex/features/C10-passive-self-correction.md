# C10 — Passive Self-Correction

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: user
Phase: Phase 3

## Purpose
Makes Tabatha "almost invisible" by continuously repairing its own records from observation, on the assumption that the human is always behind on manual upkeep. The engine that keeps the ledger honest without asking the user to maintain it.

## Key behaviors
- **Self-repairing records** — fixes tab↔intent links, corrects what an intent *really* is, recomputes how long something was *actually* worked on.
- **Observation-driven** — corrections derive from captured/telemetry evidence, not user edits.
- Reuses `activityAuditService` + the Observations Ledger.

## Dependencies
- C4 (Observations Ledger) — reads evidence and writes corrections back.
- C1 (Adaptive Capture Engine) — capture frames strengthen correction confidence.
- C11 (Cross-Signal Attention Accounting) — human-vs-agent attribution informs corrections.
