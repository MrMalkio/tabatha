# Task 04b — focusService

| Property | Value |
|---|---|
| **Branch** | `refactor/decomp-v2-focus-service` |
| **Branched from** | `refactor/decomp-v2` (after Tasks 02 + 03 merged) |
| **Merge target** | `refactor/decomp-v2` |
| **Depends on** | Tasks 02 + 03 |
| **Parallel with** | 04a, 04c, 04d |
| **Effort** | ~2 hours |
| **Risk** | High (funnel state machine + bridge) |

## Files created
- `src/background/services/focusService.js`

## Handlers owned (14 cases)
`GET_FOCUS_ENGINE`, `START_FOCUS`, `ADD_FOCUS`, `SWITCH_FOCUS`, `COMPLETE_FOCUS`, `EXTEND_FOCUS_TIMER`, `SET_FUNNEL_STAGE`, `UPDATE_FOCUS_TAGS`, `RENAME_FOCUS`, `UPDATE_FOCUS`, `PAUSE_FOCUS`, `RESUME_FOCUS`, `LINK_INTENT_TO_TASK`, `MERGE_INTENTS`.

## Internal exports for cross-service callers
- `autoQueueFromIntent(intent, tabId)` — called by `tabService.SET_INTENT`.
- `pauseActiveFocus(reason)` — called by `clockService.TOGGLE_BREAK` and `blockgateService.START_SIDE_QUEST`.
- `linkTabToFocus(focusId, tabId)` — called by `tabService.LINK_TAB_TO_INTENT`.

## Efficiency fixes bundled
1. **Deduplicate `UPDATE_FOCUS` vs `SET_FUNNEL_STAGE`** — both transition stage via different code paths. Extract a private `applyStageTransition(focus, newStage)` and have both handlers call it.
2. Archive completed focuses into `focusEngine.history` through `archiveBeforeCap` before capping (instead of silent `.slice`).

## Cross-service calls
- `RESUME_FOCUS` → `clockService.endBreakIfActive()`. Direct import.

If 04d (clockService) hasn't landed yet, stub with feature flag and fall back to inline.

## Router registration
```js
const services = [..., focusService];
```

## Verification
- [x] Start focus → add focus → switch active → update → complete
- [x] Funnel stage transition gates preserved in service smoke test
- [ ] Pause focus → break starts; resume focus → break ends in extension
- [x] history cap drops oldest into archive
- [x] message-contracts.md updated
- [x] `npm run build`
- [x] `npm run version:check`
- [x] `git diff --check`
