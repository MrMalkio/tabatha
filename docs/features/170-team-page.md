# Feature #170 — Team Page (Owner's God-Eye View)

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** #138 Team Auth, #158 Org Profiles, #169 Cowork Activity  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Team page. The god's eye view of everyone's activity on your team."
> — User, 2026-05-14
> "The owner's version (team page)"
> — User, 2026-05-14

## What It Does

The **owner/admin-only** team management page with full visibility into every team member's activity. Shows detailed time breakdowns, focus histories, productivity metrics, and management controls. This is the complement to the Cowork page (#169) — same real-time data but with full granularity.

## Includes

- All Cowork Activity (#169) data + granular details
- Per-member: time breakdowns, focus sessions, intent history, task progress
- Team-wide: aggregate productivity, billable hours, utilization rates
- Management: reassign tasks, approve time edits (#157), send requests (#162)
- Filtering: by date range, project, client, member

## Implementation Notes

- Role-gated: only org owners and admins can access
- Reuses Cowork Activity components with extended data panels
- Real-time via Supabase Realtime
- Page location: dedicated page accessible from Settings or Sidebar

## Open Questions

- Should owners be able to see individual tab/URL activity or just aggregated focus data?
- Privacy balance: what level of monitoring is healthy vs. surveillance?
