# Feature #204 — Activity Review & Approval Flow (Rise-Style Pending Queue)

> **Status:** 📋 Planned · **Version:** v0.4.0
> **Depends On:** #188 Client Time Attribution, #195 Deep Edit / Retroactive Log Editing, #190 AI-Generated Activity Summaries
> **Created:** 2026-05-26
> **Source:** Mike Transcript (N17)

## User Context (Quotes)

> "What I did like about Rise was it didn't just solidify that block of time or whatever I did for however long. It didn't just book that for me... there's this 'For Review' section that says, 'did you do this with this client during this time' that I could edit and approve... it literally like summarized what I did during a certain period of time... and guess what client I worked on and what service I was working on... and then I could change the wording if it didn't make sense."
> — Mike, CPA firm owner

## What It Does

Establishes a **"For Review" Landing Page / Queue** inside Tabatha that sits between raw automated tracking and finalized time cards. This mitigates the friction of manual timers by tracking passively in the background, grouping blocks into logical segments, guessing metadata, and presenting an editable "draft log" that the user approves in bulk.

Key features:
1. **The Pending Queue:**
   - Shows chronological "unapproved" blocks of tracked activity.
   - Automatically collapses idle times, pauses, and rapid context switches into cohesive periods (e.g., "9:15 AM - 10:30 AM (1h 15m)").
2. **AI / Rule-Based Heuristic Guessing:**
   - Guesses the **Client** (e.g., "Client A" based on URL patterns).
   - Guesses the **Service** (e.g., "Tax Prep" based on active apps/tabs).
   - Generates a **Summary Description** (e.g., "Reconciled March bank statement in QuickBooks and reviewed tax document PDF").
3. **Inline Quick Edits:**
   - Dropdown list to change the guessed client or service.
   - Double-click to edit description text or fine-tune start/stop times.
   - Splitting/merging: Split a 2-hour block into two 1-hour blocks if the user switched tasks without a break.
4. **Bulk Approval ("Approve & Lock"):**
   - User checks off multiple blocks and clicks "Approve Selected".
   - Approved blocks transition to the **Finalized Time Logs** repository (making them read-only for employees and ready for payroll sync).

## Implementation Notes

- **Workflow Lifecycle:**
  ```mermaid
  graph TD
      A[Raw Tracked Activity] -->|Heuristic Engine / AI| B[Draft / Pending Time Block]
      B -->|Visualized in 'For Review' Queue| C{User Edits & Approves}
      C -->|Modify Client/Service/Time| B
      C -->|Approve & Lock| D[Finalized Time Log]
      D -->|Sync Engine| E[QuickBooks Online Payroll / Supabase Sync]
  ```
- **UI Screen:**
  - Create a dedicated "Review Center" page (accessible via sidebar and home banner "You have 5 pending blocks to review").
  - Table/Grid layout where each row is an editable draft block with an inline edit panel.
- **Auto-Pauses & Breaks Integration:**
  - Standard activity logging merges gaps smaller than 5 minutes.
  - Pauses/breaks larger than 5 minutes are styled as separate unbillable breaks in the list, allowing the user to mark them as "paid internal admin" or "unpaid personal break".

## Related Features

- #188 Client/Project-Level Time Attribution
- #195 Deep Edit / Retroactive Log Editing
- #190 AI-Generated Activity Summaries
- #205 QuickBooks Online Payroll Export Workflow
