# Feature #175 — Contribution Intake Engine (External Webhook Receiver)

> **Status:** 📋 Planned · **Version:** v0.4.0  
> **Depends On:** #164 Mobile Triggers, #148 Overlock, Supabase  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Contribution intake engine, which is basically webhook that can be given to apps that offer it to send data of usage from other things. Such as sleep tracking apps, fitness apps. That will be able to add to users activity timeline fill-in gaps and context, allowing for AI Assistants to have a holistic view. But before agents the user alone will be able to thoroughly see their data."
> — User, 2026-05-14

## What It Does

A **webhook receiver system** where external apps (Oura Ring, Fitbit, Strava, Apple Health, IFTTT, Zapier) can push activity data into Tabatha's timeline. This fills gaps with non-digital context: sleep quality, exercise, meals, commute — giving the user (and eventually AI) a **holistic view** of their day.

## Supported Data Types

| Source | Data | Timeline Effect |
|--------|------|----------------|
| Sleep tracker | Sleep start/end, quality score | Fills overnight gap, morning context |
| Fitness app | Workout type, duration | Activity block on timeline |
| Calendar | Events, meetings | Auto-fill meeting blocks |
| IFTTT/Zapier | Custom triggers | User-defined timeline entries |
| Smart home | Leave/arrive home | Commute time blocks |

## Webhook Format

```json
POST /api/intake
{
  "source": "oura_ring",
  "type": "sleep",
  "data": {
    "startedAt": "2026-05-14T23:00:00Z",
    "endedAt": "2026-05-15T06:30:00Z",
    "quality": 82,
    "stages": { "deep": "1h30m", "rem": "2h", "light": "4h" }
  },
  "apiKey": "user_api_key_xyz"
}
```

## Implementation Notes

- Supabase Edge Function as webhook receiver
- Per-user API keys for authentication
- Data stored in `external_activity` table, merged into unified timeline
- Privacy: user controls which sources feed data, can delete any entry
- User-first: all data visible to user before any AI has access (#125)
- Timeline view: external data shown as colored blocks alongside focus/intent data

## Open Questions

- Should Tabatha proactively pull from APIs (polling) or only receive pushes (webhooks)?
- Data retention: how long to keep external activity data?
- Should external data influence focus scoring? (e.g., bad sleep → lower expectations)
