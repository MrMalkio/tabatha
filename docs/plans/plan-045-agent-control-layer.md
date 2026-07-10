# Implementation Plan 045: Cortex Phase 6 — Agent Control Layer (Tabatha CLI/MCP)

- **Program:** Tabatha Cortex (Plan 039) — formalized as **Phase 6** per Malkio 2026-07-10 ("make a phase for agent control layer"). Scope source: `docs/cortex/PROGRAM-agent-control-layer.md`.
- **Status:** draft — **BACK BURNER: execution starts only after Phases 1–5 are complete** (Malkio's explicit sequencing). Registered now so the phase has a number, gates, and a home.
- **Version:** expected start ≥7.4.0 → **target 7.5.0**.
- **Asana:** task `1216454646338939` (Flux Development).

## Goal
The efferent half of Cortex: let agents **read, write, and coordinate through Tabatha** — set intents, drive focuses/clock, contribute context notes, and use Tabatha as their own working memory during computer/browser work — over two transports (MCP server + CLI), with every write attributed via C11a agent sessions.

## Tasks (from the program doc's P1–P4 ladder)
1. **T1 — Read-only surface (P1).** `tabatha` MCP server exposing GET_FOCUS_ENGINE / GET_ALL_TABS / LIST_OBSERVATIONS / LIST_RECOMMENDATIONS / GET_CLOCK_STATUS as MCP tools; thin CLI wrapper. Host: desktop companion WS bridge (`:9147`) → new authenticated local endpoint (loopback token file). No writes.
2. **T2 — Attributed write surface (P2).** SET_INTENT / START_FOCUS / PAUSE / RESUME / CLOCK_* / context-note writes, each REQUIRING an open C11a agent session (hard gate — resolves program-doc open question 3 unless Malkio overrides); all writes audited via activityAuditService and reversible.
3. **T3 — Self-coordination primitives (P3).** Checkpoint/handoff/working-memory tools: an agent can declare a session, set its intent, checkpoint progress, hand off to a sub-agent, and query "what was I doing." Feeds the C10a reconciliation panel on session end.
4. **T4 — Governance (P4).** Scopes (read vs write), rate limits, kill switch, per-agent identity in the audit trail; org policy hooks (C12).
5. **T5 — Harness integration.** Register the MCP server in Claude Code/Codex configs via Headbox conventions (pairs with Plan 043 T6 harness placement).

## Dependencies / gates
- **Hard gate:** Cortex Phases 1–5 complete (Malkio).
- C11a shipped (✅ v1 2026-07-10) — the attribution substrate.
- Companion merged/deployed (in progress 2026-07-10) — hosts the bridge endpoint.
- Open questions 1–5 in the program doc need Malkio's answers before T1 starts (transport priority, host, hard-gate writes, autonomy level, context-note destination).

## Test strategy
Pure protocol/permission logic TDD in `src/utils/` + companion Rust tests for the endpoint; MCP contract tests via a harness client; every write path proven reversible in tests.

## Parallelability Review
- **Zones:** companion (endpoint host), new MCP/CLI package (own tree), background services (message surface already exists — read-mostly).
- **Shared files:** none heavy; `background.js` untouched (existing router reused).
- **Parallel:** T1 (read-only) can run parallel to any extension work; T2+ serialized behind C11a semantics decisions.
- **Max branch lifetime:** 1 week per T; T1 is a clean standalone slice.
- **Scope-split:** each T is independently shippable; T1 alone already delivers agent visibility.
