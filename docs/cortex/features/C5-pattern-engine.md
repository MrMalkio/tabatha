# C5 — Pattern Engine

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: video V3/V5
Phase: Phase 1

## Purpose
The first half of the THINK layer. C5 reads the Observations Ledger, detects repeated behaviors, and only promotes something to a "pattern" once it has repeated enough to be signal rather than noise — the guardrail against one-off false positives.

## Key behaviors
- **Repetition threshold** — flag a pattern only at ≥3–4 repetitions within a window; discard one-off noise.
- **Vision-on-demand** — sample ~N frames only when text metadata is insufficient to explain a candidate pattern, keeping vision-model cost low.

## Dependencies
- C4 (Observations Ledger) — the data source C5 reads.
- C1/C3 — supply the frames sampled during vision-on-demand.
- C6 (Optimization Loop) — consumes validated patterns to generate recommendations.
