# Tabatha â€” Agent Instructions

> This file instructs AI agents how to work on the Tabatha Chrome Extension project.

## Project Identity

**Tabatha** is a Chrome MV3 extension â€” a Context-Driven Tab Manager / "Attention Operating System" for the browser. It enforces intentional browsing by assigning Context and Intent to every tab, tracking time, and providing focus tools.

## Mandatory Protocols

### 1. Progress Logging
- **Update [docs/progress.md](file:///c:/Users/mrmal/Le%20Dev/Tabatha/docs/progress.md) at the end of every session.**
- Add a new session entry with: date, goal, what was done (checklist), key findings, decisions made, and next steps.
- Mark items `[x]` when complete, `[/]` when in-progress.

### 2. Before You Code â€” Read These First
Only read these files when working on the corresponding area:

| Working On | Read First |
|-----------|------------|
| Any feature work | [docs/progress.md](file:///c:/Users/mrmal/Le%20Dev/Tabatha/docs/progress.md) â€” check last session's next steps |
| Architecture / reorganization | [Tabatha_Concept.md](file:///c:/Users/mrmal/Le%20Dev/Tabatha/Tabatha_Concept.md) â€” core philosophy |
| Feature planning | [ROADMAP.md](file:///c:/Users/mrmal/Le%20Dev/Tabatha/ROADMAP.md) â€” phase plan |
| What's changed | [Tabatha_Changelog.md](file:///c:/Users/mrmal/Le%20Dev/Tabatha/Tabatha_Changelog.md) â€” version history |
| Background / service worker | [background.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/background.js) â€” 1206-line monolith, all message routing |
| Sidebar UI | [sidebar.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/sidebar.js) â€” âš ï¸ has missing functions (see Known Bugs) |
| Home / New Tab page | [home.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/home.js) â€” âš ï¸ has missing functions, heavy duplication with sidebar.js |
| Extension popup | [popup.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/popup.js) â€” search + Step Away mode |
| Content scripts | [gatekeeper.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/gatekeeper.js), [url-lock.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/url-lock.js) |
| Permissions / manifest | [manifest.json](file:///c:/Users/mrmal/Le%20Dev/Tabatha/manifest.json) |

### 3. Known Bugs (As of 2026-04-23)
These are the highest-priority issues. Fix before adding features:

1. **FATAL** â€” `sidebar.js:95` â€” `sendMessage()` and `populateFilterCategories()` are referenced but never defined. The sidebar is completely non-functional.
2. **FATAL** â€” `home.js` â€” `updateStats()` is called but never defined. Home dashboard crashes on load.
3. **FATAL** â€” `home.js:141` â€” `setupGreeting()` is defined but never called in `DOMContentLoaded`.
4. `sidebar.js:620` â€” Listener for `#off-chrome-dismiss` but HTML ID is `#off-chrome-skip`.
5. `background.js:1175` â€” `setPanelBehavior({ openPanelOnActionClick: true })` conflicts with `manifest.json` `default_popup`.
6. `gatekeeper.js:28` â€” `document.body.style.overflow` at `document_start` â€” body may not exist.
7. `background.js:346,1193` â€” Duplicate `notifications.onClicked` listeners.
8. `home.html:125` â€” Purpose modal is an empty `<!-- ... copy modal structure ... -->` comment.

### 4. Code Duplication Warning
`sidebar.js` and `home.js` share ~80% identical code. **Any change to shared functionality must be applied to both files** until the planned shared module extraction is completed.

Duplicated functions:
- `createTabElement()`, `renderTabs()`, `renderContexts()`, `renderGroups()`, `renderSavedGroups()`
- `sortTabIds()` (extracted in home.js, inline in sidebar.js)
- `getPriorityColor()`, `formatTime()`, `toggleSelection()`, `setupNavigation()`
- State object structure, `refreshAllData()`

### 5. Architecture Notes
- **MV3 Service Worker** â€” `background.js` is the central hub. All data flows through `chrome.runtime.sendMessage` â†’ `handleMessage()`.
- **30+ message types** â€” see `handleMessage()` switch statement in background.js (line 823+).
- **Storage** â€” all state in `chrome.storage.local`: `tabs`, `subGroups`, `categories`, `closedContexts`, `sessions`, `timeTracking`, `settings`, `sugarBox`, `parkedTabs`, `stepAwayState`.
- **No build system** â€” raw JS files, no bundling, no transpilation.
- **Icons** â€” all 501 bytes, likely placeholders needing real artwork.

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

---

<!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
<!-- HEADBOX v0.1.0 | Main: v0.1.0 | Uses: 4 | Status: active          -->
<!-- Owner: Malkio | Workspace: c:\Users\mrmal\Le Dev\Tabatha            -->
<!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->

## Project State

- **Current version:** 0.2.8-alpha
- **Current focus:** Phase 3/4 â€” Deep Customization & Sync (InPop 2.0, InBar, BlockGate, and Supabase integration complete)
- **Architecture:** React 19 + Vite 8 + TailwindCSS 4, Chrome MV3 Extension, Framer Motion
- **Dev command:** `npm run dev`
- **Build command:** `npm run build`
- **Port:** 5173 (Vite default)

---

## Mission

Tabatha is a **Context-Driven Tab Manager** â€” an "Attention Operating System" for the browser. It enforces intentional browsing by assigning Context and Intent to every tab, tracking time, and providing focus tools. Part of the Flux ecosystem.

---

## Workspace Map

See `.headbox/workspace-map.md` for the full project file tree.

---

## Critical Files

| File | Purpose | When to read |
|------|---------|-------------|
| This file (`AGENTS.md`) | Project state, rules, session log | Always â€” first thing |
| `.gemini/agent.md` | Gemini-specific instructions (known bugs, architecture, message types) | When working with Gemini |
| `docs/progress.md` | Session progress log | Before starting work â€” check last session's next steps |
| `ROADMAP.md` | 6-phase feature roadmap | When planning features |
| `Tabatha_Concept.md` | Core philosophy â€” "Attention Operating System" | When making architecture decisions |
| `Tabatha_Changelog.md` | Version history | When tracking what's changed |
| `src/App.jsx` | Main React entry | When touching app structure |
| `public/manifest.json` | Chrome MV3 manifest | When changing permissions/pages |
| `vite.config.js` | Multi-page build config | When adding pages or changing build |

> ðŸ“Ž More files added as they become frequently used. Reviewed at 20th-use.

---

## Approach Protocol

1. **Read this file first.** Check project state, current focus, session log.
2. **Check `.headbox/sticky-notes/`** for notes from other agents.
3. **Check `.headbox/workspace-map.md`** if you need structural context.
4. **Check `docs/progress.md`** for last session's next steps.
5. **Work incrementally.** Small commits, testable changes.
6. **Practice progressive disclosure.** Read what you need, drill deeper only when necessary.

---

## Global Rules

1. **Always commit before ending a session** â€” use `wip:` prefix if incomplete. Before closing, **ask the user if the session is over** so nothing is left uncommitted.
2. **Follow Conventional Commits** â€” `{type}({scope}): {description}`
3. **Never push directly to `master`** â€” always via PR or explicit human approval.
4. **When in doubt â€” always ask.** Surface ambiguity early, propose a direction, confirm before acting.
5. **Stay on task.** If you notice something unrelated, **Valet it** (see Valeting below).
6. **On `checkpoint`** â€” update any known task(s) with progress and reference artifacts.
7. **Practice progressive disclosure.** Do NOT read every file. Read what you need.
8. **Check `.headbox/sticky-notes/`** at session start for notes left by other agents or humans.
9. **Number Implementation Plans** â€” Always uniquely name your implementation plans with a version number (e.g. `implementation_plan_011.md`). Not uniquely naming them will overwrite other files in the same project.

---

## Local Rules

- **Update `docs/progress.md`** at the end of every session with: date, goal, what was done, key findings, decisions, next steps.
- **Update `Tabatha_Changelog.md`** when shipping version changes.
- **Legacy code in `v0_legacy/`** â€” reference only. Do not modify. All new work happens in `src/`.
- **Multi-page build** â€” Tabatha has separate HTML entry points: `index.html`, `home.html`, `popup.html`, `sidebar.html`, `settings.html`. Changes to build config affect all of them.
- **Chrome extension context** â€” always test changes by loading unpacked at `chrome://extensions` and checking the Service Worker console.

---

## Valeting (Parking Lot Protocol)

When you notice something that is **not part of your current task**, do not act on it unless it's obligatory. Instead, **append** an entry to `.headbox/parking_lot.md`:

```
## {date} â€” {brief_title}
- **Noticed while:** {task}
- **What:** {observation}
- **Why it matters:** {impact}
- **Options:**
  1. {option_a}
  2. {option_b}
  3. {option_c} â† **suggested**
```

**Mechanics:**
- **Append only.** Never rewrite the parking lot.
- Before appending, scan existing headers only to check for duplicates.

---

## Checkpoint Protocol

When the user says **`checkpoint`** or you reach a natural stopping point:

1. Update all known task(s) with a progress comment.
2. Include: what was done, what's next, references to artifacts with file paths.
3. If no task is known, ask the user if there's one to associate.

---

## Session Handoff Protocol

**After every session, update the Session Log below.**

- **Append** a new entry. **Never delete** previous entries.
- **Increment the usage counter** in the headbox header by 1.
- **On every 20th use**: ask the user if anything should be updated.
- You MAY update `Current version` and `Current focus` in Project State.
- **Sync all vendor files** â€” after updating `AGENTS.md`, ensure `CLAUDE.md`, `GEMINI.md`, and `.gemini/agent.md` have the same headbox section.

---

## Session Log

| Date | Agent | Focus | Work Done | Next Steps |
|------|-------|-------|-----------|------------|
| 2026-04-27 | Antigravity | Headbox install | Pilot install â€” scaffolded .headbox/, appended headbox section to AGENTS.md and .gemini/agent.md | Begin Phase 2 feature work |
| 2026-04-27 | Gemini | Update Project State | Updated AGENTS.md Headbox Project State to reflect completion of Phase 2 features and shift to Phase 3/4 (v0.2.1-alpha) | Proceed with Phase 3/4 feature development |
| 2026-04-28 | Antigravity | Logs Panel & Theme Refactor | Finalized Link/Merge modal, Tabs actions, Logs Panel, Settings Walkthrough, and Theme expansion. | General backlog (Sync logic, Supabase) |
| 2026-04-28 | Antigravity | Supabase Sync Engine | Pushed Supabase schema, configured client, and hooked up debounced sync wrapper to background focus & intent mutations. | Implement user authentication (Auth Refinement) |
| 2026-04-29 | Antigravity | Asana Time Tracker Widget | Built Flux Asana widget server (Express/HTTPS), migration 004 (flux_time_entries), full e2e test passing. | Register app in Asana Developer Console, add user name resolution |
| 2026-05-09 | Antigravity | Diagnostic Fix Sweep | Fixed 14/16 diagnostic issues + root cause (missing type:module in manifest). Added logger service, debug mode setting, Developer panel in settings. All sendMessage errors now logged. | Architecture refactor (background.js monolith), version automation |
| 2026-05-09 | Antigravity | Clock Extraction + InPop + Work Shifts | Fixed InPop (contextSource tracking, inherited vs user contexts). Extracted clock.js + storage.js from monolith. Built Work Shifts page (3 views, stubbed analytics). Added last session + work logs to home. Fixed InBar "set intent" button (OPEN_POPUP handler). Added UPDATE_FOCUS editing. Implemented Chrome tab groups bidirectional sync. Built URL Rules settings section (3 tabs: rules, domain groups, intent changelog). URL rules auto-apply on tab creation. Sidebar parity (groups panel, work shifts link). | BlockGate enhancements, InBar customization, debug bar expansion |
| 2026-05-10 | Antigravity | Intent Bugs + Tasks + Idle | Fixed tab-to-intent association (label matching). Rewrote LinkMergeModal. Added funnel stage editor. Built TasksPanel with full CRUD. Compact LogsPanel filter bar. Idle auto-break (5minâ†’break, auto-resume). Welcome Back flash overlay. Work schedule view. Break notes. Bumped to v0.2.8. | Sidebar tasks parity, InBar customization settings, BlockGate reason/guard |
| 2026-05-10 | Codex | Background Service Decomposition | Used isolated worktree for `refactor/service-arch`; extracted mapped handlers/listeners into background services, added `fluxApi` facade, updated migration checklist, and verified final build. | Chrome extension manual reload/service worker verification |

<!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
<!-- END HEADBOX                                                        -->
<!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
