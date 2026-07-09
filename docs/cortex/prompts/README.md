# Cortex — Optimization Prompts

Status: stub — Fable to populate
Parent: [Program Spec](../00-cortex-program-spec.md) §5 · Clusters: [C6](../features/C6-optimization-loop.md), [C8](../features/C8-agent-orchestration-routing.md)

This folder holds the **versioned master optimization system prompts** that drive the C6 Optimization Loop and are routed/executed by C8 (starting with cron-in-harness). These prompts are first-class artifacts: they are versioned, reviewed, and changed deliberately, because they define how Cortex reasons about "how do I economize this workflow?" over the Observations Ledger.

## Conventions
- One file per prompt, versioned by suffix: `<name>.vN.md` (e.g. `economize-workflow.v1.md`).
- Each prompt file documents: purpose, expected ledger input shape, output/recommendation schema, and the ≥3–4× validation rule it must honor.
- Never overwrite a version in place — bump to `.vN+1.md` so history is preserved.

## Planned prompts
- `economize-workflow.v1.md` — *(placeholder — to be authored)* the primary end-of-day "economize my workflow" master prompt: reads the nightly ledger export, applies the ≥3× pattern threshold, and emits approve/dismiss recommendations (hotkeys, tool replacement, custom code/extension, morning digest) for the C7 dashboard.
