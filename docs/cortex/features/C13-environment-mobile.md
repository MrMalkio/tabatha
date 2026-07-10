# C13 — Environment & Mobile

> 🔗 Google Doc: https://docs.google.com/document/d/19s66IPBn0UsQ80BYAilrKZ6pBBSfPnSDEf1jFimZPNg/edit?usp=drivesdk&ouid=104108780460431833741

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5, §8 (Phase 5)
Origin: video V13 (ergonomic desk-cam); user Dump 2 (mobile parity)
Phase: Phase 5 (both sub-clusters — camera and mobile are separately gated; see Open questions)

## Purpose

Extends Cortex's observation surface past the screen: (a) a **physical desk camera** that watches posture/lighting/monitor geometry over a short, bounded study window and turns it into ergonomic feedback, and (b) **mobile parity** — bringing the same screenshot+audio capture, ledger, redaction, and partition model that exists for desktop/browser onto the phone. Both are new SENSE-layer surfaces; neither invents a new pipeline — they feed the same C2/C3/C4 machinery C1 already built.

## Detailed behaviors

### 1. Ergonomic desk-camera capture (video V13)
- **Cadence:** every 5–10s (same configurable-interval shape as `captureDwellSeconds`), but scoped to a **bounded observation window of 3–7 days**, not always-on. The window has an explicit start and end — this is a study, not surveillance. Re-running requires re-consent (see below), it does not silently renew.
- **What it produces:** posture, glare/lighting, and monitor-height/eye-line feedback — NOT a general activity record. Frames are analyzed for these specific signals and, by default, discarded after feature extraction (see Data model). Vision-on-demand (C5's "sample only when needed" pattern from video V3) is the analytical template: this isn't continuous vision inference on every frame, it's periodic posture/lighting checks.
- **Consent is separate from screen capture.** A webcam pointed at a person is materially more sensitive than a screenshot of a browser tab — this needs its own explicit opt-in, distinct from the `screenshotCapture` master toggle, with a visible "observation window active, ends `<date>`" state so the user always knows the camera is live.
- **Output surfaces through C7.** Ergonomic findings ("raise your monitor ~2in," "reduce glare from the window behind you") are recommendations, not raw footage — they land in the same read-only Recommendation Dashboard as workflow suggestions, not a separate UI.
- **Redaction still applies (C2).** The guard model extends past "which host/app is focused" to "what's in frame" — e.g., blur everything outside a posture-relevant torso/desk region before a frame is ever written, mirroring the QuickBooks-region-blur pattern but for a camera frame instead of a browser tab.

### 2. Mobile parity — screenshot + audio tracking (Dump 2, explicitly future-phase)
- **Scope, precisely:** the SAME level of tracking Cortex does on desktop/browser — periodic screenshot capture and audio capture on the phone — using the SAME Observations Ledger (C4), SAME Sensitive-Data Guard redaction/suppression rules (C2), and SAME personal/org partition + retention model (C3). This is capture-surface parity, not just telemetry parity (see important distinction below).
- **This is explicitly future-phase.** Nothing here ships in Phase 1–4. It is sequenced in Phase 5 alongside the desk camera because both are "new physical/mobile SENSE surfaces" per the program spec §8, but the two have independent dependency chains and could ship on different timelines (see Open questions).
- **IMPORTANT — do not conflate with existing mobile telemetry work.** Two sibling repos already exist and are *not* mentioned in Program Spec §3's reuse map: `tabatha-mobile` (React Native/Expo, Android-first, "All Phases Complete (1-6)" per its own AGENTS.md) and `tabatha-mobile-2` (native Android). `tabatha-mobile/FEATURES.md` shows real shipped work — app-usage tracking via `UsageStatsManager`, a ported categorizer, local-first SQLite, timeclock, Supabase + LAN sync, phone-call intelligence — but **no screenshot or audio capture**. That is app-usage/clock parity with the desktop companion, a different and already-advanced track. C13's mobile ask is specifically the *capture surface* (screenshots + mic audio feeding the Cortex ledger), which is genuinely unbuilt anywhere. When C13 mobile work starts, it should **extend `tabatha-mobile`'s existing foreground-service + sync architecture**, not stand up a third mobile app.
- **Cross-signal note:** phone call/text reply-latency signals (used for human-vs-agent attention attribution) are C11's concern, not C13's — C11 already has a head start via `tabatha-mobile`'s shipped `TelecomManager`/`CallLog` tracking. C13 mobile is strictly the screenshot+audio capture surface.

### 3. PC-first constraint (both sub-clusters)
- **Desktop companion (`tabatha-desktop`, Rust/Tauri) is PC-only today.** Program Spec §3 and the AGENTS.md session log confirm Win32-API-based window/activity monitoring (`window_monitor.rs`) — there is no Mac build. Desk-camera capture needs OS-level camera device access, so it depends on the companion and inherits this constraint *more strictly* than plain screen capture (a browser-only fallback for camera access does not exist — `getUserMedia` in-extension is a possible interim path but was not scoped in the source dumps and is not assumed here).
- **Browser extension (Chrome MV3) already supports PC+Mac** — Chrome itself is cross-platform — but that only covers screenshot capture of browser tabs, not the desk camera.
- **Mac parity is explicitly deferred.** Dump 1: "we are prioritizing PC... but ultimately we want to account for both PC and Mac." No Mac companion work is scoped anywhere in Phase 1–5; this is a standing gap, not a Phase-5 deliverable.

## Data model touchpoints

- **Camera frames are NOT plain observations.** `observationLedger.normalizeObservation()` (verified, `src/utils/observationLedger.js`) derives `kind` from `captureRef`/`host`/`app` — none of which exist for a desk-cam frame. C13 needs either (a) a new `kind: 'ergonomic'` + `surface: 'camera'` branch in the normalizer, or (b) a distinct summary artifact (e.g. `cortex_ergonomic_reports`, one row per completed observation window with the derived findings, not per-frame) rather than flooding the ledger with thousands of posture frames. (b) is recommended — it matches "discard after feature extraction" above and keeps the ledger about *behavior*, not raw sensor readings.
- **`cortex_capture_refs.surface` (migration 022, verified `supabase/migrations/022_cortex_ledger.sql` line 48) is currently `'browser' | 'os'`.** A `'camera'` (and later `'mobile'`) value needs a follow-up migration (023+) before any camera/mobile capture-ref can be written — this table is not yet camera/mobile-ready.
- **Mobile ledger entries** would need a `surface: 'mobile'` value in the same enum, plus a `browser_profile_id`-equivalent device identifier so mobile observations partition correctly per install (mirrors migration 017's `local_id`/`machine_id` pattern used for desktop ghost-stint reconciliation — same shape, new device class).
- **Retention (C3) needs a camera-specific default shorter than `captureRetention.personal.maxAgeDays` (currently 30d, verified `src/background/constants.js` line 57)** — biometric-adjacent imagery of a person's face/body warrants tighter defaults than screenshot text. No default is set today; this is a genuine open question (see below), not an oversight to silently inherit the screenshot default for.

## Dependencies

**Depends on:**
- **C1 (Adaptive Capture Engine)** — camera cadence reuses the dwell/min-gap decision shape (`decideCapture`, verified `src/utils/captureDecision.js`), with a new event type (e.g. `'camera-tick'`) and an added bounded-window state (`observationWindowEndsAt`) that C1's decision core doesn't currently model.
- **C2 (Sensitive-Data Guard)** — redaction extends from "region of a tab" to "region of a camera frame"; suppression extends from "which app/host is focused" to potentially "is anyone else visible in frame" (not scoped, flagged below).
- **C3 (Storage & Retention Fabric)** — camera/mobile capture needs its own retention entry, shortest-lived by default; mobile inherits the existing personal/org partition model wholesale.
- **C4 (Observations Ledger)** — both surfaces normalize through the same ledger, pending the schema extension above.
- **C5 (Pattern Engine)** — the "sample only when needed" vision-on-demand philosophy is the direct template for not running vision inference on every single desk-cam frame.
- **C7 (Recommendation & Action Layer)** — ergonomic findings are delivered as dashboard recommendations, not a bespoke UI.

**Feeds:**
- **C14 (Agent Data Map)** — camera and mobile are new capture surfaces; per C14's own rule, DATA-MAP.md gets a new row (source/storage/partition/retention/redaction/access) the moment either sub-cluster starts implementation — this is a hard gate, not a nice-to-have.
- **C15 (Config & Interaction-Density Model)** — camera cadence, observation-window length, camera-specific redaction toggles, and the mobile-capture master switch all become new dials in the unified config surface; none exist in `DEFAULT_SETTINGS` today.
- **C11 (Cross-Signal Attention Accounting)** — benefits opportunistically from `tabatha-mobile`'s already-shipped call/telecom tracking, independent of whether C13's own mobile screenshot/audio work has landed.

## Reuse points (VERIFIED paths)

- `src/utils/captureDecision.js` — `decideCapture()` / `captureSurface()` — the pattern to extend for camera timing and (eventually) a `'mobile'` capture surface value. **Verified**, read in full.
- `src/utils/sensitiveDataGuard.js` — `evaluateCapture()` / `matchesTarget()` — the redaction/suppression matcher shape; camera redaction needs new `when` predicates this file doesn't yet support (not a host/appName match). **Verified**.
- `src/utils/observationLedger.js` — `normalizeObservation()` / `partitionOf()` — needs the `kind`/`surface` extension described above. **Verified**.
- `src/utils/retentionPolicy.js` — `planRetention()` — already partition + age + space generic; camera/mobile just add new policy entries, no core logic change needed. **Verified**.
- `src/background/services/captureService.js` — `captureNow()`'s `TODO(T4)` marks exactly where real frame I/O plugs in; camera capture is a **companion-side** capability (OS device access), not extension-side, so this file's role for C13 is limited to receiving results, not driving capture. **Verified**.
- `src/background/services/companionService.js` (`companionBridge`) — `getConnectionStatus()`, `sendClockEvent()`, `heartbeat()` — the WS bridge shape ergonomic-report events would ride into the extension. **Verified** (exports only; full event-handling logic not read in this pass).
- `tabatha-desktop/src-tauri/src/window_monitor.rs` — cited in Program Spec §3 as the Win32-API pattern the companion would extend for camera device access (e.g. a new `desk_camera.rs`). **NOT verified in this session** — file existence confirmed only via directory listing (`tabatha-desktop/src-tauri/src/` contains `window_monitor.rs`, `activity_log.rs`, `categorizer.rs`, `ws_server.rs`, `main.rs`), contents not opened.
- `tabatha-mobile/` (sibling repo, `C:\Users\mrmal\le dev\tabatha-mobile`) — **verified to exist** via `FEATURES.md` and `AGENTS.md`: React Native/Expo, Android-first, shipped app-usage tracking + SQLite + Supabase/LAN sync + phone-call intelligence. The correct extension point for C13 mobile capture work. **Not in Program Spec §3 reuse map — flagged as a gap.**
- `tabatha-mobile-2/` (sibling repo) — native Android variant, exists per directory listing (`AI_STUDIO_INSTRUCTIONS.md`, `DESIGN_ADDENDUM.md`, `FEATURE_AUDIT_V6.md`). **Contents not read this session** — noted for completeness; unclear how it relates to `tabatha-mobile` (fork vs. rewrite vs. parallel track). Flag for whoever picks up C13 mobile work to reconcile which repo is canonical before building.

## Open questions

1. **Two independent sub-clusters under one Phase-5 bucket.** Desk-camera and mobile-capture have no shared dependency on each other — should they ship on separate timelines instead of both being gated to Phase 5? (Desk-cam only needs the PC companion; mobile needs an entirely separate app.)
2. **Camera retention default.** No default exists. Recommend shorter than the 30-day personal screenshot default, but the exact number is a privacy-policy call, not an engineering one.
3. **`tabatha-mobile` vs `tabatha-mobile-2` — which is canonical?** Both exist; this spec assumes `tabatha-mobile` (further along per its own status) but this needs confirmation before any C13 mobile work starts.
4. **In-frame third-party suppression.** If someone else (a partner, coworker, child) walks into the desk-cam frame, does C2's per-site/app suppression model extend to "another person detected"? Not scoped in any source dump — likely needs its own privacy design pass, not silently inherited.
5. **Camera capture surface for Mac interim.** Is a browser-based `getUserMedia` capture (extension-only, no companion) an acceptable interim for Mac users before a Mac companion exists, or does desk-cam wait entirely on Mac companion parity? Not addressed in source material.
6. **Should mobile audio capture reuse C9's dictation engine** (WhisperFlow-style, Phase 3) rather than building a separate mobile audio pipeline? Plausible reuse, not yet decided.

## Phase & rollout

Phase 5 (program spec §8), after C11 cross-signal accounting and Mac parity groundwork. Both sub-clusters are gated behind Phase 1–4 landing first (C1–C4 capture/ledger/retention core, C7 dashboard, C9 voice/dictation engine as a plausible mobile-audio dependency). No implementation work should start on either sub-cluster before C14's DATA-MAP.md has rows ready to receive the new surfaces (governance gate, see C14 dependency above).
