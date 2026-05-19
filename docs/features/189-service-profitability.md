# Feature #189 — Service-Level Profitability Reporting

> **Status:** 📋 Planned · **Version:** v0.4.0
> **Depends On:** #188 Client Time Attribution, #159 Task Cost & Revenue, #67 Profitability Tracking
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N03)

## User Context (Quotes)

> "Who's getting scope creep? If I could look at what client took me a long time and for what service…"
> — Mike, CPA firm owner

## What It Does

A reporting view that cross-references **client × service × time → profitability**:
- Which services are underpriced (actual hours > estimated)?
- Which clients have scope creep (hours growing month-over-month)?
- Where is the team spending disproportionate time?

## Implementation Notes

- Builds on Client Time Attribution (#188) for the raw time data
- Builds on Task Cost & Revenue (#159) for billing rates
- Output: table/chart view, exportable as CSV/PDF
- Can integrate with QuickBooks export (#69) for billing reconciliation

## Related Features

- #188 Client/Project-Level Time Attribution
- #159 Task Cost & Revenue Tracking
- #67 Project Profitability Tracking
- #69 QuickBooks Export
