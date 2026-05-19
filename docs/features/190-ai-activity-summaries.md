# Feature #190 — AI-Generated Activity Summaries

> **Status:** 💡 Future · **Version:** v1.0
> **Depends On:** #188 Client Time Attribution, #16 AI Productivity Coach, #125 AI-as-Enhancement
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N04)

## User Context (Quotes)

> "You're gonna get a report that says, hey, based on how the team's working, let's look at these things… give me the top 3 things we can do."
> — Mike, CPA firm owner

## What It Does

An AI-powered digest that analyzes tracked data and surfaces actionable business insights:
- "You spent 40% of last week on Client X but they're only 15% of revenue"
- "Your team's context-switching increased 25% — consider batching meetings"
- "Top 3 efficiency improvements based on this week's patterns"

## Implementation Notes

- Processes time logs, focus patterns, and intent history through LLM (Claude/Gemini)
- Requires BYOK API keys (#115) or built-in integration
- Weekly/monthly digest cadence, configurable
- Privacy: all processing can be local-first or opt-in cloud

## Related Features

- #16 AI Productivity Coach / Nudges
- #188 Client/Project-Level Time Attribution
- #125 AI-as-Enhancement Principle
- #115 BYOK API Keys
