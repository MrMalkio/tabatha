# Feature #166 — Off-Device Intent Tracking

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** #117 Desktop Companion, #122 Focus Queue  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Allow for tracking off device things manually and automatically added variable for intents. And that only tracks time. If on machine activity happens devices inquire."
> — User, 2026-05-14

## What It Does

Track activities that happen **away from any device** — meetings, whiteboard sessions, phone calls, thinking walks — as intent entries that only track time. When the user returns to a device, the system **inquires** what they were doing and reconciles the timeline.

## How It Works

1. User goes idle on all devices (browser, desktop, mobile)
2. Tabatha logs an "off-device" time segment
3. When user returns to ANY device, Tabatha asks:
   - "You were away for 45 minutes. What were you doing?"
   - Quick-pick options: Meeting / Call / Break / Thinking / Other
   - Free-text input for custom description
4. Time is attributed to the selected intent (time-only, no URL/tab association)

## Off-Device Intent Data

```json
{
  "type": "off-device",
  "label": "Whiteboard session with design team",
  "startedAt": "2026-05-14T14:00:00Z",
  "endedAt": "2026-05-14T14:45:00Z",
  "source": "manual",
  "tracksTimeOnly": true,
  "linkedFocus": "focus_xyz"
}
```

## Implementation Notes

- Multi-device idle detection: all surfaces (browser, desktop, mobile) report idle
- "True idle" = all devices idle simultaneously
- Return-to-device prompt reuses Welcome Back (#126) flow with off-device options
- Manual entry: user can proactively log off-device time via Notes or Sidebar
- Auto-detection: calendar events during idle periods could auto-fill

## Open Questions

- Should calendar integration auto-suggest "you were in a meeting" based on Google Calendar?
- How to handle partial off-device (phone active but not browser/desktop)?
