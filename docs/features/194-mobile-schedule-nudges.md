# Feature #194 — Scheduled Auto-Engagement (Mobile Nudges)

> **Status:** 📋 Planned · **Version:** v0.4.0
> **Depends On:** #164 Mobile Triggers, #183 Device Proximity, Work Shifts
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N08)

## User Context (Quotes)

> "Since there'll be a phone companion and it knows your schedule, it can ask, hey, are you working yet?"
> — Malkio, describing planned feature to Mike

## What It Does

Mobile companion sends scheduled nudges based on the user's work schedule:
- "It's 9:15 AM — are you working yet?" (if no clock-in detected)
- "Your focus block for [Client X] starts in 5 minutes"
- "You've been idle for 20 minutes during work hours — need a break?"

## Implementation Notes

- Requires Tabatha Mobile app with notification permissions
- Work Shifts schedule provides the baseline for when to nudge
- Desktop Companion idle detection provides the "are you active?" signal
- Configurable: nudge frequency, tone (gentle vs. urgent), do-not-disturb windows

## Related Features

- #164 Mobile Triggers
- #183 Device Proximity Detection
- #187 Auto Clock-In/Out on Startup/Shutdown
- Work Shifts / Schedule (live)
