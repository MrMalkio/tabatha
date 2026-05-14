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
| `GET_FOCUS_ENGINE` | — | `{ focusEngine }` | ⬜ |
| `START_FOCUS` | `{ label, timerMinutes, tags }` | `{ focusEngine }` | ⬜ |
| `ADD_FOCUS` | `{ label, timerMinutes, tags }` | `{ focusEngine, newFocusId }` | ⬜ |
| `SWITCH_FOCUS` | `{ focusId }` | `{ focusEngine }` | ⬜ |
| `COMPLETE_FOCUS` | `{ focusId }` | `{ focusEngine }` | ⬜ |
| `EXTEND_FOCUS_TIMER` | `{ focusId, extraMinutes }` | `{ focusEngine }` | ⬜ |
| `SET_FUNNEL_STAGE` | `{ focusId, stage, confirmed? }` | `{ focusEngine }` or `{ error, needsConfirm, focusEngine }` | ⬜ |
| `UPDATE_FOCUS_TAGS` | `{ focusId, tags }` | `{ focusEngine }` | ⬜ |
| `RENAME_FOCUS` | `{ focusId, newLabel }` | `{ focusEngine }` | ⬜ |
| `UPDATE_FOCUS` | `{ focusId, label?, timerMinutes?, tags?, funnelStage?, confirmed? }` | `{ focusEngine }` or `{ error, needsConfirm, focusEngine }` | ⬜ |
| `PAUSE_FOCUS` | `{ focusId? }` | `{ focusEngine }` or `{ error, focusEngine }` | ⬜ |
| `RESUME_FOCUS` | `{ focusId }` | `{ focusEngine }` or `{ error, focusEngine }` | ⬜ |
| `LINK_INTENT_TO_TASK` | `{ intentId, taskId?, newTaskName? }` | `{ success }` | ⬜ |
| `MERGE_INTENTS` | `{ sourceIntentId, targetIntentId }` | `{ success }` | ⬜ |

---

## tabService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_ALL_TABS` | — | `{ tabs }` | ⬜ |
| `GET_TAB` | `{ tabId }` | `{ tab }` | ⬜ |
| `UPDATE_TAB` | `{ tabId, updates }` | `{ success }` | ⬜ |
| `BATCH_UPDATE_CONTEXT` | `{ tabIds, context }` | `{ success }` | ⬜ |
| `SET_PRIORITY` | `{ tabId, priority }` | `{ success }` | ⬜ |
| `TOGGLE_LOCK` | `{ tabId }` | `{ success }` | ⬜ |
| `UPDATE_TAB_TITLE` | `{ tabId, title }` | `{ success }` | ⬜ |
| `TOGGLE_URL_LOCK` | `{ tabId, scope? }` | `{ success }` | ⬜ |
| `REQUEST_CLOSE` | `{ tabId }` | `{ success }` | ⬜ |
| `CANCEL_CLOSE` | `{ tabId }` | `{ success }` | ⬜ |
| `BULK_CLOSE` | `{ tabIds }` | `{ success }` | ⬜ |
| `FOCUS_TAB` | `{ tabId }` | `{ success }` | ⬜ |
| `CHECK_CONTEXT_NEEDED` | — (uses sender.tab) | `{ needed, tabData, ... }` | ⬜ |
| `SET_TAB_CONTEXT` | `{ tabId, context, ... }` | `{ success }` | ⬜ |
| `SET_INTENT` | `{ tabId, intent, ... }` | `{ success }` | ⬜ |
| `SKIP_DOMAIN` | `{ domain }` | `{ success }` | ⬜ |
| `ASSOCIATE_TAB_WITH_FOCUS` | `{ tabId, focusId }` | `{ success }` | ⬜ |
| `GET_CURRENT_TAB_ID` | — (uses sender.tab) | `{ tabId }` | ⬜ |
| `CLOSE_TAB` | `{ tabId }` | `{ success }` | ⬜ |
| `LINK_TAB_TO_INTENT` | `{ tabId, targetIntentId }` | `{ success }` | ⬜ |
| `RENAME_TAB` | `{ tabId, newTitle }` | `{ success }` | ⬜ |
| `UPDATE_TAB_CONTEXT` | `{ tabId, context }` | `{ success }` | ⬜ |

---

## tabTrackingService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_TIME_TRACKING` | — | `{ timeTracking }` | ⬜ |
| `LOG_INTENT_ACTION` | `{ action, tabId, ... }` | `{ success }` | ⬜ |

---

## clockService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `CLOCK_IN` | `{ label? }` | `{ clockSession, ... }` | ⬜ |
| `CLOCK_OUT` | — | `{ clockSession, ... }` | ⬜ |
| `TOGGLE_BREAK` | — | `{ onBreak, ... }` | ⬜ |
| `GET_CLOCK_STATUS` | — | `{ clockSession, clockedIn, onBreak, ... }` | ⬜ |
| `GET_CLOCK_HISTORY` | — | `{ history }` | ⬜ |
| `GET_LAST_SESSION` | — | `{ session }` | ⬜ |
| `GET_LATEST_SESSION` | — | `{ session }` | ⬜ |

---

## taskService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_TASKS` | — | `{ tasks }` | ⬜ |
| `CREATE_TASK` | `{ name, description?, projectId?, clientId? }` | `{ success, task }` | ⬜ |
| `UPDATE_TASK` | `{ taskId, updates, confirmed? }` | `{ success }` or `{ error, needsConfirm }` | ⬜ |
| `DELETE_TASK` | `{ taskId }` | `{ success }` | ⬜ |

---

## groupService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_SAVED_GROUPS` | — | `{ groups }` | ⬜ |
| `CREATE_GROUP` | `{ name, ... }` | `{ success, group }` | ⬜ |
| `CREATE_SUB_GROUP` | `{ parentId, name }` | `{ success }` | ⬜ |
| `GET_SUB_GROUPS` | `{ parentId }` | `{ subGroups }` | ⬜ |

---

## categoryService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_CATEGORIES` | — | `{ categories }` | ⬜ |
| `CREATE_CATEGORY` | `{ name, patterns, ... }` | `{ success }` | ⬜ |
| `CLONE_CATEGORY` | `{ categoryId }` | `{ success }` | ⬜ |

---

## blockgateService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `CHECK_BLOCKED_SITE` | — (uses sender.tab.url) | `{ blocked }` | ⬜ |
| `UNBLOCK_SITE_TEMPORARILY` | `{ domain, minutes, why, intent }` | `{ success, expiresAt }` | ⬜ |
| `MANAGE_BLOCKED_SITES` | `{ action, domain? }` | `{ sites }` | ⬜ |
| `ADD_TO_SUGAR_BOX` | `{ url, title, ... }` | `{ success }` | ⬜ |
| `PARK_TAB` | `{ tabId, note? }` | `{ success }` | ⬜ |
| `START_SIDE_QUEST` | `{ tabId, ... }` | `{ success }` | ⬜ |

---

## sessionService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_SESSIONS` | — | `{ sessions }` | ⬜ |
| `GET_CLOSED_CONTEXTS` | — | `{ closedContexts }` | ⬜ |
| `GET_FLOW_RECALL` | `{ url? }` | `{ flows }` | ⬜ |
| `REOPEN_FLOW` | `{ flowId }` | `{ success }` | ⬜ |
| `EXPORT_MARKDOWN` | — | `{ markdown }` | ⬜ |

---

## settingsService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `GET_SETTINGS` | — | `{ settings }` | ⬜ |
| `UPDATE_SETTINGS` | `{ updates }` | `{ success, settings }` | ⬜ |

---

## notificationService

| Message Type | Request | Response | Status |
|-------------|---------|----------|--------|
| `OPEN_POPUP` | `{ tabId? }` | `{ success }` or `{ error }` | ⬜ |
| `GET_INBAR_DATA` | — (uses sender.tab) | `{ show, tabContext, activeFocus, activeFocusId, allFocusItems, settings }` | ⬜ |
| `GET_INBAR_NOTES` | — (uses sender.tab) | `{ note }` | ⬜ |
| `SAVE_INBAR_NOTE` | `{ note, tabId? }` | `{ success }` | ⬜ |
| `START_POMODORO` | `{ minutes }` | `{ success }` | ⬜ |

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

These are sent via `broadcastMessage()` and don't have response shapes:

| Broadcast Type | Emitted By | Payload |
|---------------|-----------|---------|
| `TAB_UPDATED` | tabService | `{ tabId, tabData }` |
| `FOCUS_ENGINE_UPDATED` | focusService | — (listeners re-fetch) |
| `TASKS_UPDATED` | taskService | `{ tasks }` |
| `SETTINGS_UPDATED` | settingsService | `{ settings }` |
| `COMPANION_STATUS_CHANGED` | companionService | `{ connected, ... }` |

---

## Change Log

| Date | Handler | Change | Reason |
|------|---------|--------|--------|
| — | — | — | No changes yet |
