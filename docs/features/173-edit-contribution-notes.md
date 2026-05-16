# Feature #173 — Edit Contribution Notes (System Improvement Feedback Loop)

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** #156 Time Entry Editing, #157 Deep Edit, #148 Overlock  
> **Created:** 2026-05-14

## User Context (Quotes)

> "For the features that are related to editing we want to allow for user to give notes about the edit and why as well, and allow them to contribute that edit note to improving the system. Which just pushes it to a list with the context of the intent/event/task or whatever it is along with the note of what the user edited and why they had to edit it. Was it a fault of the system or was it a human error."
> — User, 2026-05-14

## What It Does

When users edit time entries (#156/#157), they provide a correction note explaining **why**. This feature adds a **contribution dimension**: the user classifies the edit as "system fault" or "human error" and opts to contribute the context to a **system improvement log**. This creates a feedback loop where common system-caused errors can be identified and fixed.

## Edit Note Structure

```json
{
  "editId": "amend_abc",
  "note": "Timer didn't pause when I went to lunch",
  "classification": "system_fault" | "human_error" | "preference",
  "context": {
    "entryType": "focus",
    "entryId": "focus_xyz",
    "editType": "insert_pause",
    "originalData": { "..." },
    "correctedData": { "..." }
  },
  "contributedToImprovement": true
}
```

## System Improvement Log

A centralized list of edit contributions:

| Date | Edit Type | Classification | Note | Context |
|------|-----------|---------------|------|---------|
| May 14 | Insert pause | System fault | Timer didn't pause for lunch | Focus: "Sprint work" |
| May 14 | Change end | Human error | Forgot to stop timer at 5pm | Focus: "Code review" |
| May 13 | Reassign | Preference | Was really for Project B | Focus: "Research" |

## Implementation Notes

- Extends #156/#157 correction notes with `classification` and `contribute` fields
- Improvement log stored in `chrome.storage.local` or Supabase
- Settings: "Contribute edit notes to system improvement" toggle (opt-in)
- Analytics: aggregate classification rates → identify systematic issues
- Future: feed improvement log to AI for auto-detection pattern training

## Open Questions

- Should improvement contributions be anonymous in team mode?
- How to action the improvement log? (auto-create bug reports, surface to devs?)
