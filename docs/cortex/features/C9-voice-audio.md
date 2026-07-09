# C9 — Voice & Audio (two-way + 3 hotkeys + dictation)

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5 (full detail in §7)
Origin: user
Phase: Phase 3

## Purpose
Gives Cortex ears and a voice. Instead of every interruption being a modal, Tabby can wake, tone, listen briefly, and speak a short generated line; and the user can drive Tabby by voice via three purpose-built hotkeys. Everything dictated also feeds the ledger/context.

## Key behaviors
- **Output / "Tabby speaks"** — where a modal would interrupt, Tabby may wake and speak (short, soft, generated, not canned) preceded by an audible tone; mic opens so the user can say "hold off" → "ok, I'll come back later." Silent/absent → modal fallback. Configurable.
- **Hotkey 1 — Transcribe** — dictate into the focused field (cheap/local model).
- **Hotkey 2 — Speak to Tabby** — transcribe + think; sub-modes: real-time convo · process-then-reply · silent context/Flux update.
- **Hotkey 3 — Voice note** — freeform note stored to Flux context (transcription only).
- **Dictation engine** — WhisperFlow-style: integrate/extend an open-source tool or build our own wrapper; different models per hotkey for cost control; all dictation mirrors into the ledger/context.

## Dependencies
- C4 (Observations Ledger) — dictation and voice interactions land here.
- C7 (Recommendation & Action Layer) — voice can accept/act on recommendations.
- C15 (Config & Interaction-Density Model) — speak-vs-modal and hotkey/model config.
- Relates to feature #211 (Audio Input & Voice Control).
