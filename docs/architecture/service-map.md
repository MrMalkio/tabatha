# Service Map — Handler → Module Assignment

> Every message handler in `background.js` mapped to its target service module.  
> Use this as the extraction guide.

---

## focusService.js (14 handlers)

Focus engine lifecycle: create, switch, complete, tag, merge, block.

| Handler | Line Range (approx) | Description |
|---------|---------------------|-------------|
| `GET_FOCUS_ENGINE` | — | Return full focus engine state |
| `START_FOCUS` | — | Create + activate a new focus item |
| `ADD_FOCUS` | — | Add a focus item without switching to it |
| `SWITCH_FOCUS` | — | Pause current, activate another |
| `COMPLETE_FOCUS` | — | Mark focus as done, archive |
| `UPDATE_FOCUS` | — | Update focus properties (label, state) |
| `RENAME_FOCUS` | — | Change focus label |
| `EXTEND_FOCUS_TIMER` | — | Add minutes to active timer |
| `UPDATE_FOCUS_TAGS` | — | Update client/project/task tags |
| `SET_FUNNEL_STAGE` | — | Move focus through funnel stages |
| `SET_PRIORITY` | — | Set priority level (1-10) |
| `LINK_INTENT_TO_TASK` | — | Link a focus item to a task |
| `MERGE_INTENTS` | — | Merge two focus items |
| `ASSOCIATE_TAB_WITH_FOCUS` | — | Link a tab ID to a focus item |

**Dependencies:** storageService, notificationService

---

## tabService.js (17 handlers)

Tab state management: context, intent, locks, categories.

| Handler | Description |
|---------|-------------|
| `GET_ALL_TABS` | Return all tracked tabs |
| `GET_TAB` | Return single tab data |
| `GET_CURRENT_TAB_ID` | Return chrome.tabs.query active tab ID |
| `UPDATE_TAB` | Update arbitrary tab properties |
| `UPDATE_TAB_TITLE` | Change tracked tab title |
| `SET_TAB_CONTEXT` | Assign context (session) to a tab |
| `LINK_TAB_TO_INTENT` | Associate tab with an intent |
| `BATCH_UPDATE_CONTEXT` | Set context on multiple tabs at once |
| `CHECK_CONTEXT_NEEDED` | Check if tab needs context assignment |
| `SKIP_DOMAIN` | Mark domain as "never ask" for context |
| `TOGGLE_LOCK` | Lock/unlock a tab from closing |
| `TOGGLE_URL_LOCK` | Lock/unlock a specific URL |
| `FOCUS_TAB` | Bring tab to foreground |
| `CLOSE_TAB` | Close a specific tab |
| `BULK_CLOSE` | Close multiple tabs |
| `REQUEST_CLOSE` | Begin close workflow (may prompt) |
| `CANCEL_CLOSE` | Cancel a pending close |

**Dependencies:** storageService, notificationService, categoryService

---

## tabTrackingService.js (2 handlers + chrome.tabs listeners)

Active/passive time tracking, heartbeats, tab closures.

| Handler | Description |
|---------|-------------|
| `GET_TIME_TRACKING` | Return time tracking data |
| `LOG_INTENT_ACTION` | Log an intent-related action with timestamp |

**Also owns:** `chrome.tabs.onActivated` time tracking logic, `chrome.tabs.onRemoved` closure tracking.

**Dependencies:** storageService, tabService

---

## clockService.js (7 handlers)

Already partially extracted as `clock.js`. Move to `services/` and add remaining handlers.

| Handler | Description |
|---------|-------------|
| `CLOCK_IN` | Start a new stint |
| `CLOCK_OUT` | End current stint |
| `TOGGLE_BREAK` | Start/end a break within a stint |
| `GET_CLOCK_STATUS` | Return current clock session state |
| `GET_CLOCK_HISTORY` | Return all historical stints |
| `GET_LAST_SESSION` | Return most recent completed stint |
| `GET_LATEST_SESSION` | Return latest session data |

**Dependencies:** storageService, notificationService

---

## taskService.js (4 handlers)

Internal task CRUD.

| Handler | Description |
|---------|-------------|
| `GET_TASKS` | Return all tasks |
| `CREATE_TASK` | Create a new task |
| `UPDATE_TASK` | Update task properties |
| `DELETE_TASK` | Delete a task |

**Dependencies:** storageService, notificationService

---

## groupService.js (4 handlers)

Tab grouping with Chrome tab groups sync.

| Handler | Description |
|---------|-------------|
| `GET_SAVED_GROUPS` | Return saved groups |
| `CREATE_GROUP` | Create a new group |
| `CREATE_SUB_GROUP` | Create a sub-group under a parent |
| `GET_SUB_GROUPS` | Return sub-groups for a parent |

**Dependencies:** storageService

---

## categoryService.js (3 handlers)

Tab categories and URL pattern matching.

| Handler | Description |
|---------|-------------|
| `GET_CATEGORIES` | Return all categories |
| `CREATE_CATEGORY` | Create a custom category |
| `CLONE_CATEGORY` | Clone an existing category |

**Dependencies:** storageService

---

## blockgateService.js (6 handlers)

Site blocking, gating, temporary unblocking, sugar box, parking.

| Handler | Description |
|---------|-------------|
| `CHECK_BLOCKED_SITE` | Check if a URL is blocked |
| `MANAGE_BLOCKED_SITES` | Add/remove blocked sites |
| `UNBLOCK_SITE_TEMPORARILY` | Temporary unblock with timer |
| `ADD_TO_SUGAR_BOX` | Save URL as "reward for later" |
| `PARK_TAB` | Stash tab for later |
| `START_SIDE_QUEST` | Begin a tracked side quest |

**Dependencies:** storageService, settingsService

---

## sessionService.js (5 handlers)

Session/context history, flow recall, markdown export.

| Handler | Description |
|---------|-------------|
| `GET_SESSIONS` | Return session history |
| `GET_CLOSED_CONTEXTS` | Return closed/archived contexts |
| `GET_FLOW_RECALL` | Get suggested flow based on URL patterns |
| `REOPEN_FLOW` | Reopen a previously saved flow |
| `EXPORT_MARKDOWN` | Export session data as markdown |

**Dependencies:** storageService, notificationService

---

## settingsService.js (2 handlers)

Settings read/write.

| Handler | Description |
|---------|-------------|
| `GET_SETTINGS` | Return current settings |
| `UPDATE_SETTINGS` | Update settings |

**Dependencies:** storageService

---

## notificationService.js (5 handlers + broadcast utility)

Broadcasting, InBar data, popup triggering.

| Handler | Description |
|---------|-------------|
| `OPEN_POPUP` | Trigger popup open |
| `GET_INBAR_DATA` | Compute and return InBar state |
| `GET_INBAR_NOTES` | Return saved InBar notes |
| `SAVE_INBAR_NOTE` | Save InBar note |
| `START_POMODORO` | Begin a pomodoro timer |

**Exports:** `broadcastMessage(msg)` — used by all other services.

**Dependencies:** storageService, focusService (for GET_INBAR_DATA)

> [!NOTE]
> `GET_INBAR_DATA` has cross-service dependencies (needs focus engine + tab context).
> It may need to call into focusService and tabService. This is acceptable —
> notificationService acts as a "view compositor" for InBar data.

---

## Non-Message Code to Extract

These are NOT message handlers but important code blocks that live in `background.js`:

| Code Block | Target | Description |
|------------|--------|-------------|
| `DEFAULT_SETTINGS` | `constants.js` | Default settings object |
| `PRIORITY_LEVELS` | `constants.js` | Priority level definitions |
| `BUILT_IN_CATEGORIES` | `constants.js` | Category definitions + URL patterns |
| `patternToRegex()` | `helpers.js` | Convert URL pattern to regex |
| `formatTime()` | `helpers.js` | Time formatting utility |
| `chrome.tabs.onCreated` | `tabService.js` | New tab handler |
| `chrome.tabs.onUpdated` | `tabService.js` | Tab URL/title change handler |
| `chrome.tabs.onRemoved` | `tabService.js` + `tabTrackingService.js` | Tab close handler |
| `chrome.tabs.onActivated` | `tabTrackingService.js` | Tab switch — time tracking |
| `chrome.idle.onStateChanged` | `clockService.js` | Idle/active detection |
| `chrome.alarms.onAlarm` | Router (delegates) | Timer alarms, auto-break, etc. |
| `chrome.tabGroups.*` | `groupService.js` | Tab group sync listeners |
