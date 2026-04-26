# Tabatha — Agent Instructions

> This file instructs AI agents how to work on the Tabatha Chrome Extension project.

## Project Identity

**Tabatha** is a Chrome MV3 extension — a Context-Driven Tab Manager / "Attention Operating System" for the browser. It enforces intentional browsing by assigning Context and Intent to every tab, tracking time, and providing focus tools.

## Mandatory Protocols

### 1. Progress Logging
- **Update [docs/progress.md](file:///c:/Users/mrmal/Le%20Dev/Tabatha/docs/progress.md) at the end of every session.**
- Add a new session entry with: date, goal, what was done (checklist), key findings, decisions made, and next steps.
- Mark items `[x]` when complete, `[/]` when in-progress.

### 2. Before You Code — Read These First
Only read these files when working on the corresponding area:

| Working On | Read First |
|-----------|------------|
| Any feature work | [docs/progress.md](file:///c:/Users/mrmal/Le%20Dev/Tabatha/docs/progress.md) — check last session's next steps |
| Architecture / reorganization | [Tabatha_Concept.md](file:///c:/Users/mrmal/Le%20Dev/Tabatha/Tabatha_Concept.md) — core philosophy |
| Feature planning | [ROADMAP.md](file:///c:/Users/mrmal/Le%20Dev/Tabatha/ROADMAP.md) — phase plan |
| What's changed | [Tabatha_Changelog.md](file:///c:/Users/mrmal/Le%20Dev/Tabatha/Tabatha_Changelog.md) — version history |
| Background / service worker | [background.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/background.js) — 1206-line monolith, all message routing |
| Sidebar UI | [sidebar.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/sidebar.js) — ⚠️ has missing functions (see Known Bugs) |
| Home / New Tab page | [home.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/home.js) — ⚠️ has missing functions, heavy duplication with sidebar.js |
| Extension popup | [popup.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/popup.js) — search + Step Away mode |
| Content scripts | [gatekeeper.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/gatekeeper.js), [url-lock.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/url-lock.js) |
| Permissions / manifest | [manifest.json](file:///c:/Users/mrmal/Le%20Dev/Tabatha/manifest.json) |

### 3. Known Bugs (As of 2026-04-23)
These are the highest-priority issues. Fix before adding features:

1. **FATAL** — `sidebar.js:95` — `sendMessage()` and `populateFilterCategories()` are referenced but never defined. The sidebar is completely non-functional.
2. **FATAL** — `home.js` — `updateStats()` is called but never defined. Home dashboard crashes on load.
3. **FATAL** — `home.js:141` — `setupGreeting()` is defined but never called in `DOMContentLoaded`.
4. `sidebar.js:620` — Listener for `#off-chrome-dismiss` but HTML ID is `#off-chrome-skip`.
5. `background.js:1175` — `setPanelBehavior({ openPanelOnActionClick: true })` conflicts with `manifest.json` `default_popup`.
6. `gatekeeper.js:28` — `document.body.style.overflow` at `document_start` — body may not exist.
7. `background.js:346,1193` — Duplicate `notifications.onClicked` listeners.
8. `home.html:125` — Purpose modal is an empty `<!-- ... copy modal structure ... -->` comment.

### 4. Code Duplication Warning
`sidebar.js` and `home.js` share ~80% identical code. **Any change to shared functionality must be applied to both files** until the planned shared module extraction is completed.

Duplicated functions:
- `createTabElement()`, `renderTabs()`, `renderContexts()`, `renderGroups()`, `renderSavedGroups()`
- `sortTabIds()` (extracted in home.js, inline in sidebar.js)
- `getPriorityColor()`, `formatTime()`, `toggleSelection()`, `setupNavigation()`
- State object structure, `refreshAllData()`

### 5. Architecture Notes
- **MV3 Service Worker** — `background.js` is the central hub. All data flows through `chrome.runtime.sendMessage` → `handleMessage()`.
- **30+ message types** — see `handleMessage()` switch statement in background.js (line 823+).
- **Storage** — all state in `chrome.storage.local`: `tabs`, `subGroups`, `categories`, `closedContexts`, `sessions`, `timeTracking`, `settings`, `sugarBox`, `parkedTabs`, `stepAwayState`.
- **No build system** — raw JS files, no bundling, no transpilation.
- **Icons** — all 501 bytes, likely placeholders needing real artwork.

### 6. Testing
No automated tests exist. Manual verification:
1. Load unpacked at `chrome://extensions`
2. Check Service Worker console for errors
3. Open sidebar (side panel)
4. Open new tab (home.html)
5. Click extension icon (popup)
6. Navigate to a non-Chrome URL to test Gatekeeper

## Quick Reference

### Message Types (background.js)
```
GET_ALL_TABS, GET_TAB, UPDATE_TAB, BATCH_UPDATE_CONTEXT,
SET_PRIORITY, TOGGLE_LOCK, UPDATE_TAB_TITLE, TOGGLE_URL_LOCK,
REQUEST_CLOSE, CANCEL_CLOSE, BULK_CLOSE,
GET_SAVED_GROUPS, CREATE_GROUP, CREATE_SUB_GROUP, GET_SUB_GROUPS,
GET_CATEGORIES, CREATE_CATEGORY, CLONE_CATEGORY,
GET_FLOW_RECALL, REOPEN_FLOW, GET_CLOSED_CONTEXTS,
GET_TIME_TRACKING, START_POMODORO,
GET_SESSIONS, GET_LATEST_SESSION,
GET_SETTINGS, UPDATE_SETTINGS,
EXPORT_MARKDOWN, FOCUS_TAB,
CHECK_CONTEXT_NEEDED, SET_TAB_CONTEXT, START_SIDE_QUEST,
ADD_TO_SUGAR_BOX, PARK_TAB
```

### Category IDs
`work`, `media`, `meeting`, `reference`, `messaging`, `email`, `learning`, `entertainment`, `unknown`
