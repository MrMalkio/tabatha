# Feature #184 — Persistent Focuses (Ongoing / Frequent)

> **Status:** 📋 Planned · **Version:** v0.2.0  
> **Depends On:** #122 Focus Queue, #174 Recurring Focuses  
> **Created:** 2026-05-17

## User Context (Quotes)

> "Another concept where we can have persistent focuses or frequent. That don't really become resolved but get time and attention given to them over time, it could be a hobby, a project, a part of a project that gets ongoing maintenance."
>
> "When we hit resolved on those that just means we're done with that one for the day and we want the activity logged so we can see how much time it's getting."
>
> "Right now I am spending about 15 mins writing out new feature ideas and this isn't a focus it's something that I am just doing and I'll do it again some time and while I am working on this project at its current stage I'll often want to just click 'Tabatha Features' as one of few dynamic presets available to just set it up."
> — User, 2026-05-17

## What It Does

A new focus lifecycle model for activities that **never truly resolve** — they accumulate time over days/weeks/months. "Resolving" a persistent focus means "done for today" and logs the session, but the focus remains available for next time. Combined with **dynamic presets** for one-click activation of frequently used persistent focuses.

## How This Differs from Existing Features

| Feature | What It Handles | Lifecycle |
|---------|----------------|-----------|
| **Regular Focus (#122)** | A task to be completed | Start → Work → Resolve (done forever) |
| **Recurring Focus (#174)** | Scheduled repeating tasks | Creates new instances on a schedule |
| **Persistent Focus (#184)** | Ongoing activities with no end date | Start → Work → "Done for today" → Resume later → ... indefinitely |

**Key distinction:** Recurring focuses are *scheduled* (daily standup at 9 AM). Persistent focuses are *on-demand* (click "Tabatha Features" whenever you want to brainstorm). They don't auto-create instances — the user pulls them up when they feel like it.

## Key Behaviors

| Behavior | Detail |
|----------|--------|
| **"Done for today" resolution** | Resolving logs the session but keeps the focus available for next time |
| **Cumulative time tracking** | Total time across all sessions visible (e.g., "Tabatha Features: 12h 34m total, 15m today") |
| **Dynamic presets** | Top N persistent focuses appear as quick-launch buttons (one-click activation) |
| **Session history** | Each "done for today" creates a session entry with date + duration |
| **No scheduled recurrence** | Unlike #174, these aren't on a schedule — user activates on demand |
| **Frequency tracking** | System tracks how often and when the user engages (e.g., "You work on this ~3x/week, usually evenings") |

## Dynamic Presets

The user's top persistent focuses appear as quick-launch buttons in the focus picker:

```
┌─ Quick Start ─────────────────────────┐
│ [📌 Tabatha Features]  [📌 Guitar]    │ ← Persistent presets
│ [📌 Code Review]       [📌 Reading]   │
│ [+ New Focus...]                       │
└────────────────────────────────────────┘
```

Preset ranking: most frequently used, weighted by recency. User can pin/unpin.

## Data Model

```json
{
  "id": "pfocus_abc",
  "type": "persistent",
  "label": "Tabatha Features",
  "category": "project",
  "tags": ["tabatha", "product", "brainstorm"],
  "linkedOrg": "org_xyz",
  "createdAt": "2026-05-10T00:00:00Z",
  "totalTimeMs": 45000000,
  "sessionCount": 12,
  "lastSessionAt": "2026-05-17T20:30:00Z",
  "averageSessionMs": 900000,
  "pinned": true,
  "sessions": [
    {
      "startedAt": "2026-05-17T20:15:00Z",
      "endedAt": "2026-05-17T20:30:00Z",
      "durationMs": 900000,
      "notes": "Wrote background tracks and persistent focus concepts"
    }
  ]
}
```

## UI Changes

1. **Focus Picker** — "Persistent" tab alongside "New" and "Recent"
2. **Focus Card** — Shows cumulative stats (total time, session count, avg session)
3. **Home Page** — Dynamic presets strip at top of focus section
4. **Resolution Modal** — "Done for today" button (vs. "Resolve permanently" for regular focuses)
5. **Analytics** — Time-over-time graph per persistent focus (weekly/monthly view)

## Implementation Notes

- Persistent focuses stored with `type: "persistent"` in focus engine
- "Resolve" action on persistent focus = create session entry, pause timer, keep in engine
- "Archive" action = truly remove from active list (but keep history)
- Dynamic preset algorithm: `score = frequency × recency_weight`
- Presets displayed in focus input area, home page, and InBar quick-switch
- Settings: max preset count (default 4), auto-pin threshold

## Open Questions

- Should persistent focuses have an estimated "healthy" session duration? (e.g., "Guitar: aim for 30 min/day")
- Can persistent focuses have sub-sessions? (e.g., "Tabatha Features: brainstorm" vs. "Tabatha Features: implementation")
- Should the system suggest persistent focus creation? ("You've started 'Code Review' 5 times this week — make it persistent?")
- How to handle persistent focuses across team/org context? (e.g., is "Sprint Review" persistent or recurring?)
