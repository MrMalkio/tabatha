# Tabatha Changelog

All notable changes to the **Tabatha** extension will be documented in this
file.

---

## [Unreleased] - Phase 2 (Intelligence & Integrations)

### Planned

- **Asana Integration**: URL parsing to track project/task context without API.
- **Google Calendar**: Logging focus time to calendar.
- **High-Priority Refocus**: Bringing critical windows to the front.
- **Context-Switch Detection**: Alerting on rapid task switching.

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
