# Feature #200 — Decision Fatigue Reducer (Routine vs. Choice)

> **Status:** 📋 Planned · **Version:** v0.3.0
> **Depends On:** #174 Recurring Focuses, #199 Morning Kickstart, Work Shifts
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N14)

## User Context (Quotes)

> "People with ADHD don't have routines. You have choices."
> — Malkio, referencing a therapist's insight

> "If I'm in and my meeting's at 9 AM… it gets me going. I gotta think."
> — Mike, on how external commitments force him into productive mode

## What It Does

Pre-set daily routines that reduce morning decision-making:
- User defines a "default day" template (e.g., family→gym→work→study→family→study)
- On clock-in, Tabatha auto-sets the focus blocks from the template
- If user deviates from the routine, Tabatha gently flags it: "You usually do [X] at this time — switch?"
- "Just follow the plan" mode: suppress all prompts, auto-transition between blocks

## Implementation Notes

- Built on top of Recurring Focuses (#174) and Work Shifts
- Template editor in Settings: define blocks by time-of-day and focus label
- Deviation detection: compare actual activity to template, surface deltas
- Can learn from patterns over time: "You always skip gym on Fridays — adjust?"

## Related Features

- #174 Recurring Focuses & Tasks
- #199 Morning Kickstart / Daily Planning View
- #187 Auto Clock-In/Out
- #152 Intelligent Auto-Pause/Resume
