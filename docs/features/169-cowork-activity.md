# Feature #169 — Cowork Activity Page (Shared Team View)

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** #138 Team Auth, #158 Org Profiles  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Cowork Activity page — This is a shared accountability and transparency element where the team can see everyone else's Activity bar. This is the shared less detailed version of what the Owner is able to see, showing only everyone's activity bar and availability status."
> — User, 2026-05-14

## What It Does

A **team-facing page** where all members see each other's activity bars and availability status. Promotes accountability and transparency without exposing granular details. Shows: who's working, who's on break, who's available, what focus mode they're in — but NOT specific task details or URLs.

## Visibility Rules

| Data | Cowork Page (members) | Team Page (#170, owner) |
|------|:---------------------:|:-----------------------:|
| Activity bar (working/break/idle) | ✅ | ✅ |
| Availability status | ✅ | ✅ |
| Current focus label | ✅ (optional) | ✅ |
| Specific URLs/tabs | ❌ | ✅ |
| Time breakdowns | ❌ | ✅ |
| Edit history | ❌ | ✅ |

## Implementation Notes

- Real-time via Supabase Realtime or WebSocket
- Activity bar: simple color-coded strip (green=active, amber=break, gray=idle, blue=freeform)
- Availability status: Available / Focused / On Break / Away / Do Not Disturb
- Page location: Sidebar tab or dedicated page

## Open Questions

- Can users opt out of the Cowork page visibility?
- Should there be "focus hours" where activity bars are hidden?
