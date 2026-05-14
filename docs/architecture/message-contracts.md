# Message Contracts — Response Shape Registry

> **Frozen response shapes** for every message type in `background.js`.  
> Populate as services are extracted in `refactor/decomp-v2`.  
> Any change to a response shape must be documented here with a version note.  
> **Baseline:** `master` @ v3.34.5-α

---

## How to Read This

Each entry documents:
- **Message type** — the `case` string
- **Request shape** — what the caller sends (besides `{ type }`)
- **Response shape** — what the handler returns
- **Service** — target service module

**Status:** ⬜ = not yet verified | ✅ = verified against code | 🔄 = shape changed during extraction

---

## focusService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_FOCUS_ENGINE` | — | `{ focusEngine }` | ✅ |
| `START_FOCUS` | `{ label, timerMinutes, tags }` | `{ focusEngine }` | ✅ |
| `ADD_FOCUS` | `{ label, timerMinutes, tags }` | `{ focusEngine, newFocusId }` | ✅ |
| `SWITCH_FOCUS` | `{ focusId }` | `{ focusEngine }` | ✅ |
| `COMPLETE_FOCUS` | `{ focusId }` | `{ focusEngine }` | ✅ |
| `EXTEND_FOCUS_TIMER` | `{ focusId, extraMinutes }` | `{ focusEngine }` | ✅ |
| `SET_FUNNEL_STAGE` | `{ focusId, stage, confirmed? }` | `{ focusEngine }` or `{ error, needsConfirm, focusEngine }` | ✅ |
| `UPDATE_FOCUS_TAGS` | `{ focusId, tags }` | `{ focusEngine }` | ✅ |
| `RENAME_FOCUS` | `{ focusId, newLabel }` | `{ focusEngine }` | ✅ |
| `UPDATE_FOCUS` | `{ focusId, label?, timerMinutes?, tags?, funnelStage?, confirmed? }` | `{ focusEngine }` or `{ error, needsConfirm, focusEngine }` | ✅ |
| `PAUSE_FOCUS` | `{ focusId? }` | `{ focusEngine }` or `{ error, focusEngine }` | ✅ |
| `RESUME_FOCUS` | `{ focusId }` | `{ focusEngine }` or `{ error, focusEngine }` | ✅ |
| `LINK_INTENT_TO_TASK` | `{ intentId, taskId?, newTaskName? }` | `{ success }` | ✅ |
| `MERGE_INTENTS` | `{ sourceIntentId, targetIntentId }` | `{ success }` | ✅ |

---

## tabService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_ALL_TABS` | — | `{ tabs }` | ✅ |
| `GET_TAB` | `{ tabId }` | `{ tab }` | ✅ |
| `UPDATE_TAB` | `{ tabId, updates }` | `{ success }` | ✅ |
| `BATCH_UPDATE_CONTEXT` | `{ updates: [{ tabId, context, intent }] }` | `{ success }` | ✅ |
| `SET_PRIORITY` | `{ tabId, priority }` | `{ success }` | ✅ |
| `TOGGLE_LOCK` | `{ tabId }` | `{ success }` | ✅ |
| `UPDATE_TAB_TITLE` | `{ tabId, title }` | `{ success }` | ✅ |
| `TOGGLE_URL_LOCK` | `{ tabId, scope? }` | `{ success }` | ✅ |
| `REQUEST_CLOSE` | `{ tabId }` | `{ closed }` or `{ closed, needsConfirmation, tabData }` | ✅ |
| `CANCEL_CLOSE` | `{ tabId }` | `{ success }` | ✅ |
| `BULK_CLOSE` | `{ tabIds, context?, intent? }` | `{ closed, needsConfirmation }` | ✅ |
| `FOCUS_TAB` | `{ tabId }` | `{ success }` | ✅ |
| `CHECK_CONTEXT_NEEDED` | — (uses sender.tab) | `{ needed }` or `{ needed, inheritedContext, inheritedIntent, contextSource }` | ✅ |
| `SET_TAB_CONTEXT` | `{ context, intent?, category? }` (uses sender.tab) | `{ success }` or `{ error }` | ✅ |
| `SET_INTENT` | `{ payload }` (uses sender.tab) | `{ success }` or `{ error }` | ✅ |
| `SKIP_DOMAIN` | `{ domain }` | `{ success }` | ✅ |
| `ASSOCIATE_TAB_WITH_FOCUS` | `{ tabId?, focusId }` | `{ success }` | ✅ |
| `GET_CURRENT_TAB_ID` | — (uses sender.tab) | `{ tabId }` | ✅ |
| `CLOSE_TAB` | `{ tabId }` | `{ success }` | ✅ |
| `LINK_TAB_TO_INTENT` | `{ tabId, targetIntentId }` | `{ success }` | ✅ |
| `RENAME_TAB` | `{ tabId, newTitle }` | `{ success }` | ✅ |
| `UPDATE_TAB_CONTEXT` | `{ tabId, context }` | `{ success }` | ✅ |

---

## tabTrackingService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_TIME_TRACKING` | — | `{ timeTracking }` | ✅ |
| `LOG_INTENT_ACTION` | `{ action, url, domain, context?, focusId?, tabId? }` | `{ success }` | ✅ |

---

## clockService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `CLOCK_IN` | `{ label? }` | `{ session }` or `{ error, session? }` | ✅ — verified against `clock.js` factory |
| `CLOCK_OUT` | — | `{ session }` or `{ error }` | ✅ — verified against `clock.js` factory |
| `TOGGLE_BREAK` | — | `{ session }` or `{ error }` | ✅ — auto-pauses active focus when break starts |
| `GET_CLOCK_STATUS` | — | `{ session }` | ✅ — returns `{ active: false }` fallback when no session exists |
| `GET_CLOCK_HISTORY` | — | `{ history }` | ✅ — computed duration fields preserved |
| `GET_LAST_SESSION` | — | `{ lastSession }` | ✅ — computed duration fields preserved |
| `GET_LATEST_SESSION` | — | `{ session }` | ✅ — owned by sessionService (see below); listed here only for cross-reference |

---

## clockTickService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `TICK_SUBSCRIBE` | — | `{ subscribed: true, subscribers }` | ✅ — starts singleton 1Hz interval on first subscriber |
| `TICK_UNSUBSCRIBE` | — | `{ subscribed: false, subscribers }` | ✅ — clears interval when subscriber count reaches 0 |
| `GET_TICK_STATUS` | — | `{ active, subscribers }` | ✅ |

---

## taskService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_TASKS` | — | `{ tasks }` | ✅ |
| `CREATE_TASK` | `{ name, description?, projectId?, clientId? }` | `{ success, task }` | ✅ |
| `UPDATE_TASK` | `{ taskId, updates, confirmed? }` | `{ success }` or `{ error, needsConfirm }` | ✅ |
| `DELETE_TASK` | `{ taskId }` | `{ success }` | ✅ |

---

## groupService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_SAVED_GROUPS` | — | `{ savedGroups }` (map of `groupId → { id, title, color, collapsed, tabIds, tabCount }`); `{ savedGroups: {} }` on failure | ✅ — verified against legacy behaviour |
| `CREATE_GROUP` | `{ tabIds, name, priority }` | `{ groupId }` | ✅ — verified against legacy behaviour |
| `CREATE_SUB_GROUP` | `{ name }` | `{ id }` | ✅ — verified against legacy behaviour |
| `GET_SUB_GROUPS` | — | `{ subGroups }` (map of `subGroupId → { name, projectId, chromeGroupIds, settings }`) | ✅ — verified against legacy behaviour |

---

## categoryService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_CATEGORIES` | — | `{ categories }` | ✅ |
| `CREATE_CATEGORY` | `{ id, data }` | `{ categories }` | ✅ — verified against legacy behaviour |
| `CLONE_CATEGORY` | `{ sourceId, newId, overrides? }` | `{ categories }` | ✅ — verified against legacy behaviour |

---

## blockgateService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `CHECK_BLOCKED_SITE` | — (uses `sender.tab.url`) | `{ blocked }` | ✅ — verified against legacy behaviour |
| `UNBLOCK_SITE_TEMPORARILY` | `{ domain, minutes, why, intent }` | `{ success, expiresAt }` | ✅ — verified against legacy behaviour |
| `MANAGE_BLOCKED_SITES` | `{ action: 'add' \| 'remove' \| 'list', domain? }` | `{ sites }` | ✅ — verified against legacy behaviour |
| `ADD_TO_SUGAR_BOX` | `{ url, title }` (uses `sender.tab.id` to close the tab) | `{ success }` | ✅ — FIFO cap (`settings.storage.sugarBoxCap`, default 500) archives oldest via `archiveService` |
| `PARK_TAB` | `{ url, title, context?, note? }` (uses `sender.tab.id` to close the tab) | `{ success }` | ✅ — warns once when `parkedTabs.length === settings.storage.parkedTabsWarnAt` |
| `START_SIDE_QUEST` | `{ context, minutes }` (uses `sender.tab.id`) | `{ success }` | ✅ — cross-service: calls `focusService.pauseActiveFocus('side-quest')` |

---

## sessionService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_SESSIONS` | — | `{ sessions }` | ✅ |
| `GET_LATEST_SESSION` | — | `{ session }` | ✅ — ownership resolved to sessionService (was ambiguous with clockService) |
| `GET_CLOSED_CONTEXTS` | — | `{ closedContexts }` | ✅ |
| `GET_FLOW_RECALL` | — | `{ flows }` | ✅ — verified against legacy behaviour (no `url` parameter) |
| `REOPEN_FLOW` | `{ flowKey, newIntent? }` | `{ tabIds }` | ✅ — verified against legacy behaviour |
| `EXPORT_MARKDOWN` | — | `{ success, content }` | ✅ — verified against legacy behaviour (returns `content`, not `markdown`) |

---

## settingsService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_SETTINGS` | — | `{ settings }` | ✅ |
| `UPDATE_SETTINGS` | `{ settings }` (`{ updates }` also accepted by service) | `{ settings }` or `{ error }` for invalid `settings.storage` | ✅ |

---

## notificationService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `OPEN_POPUP` | `{ tabId? }` | `{ success }` or `{ error }` | ✅ |
| `GET_INBAR_DATA` | — (uses sender.tab) | `{ show, tabContext, activeFocus, activeFocusId, allFocusItems, settings }` | ✅ |
| `GET_INBAR_NOTES` | — (uses sender.tab) | `{ note }` | ✅ |
| `SAVE_INBAR_NOTE` | `{ note, tabId? }` | `{ success }` | ✅ |
| `START_POMODORO` | `{ minutes }` | `{ success }` | ✅ |

---

## companionService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_COMPANION_STATUS` | — | `{ connected, status, activeApp, clock }` | ⬜ |
| `GET_COMPANION_SUMMARY` | `{ date? }` | `{ requested }` or `{ connected: false }` | ⬜ |
| `COMPANION_CLOCK_IN` | `{ label? }` | `{ sent }` or `{ connected: false }` | ⬜ |
| `COMPANION_CLOCK_OUT` | — | `{ sent }` or `{ connected: false }` | ⬜ |
| `COMPANION_TOGGLE_BREAK` | — | `{ sent }` or `{ connected: false }` | ⬜ |

---

## Broadcast Messages (outbound, not request/response)

These are sent through `notificationService` helpers and don't have response shapes.

| Broadcast Type | Scope | Reason |
|---------------|-------|--------|
| `FOCUS_ENGINE_UPDATED` | `broadcastAll` | Extension UI re-fetches focus state; InBar content script re-fetches data |
| `TAB_UPDATED` | `broadcastAll` | Extension UI refreshes tab state; InBar content script re-fetches data |
| `WELCOME_BACK` | `broadcastAll` | Home page shows return overlay; InBar may show paused-focus resume affordance |
| `FOCUS_TIMER_EXPIRED` | `broadcastAll` | InBar shows the interrupting timer alert |
| `AUTO_BREAK` | `broadcastToExtension` | Extension UI only |
| `CONTEXT_REMINDER` | `broadcastToExtension` | Extension UI only |
| `GROUPS_UPDATED` | `broadcastToExtension` | Extension UI only |
| `INTENT_HISTORY_UPDATED` | `broadcastToExtension` | Extension UI only |
| `INTENT_REINFORCEMENT` | `broadcastToExtension` | Extension UI only |
| `OFF_CHROME_ACTIVE` | `broadcastToExtension` | Extension UI only |
| `OFF_CHROME_RETURN` | `broadcastToExtension` | Extension UI only |
| `PARKED_TABS_UPDATED` | `broadcastToExtension` | Extension UI only |
| `PARKED_TABS_WARNING` | `broadcastToExtension` | Fires once when `parkedTabs.length` crosses `settings.storage.parkedTabsWarnAt` |
| `POMODORO_COMPLETE` | `broadcastToExtension` | Extension UI only |
| `POMODORO_STARTED` | `broadcastToExtension` | Extension UI only |
| `PROMPT_PURPOSE` | `broadcastToExtension` | No content-script listener exists today |
| `SUGAR_BOX_UPDATED` | `broadcastToExtension` | Extension UI only |
| `TABS_BATCH_UPDATED` | `broadcastToExtension` | Extension UI only |
| `TAB_ACTIVATED` | `broadcastToExtension` | Extension UI only |
| `TAB_CREATED` | `broadcastToExtension` | Extension UI only |
| `TAB_REMOVED` | `broadcastToExtension` | Extension UI only |
| `TASKS_UPDATED` | `broadcastToExtension` | Extension UI only |
| `USER_IDLE` | `broadcastToExtension` | Extension UI only |
| `CLOCK_SESSION_UPDATED` | `broadcastToExtension` | Clock service receives the scoped helper from the router |
| `STORAGE_CAP_WARNING` | `chrome.runtime.sendMessage` | Archive service warning, extension UI only |

---

## Change Log

| Date | Handler | Change | Reason |
|------|---------|--------|--------|
| 2026-05-14 | `ADD_TO_SUGAR_BOX` | List now capped at `settings.storage.sugarBoxCap` (default 500). Dropped entries route through `archiveService.archiveBeforeCap`. Response shape unchanged; emits `STORAGE_CAP_WARNING` broadcast when entries fall off. | Task 05a sugar-box cap efficiency fix |
| 2026-05-14 | `PARK_TAB` | Emits new `PARKED_TABS_WARNING` broadcast once when `parkedTabs.length` reaches `settings.storage.parkedTabsWarnAt`. Request/response shapes unchanged. | Task 05a parked-tabs warning |
| 2026-05-14 | `START_SIDE_QUEST` | Now delegates focus pausing to `focusService.pauseActiveFocus('side-quest')`. Request/response shapes unchanged. | Task 05a service extraction |
| 2026-05-14 | `DELETE_TASK` / archived `UPDATE_TASK` | Archived org tasks now receive `archivedAt`; tasks older than `settings.storage.archivedTasksColdAfterDays` move from `tabathaOrg.tasks` to `_archivedTasks`. Request/response shapes unchanged. | Task 04c cold-store efficiency fix |
| 2026-05-14 | `COMPLETE_FOCUS` | Dropped `focusEngine.history` entries are archived through `archiveBeforeCap` before applying `settings.storage.focusHistoryCap`. Request/response shapes unchanged. | Task 04b history retention fix |
| 2026-05-14 | `chrome.tabs.onRemoved` | Closed tabs with saved InBar notes now write the note into `closedContexts` before `inbarNotes[tabId]` is pruned. Request/response shapes unchanged. | Task 04a lifecycle cleanup |
