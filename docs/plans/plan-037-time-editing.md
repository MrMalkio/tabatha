# Implementation Plan 037: Focus Time Editing

> **Current version:** 6.0.0
> **Target version:** 6.1.0
> **Source:** QA regression session 2026-05-29 — user feedback on time data corruption from off-device idle pause bug.

---

## Goal

Give users direct control over their focus time records. A paused focus that shouldn't have been paused (e.g. due to the off-device bug, or a false idle) should be correctable in under 10 seconds. The checkpoint timeline is the natural home for this — it already shows the lifecycle of a focus; we add an edit layer on top.

---

## Problem statement

Focus items store time as:
- `elapsedMs` — cumulative active milliseconds
- `lastResumedAt` — ISO timestamp of the last resume (null when paused)
- `pausedAt` — ISO timestamp of last pause
- `startedAt` / `endedAt` — overall lifecycle bounds

When idle incorrectly pauses a focus (off-device bug, false suppression), the elapsed time stops accruing. The user has no way to correct it without developer tools. This needs a UI.

---

## Scope

### Phase 1 — Edit mode in the Checkpoint Timeline (MVP)

**What the user sees:** Each focus in the FocusQueue / FocusBar gains an "Edit time" entry point. Opening it shows the checkpoint timeline with an additional "Time adjustments" section above the checkpoint list. 

**Adjustment capabilities:**
1. **Add active time** — "I was actually working for X more minutes" → adds directly to `elapsedMs`.
2. **Subtract time** — "Remove the last N minutes" → subtracts from `elapsedMs` (floor 0).
3. **Remove last pause** — If the focus is currently paused (or recently was), a "Remove last pause" button un-pauses and removes the pause record from the checkpoint log. Restores `focusState` to `active` if the focus is the active one.
4. **Set elapsed directly** — Advanced: text input showing current `h:mm:ss`, user can type a corrected value.

**Constraint:** Never allow elapsed > wall-clock time since `startedAt`. Client-side guard.

**New message types:**
- `ADJUST_FOCUS_TIME` `{ focusId, adjustmentMs, reason }` — positive or negative delta applied to `elapsedMs`. Clamped to [0, wallClockMax].
- `REMOVE_LAST_PAUSE` `{ focusId }` — removes the most recent system checkpoint entry of type "Paused (idle)" or "Paused", reactivates focus if it is the active one, logs a correction entry.

**Files to change:**
| File | Change |
|------|--------|
| `focusService.js` | Add `ADJUST_FOCUS_TIME` and `REMOVE_LAST_PAUSE` handlers |
| `src/components/CheckpointTimeline.jsx` (or wherever timeline lives) | Add edit mode toggle, adjustment controls |
| `src/hooks/useChromeStorage.js` | No changes needed |

---

### Phase 2 — Pause history list (full visibility)

Show a structured pause history derived from checkpoint entries. Each pause shows:
- Start time (the `pausedAt` checkpoint)
- End time (the next `resumed` checkpoint)  
- Duration

Each row gets a **Remove** button that splices that pause out of the record and adds its duration back to `elapsedMs`.

This gives full retroactive editing without needing a dedicated timeline editor (that's Plan 032 Deep Editing scope).

---

## Verification plan

| # | Test | Expected |
|---|------|----------|
| 1 | Open a focus, add +10 min via "Add active time" | `elapsedMs` increases by 600 000ms |
| 2 | Subtract 5 min | `elapsedMs` decreases by 300 000ms |
| 3 | Try to subtract more than elapsed | Clamped to 0, not negative |
| 4 | "Remove last pause" on a currently-paused focus | Focus moves to `active`, pause checkpoint entry removed |
| 5 | Set elapsed directly to 0:30:00 | `elapsedMs` = 1 800 000ms |
| 6 | Correction entries appear in checkpoint timeline | Shows `🛠 Time adjusted: +10m (manual)` |

---

## Parallelability review

- **Zones touched:** Focus Engine (focusService), Checkpoint Timeline UI
- **Shared files modified:** `focusService.js` (new handlers only — additive)
- **Conflicts with active branches:** None. Plan 036 is complete; this is a new branch.
- **Can run parallel with:** Plan 038 (URL Rules — different zones entirely)
- **Max branch lifetime:** 3–4 days
- **Branch name:** `feat/plan-037-time-editing`
