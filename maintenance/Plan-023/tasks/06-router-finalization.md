# Task 06 — Router finalization & PR to main

| Property | Value |
|---|---|
| **Branch** | `refactor/decomp-v2-router` (or finish on `refactor/decomp-v2` directly) |
| **Branched from** | `refactor/decomp-v2` |
| **Merge target** | `master` → then PR to `main` |
| **Depends on** | All Phase 5 tasks |
| **Parallel with** | — |
| **Effort** | ~1 hour for cleanup + 1.5 hours full regression |
| **Risk** | Low (delete-only at this point) |

## Goals
1. Delete the now-empty `handleLegacyMessage` function (or whatever is left).
2. Ensure `background.js` is ≤300 lines.
3. Remove feature flags introduced by 04a/04b cross-service stubs.
4. Run the full regression checklist.
5. **Total the semantic-changes ledger** at [../semantic-changes.md](../semantic-changes.md). Count `breaking` / `feature` / `fix` / `perf` rows. Pick the version per Tabatha's convention (MAJOR = user-facing breaking change, MINOR = features / internal-schema shifts, PATCH = fixes/perf only). Edit `public/manifest.json` to the chosen value, then run `npm run version:sync`.

## Final background.js content (target structure)
```js
import './bootstrap.js';
import { storageService } from './services/storageService.js';
import { archiveService } from './services/archiveService.js';
import { notificationService } from './services/notificationService.js';
import { settingsService } from './services/settingsService.js';
import { tabTrackingService } from './services/tabTrackingService.js';
import { categoryService } from './services/categoryService.js';
import { sessionService } from './services/sessionService.js';
import { tabService } from './services/tabService.js';
import { focusService } from './services/focusService.js';
import { taskService } from './services/taskService.js';
import { clockService } from './services/clockService.js';
import { clockTickService } from './services/clockTickService.js';
import { groupService } from './services/groupService.js';
import { blockgateService } from './services/blockgateService.js';
import { companionService } from './services/companionService.js';
import { alarmService } from './services/alarmService.js';

const services = [
  notificationService, settingsService,
  tabTrackingService, categoryService, sessionService,
  tabService, focusService, taskService, clockService, clockTickService,
  groupService, blockgateService, companionService, alarmService,
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    for (const svc of services) {
      const result = await svc.handleMessage?.(message.type, message, sender);
      if (result !== undefined) return sendResponse(result);
    }
    sendResponse({ error: `Unknown message type: ${message.type}` });
  })();
  return true;
});

// URL lock content-script injection — thin listener, no business logic
chrome.webNavigation.onBeforeNavigate.addListener(...);
```

## Verification — full regression
1. Clock in → break → resume → clock out
2. Set focus → add items → switch → complete → funnel stage transitions
3. Open tabs → set context/intent → InBar renders → lock → close → notes archived
4. Create group → add tabs → Chrome tab groups sync
5. Block site → visit → gate → temp unblock → re-block
6. Settings → change values → reload → persistence
7. Export markdown
8. Tasks → create → edit → stage transitions → archive → cold-store after 90d
9. Companion bridge → WS connects → status → clock sync → idle transitions only

## Line-count audit
```bash
wc -l src/background/background.js          # target: ≤300
wc -l src/background/services/*.js          # each: ≤350
grep -c "case '" src/background/background.js   # target: 0
grep -c "onAlarm.addListener" src/background/   # target: 1
```

## Final PR
- Target: `main`
- Title: `refactor(background): service-arch decomposition (v<chosen-version>)`
- Body: link to Plan 023, feedback-response, parallel-merge-strategy. Include the line-count audit output.
- Reviewers: ensure at least one agent ran the full regression checklist before merge.
