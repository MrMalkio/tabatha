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
- `src/background/services/tabService.js` — all 17 tab handlers + `onCreated` / `onUpdated` / `onRemoved` listeners.

## Handlers owned (verify against current background.js)
- `CHECK_CONTEXT_NEEDED` (gatekeeper)
- `SET_TAB_CONTEXT` (writes intentHistory per Task 03 migration)
- `SET_INTENT` (Intent→Focus bridge — calls `focusService.autoQueueFromIntent()`)
- `GET_TABS`, `UPDATE_TAB`, `CLOSE_TAB`, `LOCK_TAB`, `UNLOCK_TAB`, `RENAME_TAB`, `PARK_TAB`, `LINK_TAB_TO_INTENT`, plus the remaining tab cases — confirm with the live grep before extracting.

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
- [ ] All tab-related popup/sidebar actions still work
- [ ] Set context on a fresh tab → InBar renders correctly
- [ ] Set intent → if the focus service is wired, auto-queue fires; otherwise legacy path
- [ ] Close a tab with inbarNotes → notes archived to closedContexts entry
- [ ] message-contracts.md updated for all 17 handlers
