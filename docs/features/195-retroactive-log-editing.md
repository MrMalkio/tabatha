# Feature #195 — Deep Edit / Retroactive Log Editing

> **Status:** 📋 Planned · **Version:** v0.3.0
> **Depends On:** #156 Time Entry Editing, #157 Deep Edit Panel
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N09)

## User Context (Quotes)

> "You'll be able to go in because it would be different to go into your logs and then change certain things… when did I start? When did I stop?"
> — Malkio, explaining to Mike

## What It Does

Extends existing Time Entry Editing (#156) and Deep Edit Panel (#157) with:
- **Retroactive time adjustment:** change start/end times for any logged session
- **Gap filling:** "I was working but forgot to clock in — add 2 hours here"
- **Role-based permissions:** admin can restrict team members from editing their own logs
- **Audit trail:** all edits logged with before/after + editor identity

## Implementation Notes

- This is largely covered by #156 and #157 — this feature concept confirms the user need and adds the role-gating requirement
- Admin setting: "Allow team members to edit their own time entries" (boolean)
- Contribution Notes (#173) provides the feedback loop for edits

## Related Features

- #156 Time Entry Editing
- #157 Deep Edit Panel
- #173 Edit Contribution Notes
- #138 Team Auth (role-based access)
