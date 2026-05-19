# Feature #187 — Auto Clock-In/Out on Startup/Shutdown

> **Status:** 📋 Planned · **Version:** v0.4.0
> **Depends On:** #117 Desktop Companion, #5 Idle Detection
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N01)

## User Context (Quotes)

> "If I'm on that computer, it knows if I'm working or not… it clocks you in on startup, clocks you out at shutdown."
> — Mike, CPA firm owner

## What It Does

Automatically starts and stops the work clock based on OS session events:
- **Clock in** when the computer wakes from sleep / user logs in
- **Clock out** when the computer goes to sleep / screen locks / user logs off
- Optional: grace period before auto-clocking (e.g., "Did you mean to start working?")

## Implementation Notes

- Requires Desktop Companion (#117) for OS-level session events
- Extension-only fallback: detect first browser activity of the day → prompt clock-in
- Configurable in Settings: enable/disable, grace period, work schedule integration
- Pairs with Work Shifts to auto-clock only during scheduled hours

## Related Features

- #117 Desktop Companion App
- #5 Idle Detection & Auto-Pause
- Work Shifts / Schedule (live)
