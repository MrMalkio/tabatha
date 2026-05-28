# Feature #185 — Focus Auto-Resume Control & Queue-for-Later

> **Status:** 📋 Planned · **Version:** v0.2.0  
> **Depends On:** #122 Focus Queue  
> **Created:** 2026-05-26

## User Context (Quotes)

> "User needs to be able to control if a new focus should auto resume after another was marked resolved."
>
> "User needs to be able to queue additional focuses for later."
> — User, 2026-05-26

## What It Does

Two related enhancements to the focus lifecycle:

### 1. Auto-Resume Control

When a focus is resolved, the system currently auto-activates the next focus in the queue. The user needs control over this behavior:

| Setting | Behavior |
|---------|----------|
| **Auto-resume ON** (current default) | Resolving a focus immediately starts the next queued one |
| **Auto-resume OFF** | Resolving a focus returns to an "idle" state — user manually picks next |
| **Prompt** | After resolve, ask: "Start [next focus]?" with Yes/No/Pick Different |

This should be a **per-user setting** in Settings → Focus Behavior.

### 2. Queue for Later

Users need to add focuses to a queue **without activating them**. Currently, adding a focus may auto-start it or require the user to immediately manage it. "Queue for later" means:

- Add to the bottom of the focus queue
- No activation, no timer, no state change
- User can reorder the queue
- When ready, user manually activates or auto-resume picks it up

## Implementation Notes

- Settings key: `settings.focus.autoResumeAfterResolve` → `"auto"` | `"prompt"` | `"off"`
- Queue-for-later: `ADD_FOCUS` handler with `{ activate: false }` parameter
- UI: "Queue for Later" button alongside "Start Now" in focus creation

## Open Questions

- Should auto-resume respect priority? (e.g., skip low-priority, start high-priority)
- Should queue-for-later items show estimated start time based on current focus timer?
