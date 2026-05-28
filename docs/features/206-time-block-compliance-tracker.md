# Feature #206 — Time Block Compliance & Deviation Tracker

> **Status:** 📋 Planned · **Version:** v0.4.0
> **Depends On:** #192 Calendar Integration with Auto-Backfill, #200 Decision Fatigue Reducer, #201 Follow-Through Score
> **Created:** 2026-05-26
> **Source:** Mike Transcript (N19)

## User Context (Quotes)

> "and then ultimately it still tracks what I do separately though. Like I want it to still track everything I'm doing because I need to know if I'm following my time tracking, my time blocking or not. Well, what's pulling my attention away from my— what I told myself I was going to do."
> — Mike, CPA firm owner

## What It Does

Introduces a visual comparison and scoring system that evaluates the delta between **Planned Time Blocks** (pulled from Outlook/Google calendar or defined in Morning Kickstart #199) and **Actual Activity** (tracked via browser and desktop companion).

Key capabilities:
1. **Planned vs. Actual Timeline Overlay:**
   - A dual-track timeline view on the homepage or dashboard.
   - **Track A (The Plan):** Visual blocks representing scheduled meetings, focus blocks, and routines.
   - **Track B (The Reality):** Color-coded blocks representing actual focused work, classified clients, and idle breaks.
2. **Deviation Detection (The "What Pulled You Away" Audit):**
   - Automatically detects when actual activity diverges from the scheduled block (e.g., scheduled for "Client A Tax Return" but active on "Client B Excel sheet" or "Twitter").
   - Flagging & Inquiries: If user deviates for more than 10 minutes, Tabatha records the divergence. During review, it asks: "What pulled you away from [Planned Block]?" with one-click reasons (e.g., "Urgent client email", "Ad-hoc call", "Distraction", "Task blocked").
3. **Block Compliance Score:**
   - Calculate a daily and weekly compliance rating: `(Focused Minutes on Planned Activity / Total Planned Activity Minutes) * 100`.
   - Surfaces compliance trends in the weekly digest: "Your Time-Block Compliance was 72% this week. Unplanned client issues were the top source of deviation (12h total)."

## Implementation Notes

- **Data Models:**
  - `compliance_logs` table tracking: `planned_block_id`, `actual_activity_summary`, `deviation_duration`, `deviation_reason`, `classification`.
- **UX Integration:**
  - Home Dashboard displays a "Compliance Ring" or percentage.
  - Review Queue (#204) includes a small warning badge on blocks where a major deviation occurred, prompting the user to classify why they went off-track.
  - Helps individuals with ADHD gamify adherence to their schedules while maintaining a realistic understanding of where their attention is actually going.

## Related Features

- #192 Calendar Integration with Auto-Backfill
- #200 Decision Fatigue Reducer (Routine vs. Choice)
- #201 Follow-Through Score / Accountability Metric
- #199 Morning Kickstart / Daily Planning View
