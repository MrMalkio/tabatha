# Feature #172 — History Queue Recovery

> **Status:** 📋 Planned · **Version:** v0.2.0  
> **Depends On:** #122 Focus Queue, #156 Time Entry Editing  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Allow user to bring things in history back into the queue, edit/correct time."
> — User, 2026-05-14

## What It Does

Users can browse their completed/archived history and **re-queue** items — bringing a completed focus, closed task, or past intent back into the active focus queue. Combined with time editing (#156), users can correct historical data and resume work that was prematurely closed.

## Operations

| Action | Description |
|--------|-------------|
| **Re-queue** | Move completed focus back to active queue with a new timer |
| **Clone & queue** | Create a copy of a past focus with fresh timestamps |
| **Edit & queue** | Correct the historical entry's time, then optionally re-queue |
| **Resume** | Continue an interrupted session from where it left off |

## Implementation Notes

- History browser in Sidebar or Home — searchable, filterable by date/focus/intent
- "Re-queue" button on each history entry
- Re-queued items get a `resumedFrom` reference linking to the original
- Time corrections use #156 (Quick Edit) or #157 (Deep Edit)
- Overlock logs the re-queue as a new event linked to the original

## Open Questions

- Should re-queued items carry over their original time or start fresh?
- How far back can users browse history? (retention policy)
