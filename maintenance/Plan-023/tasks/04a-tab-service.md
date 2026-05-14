# Task 04a — tabService

| Property | Value |
|---|---|
| **Branch** | `refactor/decomp-v2-tab-service` |
| **Branched from** | `refactor/decomp-v2` (after Tasks 02 + 03 merged) |
| **Merge target** | `refactor/decomp-v2` |
| **Depends on** | Tasks 02 + 03 |
| **Parallel with** | 04b, 04c, 04d |
| **Effort** | ~1.5 hours |
| **Risk** | High (touches Intent→Focus bridge and the context-gatekeeper) |

## Files created
- `src/background/services/tabService.js` — all 22 tab handlers + `onCreated` / main `onUpdated` / `onRemoved` listeners.

## Handlers owned
`GET_ALL_TABS`, `GET_TAB`, `UPDATE_TAB`, `BATCH_UPDATE_CONTEXT`, `SET_PRIORITY`, `TOGGLE_LOCK`, `UPDATE_TAB_TITLE`, `TOGGLE_URL_LOCK`, `REQUEST_CLOSE`, `CANCEL_CLOSE`, `BULK_CLOSE`, `FOCUS_TAB`, `CHECK_CONTEXT_NEEDED`, `SET_TAB_CONTEXT`, `SET_INTENT`, `SKIP_DOMAIN`, `ASSOCIATE_TAB_WITH_FOCUS`, `GET_CURRENT_TAB_ID`, `CLOSE_TAB`, `LINK_TAB_TO_INTENT`, `RENAME_TAB`, `UPDATE_TAB_CONTEXT`.

## Efficiency fixes bundled
1. On `onRemoved`: prune `inbarNotes[tabId]` and `timeTracking.byTab[tabId]` (the latter aggregates first per Task 03).
2. Delete `_legacyTasksBackup` on first run after this task lands (cheap one-shot cleanup).
3. `inbarNotes` non-empty + tab closed → write a context-rich entry into `closedContexts` before pruning.

## Cross-service calls
- `SET_INTENT` → `focusService.autoQueueFromIntent(intent, sender.tab.id)`. **Import the function directly** from `focusService.js`; don't go through the message bus.
- `LINK_TAB_TO_INTENT` → `focusService.linkTabToFocus(focusId, tabId)`.

If 04a lands before 04b (focusService), stub these calls behind a feature flag `services.focus.ready === true` and fall back to the legacy inline handler. Remove the flag in 06.

## Router registration

```js
const services = [
  // ...existing...
  tabService,
];
```

## Verification
- [x] All tab message handlers extracted from legacy router
- [x] Set context on a fresh tab → canonical intentHistory row written in smoke test
- [x] Set intent → legacy focus bridge fallback retained until focusService merge
- [x] Close a tab with inbarNotes → notes archived to closedContexts entry in smoke test
- [x] message-contracts.md updated for all 22 handlers
- [x] `npm run build`
- [x] `npm run version:check`
- [x] `git diff --check`
