# Feature #198 — Privacy Modes / Scaled Visibility

> **Status:** 📋 Planned · **Version:** v0.3.0
> **Depends On:** #138 Team Auth, #158 Org Profiles, #170 Team Page
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N12)

## User Context (Quotes)

> "They do not want to be micromanaged."
> — Mike, on his team's reaction to tracking tools

> "I also convinced myself not to go because… they don't want to be micromanaged."

## What It Does

Configurable privacy tiers for team tracking:

| Tier | Admin Sees | Peers See | Individual Sees |
|------|-----------|-----------|-----------------|
| **Full** | Everything | Status only | Everything |
| **Standard** | Time + focus labels | Status only | Everything |
| **Private** | Aggregate time only | Nothing | Everything |

- Org admin sets the baseline tier; individuals can't drop below it but can opt into more visibility
- "I'm available" / "Heads down" / "In a meeting" status is always visible (if team mode is on)
- Framing: "profitability tool" not "surveillance tool"

## Implementation Notes

- Org Profiles (#158) stores the org-level privacy setting
- Team Auth (#138) enforces role-based data access
- InBar can show "Team mode: Standard" indicator so users know what's visible
- See also: `.headbox/sticky-notes/privacy-modes-future.md`

## Related Features

- #138 Team Auth
- #158 Org Profiles
- #170 Team Page
- #191 Team Activity Dashboard
