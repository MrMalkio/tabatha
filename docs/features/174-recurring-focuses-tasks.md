# Feature #174 — Recurring Focuses & Tasks

> **Status:** 📋 Planned · **Version:** v0.2.0  
> **Depends On:** #122 Focus Queue, Tasks Panel  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Add recurring focuses, or tasks."
> — User, 2026-05-14

## What It Does

Allow users to create **recurring** focus sessions or tasks that auto-populate at scheduled intervals. Daily standups, weekly reviews, monthly reports — they appear in the focus queue automatically.

## Recurrence Options

| Pattern | Example |
|---------|---------|
| Daily | "Morning planning" every day at 9:00 AM |
| Weekly | "Sprint review" every Friday at 2:00 PM |
| Biweekly | "1:1 with manager" every other Monday |
| Monthly | "Invoice clients" 1st of every month |
| Custom | "Team retrospective" every 3 weeks |
| Weekdays only | "Daily standup" Mon-Fri |

## Data Model

```json
{
  "id": "recurring_abc",
  "type": "focus" | "task",
  "template": {
    "label": "Morning Planning",
    "estimatedDuration": 15,
    "linkedOrg": "org_xyz",
    "tags": ["daily", "planning"]
  },
  "recurrence": {
    "pattern": "daily",
    "time": "09:00",
    "days": [1,2,3,4,5],
    "endDate": null
  },
  "active": true
}
```

## Implementation Notes

- Background alarm generates instances from templates at scheduled times
- Generated instances are regular focus/task entries with `recurringId` reference
- Skippable: user can dismiss/skip individual instances
- Edit propagation: "Edit this instance" vs. "Edit all future instances"
- UI: recurrence icon (🔄) on recurring items in queue/list

## Open Questions

- Should missed recurring items (e.g., weekend) accumulate or be silently skipped?
- Can recurring items have different durations per instance?
