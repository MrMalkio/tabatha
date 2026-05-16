# Feature #162 — User-to-User Requests (Booking Calendar × Task Manager)

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** #138 Team Auth, #158 Org Profiles, #122 Focus Queue  
> **Created:** 2026-05-14

## User Context (Quotes)

> "User to user requests — Requests of a user (not tasks) that then get considered in queues based on priority, and capability, and the assumption of yes. But the system gates it before it goes to the user, operating conceptionally like a booking calendar meets task manager."
> — User, 2026-05-14

## What It Does

A **request system** where team members can send requests to each other. Requests are NOT tasks — they are asks for time, attention, or capability. The system **gates** requests before they reach the recipient, queuing them intelligently based on:

- **Priority** of the request
- **Capability** of the recipient (are they the right person?)
- **Availability** (current focus, break status, calendar)
- **Assumption of yes** — the system assumes the request will be accepted and pre-queues it, but the recipient can decline

## Flow

```
Requester → Creates request → System evaluates priority/timing →
  → If urgent: surfaces immediately (non-intrusively)
  → If normal: queued for next focus break or shift start
  → If low: added to daily digest
Recipient → Reviews gated queue → Accept / Decline / Defer / Delegate
```

## Request vs. Task

| Aspect | Request (#162) | Task (#122) |
|--------|---------------|-------------|
| Nature | Ask for attention/time | Concrete deliverable |
| Lifecycle | Accept → becomes time block or task | Created → tracked → completed |
| Queuing | System-gated, priority-sorted | User-managed queue |
| Default | Assumed yes until declined | No assumption |

## Implementation Notes

- Request data model: `{ from, to, subject, priority, capability, estimatedTime, status }`
- Gating engine: checks recipient's focus state, calendar, availability before surfacing
- UI: Request inbox in Sidebar, notification badge, daily digest view
- Requires Team Auth (#138) for user-to-user messaging

## Open Questions

- Can requests be sent to a role/capability rather than a specific person?
- Should the system learn which requests a user typically accepts/declines?
- Integration with Google Calendar for availability checking?
