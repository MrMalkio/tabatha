# Implementation Plan 043: Cortex Phase 4 — Proactive Autonomy & Team/SOP Mode

> 🔗 Google Doc: https://docs.google.com/document/d/1GKZrITjuATv0d_wm1YZno6YtqjnHsBuFgwG2PcZnQD8/edit?usp=drivesdk&ouid=104108780460431833741

- **Program:** Tabatha Cortex (Plan 039). Spec: `docs/cortex/00-cortex-program-spec.md` §8 Phase 4.
- **Status:** draft (authored by Fable 2026-07-10; execute after Plan 042).
- **Version:** expected start 7.2.0 → **target 7.3.0**.
- **Clusters:** C8 (proactive/autonomous overnight builds), C12 (team/SOP mandate), C6 (multi-cadence intraday).

## Goal
Move from "user approves, then acts" to "agent acts overnight, user reviews results" — and extend Cortex to teams: managers apply it to new hires, orgs can mandate capture-on-clock-in.

## Tasks
1. **T1 — Proactivity config (C8).** Reactive ↔ proactive dial per recommendation type; autonomous mode hands approved (or pre-authorized) recommendation types to the harness/proxy agent overnight; results presented as a "while you were away" morning review (built extension, dashboard, completed knowledge work).
2. **T2 — Autonomous build pipeline.** Extend the harness bundle (`src/utils/harnessCron.js`) with an EXECUTE task variant: reads approved recommendations, generates the artifact (script/extension/digest), writes it to a review directory; extension surfaces the review next morning. Guardrails: artifact allowlist, no self-modifying Tabatha, everything reviewable before install.
3. **T3 — Multi-cadence optimization (C6).** Intraday low-level passes (cheap model via routing tier ②) + EOD high-level pass; cooldown/dedupe so intraday passes don't re-flag the same pattern.
4. **T4 — Org capture mandate (C12).** `org_capture_policy` table + RLS (mirror migration 012 manager-scoping pattern); `capture_enabled` enforcement via `browser_profile_status` (follow the `idle_state` precedent); clock-in flips capture on when mandated; personal partition stays untouchable.
5. **T5 — SOP observation mode (C12).** Manager-initiated observation window for a new hire; Cortex compares against an exemplar-workflow baseline and emits tailored hotkey/extension suggestions to the hire (and aggregate-only insights to the manager).
6. **T6 — Headbox integration (C8).** Companion reads harness folders (Headbox governance data) to place/inspect scheduled tasks automatically — replaces the Phase 1 manual copy step.

## Test strategy
Pure logic: proactivity gating, mandate enforcement matrix (org policy × personal setting × clock state), cadence cooldowns. RLS: SQL tests mirroring the db-rls-audit patterns. Manual: full overnight loop dry-run on Malkio's machine.

## Parallelability Review
- **Zones touched:** Sync/awareness (T4), harness utils + cortexService (T1–T3), companion+Headbox (T6), new SOP surfaces (T5).
- **Shared files:** migrations (new numbers only), constants.js (append).
- **Parallel:** T4+T5 (team track) vs T1–T3 (autonomy track) vs T6 (companion track) — three parallel branches.
- **Max branch lifetime:** 1 week each.
- **Scope-split:** each task above is independently committable.
