# Feature #201 — Follow-Through Score / Accountability Metric

> **Status:** 📋 Planned · **Version:** v0.3.0
> **Depends On:** #122 Multi-Focus Task Queue, #184 Checkpoint Progress Notes, #11 Daily Productivity Score
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N15)

## User Context (Quotes)

> "Everything about how you think would change if you just followed through on everything you started."
> — Malkio

> "Focus management, follow-through management is going to be…"
> — Mike

## What It Does

A personal accountability metric tracking intent completion rate:
- **Follow-Through Rate:** % of intents marked "complete" vs. "abandoned" or "timed out"
- **Trend line:** weekly/monthly view — are you improving?
- **Streak tracking:** "You've completed 12 consecutive intents"
- **Category breakdown:** which focus types have the highest/lowest completion rates?

## Implementation Notes

- Core data already exists: intent history logs outcomes (complete, abandoned, timed-out, paused)
- This feature is the **visualization layer** on top of that data
- Can integrate with CPN (#184) — checkpoint submissions count toward follow-through
- Optional: share follow-through score with team (opt-in, ties to Privacy Modes #198)

## Related Features

- #122 Multi-Focus Task Queue
- #184 Checkpoint Progress Notes
- #11 Daily Productivity Score
- #198 Privacy Modes / Scaled Visibility
