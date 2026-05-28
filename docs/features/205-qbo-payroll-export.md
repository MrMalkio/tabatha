# Feature #205 — QuickBooks Online Payroll Export Workflow

> **Status:** 📋 Planned · **Version:** v0.5.0
> **Depends On:** #158 Org Profiles, #204 Activity Review & Approval Flow, #69 QuickBooks Export
> **Created:** 2026-05-26
> **Source:** Mike Transcript (N18)

## User Context (Quotes)

> "At the end of the week or end of two weeks... we have to go into QuickBooks and run payroll... I don't want to type anything. I want to hit a button that says 'Export to QuickBooks' and it drops all the approved hours right into QBO Payroll so my payroll is done in 2 minutes."
> — Mike, CPA firm owner

## What It Does

Replicates the seamless "Approve → Sync → Run Payroll" operational model of enterprise time-tracking tools (like QuickBooks Time / TSheets), allowing firm administrators to sync finalized employee hours directly into QuickBooks Online (QBO) Payroll without manual data entry.

Key capabilities:
1. **QuickBooks Authentication & Organization Mapping:**
   - Secure OAuth 2.0 flow to link Tabatha Org to QBO.
   - Maps Tabatha team members (users) to QBO Employees/Contractors via email or name matching.
   - Maps Tabatha clients/services to QBO Customers/Projects and Service Items.
2. **Approved Hours Push:**
   - Pulls all finalized/locked time entries from Feature #204 for the active payroll cycle.
   - Summarizes total hours per employee, classified by regular hours, overtime, and specific billable/non-billable service items.
   - Performs a delta-check to prevent double-exporting already synced time entries.
3. **One-Click Sync:**
   - Single-button trigger in the Admin Dashboard: "Sync Payroll to QuickBooks".
   - Shows progress bar, diagnostic status (e.g., "12 users synced successfully, 1 error"), and sync log history.
   - Instantly populates the QBO Timesheets table, feeding directly into the "Run Payroll" screen inside QuickBooks Online.

## Implementation Notes

- **API Integration:**
  - Leverage QuickBooks Online REST API (`/v3/company/{companyId}/timeactivity` endpoint).
  - Structure each synced entry as a `TimeActivity` resource:
    ```json
    {
      "NameOf": "Employee",
      "EmployeeRef": { "value": "123", "name": "John Doe" },
      "CustomerRef": { "value": "456", "name": "Client A" },
      "ItemRef": { "value": "789", "name": "Tax Prep" },
      "TxnDate": "2026-05-26",
      "DurationHour": 1,
      "DurationMinute": 15,
      "BillableStatus": "Billable",
      "Description": "March Tax Return Reconciliation"
    }
    ```
- **Sync Lock:** Once successfully exported, the corresponding local time logs are locked from further editing in Tabatha, displaying a "Synced to QuickBooks" badge.

## Related Features

- #204 Activity Review & Approval Flow
- #158 Org Profiles
- #138 Team Auth (Admin-only action)
- #69 QuickBooks Export
