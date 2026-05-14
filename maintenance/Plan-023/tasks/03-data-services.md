# Task 03 — tabTrackingService + categoryService + sessionService

| Property | Value |
|---|---|
| **Branch** | `refactor/decomp-v2-data` |
| **Branched from** | `refactor/decomp-v2-foundation` (Task 01) |
| **Merge target** | `refactor/decomp-v2` |
| **Depends on** | Task 01 |
| **Parallel with** | Task 02 |
| **Effort** | ~2 hours |
| **Risk** | Medium (intent log merge is a schema change) |

## Files created
- `src/background/services/tabTrackingService.js` — `GET_TIME_TRACKING`, `LOG_INTENT_ACTION`, tab activated/removed time listeners.
- `src/background/services/categoryService.js` — `GET_CATEGORIES`, `CREATE_CATEGORY`, `CLONE_CATEGORY`.
- `src/background/services/sessionService.js` — `GET_SESSIONS`, `GET_CLOSED_CONTEXTS`, `GET_FLOW_RECALL`, `REOPEN_FLOW`, `EXPORT_MARKDOWN`, `saveSessionSnapshot()`.

## Schema migration: intentChangeLog → intentHistory

Bootstrap migration runs once on `onInstalled`/`onStartup`:
```js
const { intentChangeLog = [], intentHistory = [] } = await chrome.storage.local.get(['intentChangeLog', 'intentHistory']);
if (intentChangeLog.length) {
  const merged = [
    ...intentHistory,
    ...intentChangeLog.map((c) => ({
      timestamp: c.timestamp,
      tabId: c.tabId ?? null,
      url: c.url,
      domain: c.domain,
      action: 'change',
      oldIntent: c.oldIntent,
      newIntent: c.newIntent,
      oldContext: c.oldContext,
      newContext: c.newContext,
      focusId: null,
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 500);
  await chrome.storage.local.set({ intentHistory: merged });
  await chrome.storage.local.remove('intentChangeLog');
}
```

All future writes go to `intentHistory` only. Update `LOG_INTENT_ACTION` and `SET_TAB_CONTEXT` writers (the latter currently writes to `intentChangeLog` — see [background.js:2018](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/background.js#L2018)).

## Cap enforcement via settings + archive

Replace hardcoded `.slice(0, 500)` calls with:
```js
await archiveBeforeCap('intentHistory', dropped, 'localArchive');
await enforceArrayCap('intentHistory', settings.storage.intentHistoryCap);
```

Same for `closedContexts` and `sessions`.

## Snapshot interval

`sessionService.saveSessionSnapshot()` reads `settings.storage.snapshotIntervalMinutes` and `snapshotCap`. Alarm scheduling in `bootstrap.js` reads the same setting; re-schedule on `UPDATE_SETTINGS` if it changed.

## timeTracking.byTab pruning

On `chrome.tabs.onRemoved`, **before** deleting `byTab[tabId]`, aggregate its time into the matching `byCategory` / `byGroup` bucket. Then delete the per-tab entry.

## Router registration

```js
const services = [
  notificationService,    // from Task 02
  settingsService,        // from Task 02
  tabTrackingService,
  categoryService,
  sessionService,
];
```

Remove the corresponding cases from the inline switch.

## Verification

- [ ] `npm run build` passes
- [ ] On a profile that previously had `intentChangeLog` entries: after upgrade, `intentChangeLog` is gone, `intentHistory` has the merged data, sorted newest-first
- [ ] Change `settings.storage.snapshotIntervalMinutes` → next snapshot fires at the new cadence
- [ ] Close a tab with active time tracking → `byTab` entry removed, `byCategory` total preserved
- [ ] Trip the `intentHistoryCap` (e.g. set to 5 for testing) → archive entries appear under `_archive_intentHistory`
- [ ] message-contracts.md updated
