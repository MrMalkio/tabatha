# C15 — Config & Interaction-Density Model

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: user
Phase: Phase 2

## Purpose
The cross-cutting configuration surface for the whole program, plus the "interaction-density dial" that lets each user or org tune how present Tabby is — from invisible/passive to high-touch/manual.

## Key behaviors
- **Unified config surface** — capture cadence/scope, redaction rules, storage targets, retention, routing tier, and proactivity level in one place.
- **Interaction-density dial** — a single control spanning invisible/passive ↔ high-touch/manual so working styles are respected.
- Personal vs org scoping so admins and individuals each tune their own layer.

## Dependencies
- C1 (Adaptive Capture Engine) — cadence/scope config.
- C2 (Sensitive-Data Guard) — redaction/suppression rules.
- C3 (Storage & Retention Fabric) — storage target + retention.
- C8 (Agent Orchestration & Routing) — routing tier + proactivity.
- C7 (Recommendation & Action Layer) — proactivity gates auto-execution.
- C9 (Voice & Audio) — speak-vs-modal and hotkey config.
