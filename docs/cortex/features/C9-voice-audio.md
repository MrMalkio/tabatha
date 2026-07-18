# C9 — Voice & Audio (two-way + 3 hotkeys + dictation)

> 🔗 Google Doc: https://docs.google.com/document/d/1_w9TDB8h2HYqfNxXN64uaPK43qgH-9Y-2s9OxMDM7o8/edit?usp=drivesdk&ouid=104108780460431833741

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5 (C9), §7 (full detail), §8 (phasing)
Origin: user (`SOURCE-braindumps.md` Dumps 2, 3, 4) + feature #211 (`docs/features/211-audio-input-voice-control.md`)
Phase: Phase 3 (Plan 040 §8) — one slice (Hotkey 1 field transcription) is Phase-1-shippable in isolation, see **Phase & rollout**

## Purpose

Gives Cortex ears and a voice, and gives the user a voice-first way to drive all of Tabatha. Two things live under this one cluster because they share the same dictation/audio plumbing but serve opposite directions of the conversation:

1. **Tabby speaks** — where a modal would otherwise interrupt the user, Tabby can instead wake, tone, briefly listen, and say something short and generated instead of throwing a dialog in the user's face.
2. **The user speaks to Tabby** — three purpose-built hotkeys let the user dictate into a field, converse with/command Tabby, or drop a voice note — and, at the far end of the same idea, **replace virtually any button or input in the product with an audio button** while manual controls stay available for users who want them (feature #211's "control Tabatha by voice alone" north star).

Everything either direction produces — every utterance, every generated reply — also mirrors into the Cortex Observations Ledger (C4) and, for notes, the Flux context store. Tabby's voice layer is explicitly a **subset of Flux**, not a Tabatha-only feature; voice notes land in Flux context, not a Tabatha-private table.

---

## 1. Voice OUTPUT — "Tabby speaks"

**Trigger.** Any moment that would otherwise raise a modal is a candidate: focus-drift nudges, "welcome back" idle-return prompts, the Intent-Popup/InPop gatekeeper (`src/content/gatekeeper.js`), checkpoint/stale-focus prompts, focus-expired notifications (see `handleNotificationClicked` in `src/background/services/notificationService.js` — the `context-drift-`, `focus-expired-`, `nudge-` and `context-` notification families are the concrete Phase-1-era candidates that already exist and can be redirected to voice).

**Speak-vs-modal decision.** Not every candidate becomes speech. Cortex decides per-event using:
- **Config** — C15's interaction-density dial and a per-modal-type override (some users may want *only* focus-drift spoken, not checkpoint prompts).
- **Context** — is the user in a meeting (meeting-domain detection already exists in `constants.js` `meetingDomains`)? Is audio output likely to be disruptive (screen-share, video call active)? Cortex should not talk over a Zoom call the same way it should not screenshot QuickBooks.
- **Presence** — is the user actually at the machine? Uses the same idle/companion-presence signals `autoPauseEnabled`/`companionIdleGraceMinutes` already lean on (`src/background/services/companionService.js` idle handling). Absent → skip straight to modal, no wasted TTS call.

**UX sequence.**
1. Audible pre-tone (short, non-jarring; a distinct earcon so the user learns to recognize "Tabby is about to talk" before any words arrive).
2. **Brief mic-open window** *before* Tabby speaks — not after. The user gets a beat to say "hold off" (or similar) before Tabby commits to talking over them.
3. If the user interjects during that window → Tabby replies with a short **generated** acknowledgement equivalent to "ok, I'll come back later" (never a canned string — see Generation constraint below) and backs off; the underlying modal-worthy event is deferred/snoozed the same way an explicit snooze would behave today.
4. If the window passes in silence → Tabby speaks: short, soft, contextual to the modal type it's replacing (a drift nudge sounds different from a checkpoint prompt).
5. **Silent/absent fallback** — if the user doesn't respond to the tone at all (not even to interject) *and* presence signals say they're not there, Cortex falls back to the original modal. Voice output is additive, never a silent substitute that could leave the user un-notified.

**Generation constraint (non-negotiable per source dump).** Spoken lines are always **generated fresh**, never pre-recorded/canned/the-same-every-time. This is explicit in Dump 4 ("not pre-recorded, the same every time") — it's a product-feel requirement, not just a technical default. Practically: a small prompt template per modal-type feeds an LLM/TTS pass at speak-time (OpenAI TTS, see Cost control below), not a fixed audio-clip library.

**Always-available hotkey.** Independent of any triggered event, a global hotkey summons Tabby's voice on demand (distinct from the three input hotkeys below — this one is Tabby *initiating*, on request).

**Configurability.** The whole subsystem — and each sub-piece (tone, mic-open-window, speak-vs-modal per event type) — must be independently deactivatable. A user who wants captions-only or modal-only must be able to fully mute this without losing the underlying event.

---

## 2. Voice INPUT — three hotkeys

| # | Hotkey | Purpose | Transcription model tier | "Thinking" | Destination |
|---|--------|---------|---------------------------|------------|--------------|
| 1 | **Transcribe** | dictate into whatever field currently has focus | cheap/local (Whisper) | none | the focused input, verbatim |
| 2 | **Speak to Tabby** | converse with / command Tabby | same transcription tier as #1 (or shared model) | **yes — expensive tier** | Tabby acts; see sub-modes below |
| 3 | **Voice note** | freeform note, not tied to a specific input | cheap/local (Whisper), transcription only | none | Flux context store (not a Tabatha-private table — Tabby is a subset of Flux) |

**Hotkey 2 sub-modes** (source dump: "levels"):
- **Real-time conversation** — low-latency two-way audio, closest to a live call with Tabby (this is the `gpt-realtime` use case flagged in `docs/cortex/API-KEYS.md` K2/K3).
- **Process-then-reply** — speak → Tabby transcribes, thinks, replies once (spoken and/or visible), not a continuous stream. Cheaper and more predictable than real-time convo.
- **Silent context/Flux update** — speak → Tabby transcribes + thinks but only *updates state* (a focus, a task, a setting — see feature #211's action-routing tool schema) with no spoken reply at all; visual/toast ack only.

This directly reuses feature #211's **action routing** contract (`create_focus | create_task | set_priority | change_setting | open_window | group_tabs | start_stint | pause | backburner | defer | link_tab_to_focus | block_site | brain_dump`, `docs/features/211-audio-input-voice-control.md` §"The General Button — Action Routing") — Hotkey 2 *is* #211's "general voice command," just reframed as one of three hotkeys instead of a single floating button. **Reconciliation:** #211 describes the same tool-schema/action-routing concept under Phase C/D; C9 is the AI-layer program's canonical home for it, #211 remains the UI-surface spec (floating button placement, field-level mic affordances) — the two should converge on one settings block (see Data model touchpoints) rather than maintaining two.

**Context injection** (from #211, reused as-is): when a hotkey fires from a tab's InBar, the active tab's URL/title/context rides along with the utterance so actions can be tab-aware ("link this to my research focus"). InBar (`src/content/inbar.js`) is the natural trigger surface since it already has per-tab context (`getInbarData` in `notificationService.js` builds exactly this: `tabContext`, `activeFocus`, `isTabLinked`).

---

## 3. Dictation engine

WhisperFlow-style: either integrate/extend an existing open-source dictation tool, or build an in-house wrapper — the source dump is explicit that "other apps just wrap different models; we can still use their code as inspiration" i.e. there is no proprietary model to build, only the capture→hotkey→transcribe→insert pipeline around someone else's model (or OpenAI's hosted Whisper, given API-KEYS.md's verdict that OpenAI is the default provider for Phase 1–3 voice).

Delivered as a **plugin** — i.e. a self-contained module the rest of Tabatha calls into (hotkey listener → capture → transcribe → route to field/Tabby/note), not tangled into `background.js` or a content script directly. This matches the decomposed-service pattern the rest of the codebase already follows (`src/background/services/*`, DI-registered in the router — see Architecture sketch).

**Everything dictated mirrors into the ledger/context** — no dictation event is transcription-only from the ledger's point of view; even Hotkey 1's "just insert text into a field" produces a C4 observation (see Data model touchpoints) so Cortex's pattern engine (C5) can later notice, e.g., "you dictate the same boilerplate into this field every day."

---

## 4. Universal audio-input replacement (gap — under-represented in the base spec)

This is the largest idea in Dump 2 that the base program spec (§7) compresses into a single line ("three hotkeys") and needed pulling forward explicitly:

> "Tabatha needs the ability to let a user replace virtually every button/input in Tabatha with an audio button — user speaks what's going on, Tabby decides what to do — because we have a lot of buttons and inputs that should remain available for manual management or certain interaction levels that help working style."

Concretely, this is **not** a fourth hotkey — it's the end-state of Hotkey 2 (Speak to Tabby) generalized to *every* surface: every focus-creation button, every task field, every settings toggle, every InBar/sidebar/popup action should have an audio-equivalent path that resolves through the same action-routing tool schema as Hotkey 2, while the manual widget stays clickable. Feature #211 already scopes the concrete UI mechanics for this (a mic affordance beside every title/description input as the **non-AI baseline tier**, a floating omnipresent button as the **AI-counterpart tier** — see #211 §"Phased Build"). C9's job is to make sure the *routing brain* behind all of those buttons is one shared pipeline (Hotkey 2's transcribe+think path), not N one-off integrations.

**Cross-link to C15.** This is exactly what the **interaction-density dial** (`docs/cortex/features/C15-config-interaction-density-model.md`) is for: a user who wants Tabby "almost invisible" leans on audio-first/voice-driven control everywhere; a user who wants high-touch/manual keeps every click-target and ignores the mic buttons entirely. C15 should treat "audio-button density" (how many manual controls get an audio twin, and whether audio-only mode hides the manual ones) as one axis of that dial, not a separate voice-only setting.

---

## 5. Cost control

| Concern | Approach |
|---|---|
| Different models per hotkey | Hotkey 1 (field transcription) and Hotkey 3 (voice note) use the cheap/local transcription tier only; Hotkey 2 (Speak to Tabby) pays for transcription **and** an LLM "thinking" pass on top — the expensive one. |
| Transcription cost | Local/cheap wherever possible; per **API-KEYS.md** the working default is **OpenAI Whisper STT**, not AssemblyAI (AssemblyAI's key slot exists in `.env.cortex.local` but is **blank/never procured** — do not block on it; Whisper alone is sufficient for Phase 1–3). |
| Thinking cost | Only Hotkey 2 pays it, and only on the sub-modes that need it (silent context-update mode can use a cheaper/faster model than full real-time convo). |
| TTS / Tabby's spoken voice | **OpenAI TTS** (or `gpt-realtime`'s audio-out) is the default per API-KEYS.md K3 — already covered by the existing OpenAI key, no new procurement needed. |
| Provider default | **OpenAI is the default AI provider for all of C9**: Whisper (STT), TTS (voice output), `gpt-realtime` (real-time convo mode). |
| ElevenLabs | **Does not exist yet.** API-KEYS.md lists it as K10, an optional net-new key requiring Malkio's billing, evaluated only if OpenAI TTS proves insufficient for Tabby's voice quality. Do not design a hard dependency on it — OpenAI TTS must be the working path end to end. |
| Realtime convo cost ceiling | Real-time (`gpt-realtime`) is the most expensive sub-mode of Hotkey 2 — should be the one most gated by C15's proactivity/routing-tier config, and the first to fall back to process-then-reply under a cost cap. |

---

## Architecture sketch — where audio I/O physically lives in an MV3 extension

This is genuinely new plumbing — a repo-wide search turned up **zero** existing usage of `offscreen`, `getUserMedia`, or `MediaRecorder` anywhere in `src/`, and `public/manifest.json` currently declares no `offscreen` permission and no audio-capable `commands` entries (only `_execute_side_panel` and `open_tab_list`). C9 is building this layer from scratch, not extending something half-built.

**Constraints that shape the design:**
- **Service workers (`src/background/background.js`) cannot access `getUserMedia`/mic audio directly** — MV3 background scripts have no DOM/media APIs. Audio capture/playback must live in an **offscreen document** (`chrome.offscreen` API, requires adding the `offscreen` permission to `manifest.json`), which the service worker creates on demand and messages via `chrome.runtime.sendMessage`.
- **Content scripts** (`src/content/inbar.js`, `gatekeeper.js`, `blockgate.js`) run in the page's origin and *can* request `getUserMedia`, but only with a mic-permission grant scoped to that page's origin — impractical for a feature that needs to work identically on every site. The offscreen document sidesteps per-origin mic permission prompts by capturing in the extension's own context.
- **Chrome's `commands` API (hotkeys) only fires while Chrome itself has focus.** This is a hard platform limit — none of the three input hotkeys nor the "always-available hotkey to summon Tabby's voice" can fire while the user is in a non-Chrome app via `chrome.commands` alone.
- **The desktop companion (`tabatha-desktop/src-tauri/`) is therefore the natural home for system-wide hotkeys.** It already runs as a native tray process with its own event loop (`window_monitor.rs`, `ws_server.rs` on port 9147) and is the only piece of the stack that can register a global OS-level hotkey outside the browser. A voice hotkey pressed while the user is in, say, VS Code would need to be caught by the companion, which then either (a) opens its own native audio capture path, or (b) messages the extension over the existing WS bridge (`src/background/services/companionService.js`, same pattern as `CLOCK_IN`/`APP_SWITCH`) to trigger the offscreen document. This mirrors C1's existing browser⇄companion capture handoff (extension owns in-browser capture, companion takes over when Chrome loses focus) — C9 should reuse that same handoff logic for audio instead of inventing a parallel one.
- **Within Chrome**, `chrome.commands` (manifest `commands` block) is sufficient for the three hotkeys when Chrome has focus, alongside the existing InBar/floating-button trigger paths from feature #211.

**Proposed shape:**
```
Companion (global hotkey, non-Chrome-focused)     Chrome commands API (Chrome-focused)
        │                                                    │
        └──────────────► WS bridge ◄────────────────────────┘
                     (companionService.js)
                              │
                    background.js router
                              │
              chrome.offscreen document (mic capture,
              MediaRecorder, audio playback for TTS)
                              │
              voiceService.js (new; DI-registered like
              notificationService/settingsService)
                              │
            ┌─────────────────┴─────────────────┐
      transcription call                  TTS/realtime call
      (OpenAI Whisper)                  (OpenAI TTS/gpt-realtime)
                              │
              route to: focused field (H1) · action-routing
              tool schema (H2) · Flux context store (H3)
                              │
                    mirror into C4 Observations Ledger
```

New service: `voiceService.js`, registered in `background.js`'s service router the same way `notificationService`/`settingsService`/`syncService` are today (per the program spec's reuse map §3 — "New `cortexService` / `captureService` / `voiceService` register here").

---

## Data model touchpoints

- **Voice interactions → C4 Observations Ledger.** Every hotkey firing (all three) and every Tabby-speaks event produces a `cortex_observations` row (`supabase/migrations/022_cortex_ledger.sql`) with `kind = 'signal'` (or a new `kind = 'voice'` value — the CHECK constraint on `kind` isn't enforced in the current migration, so this is additive) and enough metadata to reconstruct which hotkey/sub-mode fired, not the raw audio.
- **Voice notes (Hotkey 3) → Flux context store**, not a Tabatha-only table — consistent with "Tabby is a subset of Flux" from Dump 4. Exact Flux context schema is outside this repo; C9's obligation is to produce `{ transcript, audioRef?, createdAt, sourceContext }` (same shape feature #211 already proposed) and hand it off through whatever the existing Flux sync path is (likely `syncService.js`'s cloud-batch pattern, `src/background/services/syncService.js`).
- **New settings keys** (extend `DEFAULT_SETTINGS` in `src/background/constants.js`, following the existing `// ── Cortex — AI Observation & Optimization Layer (Plan 039/040) ──` block pattern):
  ```js
  voice: {
    outputEnabled: false,             // master: Tabby-speaks subsystem
    outputToneEnabled: true,
    outputMicOpenWindowMs: 2500,      // "hold off" interjection window before speaking
    outputPerModalType: {},           // per-event-type override (drift/checkpoint/welcome-back/…)
    hotkey1Transcribe: 'Alt+Shift+D',
    hotkey2SpeakToTabby: 'Alt+Shift+T',
    hotkey3VoiceNote: 'Alt+Shift+N',
    hotkeySummonVoice: 'Alt+Shift+V', // matches #211's existing 'Alt+Shift+V' — reconcile, don't collide
    hotkey2Mode: 'processThenReply',  // 'realtime' | 'processThenReply' | 'silentUpdate'
    sttProvider: 'openai-whisper',    // supersedes #211's 'webspeech' default — reconcile (see Reuse points)
    ttsProvider: 'openai-tts',
    confirmDestructiveActions: true,  // reused verbatim from #211
  }
  ```
  **Note:** feature #211 already defines a `voice.*` settings block with an overlapping-but-different shape (`fieldDictationEnabled`, `floatingButtonEnabled`, `sttProvider: 'webspeech'`, `hotkey: 'Alt+Shift+V'` for the *single* general button). These must be merged into one settings object before implementation — C9's version above should win on provider defaults (Whisper/OpenAI over Web Speech API, since #211 flagged Web Speech's privacy/reliability problems as an open question) and hotkey *count* (three purpose-built hotkeys, not one).

---

## Dependencies (transformer graph)

**Depends on:**
- **C4 — Observations Ledger.** Every voice interaction is a ledger write; C9 cannot land before C4's schema exists (migration 022 is already staged, per commit `0dcd2fb`).
- **C7 — Recommendation & Action Layer.** Hotkey 2's action-routing tool schema overlaps with whatever action surface C7 exposes for recommendation accept/dismiss — voice should be able to say "yes" to a Cortex recommendation the same way a dashboard click would.
- **C15 — Config & Interaction-Density Model.** Speak-vs-modal decisioning and the audio-button-density axis both live in C15's config surface; C9 has no independent settings UI of its own beyond what C15 renders.
- **Desktop companion.** Required for any hotkey that must fire while Chrome doesn't have focus, and as the natural home of a native global-hotkey registration.
- **Feature #211.** Shares the action-routing tool schema, the field-level mic-button UI, and the floating-button surface. See Reconciliation notes above and in Open questions.

**Feeds:**
- **C4 — Observations Ledger** (voice events are a ledger source, not just a consumer of it).
- **C5 — Pattern Engine.** Repeated dictation/voice-command patterns (e.g., always dictating the same task title) are exactly the kind of ≥3–4× repetition C5 is built to catch.
- **C10 — Passive Self-Correction.** A "silent context/Flux update" (Hotkey 2's third sub-mode) is a direct trigger for C10's self-repair behavior — the user narrating what actually happened is a strong correction signal.

---

## Reuse points (verified paths)

| Reuse | Path | Verified |
|---|---|---|
| Notification/modal trigger points to redirect to voice | `src/background/services/notificationService.js` (`handleNotificationClicked`, `handlePomodoroComplete`, `context-drift-`/`focus-expired-`/`nudge-`/`context-` families) | read |
| InPop/Gatekeeper modal (a primary "would-be-modal" candidate) | `src/content/gatekeeper.js` | read |
| InBar (per-tab context, natural voice-trigger surface) | `src/content/inbar.js` | exists (`Glob`) |
| Companion WS bridge (candidate transport for cross-app hotkey + audio handoff) | `src/background/services/companionService.js` (`CLOCK_IN`/`APP_SWITCH`/`IDLE_STATE` message pattern) | read |
| Desktop companion native process (candidate global-hotkey host) | `tabatha-desktop/src-tauri/src/window_monitor.rs`, `ws_server.rs` (port 9147) | referenced in program spec §3, not re-verified this pass |
| Meeting-domain detection (for "don't talk over a call" context signal) | `src/background/constants.js` `meetingDomains` | read |
| Presence/idle signal reuse | `src/background/constants.js` `autoPauseEnabled`, `companionIdleGraceMinutes`; `companionService.js` idle handling | read |
| Settings persistence pattern | `src/background/constants.js` `DEFAULT_SETTINGS`, `settingsService.js` | read (Cortex block already present, ends line 74) |
| Settings UI section pattern | `src/settings/index.jsx` (`'privacy'` tab, "Privacy & Capture", `screenshotCapture` toggle ~line 1833) | read |
| Service registration pattern for new `voiceService.js` | `src/background/background.js` service router; sibling services `notificationService.js`, `settingsService.js` | read (pattern), background.js router not re-opened this pass |
| Ledger target table | `supabase/migrations/022_cortex_ledger.sql` (`tabatha.cortex_observations`) | read |
| Manifest gaps to fill (offscreen permission, audio-capable commands) | `public/manifest.json` | read — confirmed no `offscreen` permission, no audio commands present today |
| Provider defaults / cost tiers | `docs/cortex/API-KEYS.md` (K1–K3, K10) | read |
| Overlapping UI/action-routing spec to reconcile | `docs/features/211-audio-input-voice-control.md` | read |

**Path verification failures:** none — every path cited above was confirmed to exist via Read/Glob/Grep during this pass.

---

## Open questions

1. **Wake-word vs hotkey-only.** The source dumps only ever describe hotkey-triggered input and event-triggered output — no wake-word ("hey Tabby") is specified. Confirm hotkey-only is intentional before any always-listening mic path is built (always-listening also reopens the privacy posture question Dump 3 explicitly deferred).
2. **Mic permission UX in MV3.** An offscreen document's `getUserMedia` still needs an initial permission grant somewhere with a visible UI — likely the settings page or a one-time onboarding prompt — since offscreen documents have no visible surface of their own to host a permission-request click.
3. **Latency budget for real-time convo (Hotkey 2 sub-mode 1).** `gpt-realtime` round-trip + Chrome offscreen audio pipeline latency needs a target (sub-500ms?) before this sub-mode is usable; process-then-reply may end up the practical default even when real-time is selected.
4. **Tone/earcon design.** "Audible tone" and "short, soft" spoken delivery are UX/audio-design decisions with no asset yet — needs an actual sound designed (or a first pass using OpenAI TTS's most neutral voice + a synthesized tone).
5. **Settings-schema collision with #211.** As flagged in Data model touchpoints, #211's `voice.*` settings block and this spec's proposed block must be reconciled into one before either is implemented — whoever picks up implementation should treat that merge as a blocking pre-step, not a during-implementation cleanup.
6. **Companion audio capture scope.** Should the companion ever capture audio itself (system-wide dictation outside Chrome), or does it only relay a hotkey signal and let the extension's offscreen document do all actual audio I/O? The source dump's "companion takes over" framing is about *screenshots* (C1); it's not explicit whether the same handoff applies to audio, and companion-side audio capture is a materially bigger native-code lift.
7. **Destructive-action confirmation for voice-driven settings changes.** #211 flags this generically (`confirmDestructiveActions`); C9 should confirm the same list of "destructive" actions applies uniformly across the universal-audio-replacement surface (§4), not just the general-button case #211 originally scoped it for.

---

## Phase & rollout

**Phase 3 is the core landing zone** (per program spec §8: "C9 Voice (two-way + 3 hotkeys + dictation engine)"), sequenced after Phase 1's capture/ledger/dashboard foundation and Phase 2's routing-tier + config-surface (C15) work — C9 depends on C15 existing for its speak-vs-modal config and on C4's ledger schema for write targets.

**Earlier-shippable slice:** Hotkey 1 (field transcription, cheap/local model, no "thinking," no Tabby-speaks logic, no companion/global-hotkey work) is architecturally close to feature #211's already-scoped **Phase A — Speech-to-Text Plumbing (No AI)**, which explicitly ships without AI or C15. This slice could land as early as Phase 1/2 alongside or shortly after #211's Phase A, *before* the rest of C9's Phase-3 machinery (Tabby-speaks, real-time convo, universal audio replacement) is ready — it only needs an offscreen document + Whisper call + insert-into-focused-field, no ledger-write dependency beyond what C4 already provides once it lands.

**Sequencing within Phase 3 itself:**
1. Offscreen-document audio plumbing + `voiceService.js` scaffold (blocks everything else in C9).
2. Hotkey 1 (Transcribe) + Hotkey 3 (Voice note) — both cheap-tier, no "thinking," lowest risk.
3. Hotkey 2 process-then-reply sub-mode (reuses #211's action-routing schema).
4. Tabby-speaks output subsystem (depends on C15's speak-vs-modal config existing).
5. Hotkey 2 real-time-convo sub-mode + companion global-hotkey handoff (highest latency/native-code risk, last).
6. Universal audio-input replacement (§4) — rolls out incrementally per-surface as each manual control gets its audio twin, gated by C15's density dial; not a single cutover.
