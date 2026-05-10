# Parking Lot

> Items noticed during work that need attention later.
> **Rules:** Append only. Never delete entries. Scan headers before adding to avoid duplicates.

## 2026-05-09 — background.js Monolith Refactor
- **Noticed while:** Diagnostic fix sweep
- **What:** `background.js` is ~2000 lines handling tabs, contexts, intents, focus, clock, time tracking, groups, categories, priorities, locking, markdown export, notifications, idle detection, and message routing all in one file.
- **Why it matters:** Makes debugging nearly impossible, increases risk of regressions, and makes the codebase hostile to new contributors. The service worker `type: module` fix proves Vite already supports multi-file imports — the infrastructure is ready.
- **Options:**
  1. Extract into domain modules (`src/background/clock.js`, `focus.js`, `tabs.js`, `groups.js`, `sync.js`, `messageRouter.js`, etc.) ← **suggested**
  2. Extract only the largest sections (clock, focus, groups) and leave the rest
  3. Keep as-is and rely on better tooling (code folding, search)

## 2026-05-09 — Version Discipline Automation
- **Noticed while:** Fixing hardcoded version strings in 3 places
- **What:** Version is hardcoded in `manifest.json`, `home/index.jsx`, and `settings/index.jsx` — easy to forget one when bumping.
- **Why it matters:** Leads to stale version displays and user confusion.
- **Options:**
  1. Create a single `src/version.js` that exports the version, import everywhere ← **suggested**
  2. Use a build-time replacement plugin to inject version from `package.json`
  3. Keep manual and add to release checklist

## 2026-05-09 — Debug Bar Expansion (System-Wide)
- **Noticed while:** Clock extraction + InPop fix
- **What:** Debug bar currently only shows clockSession + last message result. User wants it to show system-wide state (focus engine, tabs, settings, etc.) and be positioned at the bottom of the home page instead of under the clock bar.
- **Why it matters:** Better debugging experience — currently limited to clock state only.
- **Options:**
  1. Expand debug bar to show all storage keys with collapsible sections, pin to page bottom ← **suggested**
  2. Create a dedicated debug page (like workshifts.html) with full state inspector
  3. Both — expandable bottom bar + dedicated page for deep inspection
