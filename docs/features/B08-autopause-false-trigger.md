# Bug B08 — Autopause Triggers While User Is Active on PC

> **Status:** 🔧 Fixing · **Version:** v0.2.0  
> **Affects:** clockService.js / idle handler, Desktop Companion (#117)  
> **Related:** B05 (idle ignores non-browser activity)  
> **Created:** 2026-05-26

## User Context (Quotes)

> "Autopause should not automatically trigger if user is still using the PC but user can still be prompted to confirm if they are on task or diverging."
> — User, 2026-05-26

## What's Broken

The autopause system treats **browser inactivity** as **user inactivity**. If the user is actively working in VS Code, Figma, or any non-browser app, Tabatha still triggers autopause because it only sees Chrome idle state.

**Related to B05** but distinct: B05 is about idle detection in general. B08 is specifically about autopause being **too aggressive** — and the fix includes a new UX pattern (confirmation prompt instead of auto-trigger).

## Expected Behavior

| Scenario | Current | Expected |
|----------|---------|----------|
| User inactive in Chrome, active in VS Code | Autopause triggers | **No autopause** — user is active |
| User inactive in Chrome, inactive everywhere | Autopause triggers | Autopause triggers (correct) |
| User active in Chrome but on unrelated site | No autopause | **Prompt:** "Are you still on [focus]?" |

## Fix Approach

1. **Desktop Companion integration** — check `window_monitor` activity before triggering autopause
2. **Confirmation prompt** instead of hard autopause:
   - "You seem to be working elsewhere. Still on [Focus Name]?"
   - Options: "Yes, on task" / "No, I diverged" / "Pause focus"
3. **Smart threshold** — only prompt after sustained off-browser activity (e.g., 5+ minutes away from tracked tabs)

## Dependencies

- B05 fix (idle detection must incorporate non-browser activity)
- Desktop Companion `APP_SWITCH` messages
- CompanionBridge connectivity status
