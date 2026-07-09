# C7 — Recommendation & Action Layer

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: video V8/V9/V10/V11/V12
Phase: Phase 1 (read-only) / Phase 2 (execution)

## Purpose
The ACT layer's human-facing surface. C7 turns C6's optimization output into concrete, approvable suggestions and — once past Phase 1 — executes the approved ones. Phase 1 is strictly read-only: surface, approve, dismiss.

## Key behaviors
- **Recommendation Dashboard** — surfaces suggestions; user approves/dismisses (yes/no). Phase 1 = read-only.
- **Suggestion types** — keyboard shortcuts, tool replacement (paid→free/local, latency wins), custom code / Chrome-extension generation, consolidated morning digest (replaces manual polling loops).
- **On approval (Phase 2+)** — Cortex generates the prompt/script/extension with whatever AI it has access to and triggers it as a task (reactive), or hands off to autonomous mode (proactive).

## Dependencies
- C6 (Optimization Loop) — source of recommendations.
- C8 (Agent Orchestration & Routing) — executes approved actions in Phase 2+.
- C9 (Voice & Audio) — hotkey/dictation suggestions relate to voice.
- C15 (Config & Interaction-Density Model) — proactivity level gates auto-execution.
