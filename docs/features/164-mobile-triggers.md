# Feature #164 — Mobile Triggers (Cross-Device Action Webhooks)

> **Status:** 📋 Planned · **Version:** v0.4.0  
> **Depends On:** #117 Desktop Companion, Tabatha Mobile  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Mobile feature — The ability to trigger alerts and such based on picking up phone or doing certain things on phone. They send triggers to the system and the system creates webhooks for external actions but priority is to have certain realtime interactions based on actions from other devices or surfaces outside of the browser."
> — User, 2026-05-14

## What It Does

The mobile companion detects **physical actions** (phone pickup, app launch, call start/end) and sends **triggers** to the Tabatha ecosystem. The system can respond with real-time interactions — pausing browser focus, logging context switches, or surfacing prompts. Also exposes a **webhook system** for external services to trigger Tabatha actions.

## Trigger Sources

| Trigger | Detection Method | Tabatha Response |
|---------|-----------------|------------------|
| Phone pickup | Accelerometer / screen on | Log context switch, optionally pause focus |
| Call started | Phone state API | Auto-pause focus, log "On call" parallel (#163) |
| Call ended | Phone state API | Prompt: "Back to {focus}?" |
| Specific app opened | Usage monitor | Log app-based context |
| Geofence entry/exit | Location services | Auto clock-in/out (#150) |
| External webhook | HTTP POST to Tabatha endpoint | Custom action (configurable) |

## Webhook System

External services can POST to a Tabatha webhook endpoint to trigger actions:

```json
POST /api/webhook/trigger
{
  "event": "sleep_ended",
  "source": "oura_ring",
  "data": { "sleepScore": 82, "duration": "7h 23m" },
  "timestamp": "2026-05-14T07:00:00Z"
}
```

## Implementation Notes

- Mobile triggers: Tabatha Mobile sends events via Supabase Realtime or LAN bridge
- Webhook server: could be Supabase Edge Function or self-hosted endpoint
- Action mapping: configurable rules for what triggers produce what responses
- Privacy: all triggers are opt-in, configurable per source

## Open Questions

- Latency tolerance for real-time triggers? (< 2 seconds ideal)
- Should webhooks support bidirectional data (Tabatha → external)?
- Rate limiting for webhook abuse prevention?
