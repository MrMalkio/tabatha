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
| 1 | `GET_FOCUS_ENGINE` | focusService | ✅ | ✅ | ✅ | ⬜ | |
| 2 | `START_FOCUS` | focusService | ✅ | ✅ | ✅ | ⬜ | Companion bridge integration preserved |
| 3 | `ADD_FOCUS` | focusService | ✅ | ✅ | ✅ | ⬜ | |
| 4 | `SWITCH_FOCUS` | focusService | ✅ | ✅ | ✅ | ⬜ | |
| 5 | `COMPLETE_FOCUS` | focusService | ✅ | ✅ | ✅ | ⬜ | Archives dropped `focusEngine.history` entries before capping |
| 6 | `EXTEND_FOCUS_TIMER` | focusService | ✅ | ✅ | ✅ | ⬜ | |
| 7 | `SET_FUNNEL_STAGE` | focusService | ✅ | ✅ | ✅ | ⬜ | Uses shared stage transition helper |
| 8 | `UPDATE_FOCUS_TAGS` | focusService | ✅ | ✅ | ✅ | ⬜ | |
| 9 | `RENAME_FOCUS` | focusService | ✅ | ✅ | ✅ | ⬜ | |
| 10 | `UPDATE_FOCUS` | focusService | ✅ | ✅ | ✅ | ⬜ | Uses shared stage transition helper |
| 11 | `PAUSE_FOCUS` | focusService | ✅ | ✅ | ✅ | ⬜ | |
| 12 | `RESUME_FOCUS` | focusService | ✅ | ✅ | ✅ | ⬜ | Auto-ends break through injected clock fallback |
| 13 | `LINK_INTENT_TO_TASK` | focusService | ✅ | ✅ | ✅ | ⬜ | Creates legacy task if `newTaskName` provided |
| 14 | `MERGE_INTENTS` | focusService | ✅ | ✅ | ✅ | ⬜ | |

---

## tabService.js — 22 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_ALL_TABS` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 2 | `GET_TAB` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 3 | `UPDATE_TAB` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 4 | `BATCH_UPDATE_CONTEXT` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 5 | `SET_PRIORITY` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 6 | `TOGGLE_LOCK` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 7 | `UPDATE_TAB_TITLE` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 8 | `TOGGLE_URL_LOCK` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 9 | `REQUEST_CLOSE` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 10 | `CANCEL_CLOSE` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 11 | `BULK_CLOSE` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 12 | `FOCUS_TAB` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 13 | `CHECK_CONTEXT_NEEDED` | tabService | ✅ | ✅ | ✅ | ⬜ | Complex — URL rules, domain skipping |
| 14 | `SET_TAB_CONTEXT` | tabService | ✅ | ✅ | ✅ | ⬜ | Writes canonical `intentHistory` rows |
| 15 | `SET_INTENT` | tabService | ✅ | ✅ | ✅ | ⬜ | Focus bridge falls back to legacy inline logic until focusService is merged |
| 16 | `SKIP_DOMAIN` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 17 | `ASSOCIATE_TAB_WITH_FOCUS` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 18 | `GET_CURRENT_TAB_ID` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 19 | `CLOSE_TAB` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 20 | `LINK_TAB_TO_INTENT` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 21 | `RENAME_TAB` | tabService | ✅ | ✅ | ✅ | ⬜ | |
| 22 | `UPDATE_TAB_CONTEXT` | tabService | ✅ | ✅ | ✅ | ⬜ | |

---

## tabTrackingService.js — 2 handlers + listeners

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_TIME_TRACKING` | tabTrackingService | ✅ | ✅ | ✅ | ⬜ | |
| 2 | `LOG_INTENT_ACTION` | tabTrackingService | ✅ | ✅ | ✅ | ⬜ | Now writes union-shape rows via `appendIntentHistory` |
| 3 | `chrome.tabs.onActivated` (time) | tabService | ⬜ | ⬜ | — | ⬜ | Listener stays in background.js until Task 04a moves tab lifecycle |
| 4 | `chrome.tabs.onRemoved` (time) | tabTrackingService | ✅ | ✅ | — | ⬜ | `aggregateAndPruneTabTime` invoked from background.js before tab delete |

---

## clockService.js — 6 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `CLOCK_IN` | clockService | ✅ | ✅ | ✅ | ⬜ | Companion bridge sync injected via configureClockService |
| 2 | `CLOCK_OUT` | clockService | ✅ | ✅ | ✅ | ⬜ | Companion bridge sync injected via configureClockService |
| 3 | `TOGGLE_BREAK` | clockService | ✅ | ✅ | ✅ | ⬜ | Auto-pauses active focus via injected getFocusEngine/setFocusEngine |
| 4 | `GET_CLOCK_STATUS` | clockService | ✅ | ✅ | ✅ | ⬜ | |
| 5 | `GET_CLOCK_HISTORY` | clockService | ✅ | ✅ | ✅ | ⬜ | |
| 6 | `GET_LAST_SESSION` | clockService | ✅ | ✅ | ✅ | ⬜ | |

---

## taskService.js — 4 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_TASKS` | taskService | ✅ | ✅ | ✅ | ⬜ | Org + legacy merge; cold-stores archived org tasks past `settings.storage.archivedTasksColdAfterDays` |
| 2 | `CREATE_TASK` | taskService | ✅ | ✅ | ✅ | ⬜ | Creates org-registry tasks in `unsorted` stage |
| 3 | `UPDATE_TASK` | taskService | ✅ | ✅ | ✅ | ⬜ | Funnel stage gating preserved; archive updates stamp `archivedAt` |
| 4 | `DELETE_TASK` | taskService | ✅ | ✅ | ✅ | ⬜ | Soft delete now stamps `archivedAt`; old archived tasks move to `_archivedTasks` |

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
| 1 | `GET_CATEGORIES` | categoryService | ✅ | ✅ | ✅ | ⬜ | |
| 2 | `CREATE_CATEGORY` | categoryService | ✅ | ✅ | ✅ | ⬜ | |
| 3 | `CLONE_CATEGORY` | categoryService | ✅ | ✅ | ✅ | ⬜ | |

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

## sessionService.js — 6 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_SESSIONS` | sessionService | ✅ | ✅ | ✅ | ⬜ | |
| 2 | `GET_LATEST_SESSION` | sessionService | ✅ | ✅ | ✅ | ⬜ | Resolved ownership from clockService |
| 3 | `GET_CLOSED_CONTEXTS` | sessionService | ✅ | ✅ | ✅ | ⬜ | |
| 4 | `GET_FLOW_RECALL` | sessionService | ✅ | ✅ | ✅ | ⬜ | |
| 5 | `REOPEN_FLOW` | sessionService | ✅ | ✅ | ✅ | ⬜ | |
| 6 | `EXPORT_MARKDOWN` | sessionService | ✅ | ✅ | ✅ | ⬜ | Snapshot alarm now dispatched from `bootstrap.js`, cadence from `settings.storage.snapshotIntervalMinutes` |

---

## settingsService.js — 2 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_SETTINGS` | settingsService | ✅ | ✅ | ✅ | ⬜ | Manual extension reload still pending |
| 2 | `UPDATE_SETTINGS` | settingsService | ✅ | ✅ | ✅ | ⬜ | Validates `settings.storage`; manual persistence test still pending |

---

## notificationService.js — 5 handlers

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `OPEN_POPUP` | notificationService | ✅ | ✅ | ✅ | ⬜ | Manual gatekeeper injection test still pending |
| 2 | `GET_INBAR_DATA` | notificationService | ✅ | ✅ | ✅ | ⬜ | Cross-service deps injected from router; manual InBar render test still pending |
| 3 | `GET_INBAR_NOTES` | notificationService | ✅ | ✅ | ✅ | ⬜ | Manual note load test still pending |
| 4 | `SAVE_INBAR_NOTE` | notificationService | ✅ | ✅ | ✅ | ⬜ | Manual note save test still pending |
| 5 | `START_POMODORO` | notificationService | ✅ | ✅ | ✅ | ⬜ | Manual timer alarm test still pending |

---

## companionService.js — 5 handlers (+ 1 break alias)

| # | Handler | Service | Extracted? | Build green? | Same response shape? | Manual test pass? | Notes |
|---|---------|---------|-----------|-------------|----------------------|-------------------|-------|
| 1 | `GET_COMPANION_STATUS` | companionService | ✅ | ✅ | ✅ | ⬜ | WebSocket lifecycle now initializes via bootstrap |
| 2 | `GET_COMPANION_SUMMARY` | companionService | ✅ | ✅ | ✅ | ⬜ | |
| 3 | `COMPANION_CLOCK_IN` | companionService | ✅ | ✅ | ✅ | ⬜ | |
| 4 | `COMPANION_CLOCK_OUT` | companionService | ✅ | ✅ | ✅ | ⬜ | |
| 5 | `COMPANION_TOGGLE_BREAK` | companionService | ✅ | ✅ | ✅ | ⬜ | `COMPANION_CLOCK_BREAK` alias also supported |

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
| 7 | `chrome.tabs.onCreated` | `tabService.js` | ✅ | ✅ | |
| 8 | `chrome.tabs.onUpdated` | `tabService.js` | ✅ | ✅ | Main tab URL/title/audible listener extracted; tab-group sync listener remains pending groupService |
| 9 | `chrome.tabs.onRemoved` | Split: tabService + tabTrackingService | ✅ | ✅ | Archives InBar notes to `closedContexts`, prunes `inbarNotes`, and delegates time aggregation to tabTrackingService |
| 10 | `chrome.tabs.onActivated` | `tabTrackingService.js` | ⬜ | ⬜ | |
| 11 | `chrome.idle.onStateChanged` | `clockService.js` | ⬜ | ⬜ | |
| 12 | `chrome.alarms.onAlarm` | `alarmService.js` | ✅ | ✅ | Consolidated to a single listener; routes by name to handlers exposed on focusService / tabService / notificationService / clockService / sessionService. `supabase-sync` is auth-guarded before dispatch. |
| 13 | `chrome.tabGroups.*` | `groupService.js` | ⬜ | ⬜ | |
| 14 | `initializeState()` | Router | ⬜ | ⬜ | |
| 15 | `migrateTasksToOrg()` | `taskService.js` | ⬜ | ⬜ | |

---

## Verification Log

| Date | Phase | Check | Result | Notes |
|------|-------|-------|--------|-------|
| 2026-05-14 | Task 04d | clockService extraction (6 handlers) | ✅ Build green | Companion bridge + webhook injected via configureClockService; endBreakIfActive cross-service export added |
| 2026-05-14 | Task 04d | clockTickService (TICK broadcaster) | ✅ Build green | 3 new message types: TICK_SUBSCRIBE, TICK_UNSUBSCRIBE, GET_TICK_STATUS |
| 2026-05-14 | Task 05c | alarmService consolidation (3 listeners → 1) | ✅ Build green, single `onAlarm.addListener` grep-verified | Removed duplicate `chrome.idle.setDetectionInterval(60)`; auth-guarded `supabase-sync` dispatch; `idleAutoBreakApplied` flag moved into clockService (consume/reset). |
