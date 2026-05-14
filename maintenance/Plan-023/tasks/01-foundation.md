# Task 01 — Foundation (constants, helpers, storage, archive, bootstrap, router skeleton)

| Property | Value |
|---|---|
| **Branch** | `refactor/decomp-v2-foundation` |
| **Branched from** | `master` (after Task 00 merged) |
| **Merge target** | `refactor/decomp-v2` (long-lived integration branch — create this branch when starting this task) |
| **Depends on** | Task 00 |
| **Parallel with** | — (gate for all of Phase 2+) |
| **Effort** | ~1.5 hours |
| **Risk** | Low |

## Files created
- `src/background/constants.js` — extract `DEFAULT_SETTINGS`, `PRIORITY_LEVELS`, `BUILT_IN_CATEGORIES`, `DEFAULT_FOCUS_ENGINE`, `STAGE_ORDER`. Already partially in `services/storageService.js` — **move** to `constants.js`.
- `src/background/helpers.js` — `formatDuration()`, `patternToRegex()`, `getUrlBase()`, `detectCategory()`.
- `src/background/services/storageService.js` — promote to canonical layer. Add `enforceArrayCap(key, capSetting)` and `pruneStaleKeys(liveTabIds)`.
- `src/background/services/archiveService.js` — `archiveBeforeCap(key, droppedEntries, destination)` (`'localArchive' | 'supabase' | 'warn'`). Local archive writes to `_archive_<key>` rolling key by month.
- `src/background/bootstrap.js` — extract `initializeState()`, `migrateTasksToOrg()`, `runRetentionCleanup()`, alarm registration, `onInstalled`/`onStartup`.

## Settings schema additions

Add to default settings (via `constants.js`):
```js
storage: {
  snapshotIntervalMinutes: 30,
  snapshotCap: 20,
  logsCap: 500,
  closedContextsCap: 500,
  intentHistoryCap: 500,
  focusHistoryCap: 200,
  parkedTabsCap: 200,
  parkedTabsWarnAt: 180,
  pendingTimeLogsCap: 5000,
  pendingTimeLogsWarnAt: 4000,
  archivedTasksColdAfterDays: 90
}
```

Migration in `initializeState()`: if existing settings lack `storage`, merge defaults in (additive, no data loss).

## Router skeleton (the "thread")

In `background.js`, **without removing the inline switch yet**, add:

```js
const services = []; // populated as services land

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    for (const svc of services) {
      const result = await svc.handleMessage(message.type, message, sender);
      if (result !== undefined) return sendResponse(result);
    }
    // Fall through to existing inline switch (unchanged)
    return handleLegacyMessage(message, sender, sendResponse);
  })();
  return true;
});
```

Rename the existing listener body to `handleLegacyMessage`. This is a structural change with **zero behavior change**.

## Verification

- [ ] `npm run build` passes
- [ ] Load unpacked → service worker console clean
- [ ] Every existing message type still works (regression-test a representative handful: GET_SETTINGS, GET_FOCUS_ENGINE, GET_TIME_TRACKING, GET_TASKS, CLOCK_IN, GET_COMPANION_STATUS)
- [ ] `services.length === 0` in the router (intentional — services land in later tasks)
- [ ] Settings migration adds `storage` block on first load (verify via DevTools storage inspector)
