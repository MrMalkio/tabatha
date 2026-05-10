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

## 2026-05-09 — InBar Customization & Content Expansion
- **Noticed while:** Post-build feature review
- **What:** InBar needs richer content and user control over what's shown.
- **Why it matters:** Users need to understand what each element means and control bar density.
- **Requirements:**
  1. Settings: toggles for each InBar element (intent, focus, timers, notes, etc.)
  2. Settings: legend/key explaining what each InBar element represents
  3. Show current tab's intent label (if not already — verify)
  4. Show overall active focus item label
- **Options:**
  1. Add a settings sub-section "InBar Elements" with checkboxes + preview ← **suggested**
  2. Add a ? icon on InBar itself that shows an inline key

## 2026-05-09 — BlockGate Enhancement Suite
- **Noticed while:** Post-build feature review
- **What:** Multiple enhancements to the site-blocking (BlockGate) system.
- **Why it matters:** Blocking is a core attention management feature — needs depth.
- **Requirements:**
  1. **Block reasons:** User can optionally set a reason when blocking a site. BlockGate popup shows the reason when the user visits the blocked site ("You blocked this because: ___").
  2. **Delayed unblocking:** Optional 10-minute unblock guard in settings — when user removes a block, it doesn't take effect for 10 mins. Prevents impulsive unblocking.
  3. **Unblocked list:** In blocked sites settings, show recently-unblocked sites so users can easily re-block them. Support blocking URL patterns (sections of sites), not just full domains.
  4. **Custom BlockGate text:** User can customize the H1, subtext, and button text of the blocked page popup. Block reason shows conditionally if provided.
  5. **Temporary blocking from InBar/Sidebar:** Quick-block the current site with preset durations (15m, 30m, 1h, 2h, 1d, custom). Available from InBar action menu and sidebar.
  6. **Add-to-intent from BlockGate:** The blocked page popup should offer "Add this page to an existing intent/focus" as an alternative to full blocking — lets user redirect rather than just block.
  7. **InPop/BlockGate mutual exclusion:** Never show both InPop (gatekeeper) and BlockGate popup simultaneously. BlockGate takes priority if the site is blocked.
- **Options:**
  1. Implement incrementally: reasons + custom text first, then delayed unblock, then temp blocking ← **suggested**
  2. Full implementation in one pass
