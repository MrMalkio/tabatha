# Implementation Plan 040: Cortex Phase 1 — First AI Observation Layer

- **Program:** Tabatha Cortex (Plan 039). Spec: `docs/cortex/00-cortex-program-spec.md` §8.
- **Current version:** 6.5.0 → **target 7.0.0** (MAJOR — first AI integration).
- **Branch:** `claude/tabatha-ai-integration-layer-91903b` (Cortex program branch).
- **Status:** in progress (started by Claude 2026-07-09; Fable to continue overnight).

## Goal
Ship the cheapest, local-first, no-backend slice of Cortex: context-driven capture → sensitive-data guard → local storage/retention → observations ledger → cron-in-harness optimization → read-only recommendation dashboard. **No net-new API key required** (OpenAI + Supabase + harness cover it).

## Architecture principle for Phase 1
Push all decision logic into **pure, unit-tested modules in `src/utils/`** (no chrome/DOM/supabase deps), and keep the `captureService` a thin chrome-facing shell that calls them. This mirrors `stintReconciliation.js` (26 tests) and keeps the risky I/O surface tiny.

## Task breakdown

### T1 — Pure decision core (TDD, `src/utils/` + `test/`)  ← this session
1. `captureDecision.js` — `decideCapture(event, state, config)`: context-driven "when + which surface" (browser⇄companion handoff, dwell interval, min-gap, context-change triggers). **Origin C1.**
2. `sensitiveDataGuard.js` — `evaluateCapture(target, rules)`: per-site/app suppression (only when the sensitive surface is the capture target) + capture-time redaction regions. **Origin C2.**
3. `observationLedger.js` — `normalizeObservation(raw)` + `dedupeKey(rec)` + `partitionOf(rec, clockState)`: fold every signal into one normalized record; personal/org partition. **Origin C4.**
4. `retentionPolicy.js` — `planRetention(inventory, policy, freeBytes)`: prune by age AND free-space, separate personal/org budgets. **Origin C3.**

### T2 — Service shell + settings  ← this session (scaffold)
5. `src/background/services/captureService.js` — `configureCaptureService({...})` + `handleMessage` for `GET_CAPTURE_STATE`, `SET_CAPTURE_ENABLED`, `CAPTURE_NOW` (guarded), `LIST_OBSERVATIONS`. Registered in `background.js` `services[]`. Uses the T1 pure modules + `chrome.tabs.captureVisibleTab` (only when enabled + guard passes).
6. `DEFAULT_SETTINGS` (constants.js): add `captureEnabled` (false), `captureDwellIntervalMs`, `captureMinGapMs`, `captureStoragePath`, `sensitiveRules` ([]), `captureRetention` ({personal,org}). Wire the existing inert `screenshotCapture` toggle → master enable.

### T3 — Migration 022 (skeleton)  ← this session
7. `supabase/migrations/022_cortex_ledger.sql` — `tabatha.cortex_observations` + `tabatha.cortex_capture_refs`, personal/org partition column, RLS mirroring existing patterns. Not applied yet (local-first; cloud batch is backup).

### T4 — Storage + capture I/O  ← next increment
Local frame write to configurable path, external-archive interface stub, nightly ledger export file. Companion OS-capture handoff (Rust, separate repo — depends on companion deploy board item).

### T5 — Cron-in-harness + Dashboard  ← next increment
Harness scheduled task writer + master `economize-workflow.v1` prompt; read-only Recommendation dashboard panel (approve/dismiss).

### T6 — Agent Data Map  ← next increment
Populate `docs/cortex/DATA-MAP.md`, update `.headbox/workspace-map.md`.

## Test strategy
`node --test`. Every T1 module gets a `test/<module>.test.js` written FIRST. Target: full branch coverage of decision logic (suppression edge cases, handoff, dedupe, retention budget math). T2 service shell verified by build (`npm run build`) + message-handler smoke.

## Definition of done (Phase 1)
Capture runs opt-in, respects suppression/redaction, writes a local ledger, a harness cron produces recommendations, dashboard shows them read-only, DATA-MAP published. Ships as v7.0.0 after regression.

## Parallelability Review
- **Zones touched:** background services (new `captureService`, isolated), `src/utils/` (new files, no collisions), `constants.js` DEFAULT_SETTINGS (append-only), `settings/index.jsx` (wire existing toggle), new migration 022, new docs. 
- **Shared-file risk:** `background.js` services array (one-line add) and `constants.js` (append) are the only shared edits — low conflict. No overlap with active worktrees (deploy-*, nb0102-schedule).
- **Parallelable:** T1's four modules are fully independent → can be split across agents. T2/T3 depend on T1. 
- **Max branch lifetime:** T1–T3 ~days; keep the program branch rebased on staging weekly.
- **Scope-split:** T4/T5/T6 are separate follow-up increments (own commits), safe to hand to Fable.
