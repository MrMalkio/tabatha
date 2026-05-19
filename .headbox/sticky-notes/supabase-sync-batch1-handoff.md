# Supabase Sync Batch 1 Handoff - May 19, 2026

**From:** Codex
**Branch:** `codex/sync-batch-1`
**Base:** `github/refactor/decomp-v2` after PR #19 merge
**Commit:** `96267d3 feat(sync): add durable batch 1 Supabase coverage`
**Version:** `4.7.6`

---

## TL;DR

Batch 1 sync coverage is implemented and committed, but not yet remotely verified.

The old Supabase sync foundation was already fixed by Plan 025 / PR #19. This batch adds push-sync coverage for durable local data that users expect to survive across machines:

- `tabathaOrg.operations`
- `tabathaOrg.initiatives`
- `tabathaOrg.clients`
- `tabathaOrg.projects`
- `tabathaOrg.tasks`
- `focusEngine.history`
- `clockHistory`
- `companionRecentSessions`
- `desktopActivity`

The next step is to apply migration 008 to the Flux Supabase project, load the unpacked extension, hit **Sync now**, and verify the new tables populate.

---

## What Landed

### Migration 008

File:

- `supabase/migrations/008_add_batch1_sync_tables.sql`

Creates:

- `tabatha.operations`
- `tabatha.initiatives`
- `tabatha.clients`
- `tabatha.projects`
- `tabatha.tasks_registry`
- `tabatha.clock_sessions`
- `tabatha.desktop_activity`

Each table has:

- `profile_id`
- nullable `org_id` / `team_id`
- local client IDs used for upsert identity
- RLS policies scoped to the authenticated user's profile
- grants for `anon`, `authenticated`, and `service_role`

### Sync service changes

File:

- `src/background/services/syncService.js`

New behavior:

- `focus_items` sync now includes both active/queued focus items and `focusEngine.history`.
- `tabathaOrg` maps are upserted into the new org registry tables.
- `clockHistory` is upserted into `clock_sessions`.
- `companionRecentSessions` and `desktopActivity` are upserted into `desktop_activity`.
- `lastClockSync` and `lastDesktopActivitySync` watermarks avoid reprocessing old history every sync.
- Storage-change listener triggers debounced sync for durable keys written directly from extension pages:
  - `tabathaOrg`
  - `clockHistory`
  - `companionRecentSessions`
  - `desktopActivity`

### Clock trigger

File:

- `src/background/services/clockService.js`

Clock-out now calls `triggerSync()` when it succeeds. The storage listener also catches `clockHistory`, but this makes the intent explicit.

### Router wiring

File:

- `src/background/background.js`

Wires:

- `registerSyncStorageListener()`
- `triggerSync` dependency into `clockService`

---

## Verification Already Run

All of these passed on branch `codex/sync-batch-1`:

```bash
node --check src/background/services/syncService.js
node --check src/background/background.js
npm run version:check
npm run build
npx eslint src/background/services/syncService.js --global chrome
```

Repo-wide lint still has pre-existing noise from extension `chrome` globals, generated artifacts, and `v0_legacy`. Do not treat repo-wide `npm run lint` as a clean gate until lint config is fixed.

---

## Required Next Steps

1. Apply migration 008 to the Flux Supabase project.
2. Load the built extension from this branch.
3. Open Settings -> Sync / Account.
4. Clear diagnostics.
5. Click **Sync now**.
6. Verify the new tables populate in the `tabatha` schema.

Recommended tables to check:

- `tabatha.clients`
- `tabatha.projects`
- `tabatha.tasks_registry`
- `tabatha.focus_items`
- `tabatha.clock_sessions`
- `tabatha.desktop_activity`

If there is not enough local data to test a table, create a small sample locally first:

- create a client/project/task via focus tags or task UI
- complete a focus so it lands in `focusEngine.history`
- clock in/out once
- run the desktop companion long enough to produce a companion session

---

## Migration Command Context

The broader Supabase handoff says the Flux DB password is in:

- `supabase/.env` as `Flux_DB_Pass`

Typical command:

```bash
supabase db push --linked --password '<from supabase/.env>'
```

Do not run `supabase config push --yes`. If config push is ever needed, answer prompts selectively. Migration 008 is SQL-only.

---

## New Diagnostic Kinds

If **Sync now** reports failures after migration 008, use these diagnostic names as the starting point:

- `operations_upsert_failed`
- `initiatives_upsert_failed`
- `clients_upsert_failed`
- `projects_upsert_failed`
- `tasks_registry_upsert_failed`
- `clock_sessions_upsert_failed`
- `desktop_activity_upsert_failed`
- `sync_completed_with_errors`

If these appear before migration 008 is applied, that is expected: the tables do not exist yet.

---

## Important Implementation Notes

- Sync is still push-only. No cloud-to-local pull was added.
- Active `clockSession` is intentionally local-only. Only completed `clockHistory` sessions sync.
- `tabs`, `parkedTabs`, `inbarNotes`, `tabathaLogs`, archive keys, and transient flags remain local-only.
- The sync service records `_lastSyncSuccess` only when all sync blocks succeed. If any block fails, diagnostics are kept and success is not updated.
- `metadata` / `payload` JSONB columns preserve the full local object for future migrations and two-way sync work.

---

## Watchouts For The Next Agent

- Migration 008 has not been applied remotely in this branch session.
- Manual unpacked-extension verification was not done in this session.
- `desktopActivity` shape is less certain than `companionRecentSessions`; the sync mapper is defensive and stores the raw payload.
- If a user reports sync broken, do not re-investigate the old page/service-worker session split first. PR #19 fixed that. Start with the Settings Sync Status diagnostic panel.

---

## Good Follow-Up Candidates

After Batch 1 is verified:

1. Batch 2 config sync:
   - `categories`
   - `urlRules`
   - `skippedDomains`
   - `blockedSites`
   - `subGroups`
2. Better `auth_init_failed` timeout handling:
   - on timeout, read the Supabase session directly from `chrome.storage.local`
   - log only if storage is also empty
3. Two-way sync design:
   - decide conflict strategy before implementing pull
