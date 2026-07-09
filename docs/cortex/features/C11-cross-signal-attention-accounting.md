# C11 — Cross-Signal Attention Accounting

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: user
Phase: Phase 5

## Purpose
Broadens attention accounting beyond the browser so Tabatha can honestly answer "how well are you leveraging your tools?" It ingests signals from outside Chrome and, critically, tells apart human activity from AI-agent activity so time is attributed to the right entity.

## Key behaviors
- **Broader signal ingest** — phone/call logs, email/text reply latency, computer on/off windows.
- **Human-vs-agent attribution** — distinguishes when an AI agent (vs the human) is controlling a browser/window/machine so activity is credited correctly.
- **Leverage analytics** — powers honest reporting on how well the user is using their resources and tools.

## Dependencies
- C4 (Observations Ledger) — where cross-signal events are fused.
- C1 (Adaptive Capture Engine) / companion — supply device and window control signals.
- C10 (Passive Self-Correction) — consumes attribution to correct records.
- C14 (Agent Data Map & Governance) — must catalog these new external signals.
