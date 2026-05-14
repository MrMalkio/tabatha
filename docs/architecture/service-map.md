# Service Map — Handler → Module Assignment

> Every message handler in master's `background.js` (v3.34.5-α, 2920 lines) mapped to its target service module.  
> Use this as the extraction guide for `refactor/decomp-v2`.  
> **79 handlers across 12 services** (+ 6 companion-bridge handlers handled separately).

---

## focusService.js — 14 handlers

Focus engine lifecycle: create, switch, complete, tag, merge, pause/resume.

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `GET_FOCUS_ENGINE` | 2425 | Return full focus engine state |
| 2 | `START_FOCUS` | 2428 | Create + activate a new focus item |
| 3 | `ADD_FOCUS` | 2438 | Add a focus item without switching to it |
| 4 | `SWITCH_FOCUS` | 2443 | Pause current, activate another |
| 5 | `COMPLETE_FOCUS` | 2446 | Mark focus as done |
| 6 | `EXTEND_FOCUS_TIMER` | 2449 | Add minutes to active timer |
| 7 | `SET_FUNNEL_STAGE` | 2452 | Move focus through funnel stages (state machine) |
| 8 | `UPDATE_FOCUS_TAGS` | 2496 | Update client/project/task tags |
| 9 | `RENAME_FOCUS` | 2499 | Change focus label |
| 10 | `UPDATE_FOCUS` | 2509 | Update focus properties + stage transition engine |
| 11 | `PAUSE_FOCUS` | 2609 | Pause active focus, save elapsed time |
| 12 | `RESUME_FOCUS` | 2628 | Resume paused focus, auto-pause others |
| 13 | `LINK_INTENT_TO_TASK` | 2256 | Link a focus item to a task |
| 14 | `MERGE_INTENTS` | 2279 | Merge two focus items (tabs + time) |

**Dependencies:** storageService, notificationService, clockService (RESUME_FOCUS auto-ends break)

---

## tabService.js — 21 handlers

Tab state management: context, intent, locks, priorities, categories, URL locks.

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `GET_ALL_TABS` | 1657 | Return all tracked tabs |
| 2 | `GET_TAB` | 1660 | Return single tab data |
| 3 | `UPDATE_TAB` | 1664 | Update arbitrary tab properties |
| 4 | `BATCH_UPDATE_CONTEXT` | 1674 | Set context on multiple tabs at once |
| 5 | `SET_PRIORITY` | 1688 | Set tab priority level |
| 6 | `TOGGLE_LOCK` | 1708 | Lock/unlock a tab from closing |
| 7 | `UPDATE_TAB_TITLE` | 1718 | Change tracked tab title |
| 8 | `TOGGLE_URL_LOCK` | 1728 | Lock/unlock a specific URL |
| 9 | `REQUEST_CLOSE` | 1755 | Begin close workflow |
| 10 | `CANCEL_CLOSE` | 1758 | Cancel a pending close |
| 11 | `BULK_CLOSE` | 1763 | Close multiple tabs |
| 12 | `FOCUS_TAB` | 1870 | Bring tab to foreground |
| 13 | `CHECK_CONTEXT_NEEDED` | 1879 | Check if tab needs context assignment |
| 14 | `SET_TAB_CONTEXT` | 1980 | Assign context to a tab |
| 15 | `SET_INTENT` | 2037 | Set intent for a tab |
| 16 | `SKIP_DOMAIN` | 2176 | Mark domain as "never ask" for context |
| 17 | `ASSOCIATE_TAB_WITH_FOCUS` | 2204 | Link a tab ID to a focus item |
| 18 | `GET_CURRENT_TAB_ID` | 2218 | Return sender's tab ID |
| 19 | `CLOSE_TAB` | 2222 | Close a specific tab |
| 20 | `LINK_TAB_TO_INTENT` | 2228 | Associate tab with an intent |
| 21 | `RENAME_TAB` | 2667 | Set custom title for a tab |
| 22 | `UPDATE_TAB_CONTEXT` | 2677 | Update tab context + intent |

> **Note:** 22 entries — `UPDATE_TAB_CONTEXT` was added post-v1 audit. Actual unique cases = 22.

**Dependencies:** storageService, notificationService, categoryService, focusService (for LINK_TAB_TO_INTENT, ASSOCIATE_TAB_WITH_FOCUS)

---

## tabTrackingService.js — 2 handlers + chrome.tabs listeners

Active/passive time tracking, heartbeats, tab closures.

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `GET_TIME_TRACKING` | 1824 | Return time tracking data |
| 2 | `LOG_INTENT_ACTION` | 2186 | Log an intent-related action with timestamp |

**Also owns:** `chrome.tabs.onActivated` time tracking logic, `chrome.tabs.onRemoved` closure tracking.

**Dependencies:** storageService, tabService

---

## clockService.js — 7 handlers

Already partially extracted as `clock.js`. Move to `services/` and wrap.

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `CLOCK_IN` | 2819 | Start a new stint |
| 2 | `CLOCK_OUT` | 2829 | End current stint |
| 3 | `TOGGLE_BREAK` | 2841 | Start/end a break (auto-pauses focus) |
| 4 | `GET_CLOCK_STATUS` | 2838 | Return current clock session state |
| 5 | `GET_CLOCK_HISTORY` | 2869 | Return all historical stints |
| 6 | `GET_LAST_SESSION` | 2866 | Return most recent completed stint |
| 7 | `GET_LATEST_SESSION` | 1836 | Return latest session data |

**Dependencies:** storageService, notificationService, companionBridge, focusService (TOGGLE_BREAK auto-pauses active focus)

---

## taskService.js — 4 handlers

Task CRUD with org registry (legacy fallback).

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `GET_TASKS` | 2309 | Return merged org + legacy tasks |
| 2 | `CREATE_TASK` | 2318 | Create task in org registry |
| 3 | `UPDATE_TASK` | 2343 | Update task (with funnel stage gating) |
| 4 | `DELETE_TASK` | 2405 | Archive task (soft delete) |

**Dependencies:** storageService, notificationService

---

## groupService.js — 4 handlers

Tab grouping with Chrome tab groups sync.

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `GET_SAVED_GROUPS` | 1767 | Return saved groups |
| 2 | `CREATE_GROUP` | 1789 | Create a new group |
| 3 | `CREATE_SUB_GROUP` | 1794 | Create sub-group under parent |
| 4 | `GET_SUB_GROUPS` | 1799 | Return sub-groups for parent |

**Dependencies:** storageService

---

## categoryService.js — 3 handlers

Tab categories and URL pattern matching.

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `GET_CATEGORIES` | 1803 | Return all categories |
| 2 | `CREATE_CATEGORY` | 1806 | Create a custom category |
| 3 | `CLONE_CATEGORY` | 1809 | Clone an existing category |

**Dependencies:** storageService

---

## blockgateService.js — 6 handlers

Site blocking, gating, temporary unblocking, sugar box, parking.

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `CHECK_BLOCKED_SITE` | 2691 | Check if URL is blocked |
| 2 | `UNBLOCK_SITE_TEMPORARILY` | 2717 | Temporary unblock with alarm |
| 3 | `MANAGE_BLOCKED_SITES` | 2735 | Add/remove/list blocked sites |
| 4 | `ADD_TO_SUGAR_BOX` | 2149 | Save URL as "reward for later" |
| 5 | `PARK_TAB` | 2163 | Stash tab for later |
| 6 | `START_SIDE_QUEST` | 2118 | Begin a tracked side quest |

**Dependencies:** storageService, settingsService

---

## sessionService.js — 5 handlers

Session/context history, flow recall, markdown export.

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `GET_SESSIONS` | 1833 | Return session history |
| 2 | `GET_LATEST_SESSION` | 1836 | Return latest session |
| 3 | `GET_CLOSED_CONTEXTS` | 1820 | Return closed/archived contexts |
| 4 | `GET_FLOW_RECALL` | 1813 | Get suggested flow based on URL |
| 5 | `REOPEN_FLOW` | 1816 | Reopen a previously saved flow |
| 6 | `EXPORT_MARKDOWN` | 1865 | Export session data as markdown |

> **Resolved (Task 03):** `GET_LATEST_SESSION` is owned by sessionService (same `{ session }` shape, source is the `sessions` snapshot list). clockService keeps `GET_LAST_SESSION` for its stints-based view.

**Dependencies:** storageService, notificationService

---

## settingsService.js — 2 handlers

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `GET_SETTINGS` | 1841 | Return current settings |
| 2 | `UPDATE_SETTINGS` | 1844 | Update settings + broadcast |

**Dependencies:** storageService

---

## notificationService.js — 5 handlers + broadcast utility

Broadcasting, InBar data, popup triggering.

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `OPEN_POPUP` | 2797 | Trigger gatekeeper injection |
| 2 | `GET_INBAR_DATA` | 2756 | Compute InBar state (focus + tab + time) |
| 3 | `GET_INBAR_NOTES` | 2790 | Return saved InBar notes |
| 4 | `SAVE_INBAR_NOTE` | 2781 | Save InBar note |
| 5 | `START_POMODORO` | 1827 | Begin a pomodoro timer |

**Exports:** `broadcastToExtension(msg)`, `broadcastToAllTabs(msg)`, `broadcastAll(msg)` — used by background listeners and other services to avoid spraying extension-only events at content scripts.

**Dependencies:** storageService, focusService (GET_INBAR_DATA needs focus engine + tab context)

---

## companionService.js — 5 handlers

Desktop companion proxy.

| # | Handler | Line (approx) | Description |
|---|---------|--------------|-------------|
| 1 | `GET_COMPANION_STATUS` | 2873 | Return WebSocket connection state |
| 2 | `GET_COMPANION_SUMMARY` | 2881 | Request daily summary from desktop |
| 3 | `COMPANION_CLOCK_IN` | 2888 | Forward clock-in to desktop |
| 4 | `COMPANION_CLOCK_OUT` | 2895 | Forward clock-out to desktop |
| 5 | `COMPANION_TOGGLE_BREAK` | 2902 | Forward break toggle to desktop |

**Dependencies:** companion-bridge.js

---

## companion-bridge.js — 6 WebSocket message handlers (separate from router)

These are handled internally by the companion bridge, NOT through the chrome.runtime.onMessage router:

| # | WS Message Type | Description |
|---|----------------|-------------|
| 1 | `APP_SWITCH` | Desktop app focus change |
| 2 | `APP_SESSION_END` | Desktop app session ended |
| 3 | `COMPANION_STATUS` | Companion heartbeat/status |
| 4 | `CLOCK_STATE` | Clock state sync from desktop |
| 5 | `DAILY_SUMMARY` | Daily summary response |
| 6 | `IDLE_STATE` | Desktop idle state change |

---

## Non-Message Code to Extract

| Code Block | Target | Description |
|------------|--------|-------------|
| `DEFAULT_SETTINGS` | `constants.js` | Default settings object |
| `PRIORITY_LEVELS` | `constants.js` | Priority level definitions |
| `BUILT_IN_CATEGORIES` | `constants.js` | Category definitions + URL patterns |
| `patternToRegex()` | `helpers.js` | Convert URL pattern to regex |
| `formatTime()` | `helpers.js` | Time formatting utility |
| `detectCategory()` | `helpers.js` | URL → category matcher |
| `chrome.tabs.onCreated` | `tabService.js` | New tab handler |
| `chrome.tabs.onUpdated` | `tabService.js` | Tab URL/title change handler |
| `chrome.tabs.onRemoved` | `tabService.js` + `tabTrackingService.js` | Tab close handler |
| `chrome.tabs.onActivated` | `tabTrackingService.js` | Tab switch — time tracking |
| `chrome.idle.onStateChanged` | `clockService.js` | Idle/active detection |
| `chrome.alarms.onAlarm` | Router (delegates) | Timer alarms, auto-break, etc. |
| `chrome.tabGroups.*` | `groupService.js` | Tab group sync listeners |
| `initializeState()` | Router | Startup initialization |
| `migrateTasksToOrg()` | `taskService.js` | One-time legacy migration |
