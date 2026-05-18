# Feature #181 — Blocker Banner (Team Dependency Marquee)

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** #138 Team Auth, #158 Org Profiles, #162 User Requests  
> **Created:** 2026-05-15

## User Context (Quotes)

> "Blocker banner — Additional thin Banner that is at top of page instead of bottom shaped just like InBar. But this one is a marquee from other team members that shows who you are blocking or the roadblock for. Requires user to interact and acknowledge that understanding."
>
> "Shows up periodically until it gets closer to an unreasonable time and then it just stays persistent. This can be controlled by manager and user. With manager ability to activate, and user ability to only make it more intense, but not less intense than what manager instituted."
>
> "These can stack or marquee, like a ticker."
> — User, 2026-05-15

## What It Does

A thin **top-of-page banner** (InBar-shaped, positioned at top instead of bottom) that surfaces **team dependency blockers** — showing the user who they are blocking and what deliverable is waiting. The banner scrolls like a ticker/marquee when there are multiple blockers.

## Key Behaviors

| Behavior | Detail |
|----------|--------|
| **Acknowledgment required** | User must interact (click/dismiss) — can't be passively ignored |
| **Escalating urgency** | Starts periodic → becomes persistent as deadline approaches |
| **Manager-controlled** | Manager can activate blockers, set urgency thresholds |
| **Asymmetric permissions** | User can make it MORE intense, but NEVER less intense than what manager set |
| **Stacking/marquee** | Multiple blockers scroll as a ticker tape |

## Urgency Escalation

| Time Remaining | Behavior |
|---------------|----------|
| > 48 hours | Appears once per session, dismissable |
| 24–48 hours | Appears every 2 hours, requires acknowledgment |
| 12–24 hours | Appears every hour, amber color |
| < 12 hours | Persistent (stays visible), red color, cannot dismiss |
| Overdue | Persistent + pulsing, blocks until acknowledged |

## Permission Model

```
Manager sets: urgency_level = "medium" (appears every 2h)
User can:     urgency_level = "high" (make it hourly) ✅
User cannot:  urgency_level = "low" (less than manager set) ❌
```

## Visual Design

```
┌──────────────────────────────────────────────────────────────────┐
│ ⚠️ You are blocking: Sarah (API integration) · 18h remaining   │◄── marquee
│    Jake (design review) · 2 days remaining                      │    scrolling
│                                          [Acknowledge ✓] [View] │
└──────────────────────────────────────────────────────────────────┘
═══════════════════════ PAGE CONTENT ══════════════════════════════
═══════════════════════════════════════════════════════════════════
┌──────────────────────────────────────────────────────────────────┐
│ 🎯 Focus: Sprint work │ 📝 Reviewing PR │ ⏱ 1:23:45            │◄── InBar
└──────────────────────────────────────────────────────────────────┘
```

## Implementation Notes

- Content script injection at top of page (mirrors InBar at bottom)
- Data source: team blocker records from Supabase Realtime or background polling
- Urgency calculation: background alarm checks remaining time, escalates state
- Manager API: `POST /blockers` with `{ assignee, description, deadline, urgency_floor }`
- User settings: personal urgency multiplier (≥ manager floor)
- Marquee: CSS `animation: marquee` or React ticker component for multiple items

## Implementation Files

| File | Purpose |
|------|---------|
| TBD → `src/content/BlockerBanner.jsx` | Top-of-page banner component |
| TBD → background handler | Blocker state management + escalation |
| Team API endpoint | Blocker CRUD for managers |

## Open Questions

- Should blocker banners appear in Freeform Mode (#161)?
- Can users add self-imposed blockers (personal accountability)?
- Should the banner show estimated impact? ("Sarah's PR is waiting 3 days because of this")
