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
| 2026-05-14 | 4 | 04c-task-service | Extracted taskService from the background router for task CRUD and stage-gating ownership; archived org tasks now carry `archivedAt` and tasks older than `settings.storage.archivedTasksColdAfterDays` move from `tabathaOrg.tasks` to `_archivedTasks`. | `internal-schema` | Public request/response shapes for `GET_TASKS`, `CREATE_TASK`, `UPDATE_TASK`, and `DELETE_TASK` are preserved. `_archivedTasks` is an internal cold-store key for old archived task records. |
| 2026-05-14 | 4 | 04b-focus-service | Extracted focusService from the background router for focus lifecycle, funnel transitions, intent-task linking, and intent merge ownership; `SET_FUNNEL_STAGE` and `UPDATE_FOCUS` now share the same stage transition helper; completed focus history is archived through `archiveBeforeCap` before applying `settings.storage.focusHistoryCap`. | `perf` | Public request/response shapes for migrated focus handlers are preserved. Dropped focus history entries now land in `_archive_focusEngine.history` instead of being silently discarded by the cap. |
| 2026-05-14 | 3 | 03-data-services | Extracted tabTrackingService, categoryService, sessionService from the background router; replaced hardcoded `.slice(0, 500/50)` caps with `enforceArrayCap` + `archiveBeforeCap` for `intentHistory` / `closedContexts` / `sessions`; merged `intentChangeLog` into `intentHistory` with the union shape (one-time migration, legacy key removed); snapshot alarm is now user-tunable via `settings.storage.snapshotIntervalMinutes` (re-armed on UPDATE_SETTINGS); `chrome.tabs.onRemoved` now aggregates `timeTracking.byTab` into `byGroup`/`bySubGroup`/`byProject` before deleting the per-tab row. | `internal-schema` | `intentChangeLog` is removed and merged into `intentHistory` — any external reader of `intentChangeLog` must read `intentHistory` instead. Cap defaults are still `intentHistoryCap=500`, `closedContextsCap=500`, `snapshotCap=20`. Response shapes for migrated handlers preserved; `GET_LATEST_SESSION` is now handled by sessionService (same `{ session }` shape). |
| 2026-05-14 | 2 | 02-notification-settings | Extracted notificationService and settingsService from the background router; scoped outbound broadcasts to extension-only vs InBar-relevant all-target messages; added validation for `settings.storage` writes. | `internal-only` | Behavior and response shapes preserved for migrated handlers except invalid `settings.storage` writes now return `{ error }` before persisting. |
| 2026-05-14 | 1 | 01-foundation | Extracted constants/helpers/bootstrap from background.js; added router skeleton (`services[]` + `handleLegacyMessage` fall-through); added `storage` block to `DEFAULT_SETTINGS` with additive migration; added `enforceArrayCap` + `pruneStaleKeys` to storageService; added `archiveService.archiveBeforeCap` primitive. | `internal-only` + `internal-schema` | Settings migration is additive (defaults seeded only when missing). `services.length === 0` after this task — services land in Tasks 02+. Cap defaults match prior hard-coded values (logsCap 500, focusHistoryCap 200). |
| | | | | | |

<!-- Append rows above this line. Keep newest at top, oldest at bottom. -->
