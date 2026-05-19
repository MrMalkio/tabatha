# Feature #192 — Calendar Integration with Auto-Backfill

> **Status:** 📋 Planned · **Version:** v0.4.0
> **Depends On:** #53 Google Calendar Integration, #156 Time Entry Editing
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N06)

## User Context (Quotes)

> "I track my calendar backwards more than I do forward… extend the calendar entry so it has a better representation."
> — Mike, CPA firm owner

## What It Does

Two-way calendar sync with intelligent time backfilling:
- **Import:** Pull Google/Outlook calendar events and auto-create focus blocks
- **Backfill:** When a meeting ends, auto-extend the calendar entry or create a focus block for the follow-up work done immediately after
- **Retroactive:** Use calendar as a reference to fill gaps in time logs ("I was in a meeting from 2-3, that gap makes sense now")

## Implementation Notes

- Extends #53 (Google Calendar Integration) with write-back capability
- Calendar event → focus block mapping: configurable per event type
- Detect meeting overruns: if activity continues on meeting-related tabs after the calendar event ends, extend the attribution
- Backfill UI: "You had a gap from 2-3 PM — was this the [Calendar Event Name]?"

## Related Features

- #53 Google Calendar Integration
- #144 Google Workspace Integration Suite
- #156 Time Entry Editing
- #193 Meeting Block Detection
