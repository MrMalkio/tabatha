# Feature #199 — Morning Kickstart / Daily Planning View

> **Status:** 📋 Planned · **Version:** v0.3.0
> **Depends On:** #174 Recurring Focuses, #122 Multi-Focus Task Queue, Work Shifts
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N13)

## User Context (Quotes)

> "I'm trying to figure out what to focus on and what not to focus on and how I can time block myself."
> — Mike

> "What is it that allows you to get started? If I touch Asana or Slack, I'm good. Virtually anything else will fuck my ability."
> — Malkio

## What It Does

A dedicated "Start Your Day" view that appears on first browser open or clock-in:
- Shows today's priorities (from focus queue, recurring tasks, calendar)
- "Pick your first task" prompt — reduces decision fatigue
- Quick time-block planner: drag priorities into time slots
- Yesterday's unfinished items highlighted with "carry over?" option

## Implementation Notes

- Triggered on first clock-in or homepage visit of the day
- Pulls from: Focus Queue (#122), Recurring Focuses (#174), Calendar (#192)
- Can be dismissed / set to not show ("I already know what I'm doing")
- Mobile companion (#194) can send a preview push notification

## Related Features

- #174 Recurring Focuses & Tasks
- #122 Multi-Focus Task Queue
- #192 Calendar Integration with Auto-Backfill
- #200 Decision Fatigue Reducer
