# Migration Parity Checklist

> **Every handler must be verified before merge.**  
> Update this file as you extract each service. Mark status as you go.

---

## Status Legend

- `⬜` — Not started
- `🔨` — Extracted, not tested
- `✅` — Extracted + build passes + manual test passes
- `🔄` — Needs re-sync (master added new code to this handler)

---

## Progress Summary

| Service | Handlers | Extracted | Tested | Status |
|---------|----------|-----------|--------|--------|
| constants + helpers | — | ✅ | ✅ | Extracted; build passes |
| storageService | — | ✅ | ✅ | Moved to `src/background/services/storageService.js`; build passes |
| clockService | 7 | ✅ | ⬜ | Moved to `src/background/services/clockService.js`; build passes; manual tests pending |
| focusService | 14 | ⬜ | ⬜ | Not started |
| tabService | 17 | ✅ | ⬜ | Extracted to `src/background/services/tabService.js`; build passes; manual tests pending |
| tabTrackingService | 2+ | ⬜ | ⬜ | Not started |
| taskService | 4 | ✅ | ⬜ | Extracted to `src/background/services/taskService.js`; build passes; manual tests pending |
| groupService | 4 | ✅ | ⬜ | Extracted to `src/background/services/groupService.js`; build passes; manual tests pending |
| categoryService | 3 | ✅ | ⬜ | Extracted to `src/background/services/categoryService.js`; build passes; manual tests pending |
| blockgateService | 6 | ⬜ | ⬜ | Not started |
| sessionService | 5 | ✅ | ⬜ | Extracted to `src/background/services/sessionService.js`; build passes; manual tests pending |
| settingsService | 2 | ✅ | ⬜ | Extracted to `src/background/services/settingsService.js`; build passes; manual tests pending |
| notificationService | 5 | ✅ | ⬜ | Extracted to `src/background/services/notificationService.js`; build passes; manual tests pending |
| Router refactor | — | ⬜ | ⬜ | Not started |
| fluxApi | — | ⬜ | ⬜ | Not started |

**Overall: 47 / 62 handlers migrated**

---

## focusService.js — 14 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_FOCUS_ENGINE` | ⬜ | ⬜ | ⬜ | |
| 2 | `START_FOCUS` | ⬜ | ⬜ | ⬜ | |
| 3 | `ADD_FOCUS` | ⬜ | ⬜ | ⬜ | |
| 4 | `SWITCH_FOCUS` | ⬜ | ⬜ | ⬜ | |
| 5 | `COMPLETE_FOCUS` | ⬜ | ⬜ | ⬜ | |
| 6 | `UPDATE_FOCUS` | ⬜ | ⬜ | ⬜ | |
| 7 | `RENAME_FOCUS` | ⬜ | ⬜ | ⬜ | |
| 8 | `EXTEND_FOCUS_TIMER` | ⬜ | ⬜ | ⬜ | |
| 9 | `UPDATE_FOCUS_TAGS` | ⬜ | ⬜ | ⬜ | |
| 10 | `SET_FUNNEL_STAGE` | ⬜ | ⬜ | ⬜ | |
| 11 | `SET_PRIORITY` | ⬜ | ⬜ | ⬜ | |
| 12 | `LINK_INTENT_TO_TASK` | ⬜ | ⬜ | ⬜ | |
| 13 | `MERGE_INTENTS` | ⬜ | ⬜ | ⬜ | |
| 14 | `ASSOCIATE_TAB_WITH_FOCUS` | ⬜ | ⬜ | ⬜ | |

---

## tabService.js — 17 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_ALL_TABS` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 2 | `GET_TAB` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 3 | `GET_CURRENT_TAB_ID` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 4 | `UPDATE_TAB` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 5 | `UPDATE_TAB_TITLE` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 6 | `SET_TAB_CONTEXT` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 7 | `LINK_TAB_TO_INTENT` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 8 | `BATCH_UPDATE_CONTEXT` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 9 | `CHECK_CONTEXT_NEEDED` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 10 | `SKIP_DOMAIN` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 11 | `TOGGLE_LOCK` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 12 | `TOGGLE_URL_LOCK` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 13 | `FOCUS_TAB` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 14 | `CLOSE_TAB` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 15 | `BULK_CLOSE` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 16 | `REQUEST_CLOSE` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |
| 17 | `CANCEL_CLOSE` | ✅ | ✅ | ⬜ | Extracted to tabService; manual test pending |

---

## tabTrackingService.js — 2 handlers + listeners

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_TIME_TRACKING` | ⬜ | ⬜ | ⬜ | |
| 2 | `LOG_INTENT_ACTION` | ⬜ | ⬜ | ⬜ | |
| 3 | `chrome.tabs.onActivated` (time) | ⬜ | ⬜ | ⬜ | Event listener, not message |
| 4 | `chrome.tabs.onRemoved` (time) | ⬜ | ⬜ | ⬜ | Event listener, not message |

---

## clockService.js — 7 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `CLOCK_IN` | ✅ | ✅ | ⬜ | Extracted to clockService; manual test pending |
| 2 | `CLOCK_OUT` | ✅ | ✅ | ⬜ | Extracted to clockService; manual test pending |
| 3 | `TOGGLE_BREAK` | ✅ | ✅ | ⬜ | Extracted to clockService; manual test pending |
| 4 | `GET_CLOCK_STATUS` | ✅ | ✅ | ⬜ | Extracted to clockService; manual test pending |
| 5 | `GET_CLOCK_HISTORY` | ✅ | ✅ | ⬜ | Extracted to clockService; manual test pending |
| 6 | `GET_LAST_SESSION` | ✅ | ✅ | ⬜ | Extracted to clockService; manual test pending |
| 7 | `GET_LATEST_SESSION` | ✅ | ✅ | ⬜ | Extracted to clockService; manual test pending |

---

## taskService.js — 4 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_TASKS` | ✅ | ✅ | ⬜ | Extracted to taskService; manual test pending |
| 2 | `CREATE_TASK` | ✅ | ✅ | ⬜ | Extracted to taskService; manual test pending |
| 3 | `UPDATE_TASK` | ✅ | ✅ | ⬜ | Extracted to taskService; manual test pending |
| 4 | `DELETE_TASK` | ✅ | ✅ | ⬜ | Extracted to taskService; manual test pending |

---

## groupService.js — 4 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_SAVED_GROUPS` | ✅ | ✅ | ⬜ | Extracted to groupService; manual test pending |
| 2 | `CREATE_GROUP` | ✅ | ✅ | ⬜ | Extracted to groupService; manual test pending |
| 3 | `CREATE_SUB_GROUP` | ✅ | ✅ | ⬜ | Extracted to groupService; manual test pending |
| 4 | `GET_SUB_GROUPS` | ✅ | ✅ | ⬜ | Extracted to groupService; manual test pending |

---

## categoryService.js — 3 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_CATEGORIES` | ✅ | ✅ | ⬜ | Extracted to categoryService; manual test pending |
| 2 | `CREATE_CATEGORY` | ✅ | ✅ | ⬜ | Extracted to categoryService; manual test pending |
| 3 | `CLONE_CATEGORY` | ✅ | ✅ | ⬜ | Extracted to categoryService; manual test pending |

---

## blockgateService.js — 6 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `CHECK_BLOCKED_SITE` | ⬜ | ⬜ | ⬜ | |
| 2 | `MANAGE_BLOCKED_SITES` | ⬜ | ⬜ | ⬜ | |
| 3 | `UNBLOCK_SITE_TEMPORARILY` | ⬜ | ⬜ | ⬜ | |
| 4 | `ADD_TO_SUGAR_BOX` | ⬜ | ⬜ | ⬜ | |
| 5 | `PARK_TAB` | ⬜ | ⬜ | ⬜ | |
| 6 | `START_SIDE_QUEST` | ⬜ | ⬜ | ⬜ | |

---

## sessionService.js — 5 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_SESSIONS` | ✅ | ✅ | ⬜ | Extracted to sessionService; manual test pending |
| 2 | `GET_CLOSED_CONTEXTS` | ✅ | ✅ | ⬜ | Extracted to sessionService; manual test pending |
| 3 | `GET_FLOW_RECALL` | ✅ | ✅ | ⬜ | Extracted to sessionService; manual test pending |
| 4 | `REOPEN_FLOW` | ✅ | ✅ | ⬜ | Extracted to sessionService; manual test pending |
| 5 | `EXPORT_MARKDOWN` | ✅ | ✅ | ⬜ | Extracted to sessionService; manual test pending |

---

## settingsService.js — 2 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_SETTINGS` | ✅ | ✅ | ⬜ | Extracted to settingsService; manual test pending |
| 2 | `UPDATE_SETTINGS` | ✅ | ✅ | ⬜ | Extracted to settingsService; manual test pending |

---

## notificationService.js — 5 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `OPEN_POPUP` | ✅ | ✅ | ⬜ | Extracted to notificationService; manual test pending |
| 2 | `GET_INBAR_DATA` | ✅ | ✅ | ⬜ | Extracted to notificationService; preserves focus + tab dependencies; manual test pending |
| 3 | `GET_INBAR_NOTES` | ✅ | ✅ | ⬜ | Extracted to notificationService; manual test pending |
| 4 | `SAVE_INBAR_NOTE` | ✅ | ✅ | ⬜ | Extracted to notificationService; manual test pending |
| 5 | `START_POMODORO` | ✅ | ✅ | ⬜ | Extracted to notificationService; manual test pending |

---

## Non-Message Code

| # | Code Block | Target | Extracted | Build | Notes |
|---|------------|--------|-----------|-------|-------|
| 1 | `DEFAULT_SETTINGS` | `constants.js` | ✅ | ✅ | Extracted to `src/background/constants.js` |
| 2 | `PRIORITY_LEVELS` | `constants.js` | ✅ | ✅ | Extracted to `src/background/constants.js` |
| 3 | `BUILT_IN_CATEGORIES` | `constants.js` | ✅ | ✅ | Extracted to `src/background/constants.js` |
| 4 | `patternToRegex()` | `helpers.js` | ✅ | ✅ | Extracted to `src/background/helpers.js` |
| 5 | `formatTime()` | `helpers.js` | ✅ | ✅ | Background `formatDuration()` extracted to `src/background/helpers.js`; no `formatTime()` helper existed in `background.js` |
| 6 | `chrome.tabs.onCreated` | `tabService.js` | ⬜ | ⬜ | |
| 7 | `chrome.tabs.onUpdated` | `tabService.js` | ⬜ | ⬜ | |
| 8 | `chrome.tabs.onRemoved` | `tabService.js` | ⬜ | ⬜ | |
| 9 | `chrome.tabs.onActivated` | `tabTrackingService.js` | ⬜ | ⬜ | |
| 10 | `chrome.idle.onStateChanged` | `clockService.js` | ⬜ | ⬜ | |
| 11 | `chrome.alarms.onAlarm` | Router (delegates) | ⬜ | ⬜ | |
| 12 | `chrome.tabGroups.*` | `groupService.js` | ⬜ | ⬜ | |

---

## Sync Log

> When `master` changes `background.js`, log it here so the decomp branch knows what to absorb.

| Date | master Commit | What Changed | Absorbed? |
|------|-------------|-------------|-----------|
| — | (initial) | Branch created from v0.2.8 | ✅ |
