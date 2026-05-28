# Feature #196 — Intent Countdown Timer (Visible Pressure)

> **Status:** ✅ Live (partial) · **Version:** v0.2.0+
> **Depends On:** #121 Focus Countdown Timer
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N10)

## User Context (Quotes)

> "That countdown is fucking effective."
> — Mike, after seeing the intent timer during the demo

## What It Does

Promotes the intent countdown timer as a **first-class UX feature** for the professional/team version:
- Visible countdown on every active intent (already exists in InBar and homepage)
- Team-visible timer: show team members' countdown timers in the Team Dashboard (#191)
- Configurable defaults: 15m, 30m, 45m, 1h presets per focus type
- "Time's up" prompt with options: extend, complete, pause, switch

## Implementation Notes

- Core timer already exists — this is about elevating it in the UX hierarchy
- Team Dashboard (#191) needs a timer display column per member
- Consider making the countdown the centerpiece of the "quick start" experience
- Mobile companion should show the countdown in the notification bar

## Related Features

- #121 Focus Countdown Timer
- #184 Checkpoint Progress Notes
- #191 Team Activity Dashboard
