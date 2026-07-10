# Decision — Unified voice settings schema (C9 ⇄ feature #211)

- **Status:** decided (Fable, 2026-07-10) — implements Plan 042 T0. Revisit only if Malkio objects.
- **Collision:** `docs/features/211-audio-input-voice-control.md` §"Settings" defines `voice.{hotkey: 'Alt+Shift+V', sttProvider: 'webspeech'|'service'}` (one hotkey, webspeech default). C9 (`docs/cortex/features/C9-voice-audio.md`) defines three hotkeys with per-hotkey model tiers and OpenAI Whisper defaults.

## Decision
One `voice` settings block that treats **#211 as the shipped substrate and C9 as the superset**:

```js
voice: {
  enabled: false,                       // master opt-in (C15 density dial gates surfaces)
  hotkeys: {
    transcribe: 'Alt+Shift+T',          // C9 hotkey 1 — field dictation (pure, no interpretation)
    speak:      'Alt+Shift+V',          // C9 hotkey 2 — keeps #211's binding (its single hotkey maps here)
    note:       'Alt+Shift+N'           // C9 hotkey 3 — voice note → Flux context
  },
  stt: {                                // per-hotkey provider tier (C9 cost control)
    transcribe: 'webspeech',            // free/local; the shipped VoiceInput.jsx path
    speak:      'webspeech',            // auto-upgrades to 'routed' when a C8 routing tier is configured
    note:       'webspeech'
  },                                    // values: 'webspeech' | 'routed' (C8 tier ①–④ decides the actual provider)
  speakMode: 'process-then-reply',      // 'realtime' | 'process-then-reply' | 'silent-update'
  output: {                             // "Tabby speaks" (C9 §output)
    enabled: false,
    toneBeforeSpeak: true,
    micPreOpenMs: 1500,                 // "hold off" interjection window
    modalFallback: true,                // silent/absent user → modal
    perModalType: {}                    // modalType → 'speak' | 'modal' | 'silent'
  },
  floatingButton: false,                // #211 Phase B omnipresent mic button
  mirrorToLedger: true                  // everything dictated also feeds C4 (C9 hard rule)
}
```

## Rationale
1. **No key dependency by default.** `webspeech` stays the default everywhere — the existing `src/components/ui/VoiceInput.jsx` (#211 Phase A) keeps working with zero setup. OpenAI Whisper/TTS/realtime arrive through the C8 routing abstraction (`'routed'`), never as a raw provider name in settings — so BYOK/proxy/gateway changes don't churn this schema.
2. **#211's `sttProvider: 'service'` is renamed `'routed'`** — same meaning, but explicit that C8 owns provider selection.
3. **#211's single `hotkey` maps to `hotkeys.speak`** (same default binding) — no muscle-memory break for the Phase B floating-button/hotkey design.
4. **Superset, not replacement:** #211 Phases A–D remain the delivery vehicle for the input side; C9 adds the output subsystem and the third (note) channel on top.

## Follow-ups
- Plan 042 T1+ implements against this schema; `DEFAULT_SETTINGS` gets the block when Phase 3 starts (not before — avoid dead config).
- `VoiceInput.jsx` migrates to read `voice.stt.transcribe` when the block lands; until then it stays hardcoded webspeech.
- C9 + #211 docs should point here (added to C9's Open Questions resolution on next doc pass).
