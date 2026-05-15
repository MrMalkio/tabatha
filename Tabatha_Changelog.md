# Tabatha Changelog

All notable changes to the **Tabatha** extension will be documented in this
file.

---

## [v3.35.0] - Plan 023 Service Decomposition - _2026-05-14_

### Changed (Internal)
- **Background service decomposition**: `background.js` collapsed from 2,920 lines (master) → 169 lines (orchestrator only). Runtime message routing, listener registration, and alarm dispatch now live in dedicated services: `tabService`, `focusService`, `taskService`, `clockService`, `clockTickService`, `tabTrackingService`, `categoryService`, `sessionService`, `notificationService`, `settingsService`, `groupService`, `blockgateService`, `companionService`, `alarmService`, `syncService`.
- **Alarm consolidation**: three `chrome.alarms.onAlarm` listeners merged into a single dispatcher in `alarmService`; `supabase-sync` is now auth-guarded before dispatch.
- **Storage caps**: `intentHistory`, `closedContexts`, `sessions`, `sugarBox`, and `focusEngine.history` archived through `archiveBeforeCap` instead of being silently truncated.
- **Settings**: added `settings.storage.*` block (sugarBoxCap, snapshotIntervalMinutes, archivedTasksColdAfterDays, parkedTabsWarnAt, etc.) with additive migration.

### Added
- **`clockTickService`**: shared 1Hz tick broadcaster (`TICK_SUBSCRIBE`, `TICK_UNSUBSCRIBE`, `GET_TICK_STATUS`) so extension pages can stop running per-component intervals.
- **`PARKED_TABS_WARNING` broadcast**: one-shot when parked tabs hit `settings.storage.parkedTabsWarnAt`.
- **`STORAGE_CAP_WARNING` broadcast**: emitted when sugarBox entries fall off the cap.

### Schema notes
- `intentChangeLog` removed and merged into `intentHistory` with a union shape (one-time migration). External readers must read `intentHistory` instead.
- Archived tasks older than `settings.storage.archivedTasksColdAfterDays` move from `tabathaOrg.tasks` to `_archivedTasks` (internal cold-store key).

---

## [Unreleased] - Phase 2 (Intelligence & Integrations)

### Planned

- **Asana Integration**: URL parsing to track project/task context without API.
- **Google Calendar**: Logging focus time to calendar.
- **High-Priority Refocus**: Bringing critical windows to the front.
- **Context-Switch Detection**: Alerting on rapid task switching.

---

## [v3.12.4-alpha] - InBar, Focus Controls, Heatmap, Logs & Activity Overhaul - _2026-05-11_

### Added
- **InBar Edit Dropdown**: ✏️ button opens inline panel for intent editing, focus assignment, and new focus creation — all from the content bar.
- **InBar Intent/Focus Split**: Bar now shows tab intent and central focus separately with a visual divider.
- **Focus Pause/Resume**: ⏸ button on FocusBar freezes timer, moves focus to queue with amber styling. FocusInput reappears for new focus.
- **Focus Edit**: ✏️ button on FocusBar for inline rename, timer adjust, and funnel stage changes.
- **Side-Quest Auto-Pause**: Starting a side quest automatically pauses the current active focus and resumes it when the side quest ends.
- **Auto-Park on Close**: Paused tabs auto-park with their sticky note preserved when closed.
- **Tab Label Editing**: ✏️ rename button on each tab card in the Tabs panel. Custom titles persist with original shown on hover.
- **Link Tab to Intent**: 📄 Link Tab button in IntentsPanel with inline open-tab picker dropdown.
- **Collapsible Sections**: All homepage sections collapsible with persisted state (Shift Controls, Now Bar, Focus Engine, Activity, Nav Tabs).
- **Activity Heatmaps (×3)**: GitHub-style contribution graph with 3 views — Browser, Overall, Follow-Through. Theme-aware colors, hover tooltips, 365-day range.
- **Context Activity Bar**: Renamed from "Desktop Activity" to include browser + desktop + mobile (future) segments.
- **Data Retention Alarm**: Daily chrome.alarm prunes companion/desktop activity older than configurable threshold (default 90 days).
- **Data Retention Setting**: Configurable in Settings → Time Tracking with description text.
- **Parked Tab Notes**: Parked tabs display context badge, auto-park source indicator, and preserved sticky notes.

### Changed
- **LogsPanel Overhaul**: Now supports 8 log types (Tab Activity, Intent Change, Focus Session, Clock Stint, Break, Context Set, Blocked Site, Task Update) with toggleable filter chips and pagination (50 per load). Desktop activity excluded — reserved for Context Activity Bar.
- **Header Spacing**: Reduced padding above/below header. Clock wrapper fixed-height prevents layout shift at different scales.
- **Version**: Bumped to 3.12.4-alpha across manifest.json, settings, and homepage.

---

## [v0.2.5-alpha] - Diagnostic Fix Sweep - _2026-05-09_

### Fixed
- **Critical: Duplicate notification listeners** merged into single handler; eliminated service worker unpredictability.
- **Critical: `activeTabId` ReferenceError** in welcome-back notification handler — replaced with `WINDOW_ID_CURRENT`.
- **Critical: `export` keyword on `triggerSync()`** removed — prevented potential service worker module loading failure.
- **Clock-In/Out race condition** — eliminated double-writes to `clockSession` storage key; UI now relies on reactive `useChromeStorage` listener.
- **Focus actions fragility** — `completeFocus()` and `extendTimer()` now receive explicit `focusId` in home and sidebar.
- **Time tracking shows 0s** — added `updateTimeTrackingAggregates()` to bridge `pendingTimeLogs` and the `timeTracking.byTab` storage key the UI reads.
- **Gatekeeper Sugar Box/Park/Later** — buttons now close overlay and tab as tooltips promised.
- **`useChromeStorage` stale closure** — `update` callback uses `useRef` to avoid capturing stale `value`.
- **Popup `new URL()` crash** — wrapped in try/catch for `chrome://` and malformed URLs.
- **`triggerSync` excessive firing** — added auth session guard to skip Supabase calls when unauthenticated.
- **`patternToRegex` double-escape** — rewrote to split on `*` first, escape segments individually.

### Changed
- **Shared `formatTime` utility** — extracted from 3 duplicate definitions into `src/utils/formatTime.js`.

---


## [v0.2.4-alpha] - Phase 3/4 Refinements - _2026-04-28_

### Added
- **Logs Panel**: Replaced simple Time view with deep filtering (Date, Intent, Category, Duration) for historical activity tracking.
- **Link/Merge Modal**: Universal modal to link Tabs to Intents, or merge Intents into Tasks.
- **Settings Walkthrough**: In-app educational tooltips describing "When", "How", and "Affects" for all configuration options.
- **Theme Expansion**: High contrast corporate theme, plus 5 new distinct themes (Neo-Brutalism, Glass Ocean, Retro Pixel, Solarized Warm, High Contrast Dark).
- **Background Handlers**: Automated logic for `CLOCK_IN`, `CLOCK_OUT`, and `TOGGLE_BREAK`.

### Changed
- **Gatekeeper Parked Tabs**: Automatically restores session context for parked tabs, preventing redundant Gatekeeper prompts.
- **Dashboard Refinement**: Renamed "Contexts" to "Sessions" and added "Link/Close" actions to tab listings.

---

## [v0.1.5] - Phase 1.5 (User Enhancements) - _2026-02-12_

### Added

- **Gatekeeper Overlay**: A new interception mechanism for empty tabs. Instead
  of a redirect or modal, a dark, immersive overlay appears on new tabs asking
  for context/intent.
  - Options: "Continue" (set context), "Side Quest" (5m timer), "Sugar Box"
    (save for later), "Park" (save for later).
- **Quick Access**: "Speed Dial" on the Welcome Page. Clicking a top site
  immediately launches it with the context typed in the "New Session Intent"
  box, bypassing the Gatekeeper.
- **Welcome Page Parity**: The "New Tab" page (`home.html`) is now a
  full-featured dashboard mirroring the Sidebar.
  - Features: Tab list, Context view, Groups management, Time tracking, Restore
    Session.
  - Design: "Mission Control" desktop layout with wider UI elements.
- **Time Tracking Logic**:
  - Added "Active Time" tracking per tab (persists across sessions).
  - Added "Open Duration" display.
  - Added Pomodoro timer constraints.
- **Sugar Box & Parked Tabs**: Stub storage implementations for saving
  distractions (Sugar Box) and keeping tabs for later (Parked).

### Changed

- **Welcome Page UI**: Completely overhauled `home.html` and `home.css` to use a
  glassmorphism "Mission Control" aesthetic, sharing styles with the Sidebar.
- **Tab Restore**: Improved "Return to Flow" logic to better handle session
  restoration with priorities.
- **Manifest**: Added `topSites` permission for Quick Access feature.

### Fixed

- **Empty Sidebar Bug**: Fixed an issue where the sidebar would be empty on
  extension reload because existing tabs weren't re-synced to storage.
- **Layout Issues**: fixed CSS conflicts between `sidebar.css` and `home.css`.

---

## [v0.1.0] - Phase 1 (Core Foundation) - _2026-02-10_

### Added

- **Extension Scaffold**: MV3 Manifest, Service Worker (`background.js`), Side
  Panel, Content Scripts.
- **Context Engine**:
  - Data structure for Tabs, Contexts, Intents, and Priorities.
  - Logic for inheriting context from parent tabs.
- **Sidebar UI**: Rich, interactive sidebar replacing the native vertical tabs.
  - Sections: Intent Dashboard, Tab List, Batch Updates, Groups, Time Tracking.
- **Tab Analysis**:
  - **Categories**: Auto-detection of "Work", "Media", "Social", etc. based on
    URL.
  - **Priority System**: Critical (Red), High (Orange), Medium (Yellow), Low
    (Green).
- **Tab Groups**:
  - Integration with native Chrome Tab Groups.
  - **Sub-Groups**: "Project" layer above Chrome groups.
- **Tab Locking**:
  - **Lock**: Prevent accidental close.
  - **URL Lock**: Prevent navigation away from a specific domain (e.g., lock a
    tab to Asana).
- **Markdown Export**: Auto-generates `Tabatha/context.md` for AI agents to
  understand user context.
- **Idle Detection**: Detects when user leaves Chrome and asks for off-screen
  context upon return.

### Core Philosophy Implementation

- Established the "Context-First" data model where every tab must have a purpose
  or inherit one.
