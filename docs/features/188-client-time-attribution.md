# Feature #188 — Client/Project-Level Time Attribution

> **Status:** 📋 Planned · **Version:** v0.3.0
> **Depends On:** #92 Client/Project Cataloging, #147 URL Mapping Engine, #117 Desktop Companion
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N02)

## User Context (Quotes)

> "I can track how much time per client and per service… are we priced appropriately?"
> — Mike, CPA firm owner

> Mike's team uses QuickBooks Time but forgets to switch manually. Wants automatic detection of which client is being worked on based on activity context.

## What It Does

Automatically attributes time to a specific client/project based on:
- **Write Tool extension integration:** Reads enriched QuickBooks Chrome page headers (via Write Tool QuickBooks Chrome extension), extracting explicit Client Names and workflow locations directly from the active tab's metadata.
- URL rules (e.g., `quickbooks.com/*clientA*` → Client A)
- Window title matching (via Desktop Companion)
- Active focus/intent association
- Manual override always available (e.g., via InBar or Pending Queue #204)

Time attribution feeds into profitability reports (#189), billing (#14), and QBO Payroll Export (#205).

## Implementation Notes

- Extends URL Mapping Engine (#147) with client-level tagging
- Scrapes browser-level tab titles enriched by the **Write Tool** extension to bypass URL parsing limits on QBO.
- Desktop Companion provides window title → client matching for non-browser apps (like Microsoft Excel or standalone tax preparation software).
- Org Profiles (#158) define the client catalog; this feature tracks time against it
- Replaces manual timer-switching (the core pain point for Mike)

## Related Features

- #92 Client/Project Cataloging
- #147 Universal URL Mapping Engine
- #158 Org Profiles
- #189 Service-Level Profitability Reporting
- #204 Activity Review & Approval Flow
- #205 QuickBooks Online Payroll Export Workflow
