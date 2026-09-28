# Cortex — Optimization Prompts

> 🔗 Google Doc: https://docs.google.com/document/d/1Fou1lTHB0-UEWFMFze8n9FVZgqbZ4sdWewUyeJurPdc/edit?usp=drivesdk&ouid=104108780460431833741

Status: two prompts authored (`economize-workflow.v1.md`, `economize-intraday.v1.md`); agent-access presets are planned under [C16](../features/C16-agent-access-kit.md)
Parent: [Program Spec](../00-cortex-program-spec.md) §5 · Clusters: [C6](../features/C6-optimization-loop.md), [C8](../features/C8-agent-orchestration-routing.md)

This folder holds the **versioned master optimization system prompts** that drive the C6 Optimization Loop and are routed/executed by C8 (starting with cron-in-harness). These prompts are first-class artifacts: they are versioned, reviewed, and changed deliberately, because they define how Cortex reasons about "how do I economize this workflow?" over the Observations Ledger.

## Conventions
- One file per prompt, versioned by suffix: `<name>.vN.md` (e.g. `economize-workflow.v1.md`).
- Each prompt file documents: purpose, expected ledger input shape, output/recommendation schema, and the ≥3–4× validation rule it must honor.
- Never overwrite a version in place — bump to `.vN+1.md` so history is preserved.

## Prompts
- `economize-workflow.v1.md` — *(authored — see the file)* the primary end-of-day "economize my workflow" master prompt: reads the nightly ledger export, applies the ≥3× pattern threshold, and emits approve/dismiss recommendations (hotkeys, tool replacement, custom code/extension, morning digest) for the C7 dashboard.
