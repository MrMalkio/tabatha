# Feature #203 — Business Taxonomy Mapping (On vs. In the Business)

> **Status:** 📋 Planned · **Version:** v0.4.0
> **Depends On:** #188 Client Time Attribution, #158 Org Profiles
> **Created:** 2026-05-26
> **Source:** Mike Transcript (N16)

## User Context (Quotes)

> "And then based on what I do on my computer, I want to just be able to say I was working on the business or I was working in the business. And if I was working in the business, I want to say what client and what service I was providing."
> — Mike, CPA firm owner

## What It Does

Introduces a primary taxonomic classification for all logged time and activities, establishing a clean operational dividing line:

1. **"IN the Business" (Billable / Delivery):**
   - Active work performed *for* clients.
   - Requires association with:
     - **Client ID** (from client registry)
     - **Service Type** (e.g., Tax Preparation, Bookkeeping, Consulting, Audit)
   - Directly feeds the Service-Level Profitability Reporting (#189).

2. **"ON the Business" (Non-Billable / Internal Overhead):**
   - Growth, administrative, operational, or capability-building activities.
   - Mapped to internal **Realms** / business functions:
     - **Sales & Marketing** (prospecting, pitch decks, social media)
     - **Operations & Admin** (billing, internal email, software config)
     - **HR & Team** (hiring, training, reviews)
     - **R&D / Infrastructure** (internal tool development, template building)

## Implementation Notes

- **Database Schema (Supabase):**
  - Add `classification_type` enum (`IN_BUSINESS`, `ON_BUSINESS`) to `time_entries` and `focus_sessions` tables.
  - Add `service_type` VARCHAR field to `time_entries`.
  - Add `realm_id` FK reference to `time_entries` for "ON the business" classification.
- **UI Components:**
  - **InBar Intent Selector:** When user clicks the Intent dropdown, they can select a quick classification: "Working [IN] Client..." or "Working [ON] Internal...".
  - **Focus Entry Modal:** Radio toggles for "Working ON the Business" (triggers internal department dropdown) vs "Working IN the Business" (triggers Client + Service picker).
  - **Visual Badges:** Color-coded timeline entries and reports:
    - **Teal / Blue:** "IN" the business (Client billable).
    - **Amber / Grey:** "ON" the business (Internal overhead).

## Addendum — Clock dimension generalizes concurrency handling

> Added during the Concurrent-Shift / Ghost-Stint fix (Migration 015 +
> `src/utils/stintReconciliation.js`).

Today clock-in carries **no** "what am I clocking into" dimension — a shift is a
single boolean, and "professional vs personal" is only a property of which
browser *install* you're in (`browser_profiles.classification`). That bluntness
is why the concurrency warning could only reason at the install-classification
level: `isLiveConcurrent(row, selfClassification)` currently treats a second
live clock as a conflict **only when it shares the same classification**, and
treats different classifications (professional + personal, or two businesses) as
legitimate parallel work.

When this feature lands the IN/ON taxonomy + `client_id` / `service_type` /
`realm_id` on the stint record, the concurrency check should be **generalized
from "same classification" to "same business/realm context"**: two simultaneous
clocks are legitimate when they're IN different clients/services (or one IN and
one ON the business), and only a true same-context overlap should warn or
block. The hours then attribute correctly per client/service instead of
double-counting a single ambiguous shift. This is the natural home for the
multi-business / "owner working across entities" concurrency the user raised.

## Related Features

- #188 Client/Project-Level Time Attribution (clock-into-context dimension; see addendum there)
- #189 Service-Level Profitability Reporting
- #158 Org Profiles
- #159 Task Cost & Revenue Tracking
