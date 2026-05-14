# Migration Parity Checklist

> **Every handler must be verified before merge.**  
> Update this file as you extract each service. Mark status as you go.  
> **Baseline:** `master` @ v3.34.5-α — 79 message handlers + 6 companion-bridge handlers  
> **Target:** All handlers extracted to services, build green, same response shapes, manual tests pass.

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Done |
| ⚠️ | Done with caveats |

---

## focusService.js — 14 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_FOCUS_ENGINE` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 2 | `START_FOCUS` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | Companion bridge integration |
| 3 | `ADD_FOCUS` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 4 | `SWITCH_FOCUS` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 5 | `COMPLETE_FOCUS` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 6 | `EXTEND_FOCUS_TIMER` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 7 | `SET_FUNNEL_STAGE` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | Complex state machine |
| 8 | `UPDATE_FOCUS_TAGS` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 9 | `RENAME_FOCUS` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 10 | `UPDATE_FOCUS` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | Duplicated stage machine — merge with SET_FUNNEL_STAGE |
| 11 | `PAUSE_FOCUS` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 12 | `RESUME_FOCUS` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | Auto-ends break via clockService |
| 13 | `LINK_INTENT_TO_TASK` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | Creates task if newTaskName provided |
| 14 | `MERGE_INTENTS` | focusService | ⬜ | ⬜ | ⬜ | ⬜ | |

---

## tabService.js — 22 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_ALL_TABS` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 2 | `GET_TAB` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 3 | `UPDATE_TAB` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 4 | `BATCH_UPDATE_CONTEXT` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 5 | `SET_PRIORITY` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 6 | `TOGGLE_LOCK` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 7 | `UPDATE_TAB_TITLE` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 8 | `TOGGLE_URL_LOCK` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 9 | `REQUEST_CLOSE` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 10 | `CANCEL_CLOSE` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 11 | `BULK_CLOSE` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 12 | `FOCUS_TAB` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 13 | `CHECK_CONTEXT_NEEDED` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | Complex — URL rules, domain skipping |
| 14 | `SET_TAB_CONTEXT` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 15 | `SET_INTENT` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | Complex — focus engine integration |
| 16 | `SKIP_DOMAIN` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 17 | `ASSOCIATE_TAB_WITH_FOCUS` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 18 | `GET_CURRENT_TAB_ID` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 19 | `CLOSE_TAB` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 20 | `LINK_TAB_TO_INTENT` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 21 | `RENAME_TAB` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 22 | `UPDATE_TAB_CONTEXT` | tabService | ⬜ | ⬜ | ⬜ | ⬜ | |

---

## tabTrackingService.js — 2 handlers + listeners

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_TIME_TRACKING` | tabTrackingService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 2 | `LOG_INTENT_ACTION` | tabTrackingService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 3 | `chrome.tabs.onActivated` (time) | tabTrackingService | ⬜ | ⬜ | — | ⬜ | Listener, no response shape |
| 4 | `chrome.tabs.onRemoved` (time) | tabTrackingService | ⬜ | ⬜ | — | ⬜ | Listener, no response shape |

---

## clockService.js — 7 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `CLOCK_IN` | clockService | ⬜ | ⬜ | ⬜ | ⬜ | Companion bridge sync |
| 2 | `CLOCK_OUT` | clockService | ⬜ | ⬜ | ⬜ | ⬜ | Companion bridge sync |
| 3 | `TOGGLE_BREAK` | clockService | ⬜ | ⬜ | ⬜ | ⬜ | Auto-pauses active focus |
| 4 | `GET_CLOCK_STATUS` | clockService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 5 | `GET_CLOCK_HISTORY` | clockService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 6 | `GET_LAST_SESSION` | clockService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 7 | `GET_LATEST_SESSION` | clockService | ⬜ | ⬜ | ⬜ | ⬜ | Shared with sessionService? |

---

## taskService.js — 4 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_TASKS` | taskService | ⬜ | ⬜ | ⬜ | ⬜ | Org + legacy merge |
| 2 | `CREATE_TASK` | taskService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 3 | `UPDATE_TASK` | taskService | ⬜ | ⬜ | ⬜ | ⬜ | Funnel stage gating |
| 4 | `DELETE_TASK` | taskService | ⬜ | ⬜ | ⬜ | ⬜ | Soft delete (archive) |

---

## groupService.js — 4 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_SAVED_GROUPS` | groupService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 2 | `CREATE_GROUP` | groupService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 3 | `CREATE_SUB_GROUP` | groupService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 4 | `GET_SUB_GROUPS` | groupService | ⬜ | ⬜ | ⬜ | ⬜ | |

---

## categoryService.js — 3 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_CATEGORIES` | categoryService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 2 | `CREATE_CATEGORY` | categoryService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 3 | `CLONE_CATEGORY` | categoryService | ⬜ | ⬜ | ⬜ | ⬜ | |

---

## blockgateService.js — 6 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `CHECK_BLOCKED_SITE` | blockgateService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 2 | `UNBLOCK_SITE_TEMPORARILY` | blockgateService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 3 | `MANAGE_BLOCKED_SITES` | blockgateService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 4 | `ADD_TO_SUGAR_BOX` | blockgateService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 5 | `PARK_TAB` | blockgateService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 6 | `START_SIDE_QUEST` | blockgateService | ⬜ | ⬜ | ⬜ | ⬜ | |

---

## sessionService.js — 5 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_SESSIONS` | sessionService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 2 | `GET_CLOSED_CONTEXTS` | sessionService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 3 | `GET_FLOW_RECALL` | sessionService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 4 | `REOPEN_FLOW` | sessionService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 5 | `EXPORT_MARKDOWN` | sessionService | ⬜ | ⬜ | ⬜ | ⬜ | |

---

## settingsService.js — 2 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_SETTINGS` | settingsService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 2 | `UPDATE_SETTINGS` | settingsService | ⬜ | ⬜ | ⬜ | ⬜ | Broadcasts to all tabs |

---

## notificationService.js — 5 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `OPEN_POPUP` | notificationService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 2 | `GET_INBAR_DATA` | notificationService | ⬜ | ⬜ | ⬜ | ⬜ | Cross-service: focus + tab + time |
| 3 | `GET_INBAR_NOTES` | notificationService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 4 | `SAVE_INBAR_NOTE` | notificationService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 5 | `START_POMODORO` | notificationService | ⬜ | ⬜ | ⬜ | ⬜ | |

---

## companionService.js — 5 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_COMPANION_STATUS` | companionService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 2 | `GET_COMPANION_SUMMARY` | companionService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 3 | `COMPANION_CLOCK_IN` | companionService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 4 | `COMPANION_CLOCK_OUT` | companionService | ⬜ | ⬜ | ⬜ | ⬜ | |
| 5 | `COMPANION_TOGGLE_BREAK` | companionService | ⬜ | ⬜ | ⬜ | ⬜ | |

---

## Non-Message Code

| # | Code Block | Target | Extracted? | Build green? | Notes |
|---|------------|--------|-----------|-------------|-------|
| 1 | `DEFAULT_SETTINGS` | `constants.js` | ⬜ | ⬜ | |
| 2 | `PRIORITY_LEVELS` | `constants.js` | ⬜ | ⬜ | |
| 3 | `BUILT_IN_CATEGORIES` | `constants.js` | ⬜ | ⬜ | |
| 4 | `patternToRegex()` | `helpers.js` | ⬜ | ⬜ | |
| 5 | `formatTime()` / `formatDuration()` | `helpers.js` | ⬜ | ⬜ | |
| 6 | `detectCategory()` | `helpers.js` | ⬜ | ⬜ | |
| 7 | `chrome.tabs.onCreated` | `tabService.js` | ⬜ | ⬜ | |
| 8 | `chrome.tabs.onUpdated` | `tabService.js` | ⬜ | ⬜ | |
| 9 | `chrome.tabs.onRemoved` | Split: tabService + tabTrackingService | ⬜ | ⬜ | |
| 10 | `chrome.tabs.onActivated` | `tabTrackingService.js` | ⬜ | ⬜ | |
| 11 | `chrome.idle.onStateChanged` | `clockService.js` | ⬜ | ⬜ | |
| 12 | `chrome.alarms.onAlarm` | Router (delegates) | ⬜ | ⬜ | |
| 13 | `chrome.tabGroups.*` | `groupService.js` | ⬜ | ⬜ | |
| 14 | `initializeState()` | Router | ⬜ | ⬜ | |
| 15 | `migrateTasksToOrg()` | `taskService.js` | ⬜ | ⬜ | |

---

## Verification Log

| Date | Phase | Check | Result | Notes |
|------|-------|-------|--------|-------|
| — | — | — | — | No extractions started yet |
