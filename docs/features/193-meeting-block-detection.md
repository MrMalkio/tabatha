# Feature #193 — Meeting Block Detection

> **Status:** 📋 Planned · **Version:** v0.4.0
> **Depends On:** #192 Calendar Auto-Backfill, #53 Google Calendar Integration, #143 Preset Intent Designs
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N07)

## User Context (Quotes)

> "My meetings were on that… it filled in the blocks, but then it would tell me you have a meeting, and then it would switch to a meeting time."
> — Mike, describing Rise app's meeting block feature

## What It Does

Auto-transitions between focus blocks and meeting blocks based on calendar events:
- When a calendar event starts → switch to a "Meeting" intent preset
- When it ends → prompt "Back to focus? What are you working on now?"
- Detect active video call (Meet/Zoom/Teams URL or Desktop Companion window) as confirmation that meeting is in progress

## Implementation Notes

- Calendar polling (1-min interval) or push via Google Calendar API
- Meeting detection heuristics: calendar event + active video call URL/app
- Auto-pause current focus intent during meeting, auto-resume after
- Uses Preset Intent Designs (#143) for meeting-specific visual templates

## Related Features

- #192 Calendar Integration with Auto-Backfill
- #143 Preset Intent Designs
- #53 Google Calendar Integration
- #163 Background Tasks / Parallels
