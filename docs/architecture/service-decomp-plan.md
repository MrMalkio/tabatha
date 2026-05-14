# Service Architecture Decomposition Plan

> **Branch:** `refactor/decomp-v2` (planned)  
> **Baseline:** `master` @ v3.34.5-α  
> **Goal:** Transform `background.js` (2920 lines, 79 handlers) into a thin router + modular service modules  
> **Supersedes:** `refactor/service-arch` (archived as `archive/service-arch-v1`)

---

## Current State (Master)

```
src/background/
├── background.js          ← 2920-line monolith (79 message handlers, all logic inline)
├── clock.js               ← Partially extracted clock service (imported by background.js)
├── storage.js             ← Partially extracted storage helpers (imported by background.js)
├── companion-bridge.js    ← Desktop companion WebSocket bridge (6 handlers)
├── logger.js              ← Logging service (debug mode gated)
└── (no services/ directory yet)
```

### Key Metrics
- **Message handlers:** 79 in `background.js` + 6 in `companion-bridge.js` = **85 total**
- **Lines of code:** 2920 (background.js) + ~200 (clock.js) + ~100 (storage.js) + ~200 (companion-bridge.js)
- **Already extracted:** `clock.js` (7 handlers delegated), `storage.js` (get/set helpers)

---

## Target Architecture

```
src/background/
├── background.js          ← Thin router: onMessage switch → service.handleMessage()
├── services/
│   ├── storageService.js          ← get/set/remove wrappers (from existing storage.js)
│   ├── notificationService.js     ← broadcastMessage() + OPEN_POPUP, INBAR_*, POMODORO
│   ├── settingsService.js         ← GET_SETTINGS, UPDATE_SETTINGS
│   ├── categoryService.js         ← GET_CATEGORIES, CREATE_CATEGORY, CLONE_CATEGORY
│   ├── clockService.js            ← CLOCK_IN/OUT, BREAK, STATUS, HISTORY (from clock.js)
│   ├── groupService.js            ← SAVED_GROUPS, CREATE_GROUP, SUB_GROUPS
│   ├── sessionService.js          ← SESSIONS, FLOW_RECALL, CLOSED_CONTEXTS, EXPORT
│   ├── taskService.js             ← CRUD: GET/CREATE/UPDATE/DELETE_TASK
│   ├── tabService.js              ← Tab state: GET/UPDATE/LOCK/CLOSE/CONTEXT
│   ├── tabTrackingService.js      ← TIME_TRACKING, LOG_INTENT_ACTION + tab listeners
│   ├── focusService.js            ← Focus engine: START/ADD/SWITCH/COMPLETE/UPDATE/MERGE
│   ├── blockgateService.js        ← BLOCKED_SITE, SUGAR_BOX, PARK_TAB, SIDE_QUEST
│   └── companionService.js        ← GET/SEND companion status (wraps companion-bridge.js)
│
├── constants.js           ← DEFAULT_SETTINGS, PRIORITY_LEVELS, BUILT_IN_CATEGORIES
├── helpers.js             ← patternToRegex, formatTime, detectCategory
├── companion-bridge.js    ← WebSocket client (no change)
├── logger.js              ← Logging service (no change)
└── clock.js               ← DEPRECATED — replaced by services/clockService.js
```

---

## Service Module Contract

Every service exports `handleMessage(type, message, sender)`:

```javascript
// services/exampleService.js
import { getStorage, setStorage } from './storageService.js';
import { broadcastMessage } from './notificationService.js';

export async function handleMessage(type, message, sender) {
  switch (type) {
    case 'SOME_ACTION': return someAction(message, sender);
    default: return null; // Not our responsibility
  }
}

async function someAction({ param1 }, sender) {
  // ...logic
}
```

The router dispatches like:

```javascript
// background.js (post-refactor)
import * as focusService from './services/focusService.js';
import * as tabService from './services/tabService.js';
// ...etc

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(msg, sender) {
  const { type } = msg;
  return (
    await focusService.handleMessage(type, msg, sender) ??
    await tabService.handleMessage(type, msg, sender) ??
    // ...other services...
    { error: 'Unknown message type' }
  );
}
```

---

## Handler → Service Mapping (79 handlers)

See full details: [`service-map.md`](./service-map.md)

| Service | Handlers | Count |
|---------|----------|-------|
| **focusService** | START_FOCUS, ADD_FOCUS, SWITCH_FOCUS, COMPLETE_FOCUS, UPDATE_FOCUS, RENAME_FOCUS, EXTEND_FOCUS_TIMER, UPDATE_FOCUS_TAGS, SET_FUNNEL_STAGE, PAUSE_FOCUS, RESUME_FOCUS, LINK_INTENT_TO_TASK, MERGE_INTENTS, ASSOCIATE_TAB_WITH_FOCUS | 14 |
| **tabService** | GET_ALL_TABS, GET_TAB, GET_CURRENT_TAB_ID, UPDATE_TAB, UPDATE_TAB_TITLE, RENAME_TAB, UPDATE_TAB_CONTEXT, SET_TAB_CONTEXT, LINK_TAB_TO_INTENT, BATCH_UPDATE_CONTEXT, CHECK_CONTEXT_NEEDED, SET_INTENT, SKIP_DOMAIN, SET_PRIORITY, TOGGLE_LOCK, TOGGLE_URL_LOCK, FOCUS_TAB, CLOSE_TAB, BULK_CLOSE, REQUEST_CLOSE, CANCEL_CLOSE | 21 |
| **tabTrackingService** | GET_TIME_TRACKING, LOG_INTENT_ACTION | 2 |
| **clockService** | CLOCK_IN, CLOCK_OUT, TOGGLE_BREAK, GET_CLOCK_STATUS, GET_CLOCK_HISTORY, GET_LAST_SESSION, GET_LATEST_SESSION | 7 |
| **taskService** | GET_TASKS, CREATE_TASK, UPDATE_TASK, DELETE_TASK | 4 |
| **groupService** | GET_SAVED_GROUPS, CREATE_GROUP, CREATE_SUB_GROUP, GET_SUB_GROUPS | 4 |
| **categoryService** | GET_CATEGORIES, CREATE_CATEGORY, CLONE_CATEGORY | 3 |
| **blockgateService** | CHECK_BLOCKED_SITE, MANAGE_BLOCKED_SITES, UNBLOCK_SITE_TEMPORARILY, ADD_TO_SUGAR_BOX, PARK_TAB, START_SIDE_QUEST | 6 |
| **sessionService** | GET_SESSIONS, GET_CLOSED_CONTEXTS, GET_FLOW_RECALL, REOPEN_FLOW, EXPORT_MARKDOWN | 5 |
| **settingsService** | GET_SETTINGS, UPDATE_SETTINGS | 2 |
| **notificationService** | OPEN_POPUP, GET_INBAR_DATA, GET_INBAR_NOTES, SAVE_INBAR_NOTE, START_POMODORO | 5 |
| **companionService** | GET_COMPANION_STATUS, GET_COMPANION_SUMMARY, COMPANION_CLOCK_IN, COMPANION_CLOCK_OUT, COMPANION_TOGGLE_BREAK | 5 |
| **router (default)** | Unknown message fallback | 1 |

**Total: 79 handlers + 1 default = 80 cases** across 12 services + router

---

## Extraction Order (Dependency-First)

| Phase | Service | Dependencies | Notes |
|-------|---------|-------------|-------|
| **E1** | `constants.js` + `helpers.js` | None | Already partially present |
| **E2** | `storageService.js` | None | Move existing `storage.js` |
| **E3** | `notificationService.js` | storageService | `broadcastMessage()` used by all |
| **E4** | `settingsService.js` | storageService | 2 handlers, simple |
| **E5** | `categoryService.js` | storageService | 3 handlers |
| **E6** | `clockService.js` | storageService, notificationService | Move existing `clock.js` + expand |
| **E7** | `groupService.js` | storageService | 4 handlers |
| **E8** | `sessionService.js` | storageService, notificationService | 5 handlers |
| **E9** | `taskService.js` | storageService, notificationService | 4 handlers (org registry) |
| **E10** | `tabService.js` | storageService, notificationService, categoryService | 21 handlers — largest |
| **E11** | `tabTrackingService.js` | storageService, tabService | 2 handlers + listeners |
| **E12** | `focusService.js` | storageService, notificationService, tabService | 14 handlers — complex |
| **E13** | `blockgateService.js` | storageService, settingsService | 6 handlers |
| **E14** | `companionService.js` | companion-bridge | 5 handlers — wrapper |
| **E15** | Router refactor (`background.js`) | All services | Wire service chain |
| **E16** | Final parity verification | — | Every handler tested |

---

## Verification Protocol

### Per-Service
```bash
npm run build                    # must pass
# Load unpacked at chrome://extensions
# Check Service Worker console — 0 errors
# Test the specific handlers that were moved
```

### Full Migration
1. Build clean
2. Extension loads, SW active
3. Clock: in → break → resume → out
4. Focus: set → add → switch → complete → funnel stages
5. Tabs: open → context → intent → lock → close
6. Groups: create → add tabs → Chrome tab groups sync
7. Blocking: add site → visit → gate → temp unblock
8. InBar: renders → notes → edit dropdown
9. Tasks: CRUD → funnel stages → link to intent
10. Settings: change → persist
11. Export: markdown export
12. Companion: status check → clock sync

### Parity Proof
Migration checklist has every handler with:
- ☐ Extracted to service
- ☐ Build passes
- ☐ Same response shape
- ☐ Manual test passes

---

## Related Documents

| Document | Path | Purpose |
|----------|------|---------|
| Service map | [`service-map.md`](./service-map.md) | Handler → service assignment |
| Migration checklist | [`migration-checklist.md`](./migration-checklist.md) | Per-handler extraction status |
| Message contracts | [`message-contracts.md`](./message-contracts.md) | Frozen response-shape registry |
| Plan 023 | [`../../maintenance/Plan-023/`](../../maintenance/Plan-023/) | Overall decomp plan |
