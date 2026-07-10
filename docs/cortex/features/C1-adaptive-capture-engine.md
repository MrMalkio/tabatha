# C1 — Adaptive Capture Engine

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: video V1; user-expanded (SOURCE-braindumps.md Dump 1, Dump 3)
Phase: Phase 1 (T1–T3 shipped; T4 pixel I/O is the next increment)

## Purpose

C1 is the SENSE layer's capture brain: it decides **when** a frame is worth taking and **which
surface** (browser extension vs desktop companion) takes it, so Tabatha never blindly grabs a
screenshot every N seconds and never captures the same moment twice. It reuses the context
Tabatha already tracks — tab/window/app/focus/intent changes, idle state — as the primary
trigger, with a configurable dwell interval as a fallback for long, static sessions. Because a
user's desktop is not one uniform frame (multiple monitors, mismatched aspect ratios, ultrawide +
portrait combos), C1 also owns *what shape* a capture takes: full desktop, one image per screen,
or a single isolated window — so downstream vision models get a frame they can actually
interpret instead of a confusing composite.

## Detailed behaviors

**Timing (context-driven, not blind interval)**
1. A capture is triggered by a context change — tab activation, window focus change, OS app
   switch, Tabatha focus change, or intent change — via `decideCapture()` in
   `src/utils/captureDecision.js`.
2. A `minGapMs` floor (default 2s, `captureMinGapSeconds`) prevents thrash when context changes
   rapidly (e.g. alt-tabbing); a context-change within the floor is silently skipped, not queued.
3. While the user dwells in one context (no context change), a `dwellIntervalMs` fallback
   (default 10s, `captureDwellSeconds`) fires periodic refresh captures so long, static sessions
   (reading, watching, a single long doc edit) still get frames. `captureOnContextChange` can
   disable the context-change trigger entirely, leaving pure dwell-interval polling.
4. Both intervals are user-configurable (Settings → Privacy & Capture, C15 surfaces the controls).

**Browser⇄companion handoff (no double capture)**
5. `captureSurface({ chromeFocused, idle })` in `captureDecision.js` is the single source of
   truth for who owns capture at any instant: `'browser'` when Chrome is focused, `'os'`
   (companion) when it is not, `'none'` when idle. Exactly one surface is ever active.
6. The browser extension captures the **visible tab** on tab-switch and on the dwell tick, using
   `chrome.tabs.captureVisibleTab` (not yet wired — see Open Questions / T4).
7. The desktop companion already emits `chromeFocused` / `chromeBlurred` events
   (`companionService.js` `_handleAppSwitch`, checking `app_name === 'chrome.exe'`) whenever
   `window_monitor.rs` reports an app switch. C1's handoff decision consumes those same events —
   no new companion signal is required, only a consumer that calls `captureSurface()` on each
   event and starts/stops the appropriate capture loop.
8. When idle (Chrome idle API or companion `IDLE_STATE`), neither surface captures — this mirrors
   the existing idle-suppression logic already used by the Smart Idle Engine
   (`companionBridge.isRecentlyActive`).

**Multi-monitor / aspect-ratio aware capture**
9. Three configurable capture *modes*, selectable in settings and per-org policy:
   - **Full virtual desktop** — one image spanning all screens (companion-only; Chrome APIs
     cannot address OS screen geometry).
   - **Per-screen, separate images at the same timestamp** — each physical monitor captured as
     its own image, all stamped with one shared `captured_at`, so downstream consumers can
     reconstruct "what was on every screen at time T" without stitching a composite.
   - **Specific window in isolation** — capture only the window that has focus (this is what the
     browser extension always does via `captureVisibleTab`; the companion can do the OS-level
     equivalent for any foreground window).
10. Rationale (verbatim intent, Dump 3): with an ultrawide monitor next to a monitor of a
    different aspect ratio, a single full-desktop screenshot is geometrically inconsistent and
    "the agent may not know the layout" — a vision model fed one warped composite frame
    mis-reads element positions and proportions. Per-screen or per-window capture avoids this by
    construction; C1 defaults to per-window/per-screen over full-desktop for this reason.
11. Screen/window enumeration is **companion-only** work (Win32 APIs, `window_monitor.rs`); the
    extension has no way to see OS monitor geometry, so "per-screen" and "full virtual desktop"
    modes only apply when the companion owns capture. Browser-owned capture is always
    single-tab/window by construction.

**Manual screen + audio recording**
12. On-demand video recording with system audio and mic, invokable from either surface:
    - **Extension** — `getDisplayMedia()` (screen/tab + optional system audio) combined with
      `getUserMedia()` (mic), or `chrome.tabCapture` for tab-scoped capture.
    - **Companion** — OS-level screen + system audio + mic capture (Rust, Windows first).
13. Manual recordings are tagged `kind: 'recording'` in the ledger (vs `kind: 'capture'` for
    stills) but flow through the **same** storage/retention/redaction pipeline as screenshots —
    see C2 behavior 15 for the (currently unimplemented) requirement that a recording must
    re-evaluate the Sensitive-Data Guard as focus changes mid-recording, not just at start.
14. PC is the priority target for both companion capture and manual recording; **the browser
    extension itself already runs on Mac today** (Tabatha's extension is cross-platform), but the
    companion — and therefore all OS-side handoff, screen enumeration, and manual OS recording —
    is Windows-only. This is an explicit asymmetry the program spec does not currently state: a
    Mac user gets *only* browser-tab capture and silently loses coverage the instant Chrome loses
    focus, rather than getting a companion handoff. Product needs to decide whether that gap is
    surfaced to Mac users or accepted silently for Phase 1–2.

**Rate limits & throttling**
15. `chrome.tabs.captureVisibleTab` has an undocumented per-second call quota
    (`MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`, historically ~2/s per window); `minGapMs` must
    stay at or above whatever the effective quota is, or captures will throw/silently no-op.
16. DRM/protected video (Netflix etc.) returns a black frame from `captureVisibleTab` — C1 should
    detect and log this as `reason: 'protected-content'`, not count it as a successful capture.

## Data model touchpoints

| Key / table | Location | Notes |
|---|---|---|
| `settings.screenshotCapture` | `chrome.storage` via `settingsService` | Master enable gate (was inert; now read by `captureService.isEnabled`) |
| `settings.captureDwellSeconds`, `captureMinGapSeconds`, `captureOnContextChange` | `constants.js` `DEFAULT_SETTINGS` (~L51–53) | Feed `captureConfig()` in `captureService.js` |
| `settings.captureStoragePath` | `constants.js` (~L54) | Local-first target path; C3 owns actual write |
| `settings.captureRetention.{personal,org}.maxAgeDays` | `constants.js` (~L56–59) | Consumed by C3's `planRetention()`, not C1 |
| `cortexLedger` | `chrome.storage.local`, capped FIFO | Every capture attempt (success or context-only) appends one normalized observation via `recordObservation()` |
| `cortexCaptureState` | `chrome.storage.local` | `{ lastCaptureAt, lastContextKey }` — the running state `decideCapture()` needs |
| `tabatha.cortex_capture_refs` | `supabase/migrations/022_cortex_ledger.sql` | `screen_index` (multi-monitor), `surface`, `storage_uri`, `bytes` — cloud-batch mirror only, opt-in |
| `tabatha.cortex_observations` | same migration | `capture_ref` FK, nullable — context-only observations (no frame) still get a row |

**Local vs syncs:** raw pixels/video never leave the device by default. Only capture *references*
(path/URI, screen index, redaction/suppression booleans, byte size) sync to
`cortex_capture_refs` when the user opts into cloud-batch backup (program spec §6 rule 3).

## Dependencies (transformer graph)

**Depends on:**
- **C2 (Sensitive-Data Guard)** — every capture path (still or recording) must pass through
  `evaluateCapture()` before a frame is written; C1 never persists ungated.
- **C15 (Config & Interaction-Density Model)** — surfaces dwell/gap/mode/toggle controls in
  Settings; C1 only reads the resulting values.
- **C11 (Cross-Signal Attention Accounting)** — the companion's `chromeFocused`/`chromeBlurred`
  and idle signals that drive the handoff decision originate here.

**Feeds:**
- **C3 (Storage & Retention Fabric)** — every accepted frame/recording is a write target for C3's
  local-first storage and eventual archive/retention.
- **C4 (Observations Ledger)** — every capture attempt (accepted, redacted, or suppressed)
  produces a normalized ledger record.
- **C5 (Pattern Engine)** — vision-on-demand sampling reads `captureRef`s C1 produced.
- **C9 (Voice/Audio)** — manual recording shares the same `getUserMedia`/mic-permission plumbing
  the voice hotkeys will need; should be built as one shared capture-permission layer, not two.

## Reuse points

| File (verified) | Reused for |
|---|---|
| `src/utils/captureDecision.js` | `decideCapture()` (timing), `captureSurface()` (handoff) — pure, unit-tested |
| `src/background/services/captureService.js` | Chrome-facing shell: enable gate, `CAPTURE_NOW` guarded entrypoint, ledger writes |
| `src/background/services/companionService.js` | `companionBridge` — `chromeFocused`/`chromeBlurred` events (L282–290), `isRecentlyActive()`, WS send/receive channel for T4 frame handoff |
| `src/background/services/storageService.js` | `getStorage`/`setStorage`/`getSettings` primitives `captureService` builds on |
| `src/background/constants.js` (~L48–61) | `DEFAULT_SETTINGS` capture keys |
| `src/settings/index.jsx` (L101, L1829–1837) | "Privacy & Capture" panel; `screenshotCapture` toggle already wired to `updateSetting` |
| `public/manifest.json` | Current permissions (`tabs`, `downloads`, `activeTab`, …) — **`tabCapture`/`desktopCapture` NOT yet present**, see Open Questions |
| `C:\Users\mrmal\Le Dev\tabatha-desktop\src-tauri\src\window_monitor.rs` | Active-window poll (Win32) — companion-side capture trigger + screen/window enumeration target |
| `C:\Users\mrmal\Le Dev\tabatha-desktop\src-tauri\src\ws_server.rs` | Existing WS channel (`:9147`) — reused for browser⇄companion handoff signal and (T4) frame-write handoff |
| `C:\Users\mrmal\Le Dev\tabatha-desktop\src-tauri\src\categorizer.rs` | App→category enrichment already available for capture context labeling |

All companion paths verified present under `C:\Users\mrmal\Le Dev\tabatha-desktop\src-tauri\src\`.

## What's already built (Phase 1 T1–T3)

- `src/utils/captureDecision.js` — `decideCapture()` + `captureSurface()`, fully pure, tested in
  `test/captureDecision.test.js`.
- `src/background/services/captureService.js` — `captureNow()` orchestrates enable-gate →
  `decideCapture` → `evaluateCapture` (C2) → `recordObservation` (C4); registered in
  `background.js` services array (L73 import, L192 registration). The pixel grab itself is a
  `TODO(T4)` comment (L103–104) — no `chrome.tabs.captureVisibleTab` call exists yet anywhere in
  the codebase (verified via repo-wide search).
- `src/utils/observationLedger.js` (C4, consumed here) — `normalizeObservation`/`partitionOf`.
- `constants.js` `DEFAULT_SETTINGS` — all C1 config keys already present and defaulted safe (off).
- `settings/index.jsx` — master toggle wired; **no UI yet** for dwell/gap/mode granular controls
  (those remain a C15 task).
- **Remains (T4):** the actual `chrome.tabs.captureVisibleTab` call and its `dataURL` handling;
  companion-side OS screen/window capture (new Rust capture module, doesn't exist yet — only
  `window_monitor.rs`'s *poll*, not pixel capture, is built); multi-screen enumeration; manual
  recording (`getDisplayMedia`/`tabCapture` — zero recording code exists today); file write path
  (browser→companion handoff vs `chrome.downloads`, see Open Questions); wiring redaction regions
  from C2 into an actual pixel-level blur before write.

## Open questions

- **MV3 file-write constraint:** the extension cannot write to an arbitrary filesystem path.
  Options: (a) hand the captured frame to the companion over the existing WS channel for on-disk
  write (companion already has filesystem access — likely winner, mirrors existing
  request/response pattern), (b) `chrome.downloads` (writes relative to the Downloads folder only,
  triggers a visible download unless `downloads.shelf` behavior is tuned, and doesn't naturally
  support a companion-invisible archive path), (c) OPFS (origin-private, fast, but invisible to
  Explorer/Finder and to the companion — wrong fit for the "configurable path" / Drive-archival
  requirement). Needs a decision before T4 starts.
- **`captureVisibleTab` rate limit** — must confirm the actual current-Chrome quota and set
  `minGapMs`'s effective floor accordingly (see behavior 15).
- **Missing manifest permission** — `public/manifest.json` has no `tabCapture` or
  `desktopCapture` permission today (verified). Adding either forces every existing unpacked
  install to be reloaded/re-approved, which compounds the already-tracked `.pem` persistence
  problem (program spec §12) — worth bundling into the same reinstall event rather than two
  separate ones.
- **DRM/protected content** — `captureVisibleTab` silently returns a black frame; needs explicit
  detection so it isn't miscounted as a successful capture (behavior 16).
- **Screen/window enumeration ownership** — confirmed companion-only (behavior 11); the spec
  should state this explicitly so no one designs a browser-side "capture all screens" path.
- **Mac coverage gap** — flagged in behavior 14; needs an explicit product decision, not just an
  engineering TODO.
- **System-audio capture friction** — `getDisplayMedia`'s "share system audio" prompt is
  re-requested on every manual recording call (no persistent grant on Windows/Chrome); may push
  longer/repeated manual recordings toward companion-side OS audio capture instead.

## Phase & rollout

| Behavior | Phase |
|---|---|
| Context-driven timing, dwell fallback, min-gap (1–4) | Phase 1 (T1 — shipped) |
| Handoff decision logic, companion event consumption (5–8) | Phase 1 (T1 shipped; T4 wires the consumer) |
| Actual pixel capture (browser + companion), file write | Phase 1 T4 |
| Per-screen / full-desktop / per-window capture modes (9–11) | Phase 1 T4 (companion capture module is net-new) |
| Manual screen + audio recording, extension and companion (12–14) | Phase 2 (shares plumbing with C9 Voice, itself Phase 3 — recording can land earlier as a standalone control) |
| Rate-limit throttling, DRM detection (15–16) | Phase 1 T4 (must ship alongside the first real capture call) |
| Mac companion parity | Phase 5 (per program spec §8) |
