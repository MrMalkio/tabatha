# Implementation Plan 041: Cortex Phase 2 — Companion Handoff, Action Execution & Routing Tiers

> 🔗 Google Doc: https://docs.google.com/document/d/1h4eqZdv8J7vgltRH9IvhG3HyMWnYJngXx3Ayg2rFkUg/edit?usp=drivesdk&ouid=104108780460431833741

- **Program:** Tabatha Cortex (Plan 039). Spec: `docs/cortex/00-cortex-program-spec.md` §8 Phase 2.
- **Status:** draft (authored by Fable 2026-07-10; execute after Plan 040 ships v7.0.0).
- **Current version at authoring:** 6.5.0 (Plan 040 in flight) → **expected start version 7.0.0 → target 7.1.0**.
- **Clusters:** C1 (OS capture), C3 (real storage/archive), C7 (action execution), C8 tiers ②③, C15 (config surface).
- **Gate:** the desktop-companion deploy board item (Asana 1216438764808685) MUST be resolved first — Phase 2's capture handoff assumes a current companion.

## Goal
Close the two biggest Phase 1 compromises (browser-only capture; Downloads-only storage) and turn the read-only dashboard into an acting one.

## Tasks
1. **T1 — Companion OS-capture handoff (C1).** Rust (separate repo `tabatha-desktop`): screen-capture module (windows-capture / DXGI), triggered by the existing 1s window poll + a new WS message from the extension when Chrome blurs (`captureService` already records the `chrome-blurred` signal). Per-window and per-screen capture modes (same-timestamp sets — filenames already support `_sN` via `buildCaptureFilename`). Companion applies the same C2 guard rules (mirror `sensitiveRules` over WS).
2. **T2 — Real storage fabric (C3).** Companion writes frames to the true configurable `captureStoragePath` (arbitrary filesystem path, not Downloads-relative), owns free-space measurement (feeds `planRetention` — `src/utils/retentionPolicy.js` is already space-aware and tested), and implements the first external-archive adapter (external HDD / configured folder; Drive/OneDrive via their sync folders first, APIs later). Replace the extension's `externalArchive` stub with a WS delegation.
3. **T3 — Routing tier ② backend proxy (C8).** Supabase edge function holding the OpenAI key (server-side; see `docs/cortex/API-KEYS.md`); extension calls it for on-demand optimization passes (no harness required). Org billing/batch groundwork.
4. **T4 — Routing tier ③ Vercel AI Gateway (C8).** Config-only tier behind a settings enum; BLOCKED on Malkio creating the Gateway key (API-KEYS.md "requires Malkio later").
5. **T5 — C7 action execution.** On approve: generate the artifact (prompt/script/extension scaffold) via the configured routing tier and hand it off as a task; morning-digest generator (the #1 recommendation type) rendered as a home-page card.
6. **T6 — C15 config surface v1.** Settings section exposing: cadence/scope (incl. multi-screen/per-window mode), redaction rules editor (UI over `sensitiveRules`), storage targets, retention, routing tier, proactivity level, density dial (first cut: passive/balanced/hands-on).

## Test strategy
Rust: unit tests in companion repo (existing 23-test precedent). Extension: pure logic in `src/utils/` + `node --test` first (routing selection, digest assembly, config validation). E2E: manual handoff check Chrome⇄companion with both surfaces logging to one ledger.

## Parallelability Review
- **Zones touched:** Companion (separate repo — fully parallel), Sync/edge functions, Settings, background captureService/cortexService.
- **Shared files:** `constants.js` (append), `settings/index.jsx` (new section mount) — low risk.
- **Conflicts:** none with current worktrees; T1/T2 (companion) and T3–T6 (extension) can run as two parallel tracks/agents.
- **Max branch lifetime:** split into ≥3 branches (companion-capture, routing-proxy, action-layer+config); each ≤1 week.
- **Scope-split points:** T1+T2 / T3+T4 / T5+T6.
