# Feature #208 — Smart Deferral & Task Splitting Engine (Auto-Stint Scheduler)

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** Focus Engine (#122), Time-Blocking Engine (#192), Calendar Sync (#193), Compliance Tracker (#206)  
> **Created:** 2026-05-28

## User Context (Quotes)

> "This all begs the idea of having another feature that is related but seperate which is the ability to defer a focus to a specific stint of time, I think this would be related to both scheduling, time blocking, queuing, pausing, and backburner."
>
> "The user can push a task of to another day and the system auto decides when it would place it based on user's schedule and pre-existing time blocks to see where it would fit if at all. even going as far as breaking down a task based on how much time a user or the system expects it to take and holding that up agains the available time to work on it, it's priority, dependencies, blockers and other things."
> — User, 2026-05-28

---

## What It Does

The **Smart Deferral & Task Splitting Engine** is an intelligent assistant scheduler that automatically manages your attention budget. When a focus is deferred, instead of just sitting statically in a queue, the system maps it into optimal future "stints" (time slots) based on calendar availability, workload fragmentation, and dependency chains.

---

## Core Engine Mechanics

### 1. The Deferral Request
When a user decides they cannot or should not work on a focus right now:
1. **Trigger Deferral:** User clicks "Defer" in the Sidebar, Homepage, or InBar.
2. **System Prompt:**
   - **Target Window:** e.g., "Defer to tomorrow", "Defer to next week", or "Defer until blockers resolve".
   - **Expected Duration:** User specifies or system predicts (e.g. 3 hours).
   - **Priority:** (P1 to P5).

### 2. Auto-Stint Allocation Algorithm
The engine reviews constraints to find the perfect calendar slots:
* **Pre-existing Calendar Events:** Reads Google/Outlook calendars to bypass meetings, lunches, and hard-blocked times.
* **Focus Time Blocks:** Analyzes previously committed focus blocks.
* **Attention Energy Windows:** Factors in user preferences (e.g., "No heavy coding tasks after 4:00 PM").
* **Priority Stack:** Higher priority items can displace lower-priority queue items (auto-shifting them down).

### 3. Fragmentation & Task Splitting
If a task is expected to take 4 hours, but the user's upcoming schedule only has two disjointed 2-hour blocks of free time:
* **The Auto-Splitter** breaks the task into manageable context fragments:
  - `[Focus Name] (Part 1 of 2)`
  - `[Focus Name] (Part 2 of 2)`
* These are scheduled separately, preserving their relationship as child focus fragments under a shared parent focus tracking ID.

### 4. Dependency & Blocker Gating
* If a focus is marked as "Blocked by [Coworker Name]" or "Blocked by PR Merge", the Deferral Engine estimates or asks for a resolution window.
* The focus is automatically pushed *beyond* that window, keeping the queue clean of untransactionable tasks.

---

## Schema Extensions

### Deferral and Stint Allocation Metadata
```json
{
  "focus": {
    "id": "f_db_indexing",
    "label": "Audit database indexes",
    "status": "deferred",
    "priority": "P2",
    "estimatedDurationMs": 10800000, 
    "deferralMeta": {
      "deferredAt": "2026-05-28T13:54:00Z",
      "targetStintStart": "2026-05-29T09:00:00Z",
      "isSplit": true,
      "splitParts": [
        {
          "partId": "f_db_indexing_p1",
          "label": "Audit database indexes (Part 1/2)",
          "scheduledStart": "2026-05-29T09:00:00Z",
          "durationMs": 5400000
        },
        {
          "partId": "f_db_indexing_p2",
          "label": "Audit database indexes (Part 2/2)",
          "scheduledStart": "2026-05-29T13:30:00Z",
          "durationMs": 5400000
        }
      ]
    }
  }
}
```

---

## UI Components

### A. The "Smart Deferral" Pop-Over
* Renders options to defer with simple presets ("Next available slot today", "First thing tomorrow morning", "Custom stint").
* Displays a mini visual preview of where the task is being placed on their calendar/planner schedule.

### B. The Fragment Coordinator (Planner View)
* In the Planner page, auto-split tasks are grouped with a linking line or visual bracket indicating they are parts of a single unified effort.
* Dragging one part automatically updates the availability schedule for the second part.
