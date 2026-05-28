# Feature #191 — Team Activity Dashboard (Mutual Visibility)

> **Status:** 📋 Planned · **Version:** v0.3.0
> **Depends On:** #169 Cowork Activity, #170 Team Page, #138 Team Auth
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N05)

## User Context (Quotes)

> "What if we had a scaled-down version for remote teams? Everybody gets to see everybody's bar."
> — Mike, CPA firm owner

## What It Does

A **peer-facing** team view where every team member can see each other's current focus status — not just the admin. Think: a virtual "office floor" showing who's heads-down, in a meeting, or available.

Key difference from #170 (Team Page): this is **mutual, non-hierarchical** visibility. Everyone sees the same view. No admin-only data.

## Implementation Notes

- Simplified version of Cowork Activity (#169) focused on status bars
- Each team member's InBar status is aggregated: current focus label, time-in-focus, availability
- No detailed time breakdowns — just "what are you working on right now?"
- Respects Privacy Modes (#198): team members can opt into visibility levels

## Related Features

- #169 Cowork Activity Page
- #170 Team Page (admin version)
- #198 Privacy Modes / Scaled Visibility
- #138 Team Auth
