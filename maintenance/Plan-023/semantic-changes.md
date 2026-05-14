# Semantic Changes Ledger — Plan 023

> **Rule:** every PR that lands on `refactor/decomp-v2` adds one or more rows here before merge. Phase 6 totals the rows to pick the version number for `master` → `main`.
>
> **Starting from:** `3.34.5` (master, 2026-05-13)

## Categories
- `breaking` — user-visible behavior changes, removed features, public API surface changes (Supabase tables, companion HTTP API, exported message types). One of these forces a MAJOR bump.
- `feature` — new user-visible capability or new internal capability another app could consume. Drives MINOR.
- `internal-schema` — change to a `chrome.storage` key shape or migration that future tools must account for. Drives MINOR.
- `fix` — bug fix with no other behavior change. Drives PATCH.
- `perf` — performance / efficiency improvement with no behavior change. Drives PATCH.
- `internal-only` — pure refactor, no observable effect at any boundary. **No version bump.**

## Bump rules (Tabatha convention)
- Any `breaking` row → MAJOR
- Else any `feature` or `internal-schema` row → MINOR
- Else any `fix` or `perf` row → PATCH
- Only `internal-only` rows → no bump (still ship as an `-α` if helpful for distribution)

---

## Ledger

| Date | Phase | Task | Change | Category | Notes |
|---|---|---|---|---|---|
| 2026-05-14 | 4 | 04d-clock-service | Extracted 6 clock handlers (CLOCK_IN, CLOCK_OUT, TOGGLE_BREAK, GET_CLOCK_STATUS, GET_CLOCK_HISTORY, GET_LAST_SESSION) into `clockService.js`. Added `endBreakIfActive()` cross-service export. Replaced 3 direct `clockService.toggleBreak()` calls in idle/alarm/RESUME_FOCUS with service exports. | `internal-only` | All response shapes preserved. TOGGLE_BREAK focus-pause side-effect now uses injected deps (getFocusEngine/setFocusEngine) instead of module-scope closures. |
| 2026-05-14 | 4 | 04d-clock-service | Added `clockTickService.js` — central 1Hz tick broadcaster with subscriber counting (3 new message types: TICK_SUBSCRIBE, TICK_UNSUBSCRIBE, GET_TICK_STATUS). | `feature` | Replaces N per-component `setInterval(1000)` timers with a single shared interval. UI migration to use TICK messages is deferred. |
| 2026-05-14 | 2 | 02-notification-settings | Extracted notificationService and settingsService from the background router; scoped outbound broadcasts to extension-only vs InBar-relevant all-target messages; added validation for `settings.storage` writes. | `internal-only` | Behavior and response shapes preserved for migrated handlers except invalid `settings.storage` writes now return `{ error }` before persisting. |
| 2026-05-14 | 1 | 01-foundation | Extracted constants/helpers/bootstrap from background.js; added router skeleton (`services[]` + `handleLegacyMessage` fall-through); added `storage` block to `DEFAULT_SETTINGS` with additive migration; added `enforceArrayCap` + `pruneStaleKeys` to storageService; added `archiveService.archiveBeforeCap` primitive. | `internal-only` + `internal-schema` | Settings migration is additive (defaults seeded only when missing). `services.length === 0` after this task — services land in Tasks 02+. Cap defaults match prior hard-coded values (logsCap 500, focusHistoryCap 200). |
| | | | | | |

<!-- Append rows above this line. Keep newest at top, oldest at bottom. -->
