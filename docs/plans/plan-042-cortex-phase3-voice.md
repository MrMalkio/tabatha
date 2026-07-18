# Implementation Plan 042: Cortex Phase 3 — Voice, Ears & Passive Self-Correction

> 🔗 Google Doc: https://docs.google.com/document/d/1m0ndVZQxFRdoN9zp_UHyyimWC1g_P57UnjLG3AEkw4M/edit?usp=drivesdk&ouid=104108780460431833741

- **Program:** Tabatha Cortex (Plan 039). Spec: `docs/cortex/00-cortex-program-spec.md` §7/§8 Phase 3.
- **Status:** draft (authored by Fable 2026-07-10; execute after Plan 041).
- **Version:** expected start 7.1.0 → **target 7.2.0**.
- **Clusters:** C9 (voice/audio two-way + 3 hotkeys + dictation), C10 (passive self-correction).
- **Feature specs:** `docs/cortex/features/C9-voice-audio.md` (deep), `C10-passive-self-correction.md`; reconcile with `docs/features/211-audio-input-voice-control.md` — **known settings-schema collision** (#211's `voice.*` block: single hotkey + webspeech default vs C9's three hotkeys + OpenAI Whisper default) must be resolved FIRST.

## Goal
Give Tabby ears and a voice (speak-instead-of-modal, three input hotkeys, dictation engine) and let it silently repair its own records.

## Tasks
1. **T0 — Reconcile #211 ↔ C9 settings schema** (blocking design decision; output = one `voice.*` schema).
2. **T1 — Audio plumbing.** MV3 offscreen document for mic + TTS playback (extension); companion as system-wide hotkey host (chrome.commands only works while Chrome is focused). OpenAI Whisper STT + TTS via the routing tier from C8 (proxy preferred; BYOK fallback).
3. **T2 — Hotkey 1: field transcription** (cheap model; can ship early per C9 spec).
4. **T3 — Hotkey 2: Speak to Tabby** — transcribe + think; sub-modes real-time convo / process-then-reply / silent context update.
5. **T4 — Hotkey 3: voice note → Flux context**; all dictation mirrors into the ledger (C4).
6. **T5 — Tabby speaks.** Modal-interception layer in notificationService: tone → mic-open "hold off" window → short generated line; silent/absent → modal fallback; per-modal-type config (C15).
7. **T6 — Dictation engine decision** (integrate open-source WhisperFlow-style vs own wrapper) + plugin packaging; everything dictated feeds the ledger.
8. **T7 — C10 self-correction v1.** Confidence-laddered corrections (reuse `autoFocusService` CONFIDENCE_ORDER + `activityAuditService` audit/revert): tab↔intent link repair, intent relabel suggestions, actual-time-worked recompute. Passive per density dial; every correction auditable + reversible.
9. **T8 — Universal audio-input groundwork (C9/C15 gap item):** input-registry abstraction so any Tabatha button/input can declare an audio-equivalent handler.

## Test strategy
Pure logic first (`node --test`): correction confidence math, transcript→ledger normalization, speak-vs-modal decision table. Manual: mic permission UX, latency budget for real-time mode, hotkeys inside vs outside Chrome.

## Parallelability Review
- **Zones touched:** Notifications (T5), new offscreen/audio zone (T1–T4, isolated), Focus Engine (T7 — coordinate with any focus work), companion (hotkey host).
- **Shared files:** manifest.json (offscreen permission + commands — one agent only), constants.js (voice settings block).
- **Parallel:** voice track (T1–T6) and self-correction track (T7) are independent → two branches.
- **Max branch lifetime:** 1 week each; T5 modal interception is the riskiest — own branch.
- **Scope-split:** T2 alone is a shippable early sliver.
