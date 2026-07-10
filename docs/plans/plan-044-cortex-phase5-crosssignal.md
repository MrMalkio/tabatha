# Implementation Plan 044: Cortex Phase 5 — Cross-Signal Accounting, Environment & Mobile

> 🔗 Google Doc: https://docs.google.com/document/d/1pOjtyFPcvYd0VuPYHjhXMCFRc4JrkrNHk6R6-hA4pl0/edit?usp=drivesdk&ouid=104108780460431833741

- **Program:** Tabatha Cortex (Plan 039). Spec: `docs/cortex/00-cortex-program-spec.md` §8 Phase 5.
- **Status:** draft (authored by Fable 2026-07-10; execute after Plan 043).
- **Version:** expected start 7.3.0 → **target 7.4.0**.
- **Clusters:** C11 (cross-signal attention accounting), C13 (environment camera + mobile), Mac parity.

## Goal
Honest attention attribution across every signal the user's life emits — including knowing when an AI agent (not the human) is driving — plus the physical-environment and mobile extensions.

## Tasks
1. **T1 — Human-vs-AI-agent attribution (C11, first-class).** `controller` field on observations (`human | ai-agent | unknown`); detection surfaces: webdriver/CDP flags, companion process ancestry, input-event absence during activity, agent self-announcement API. All analytics split by controller so "how well are you leveraging your tools" is answerable.
2. **T2 — Reply-latency signals (C11).** Email/text reply-latency ingestion (privacy-first: latency metadata only, never content); phone/call logs via `tabatha-mobile`'s existing phone-call intelligence; computer on/off windows from companion power events.
3. **T3 — Leverage analytics (C11).** "Resources & tools" dashboard: attention by entity (self vs agents), response-latency trends, on/off rhythm.
4. **T4 — Ergonomic camera (C13).** Companion desk-cam capture every 5–10s over a bounded 3–7 day window (distinct consent + auto-expiry); vision pass emits posture/glare/monitor-height recommendations into the C7 dashboard.
5. **T5 — Mobile parity (C13).** Extend `tabatha-mobile` (NOT a new app) with screenshot+audio capture under the same ledger/redaction/partition model; sync into the unified ledger.
6. **T6 — Mac parity.** Companion build for macOS (window monitoring + capture via ScreenCaptureKit); closes the "Mac loses coverage when Chrome blurs" asymmetry documented in C1.

## Test strategy
Pure logic: controller-attribution decision table, latency aggregation. Hardware-touching tasks (T4–T6) get manual protocols + bounded pilots on Malkio's machines.

## Parallelability Review
- **Zones touched:** Companion (T1/T4/T6), mobile repo (T2/T5 — fully parallel), extension analytics UI (T3).
- **Shared files:** migrations (new), constants.js (append).
- **Parallel:** mobile, companion, and extension tracks are three independent repos/branches.
- **Max branch lifetime:** 1 week per branch; T6 (Mac) is its own long-lead track.
- **Scope-split:** every task is separable; T4 is a bounded experiment, not permanent infra.
