# Task 05a — groupService + blockgateService

| Property | Value |
|---|---|
| **Branch** | `refactor/decomp-v2-group-blockgate` |
| **Branched from** | `refactor/decomp-v2` (after Phase 4 integration) |
| **Merge target** | `refactor/decomp-v2` |
| **Depends on** | All of Phase 4 |
| **Parallel with** | 05b |
| **Effort** | ~1.5 hours |
| **Risk** | Medium |

## Files created
- `src/background/services/groupService.js` — `GET_SAVED_GROUPS`, `CREATE_GROUP`, `CREATE_SUB_GROUP`, `GET_SUB_GROUPS`, plus `chrome.tabGroups.onCreated/onUpdated/onRemoved` listeners.
- `src/background/services/blockgateService.js` — `CHECK_BLOCKED_SITE`, `MANAGE_BLOCKED_SITES`, `UNBLOCK_SITE_TEMPORARILY`, `ADD_TO_SUGAR_BOX`, `PARK_TAB`, `START_SIDE_QUEST`.

## Cross-service calls
- `START_SIDE_QUEST` → `focusService.pauseActiveFocus('side-quest')`.

## Efficiency fixes bundled
- `sugarBox` cap = `settings.storage.sugarBoxCap` (add to defaults, default 500); FIFO with archive.
- `parkedTabs` warns at `parkedTabsWarnAt` via `notificationService.broadcastToExtension({ type: 'PARKED_TABS_WARNING', count })`.

## Router registration
```js
const services = [..., groupService, blockgateService];
```

## Verification
- [ ] Create tab group → reflected in Chrome groups → close → removed
- [ ] Block site → visit → gate page renders → temp unblock → re-blocks after timer
- [ ] Sugar box fills past cap → oldest archived, warning shown
- [ ] Parked tabs cross warn threshold → user-facing notification fires
- [ ] message-contracts.md updated
