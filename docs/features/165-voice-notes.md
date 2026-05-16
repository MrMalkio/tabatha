# Feature #165 — Voice Notes (Universal Capture)

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** #114 Voice Notes & Recordings, #154 Notes Panel  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Voice notes — From anywhere."
> — User, 2026-05-14

## What It Does

Capture voice notes from **any surface** — browser extension, desktop companion, mobile app — and have them appear in the unified Notes Panel (#154). Voice notes are recorded, optionally transcribed, and linkable to any Tabatha object (focus, intent, task, HeadBox).

## Capture Points

| Surface | Method |
|---------|--------|
| Browser (InBar) | Microphone button → record → transcribe |
| Browser (Sidebar/Home) | Notes Panel voice capture button |
| Desktop Companion | System tray → "Voice Note" or global hotkey |
| Mobile App | Quick-capture widget / shake-to-record |
| Hotkey (#112) | Global shortcut opens voice capture overlay |

## Implementation Notes

- Use Web Audio API / `MediaRecorder` for browser capture
- Store audio as blob in IndexedDB or Supabase Storage
- Transcription: Web Speech API (free, on-device) or Whisper API (opt-in, better accuracy)
- Voice notes appear in Notes Panel (#154) with audio player + transcript
- AI-as-Enhancement (#125): transcription is the AI layer; raw audio always works without it

## Open Questions

- Max recording length? (30s quick note vs. 5-min memo)
- Should voice notes auto-tag based on current focus context?
- Offline recording → sync when back online?
