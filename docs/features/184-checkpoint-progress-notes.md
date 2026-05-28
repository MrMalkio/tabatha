# Feature #184 — Checkpoint Progress Notes (CPN)

> **Status:** 📋 Planned · **Version:** v4.5.3 · **Scoped at:** v4.0.0
> **Depends On:** Focus Engine (core), #166 Off-Device Tracking
> **Created:** 2026-05-16
> **Implementation Brief:** [Plan 025](../../.gemini/antigravity/brain/0919dcff-3bdc-4a0f-91ce-4971d8335c43/implementation_plan.md)

## User Context (Quotes)

> "A user needs the ability to add 'progress notes'. These notes are
> specifically meant for a user to type or record the progress and changes that
> they've made since last entry."
>
> "They should be able to add these via sidebar, InBar, and progress pop-ups
> that show at a configurable interval in relation to the time allotted for the
> focus, such as every 3rd of the overall time frame (configurable)."
>
> "If there is a progress note that is about to show but a subtask was marked
> complete, then the user shouldn't have to be prompted to leave a Checkpoint
> note, though they will always have an option."
>
> "On the CPN the user can mark if they've made little progress, a lot of
> progress, no progress, almost done. And these options are the submission
> button for the note. And these variables contribute to the Follow-through
> tracking system."
>
> "On the InBar if a CPN is old or there hasn't been one in a while there should
> be a signal of such." — User, 2026-05-16

## What It Does

Checkpoint Progress Notes (CPNs) are timed self-reflections attached to an
active focus item. They capture what the user accomplished since their last
checkpoint, plus a progress-level rating. The system auto-prompts at
configurable intervals, is suppressible via subtask completion or manual snooze,
and feeds data into the Follow-Through tracking system.

## Key Behaviors

| Behavior                              | Detail                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Auto-prompt interval**              | Fires at a fraction of the focus timer (default: every ⅓). Configurable.                                                    |
| **Progress levels as submit buttons** | `😐 No Progress` · `📈 Little Progress` · `🚀 A Lot` · `🏁 Almost Done` · `🚧 Stuck`                                        |
| **Smart suppression**                 | If a subtask/linked task was completed recently, auto-prompt is suppressed (check only runs if subtasks/linked tasks exist) |
| **Snooze**                            | "Remind me in 5 min" on the popup itself                                                                                    |
| **Global disable**                    | Configurable in Settings → Follow-through Support                                                                           |
| **InBar staleness signal**            | Pulsing amber dot when CPN is overdue (configurable staleness threshold, default 30 min)                                    |
| **Entry points**                      | InBar manual button, sidebar checkpoint button, auto-prompt popup, FTE/combo popup                                          |
| **Logged to master context**          | CPNs are written to `tabathaLogs` alongside other events                                                                    |
| **Asana bridge**                      | Optionally auto-post CPN as comment on linked Asana task (configurable in settings)                                         |

## Data Model

Stored on the focus item as `item.checkpoint[]`:

```js
{
  id: 'cpn_1716912345_a2f3k',
  text: 'Refactored the auth flow, fixed token refresh race',
  progressLevel: 'lot',       // 'none' | 'little' | 'lot' | 'almost_done' | 'stuck'
  progressValue: 3,           // numeric: none=0, stuck=0, little=1, lot=3, almost_done=4
  createdAt: '2026-05-16T12:30:00Z',
  focusId: 'f_17169...',
  elapsedAtMs: 540000,         // focus elapsed when note was taken
  triggeredBy: 'auto_prompt'   // 'auto_prompt' | 'manual' | 'combo_popup' | 'inbar' | 'sidebar'
}
```

Focus item additions:

```js
{
  // ...existing focus item fields...
  checkpoint: [],              // CPN entries
  lastCheckpointAt: null,      // ISO timestamp of most recent CPN
  checkpointSnoozedUntil: null // ISO timestamp, delays next auto-prompt
}
```

## Progress Level Mapping

| Level             | Emoji | Value | Follow-Through Signal                                   |
| ----------------- | ----- | ----- | ------------------------------------------------------- |
| No Progress       | 😐    | 0     | Stall indicator                                         |
| Stuck             | 🚧    | 0     | Triggers roadblock ticket or additional intent (future) |
| Little Progress   | 📈    | 1     | Normal pace                                             |
| A Lot of Progress | 🚀    | 3     | Strong momentum                                         |
| Almost Done       | 🏁    | 4     | Completion signal                                       |

> **Future:** `stuck` serves as a trigger for roadblock ticket creation or
> spawning an additional intent to unblock.

## Auto-Prompt Logic

```
1. Focus starts → create alarm: checkpoint-prompt-{focusId}
   - delay = timerMinutes × checkpointIntervalFraction (default 0.33)
   - repeating at same interval

2. Alarm fires → handleCheckpointPrompt(focusId):
   a. Is focus still active? No → clear alarm, done
   b. Is checkpointNotesEnabled === false? → done
   c. Is snoozed (checkpointSnoozedUntil > now)? → done
   d. Has a subtask/linked task been completed in last 2 min?
      (only check if subtasks/linked tasks exist — skip otherwise)
      → done (suppress)
   e. Broadcast CHECKPOINT_PROMPT to all tabs

3. Focus completes/pauses → clear checkpoint alarm
```

## Settings (under "Follow-through Support")

| Setting                             | Key                          | Default |
| ----------------------------------- | ---------------------------- | ------- |
| Enable checkpoint prompts           | `checkpointNotesEnabled`     | `true`  |
| Prompt interval (fraction of timer) | `checkpointIntervalFraction` | `0.33`  |
| Staleness threshold (minutes)       | `checkpointStaleMinutes`     | `30`    |
| Auto-post CPNs to Asana             | `checkpointAutoPostAsana`    | `false` |

## Visual Design — Auto-Prompt Overlay

```
┌─────────────────────────────────────────────┐
│  📋 Progress Check                          │
│  ─────────────────────────────────           │
│  Focus: "Refactor auth flow"                │
│  Elapsed: 10:23 · Timer: 15:00              │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ What have you accomplished since    │    │
│  │ your last checkpoint?               │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Submit with progress level:                │
│  [😐 None] [📈 Little] [🚀 A Lot]          │
│  [🏁 Almost Done] [🚧 Stuck]               │
│                                             │
│  [⏰ Snooze 5 min]  [Skip this time]       │
└─────────────────────────────────────────────┘
```

## InBar Staleness Signal

```
Normal:  ... ⏱ 10:23 │ 📝 │ ▾     (note button is default color)
Stale:   ... ⏱ 10:23 │ 📝🟠│ ▾    (pulsing amber dot after 30min)
```

## Asana Bridge

When `checkpointAutoPostAsana` is enabled and a CPN is saved on a focus with a
linked `asanaGid`:

- Fire `POST_ASANA_COMMENT` webhook: `{ taskGid, comment, progressLevel }`
- Actual API call handled by the Asana widget server (existing infra)
- Manual mode: user clicks "Post to Asana" button on each CPN instead

## Implementation Files

| File                                                             | Purpose                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [focusService.js](../../src/background/services/focusService.js) | CPN handlers (SAVE/SNOOZE/GET_STATUS), alarm creation, Asana webhook stub |
| [alarmService.js](../../src/background/services/alarmService.js) | `checkpoint-prompt-` prefix routing                                       |
| [constants.js](../../src/background/constants.js)                | Default CPN settings                                                      |
| [inbar.js](../../src/content/inbar.js)                           | CPN popup overlay, staleness signal, manual entry button                  |
| [sidebar/index.jsx](../../src/sidebar/index.jsx)                 | Checkpoint button + inline form                                           |
| [home/index.jsx](../../src/home/index.jsx)                       | CPN timeline in focus card                                                |
| [settings/index.jsx](../../src/settings/index.jsx)               | Follow-through Support settings section                                   |

## Open Questions

- Should CPN prompts stack with FTE? (Current plan: they piggyback onto
  FTE/combo popups when timing overlaps)
- Should the InBar's 📋 manual button expand into a mini-form inline, or open a
  small floating card? - OPen in sidebar
- When `stuck` is selected, should it immediately prompt for a roadblock
  description, or just tag the CPN?
  - **Answer:** It should be in the note; the note serves as the description. In this case, the note for the CPN is compulsory.
  - **Escalation Flow Rules:** When the user marks their status as "Stuck" and saves, a secondary quick-form escalates the problem:
    1. *Do you need help?* (Toggle: Yes/No)
    2. *Who from?* (Select teammate/manager or "Self" if just need time to cook)
    3. *Are you getting pulled?* (Toggle: Yes/No - indicating if external interruption/scope-creep is the root cause)
    This escalation form data is appended to the CPN metadata and can auto-generate a Slack/Asana roadblock notification for team collaboration.
  - **Self-Unstuck Gamification:** If a user resolves a "Stuck" checkpoint themselves (by subsequently registering a progress note of "A Lot" or "Almost Done" on the same focus, or completing the focus successfully), they receive a **+5 "Self-Rescued" boost** to their Follow-Through Score (#201), reinforcing positive problem-solving.
