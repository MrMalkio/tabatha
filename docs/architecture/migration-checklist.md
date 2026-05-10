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
| constants + helpers | — | ⬜ | ⬜ | Not started |
| storageService | — | ✅ | ✅ | Already exists as `storage.js` |
| clockService | 7 | ✅ | ⬜ | Already exists as `clock.js`, needs move + expand |
| focusService | 14 | ⬜ | ⬜ | Not started |
| tabService | 17 | ⬜ | ⬜ | Not started |
| tabTrackingService | 2+ | ⬜ | ⬜ | Not started |
| taskService | 4 | ⬜ | ⬜ | Not started |
| groupService | 4 | ⬜ | ⬜ | Not started |
| categoryService | 3 | ⬜ | ⬜ | Not started |
| blockgateService | 6 | ⬜ | ⬜ | Not started |
| sessionService | 5 | ⬜ | ⬜ | Not started |
| settingsService | 2 | ⬜ | ⬜ | Not started |
| notificationService | 5 | ⬜ | ⬜ | Not started |
| Router refactor | — | ⬜ | ⬜ | Not started |
| fluxApi | — | ⬜ | ⬜ | Not started |

**Overall: 0 / 62 handlers migrated**

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
| 1 | `GET_ALL_TABS` | ⬜ | ⬜ | ⬜ | |
| 2 | `GET_TAB` | ⬜ | ⬜ | ⬜ | |
| 3 | `GET_CURRENT_TAB_ID` | ⬜ | ⬜ | ⬜ | |
| 4 | `UPDATE_TAB` | ⬜ | ⬜ | ⬜ | |
| 5 | `UPDATE_TAB_TITLE` | ⬜ | ⬜ | ⬜ | |
| 6 | `SET_TAB_CONTEXT` | ⬜ | ⬜ | ⬜ | |
| 7 | `LINK_TAB_TO_INTENT` | ⬜ | ⬜ | ⬜ | |
| 8 | `BATCH_UPDATE_CONTEXT` | ⬜ | ⬜ | ⬜ | |
| 9 | `CHECK_CONTEXT_NEEDED` | ⬜ | ⬜ | ⬜ | |
| 10 | `SKIP_DOMAIN` | ⬜ | ⬜ | ⬜ | |
| 11 | `TOGGLE_LOCK` | ⬜ | ⬜ | ⬜ | |
| 12 | `TOGGLE_URL_LOCK` | ⬜ | ⬜ | ⬜ | |
| 13 | `FOCUS_TAB` | ⬜ | ⬜ | ⬜ | |
| 14 | `CLOSE_TAB` | ⬜ | ⬜ | ⬜ | |
| 15 | `BULK_CLOSE` | ⬜ | ⬜ | ⬜ | |
| 16 | `REQUEST_CLOSE` | ⬜ | ⬜ | ⬜ | |
| 17 | `CANCEL_CLOSE` | ⬜ | ⬜ | ⬜ | |

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
| 1 | `CLOCK_IN` | ⬜ | ⬜ | ⬜ | Partially in clock.js |
| 2 | `CLOCK_OUT` | ⬜ | ⬜ | ⬜ | Partially in clock.js |
| 3 | `TOGGLE_BREAK` | ⬜ | ⬜ | ⬜ | Partially in clock.js |
| 4 | `GET_CLOCK_STATUS` | ⬜ | ⬜ | ⬜ | |
| 5 | `GET_CLOCK_HISTORY` | ⬜ | ⬜ | ⬜ | |
| 6 | `GET_LAST_SESSION` | ⬜ | ⬜ | ⬜ | |
| 7 | `GET_LATEST_SESSION` | ⬜ | ⬜ | ⬜ | |

---

## taskService.js — 4 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_TASKS` | ⬜ | ⬜ | ⬜ | |
| 2 | `CREATE_TASK` | ⬜ | ⬜ | ⬜ | |
| 3 | `UPDATE_TASK` | ⬜ | ⬜ | ⬜ | |
| 4 | `DELETE_TASK` | ⬜ | ⬜ | ⬜ | |

---

## groupService.js — 4 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_SAVED_GROUPS` | ⬜ | ⬜ | ⬜ | |
| 2 | `CREATE_GROUP` | ⬜ | ⬜ | ⬜ | |
| 3 | `CREATE_SUB_GROUP` | ⬜ | ⬜ | ⬜ | |
| 4 | `GET_SUB_GROUPS` | ⬜ | ⬜ | ⬜ | |

---

## categoryService.js — 3 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_CATEGORIES` | ⬜ | ⬜ | ⬜ | |
| 2 | `CREATE_CATEGORY` | ⬜ | ⬜ | ⬜ | |
| 3 | `CLONE_CATEGORY` | ⬜ | ⬜ | ⬜ | |

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
| 1 | `GET_SESSIONS` | ⬜ | ⬜ | ⬜ | |
| 2 | `GET_CLOSED_CONTEXTS` | ⬜ | ⬜ | ⬜ | |
| 3 | `GET_FLOW_RECALL` | ⬜ | ⬜ | ⬜ | |
| 4 | `REOPEN_FLOW` | ⬜ | ⬜ | ⬜ | |
| 5 | `EXPORT_MARKDOWN` | ⬜ | ⬜ | ⬜ | |

---

## settingsService.js — 2 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `GET_SETTINGS` | ⬜ | ⬜ | ⬜ | |
| 2 | `UPDATE_SETTINGS` | ⬜ | ⬜ | ⬜ | |

---

## notificationService.js — 5 handlers

| # | Handler | Extracted | Build | Test | Notes |
|---|---------|-----------|-------|------|-------|
| 1 | `OPEN_POPUP` | ⬜ | ⬜ | ⬜ | |
| 2 | `GET_INBAR_DATA` | ⬜ | ⬜ | ⬜ | Complex: needs focus + tab data |
| 3 | `GET_INBAR_NOTES` | ⬜ | ⬜ | ⬜ | |
| 4 | `SAVE_INBAR_NOTE` | ⬜ | ⬜ | ⬜ | |
| 5 | `START_POMODORO` | ⬜ | ⬜ | ⬜ | |

---

## Non-Message Code

| # | Code Block | Target | Extracted | Build | Notes |
|---|------------|--------|-----------|-------|-------|
| 1 | `DEFAULT_SETTINGS` | `constants.js` | ⬜ | ⬜ | |
| 2 | `PRIORITY_LEVELS` | `constants.js` | ⬜ | ⬜ | |
| 3 | `BUILT_IN_CATEGORIES` | `constants.js` | ⬜ | ⬜ | |
| 4 | `patternToRegex()` | `helpers.js` | ⬜ | ⬜ | |
| 5 | `formatTime()` | `helpers.js` | ⬜ | ⬜ | |
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
