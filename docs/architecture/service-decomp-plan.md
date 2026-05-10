# Service Architecture Decomposition Plan

> **Branch:** `refactor/service-arch`  
> **Baseline:** `master` @ v0.2.8-alpha  
> **Goal:** Transform `background.js` (2302 lines, 62 handlers) into a thin router + 11 service modules  
> **Risk:** Zero. No features change. Behavior-identical refactor.

---

## Strategy

### Parallel Track Model

```
master ─────●─────●─────●─────●─────● (features, fixes continue)
             \                       ↑
              \   rebase periodically │
               \                     │
refactor/service-arch ──●──●──●──●───┘ (decomp, then merge)
```

- **`master`** is never frozen. Feature work, bug fixes, UI changes continue.
- **`refactor/service-arch`** does the decomposition work.
- **Periodically rebase** the decomp branch onto master to absorb new code.
- **Merge back** only when 100% parity is verified.
- After merge, new features (Follow-Through Engine, InBar v2) build on the clean architecture.

### Rebase Protocol

Before each work session on this branch:
```bash
git checkout refactor/service-arch
git rebase master
npm run build   # verify no conflicts broke anything
```

If `master` added new message handlers, add them to the appropriate service module + update the migration checklist.

---

## Current State

### Source Files

| File | Lines | Role |
|------|-------|------|
| `src/background/background.js` | 2302 | Monolith — ALL logic lives here |
| `src/background/clock.js` | ~120 | Clock service (already extracted) |
| `src/background/storage.js` | ~130 | Storage helpers (already extracted) |

### All 62 Message Handlers (current)

See full parity checklist: [`docs/architecture/migration-checklist.md`](file:///c:/Users/mrmal/Le%20Dev/Tabatha/docs/architecture/migration-checklist.md)

---

## Target Architecture

```
src/background/
├── background.js                  ← Thin router (~150 lines)
│                                     - chrome.runtime.onMessage listener
│                                     - chrome.tabs/alarms/idle listeners
│                                     - Delegates ALL logic to services
│
├── services/
│   ├── focusService.js            ← Focus engine: CRUD, intents, blocking, switching
│   ├── tabService.js              ← Tab state: context, intent, categories, locks
│   ├── tabTrackingService.js      ← Time tracking: active/passive, heartbeats, closures
│   ├── clockService.js            ← (ALREADY EXISTS as clock.js — move to services/)
│   ├── storageService.js          ← (ALREADY EXISTS as storage.js — move to services/)
│   ├── taskService.js             ← Task CRUD: create, update, delete, link
│   ├── groupService.js            ← Tab groups: create, sub-groups, Chrome sync
│   ├── categoryService.js         ← Categories: CRUD, URL pattern matching
│   ├── blockgateService.js        ← Site blocking: check, manage, temp unblock
│   ├── sessionService.js          ← Session/context history: save, recall, export
│   └── notificationService.js     ← Broadcasting: FOCUS_ENGINE_UPDATED, etc.
│
├── api/
│   └── fluxApi.js                 ← Public API surface for Flux ecosystem
│
├── constants.js                   ← DEFAULT_SETTINGS, PRIORITY_LEVELS, BUILT_IN_CATEGORIES
└── helpers.js                     ← Shared utilities: patternToRegex, formatTime, etc.
```

---

## Service Module Contracts

Each service module follows this pattern:

```javascript
// src/background/services/exampleService.js
import { getStorage, setStorage } from './storageService.js';
import { broadcastMessage } from './notificationService.js';

/**
 * Handle a message of the given type.
 * @returns {object|null} Response object, or null if not handled by this service.
 */
export async function handleMessage(type, message, sender) {
  switch (type) {
    case 'SOME_ACTION': return someAction(message);
    case 'ANOTHER_ACTION': return anotherAction(message);
    default: return null; // not our responsibility
  }
}

// Internal functions
async function someAction({ param1, param2 }) {
  // ...logic
}

// Public API for Flux ecosystem integration
export const api = {
  someAction,
  anotherAction,
};
```

---

## Handler → Service Mapping

See full details: [`docs/architecture/service-map.md`](file:///c:/Users/mrmal/Le%20Dev/Tabatha/docs/architecture/service-map.md)

| Service | Handlers | Count |
|---------|----------|-------|
| **focusService** | START_FOCUS, ADD_FOCUS, SWITCH_FOCUS, COMPLETE_FOCUS, UPDATE_FOCUS, RENAME_FOCUS, EXTEND_FOCUS_TIMER, UPDATE_FOCUS_TAGS, SET_FUNNEL_STAGE, SET_PRIORITY, GET_FOCUS_ENGINE, LINK_INTENT_TO_TASK, MERGE_INTENTS, ASSOCIATE_TAB_WITH_FOCUS | 14 |
| **tabService** | GET_ALL_TABS, GET_TAB, GET_CURRENT_TAB_ID, UPDATE_TAB, UPDATE_TAB_TITLE, SET_TAB_CONTEXT, LINK_TAB_TO_INTENT, BATCH_UPDATE_CONTEXT, CHECK_CONTEXT_NEEDED, SKIP_DOMAIN, TOGGLE_LOCK, TOGGLE_URL_LOCK, FOCUS_TAB, CLOSE_TAB, BULK_CLOSE, REQUEST_CLOSE, CANCEL_CLOSE | 17 |
| **tabTrackingService** | GET_TIME_TRACKING, LOG_INTENT_ACTION | 2 |
| **clockService** | CLOCK_IN, CLOCK_OUT, TOGGLE_BREAK, GET_CLOCK_STATUS, GET_CLOCK_HISTORY, GET_LAST_SESSION, GET_LATEST_SESSION | 7 |
| **taskService** | GET_TASKS, CREATE_TASK, UPDATE_TASK, DELETE_TASK | 4 |
| **groupService** | GET_SAVED_GROUPS, CREATE_GROUP, CREATE_SUB_GROUP, GET_SUB_GROUPS | 4 |
| **categoryService** | GET_CATEGORIES, CREATE_CATEGORY, CLONE_CATEGORY | 3 |
| **blockgateService** | CHECK_BLOCKED_SITE, MANAGE_BLOCKED_SITES, UNBLOCK_SITE_TEMPORARILY, ADD_TO_SUGAR_BOX, PARK_TAB, START_SIDE_QUEST | 6 |
| **sessionService** | GET_SESSIONS, GET_CLOSED_CONTEXTS, GET_FLOW_RECALL, REOPEN_FLOW, EXPORT_MARKDOWN | 5 |
| **settingsService** | GET_SETTINGS, UPDATE_SETTINGS | 2 |
| **notificationService** | OPEN_POPUP, GET_INBAR_DATA, GET_INBAR_NOTES, SAVE_INBAR_NOTE, START_POMODORO | 5 |

**Total: 62 handlers across 11 services** (+ storageService already extracted)

---

## Extraction Order

Extract services in dependency order — services with NO dependencies on other services first:

| Phase | Service | Dependencies | Est. Time |
|-------|---------|-------------|-----------|
| **E1** | `constants.js` + `helpers.js` | None | 10 min |
| **E2** | `storageService.js` (move existing) | None | 5 min |
| **E3** | `notificationService.js` | storageService | 15 min |
| **E4** | `settingsService.js` | storageService | 10 min |
| **E5** | `categoryService.js` | storageService | 15 min |
| **E6** | `clockService.js` (move + expand) | storageService, notificationService | 15 min |
| **E7** | `groupService.js` | storageService | 15 min |
| **E8** | `sessionService.js` | storageService, notificationService | 20 min |
| **E9** | `taskService.js` | storageService, notificationService | 15 min |
| **E10** | `tabService.js` | storageService, notificationService, categoryService | 25 min |
| **E11** | `tabTrackingService.js` | storageService, tabService | 15 min |
| **E12** | `focusService.js` | storageService, notificationService, tabService | 30 min |
| **E13** | `blockgateService.js` | storageService, settingsService | 20 min |
| **E14** | Router refactor (`background.js`) | All services | 20 min |
| **E15** | `api/fluxApi.js` | All services | 15 min |
| **E16** | Final parity verification | — | 30 min |

**Total estimated: ~4.5 hours**

---

## Per-Service Extraction Steps

For each service:

1. **Identify** — Find all case handlers + supporting functions in `background.js`
2. **Copy** — Create `services/{name}.js`, paste functions with imports
3. **Wire** — Add `handleMessage(type, message, sender)` switch
4. **Route** — In `background.js`, replace inline handler with service call
5. **Test** — `npm run build` + load extension + verify that handler still works
6. **Check off** — Update `migration-checklist.md`

---

## Related Documents

| Document | Path | Purpose |
|----------|------|---------|
| This plan | [`docs/architecture/service-decomp-plan.md`](file:///c:/Users/mrmal/Le%20Dev/Tabatha/docs/architecture/service-decomp-plan.md) | How + why |
| Service map | [`docs/architecture/service-map.md`](file:///c:/Users/mrmal/Le%20Dev/Tabatha/docs/architecture/service-map.md) | Which handler → which service |
| Parity checklist | [`docs/architecture/migration-checklist.md`](file:///c:/Users/mrmal/Le%20Dev/Tabatha/docs/architecture/migration-checklist.md) | Track every handler's migration status |
| Follow-Through scope | [`C:/Users/mrmal/.gemini/antigravity/brain/53e2949b-db81-4fed-a450-3e96dcb44a1d/scope_follow_through.md`](file:///C:/Users/mrmal/.gemini/antigravity/brain/53e2949b-db81-4fed-a450-3e96dcb44a1d/scope_follow_through.md) | Data model for new features (post-merge) |
| InBar scope | [`C:/Users/mrmal/.gemini/antigravity/brain/53e2949b-db81-4fed-a450-3e96dcb44a1d/scope_inbar_digression.md`](file:///C:/Users/mrmal/.gemini/antigravity/brain/53e2949b-db81-4fed-a450-3e96dcb44a1d/scope_inbar_digression.md) | InBar + digression UX (post-merge) |
| Master plan v2 | [`C:/Users/mrmal/.gemini/antigravity/brain/53e2949b-db81-4fed-a450-3e96dcb44a1d/implementation_plan_014.md`](file:///C:/Users/mrmal/.gemini/antigravity/brain/53e2949b-db81-4fed-a450-3e96dcb44a1d/implementation_plan_014.md) | Overall v0.3.0 roadmap |
| AGENTS.md | [`AGENTS.md`](file:///c:/Users/mrmal/Le%20Dev/Tabatha/AGENTS.md) | Project rules + session log |

---

## Verification Protocol

### After Each Service Extraction

```bash
npm run build                    # must pass
# Load unpacked at chrome://extensions
# Check Service Worker console — 0 errors
# Test the specific handlers that were moved
```

### After Full Migration

1. **Build:** `npm run build` clean
2. **Load:** Extension loads, SW active
3. **Clock:** Clock in → break → resume → clock out
4. **Focus:** Set focus → add items → switch → complete
5. **Tabs:** Open tabs → set context → set intent → lock → close
6. **Groups:** Create group → add tabs → verify Chrome tab groups sync
7. **Blocking:** Add blocked site → visit → verify gate → temp unblock
8. **InBar:** Open tab → verify InBar renders → notes work
9. **Settings:** Change settings → verify persistence
10. **Export:** Export markdown → verify file content

### Parity Proof

The migration checklist has every handler with:
- ☐ Extracted to service
- ☐ Build passes
- ☐ Manual test passes
- ☐ Same response shape as original

When ALL 62 handlers are checked, merge is safe.
