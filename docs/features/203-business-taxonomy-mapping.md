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

## Related Features

- #188 Client/Project-Level Time Attribution
- #189 Service-Level Profitability Reporting
- #158 Org Profiles
- #159 Task Cost & Revenue Tracking
