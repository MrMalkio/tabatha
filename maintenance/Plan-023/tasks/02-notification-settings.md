# Task 02 — notificationService + settingsService

| Property | Value |
|---|---|
| **Branch** | `refactor/decomp-v2-communication` |
| **Branched from** | `refactor/decomp-v2-foundation` (Task 01) |
| **Merge target** | `refactor/decomp-v2` |
| **Depends on** | Task 01 |
| **Parallel with** | Task 03 |
| **Effort** | ~1 hour |
| **Risk** | Medium (broadcast scoping affects many UI listeners) |

## Files created
- `src/background/services/notificationService.js` — exports `broadcastToExtension`, `broadcastToAllTabs`, `broadcastAll`, plus `handleMessage` for: `OPEN_POPUP`, `GET_INBAR_DATA`, `GET_INBAR_NOTES`, `SAVE_INBAR_NOTE`, `START_POMODORO`.
- `src/background/services/settingsService.js` — handles `GET_SETTINGS`, `UPDATE_SETTINGS`. Validates `settings.storage` block on write.

## Audit & migrate every broadcastMessage caller

Grep `broadcastMessage(` in `background.js`. Classify each call:
- **Pure extension UI** (popup, sidebar, settings, home) → `broadcastToExtension`
- **Content-script-relevant** (TAB_UPDATED, INBAR-relevant) → `broadcastToAllTabs` or `broadcastAll`
- Unsure? Use `broadcastAll` and add a TODO row in `docs/architecture/message-contracts.md`.

Document each replacement in `message-contracts.md`.

## Router registration

After this task lands:
```js
const services = [notificationService, settingsService];
```

Remove the corresponding cases from the inline switch.

## Verification

- [x] `npm run build` passes
- [ ] Open popup → renders
- [ ] Open InBar on any tab → data renders, notes save
- [ ] Settings → change → reload → values persist
- [ ] No "Could not establish connection" errors in service worker console (means broadcasts are correctly scoped)
- [x] message-contracts.md updated for every message type touched
