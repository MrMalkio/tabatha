# 🔌 Supabase Sync — Status & Handoff — May 18, 2026 (updated)

**From:** Claude (Opus 4.7)
**For:** Next agent if more sync work is needed
**Branch this work lives on:** `fix/popup-harmony` (head moves with each fix; latest at **v4.3.6**)
**User confirmed sync works end-to-end on 2026-05-18 ~4:21 PM** — `tabatha.focus_items` / `tabatha.intent_history` populating, "✓ Synced HH:MM:SS" pill is green.

---

## TL;DR — current state

End-to-end Supabase sync is **structurally complete**. Every static mismatch I could find between code and the live Flux DB has been resolved. The user has a manual **↻ Sync now** button in Settings → Account → Sync Status to verify it works in seconds without waiting for the 5-min alarm.

If a future agent is asked to "fix Supabase sync" again, **first ask whether the user already hit Sync now and what the diagnostic panel reports**. Don't re-investigate from scratch — the panel is the canonical source of truth.

---

## What's been done (PR chain into `fix/popup-harmony`)

| Commit | Version | What |
|---|---|---|
| `19308ac` | (pre-v4.0.0) | `noopLock` in supabaseClient — bypass Web Locks contention across extension pages |
| `b517fca` → cherry-pick `6b9f150` | v4.3.1 | Expose `tabatha` schema in PostgREST via `supabase/config.toml`; migration 006 grants USAGE/SELECT/INSERT/UPDATE/DELETE; `clearAllAuthStorage` helper that clears both `window.localStorage` AND `chrome.storage.local` sb-* keys |
| `f025959` | v4.3.2 | Migration 007 adds `profile.avatar_url` column (was missing from migration 001); button timeout safety nets so signOut/forceReset can't get stuck on loading state |
| `86dfcb7` | v4.3.2 | Defensive `new Date(intent.timestamp).toISOString()` normalization on intent_history inserts — protects against legacy epoch-ms entries |
| `1d6335f` | v4.3.3 | `SYNC_NOW` / `CLEAR_SYNC_DIAGNOSTICS` message handlers + UI buttons in Settings |
| `0c74145` | v4.3.4 | **Custom `chrome.storage.local` storage adapter** on supabase-js — fixes the page-SW session split. This is the real fix; everything before was downstream of this. |
| `1f231b1` | v4.3.5 | Status pill + Sync now (↻) + Reload extension (⟳) icons in the Settings left-nav header so sync health is visible from any settings section |
| (v4.3.6 commit) | v4.3.6 | Pulse animation on the sync/reload icons when state ≠ 'fresh' — sync pulses first; if user clicks and state still isn't fresh within 6s, pulse shifts to reload icon |

Migration history is in sync: local 001–007 = remote 001–007 (verified via `supabase migration list --linked`).

---

## What sync currently does

**Code:** [src/background/services/syncService.js](../../src/background/services/syncService.js)

- **Trigger paths:**
  - `triggerSync()` debounced 10s — called by focusService, tabService, tabTrackingService on data mutations
  - `chrome.alarms` `supabase-sync` fires every 5 minutes
  - `SYNC_NOW` message handler (new in v4.3.3) — immediate, returns success+diagnostics
- **What gets synced:**
  - `focusEngine.items` → `tabatha.focus_items` (upsert on `profile_id, client_id`)
  - `chrome.storage.local.intentHistory` (entries newer than `lastIntentSync`) → `tabatha.intent_history` (insert)
  - `chrome.storage.local.timeTracking.pendingTimeLogs` → `tabatha.time_logs` (handled by [src/services/timeTracking.js](../../src/services/timeTracking.js), separate path, only fires if user has `default_org_id` set)
- **What does NOT sync:**
  - `tabathaOrg.clients/projects/tasks/operations/initiatives` — local only
  - `closedContexts`, `sugarBox`, `parkedTabs`, `urlRules`, `categories`, `subGroups`, `inbarNotes` — local only
  - `tabs` map — local only (transient state)
  - **No cloud → local pull anywhere.** Sync is one-directional, push-only.

---

## What likely remains (in priority order)

### P0 — must verify
- **Has the user confirmed `tabatha.focus_items` / `tabatha.intent_history` actually populate after hitting Sync now?** If not, the diagnostic panel will name the failure. Read [src/settings/index.jsx](../../src/settings/index.jsx) Sync Status panel to see what the user is looking at.

### P1 — likely follow-ups (user agreed with batch 1 + 2 below)

**Batch 1 — high-value sync gaps (do first):**
1. **`tabathaOrg` sync** — clients, projects, tasks, operations, initiatives. Add migration 008 with `tabatha.clients` / `projects` / `tasks_registry` / `operations` / `initiatives` tables, each with `(profile_id, client_id)` unique key for upsert. Extend `syncService.syncToSupabase` with a 4th block walking `tabathaOrg`. This is THE highest-value next item — clients/projects/tasks are what users build over time and expect to see on a second machine.
2. **`clockHistory` sync** — 365-day clock-in/out + breaks. New `tabatha.clock_sessions` table; `clockService` calls `triggerSync()` on clock-out; watermark via `lastClockSync` parallel to `lastIntentSync`.
3. **`focusEngine.history` included in focus_items upsert** — one-line change: merge `engine.history` into the existing upsert batch. The `focus_state='completed'` column already accommodates these.
4. **Companion activity sync** — `tabatha.desktop_activity` table, push from `desktopActivity` + `companionRecentSessions` with retention-aware delta.

**Batch 2 — config that should travel:**
5. **`categories`** custom rules
6. **`urlRules` + `skippedDomains`**
7. **`blockedSites`** (block list; intentionally leave temp bypasses local)
8. **`subGroups`**

**Skip — keep local:**
- `parkedTabs`, `inbarNotes`, `tabs`, `clockSession` (active), `timeTracking` aggregates, `tabathaLogs`, all `_archive_*` / `_*Migrated` flags.

### P1 — UX gaps to address alongside

- **Full user profile section in Settings → Sync & Account.** Currently shows display_name (editable), email, avatar (read-only if present), Connected pill, linked accounts, orgs/teams, sync status. Missing fields on `tabatha.profiles` that should also be surfaced/editable:
  - `avatar_url` editor (URL paste or image upload — image upload needs Supabase Storage bucket)
  - `timezone` (currently defaults to `America/New_York` in schema)
  - `default_realm` (business/professional/work/personal) — already on schema
  - `role` (read-only display: user/manager/admin/owner)
  - `created_at` ("Member since …")
  - `settings` JSONB — probably leave internal, but surface a subset (preferred theme, notification prefs) if relevant
- **Default org / default team selector** — `default_org_id` and `default_team_id` are on the profiles row but there's no UI to set them. Users with multiple org memberships have no way to pick which is active.
- **Display name save was working before sync was working.** The user reported saving a name change in a prior session and seeing it persist, despite sync being broken at the time. That's correct behavior: display name save uses `supabase.from('profiles').update(...)` — a direct REST call, NOT the syncService path. It only required the schema fix (migration 005 + 007 + schema exposure) to start working, not the chrome.storage adapter fix. Don't confuse the two paths in future debugging.

### P1 — known noise to clean up

- **`auth_init_failed: auth.getSession: timed out after 15000ms`** still appears occasionally on page mount even when sync is healthy. Root cause: when supabase-js's `getSession()` triggers a network-side token refresh and the network is slow, it can exceed the 15s timeout race in [useAuth.js](../../src/hooks/useAuth.js). The session does load eventually; this is benign noise but pollutes the diagnostic panel. Two viable fixes:
  - Bump `AUTH_TIMEOUT_MS` to 30s (lazy fix).
  - **Better fix:** on timeout, read `sb-mtdgoahskcibjbhfvofx-auth-token` directly from chrome.storage.local. If a session exists there, use it without logging — log only if storage is also empty. This is the most robust path.
- **Two-way sync.** Still push-only. See v4.0.0-followups item 2.

### P2 — UX
- The Sync Status panel surfaces failures but doesn't show "next auto-sync in N minutes." Consider a small countdown.
- Diagnostic events from yesterday persist forever unless user hits **Clear log** or Force reset auth. That's intentional (forensic value) but could be auto-trimmed after, say, 7 days.

### P3 — never blocked sync, but adjacent
- Companion bridge has no profile scoping (single-user, no per-profile auth). See v4.0.0-followups item 4.
- Tab groups: tracked in `subGroups` but not displayed in any Tabatha panel. See v4.0.0-followups item 3.

---

## Critical context if you have to dig in

### The chain of bugs we hit (in order discovered)

1. `Invalid schema: tabatha` → PostgREST didn't expose the schema (fixed by adding to `supabase/config.toml` `[api].schemas`, then `supabase config push`).
2. `permission denied for schema tabatha` → roles didn't have GRANT USAGE (fixed by migration 006).
3. `Lock "lock:sb-...-auth-token" was released because another request stole it` → Web Locks contention across extension pages (fixed by `noopLock` in [supabaseClient.js](../../src/services/supabaseClient.js)).
4. Sign Out / Force reset auth didn't actually clear session → supabase-js stores sessions in `window.localStorage` in extension PAGES, NOT `chrome.storage.local` (fixed by `clearAllAuthStorage` in [useAuth.js](../../src/hooks/useAuth.js) which clears both — partly superseded by #7 below).
5. `column profiles.avatar_url does not exist` → migration 001 didn't include it but code did (fixed by migration 007).
6. Buttons stuck on loading state → supabase-js's local-scope signOut sometimes hangs (fixed by Promise.race + setTimeout backstop).
7. **`no_auth_session: Sync attempted while signed out`** even with the UI showing "Connected" → page sign-in lands in `window.localStorage`, but the service worker has no `window` so it falls back to in-memory storage, which is empty on every SW wake. Two parallel storage layers, never crossed. **Fixed in v4.3.4 by passing a custom `chrome.storage.local`-backed storage adapter to `createClient`** — page and SW now share the same session.

### The MV3 extension auth model — important to know

- **Storage default in pages**: supabase-js picks `window.localStorage`. ❌ NOT shared with the SW.
- **Storage default in service worker**: no `window`, no `localStorage`, falls back to **in-memory only**. Every SW wake-up starts empty. ❌
- **Our fix (v4.3.4)**: we pass a custom `chrome.storage.local`-backed `storage` adapter to `createClient`. That layer IS shared across every extension context (pages + SW). After sign-in, both the page and the SW see the same JWT immediately.
- **Web Locks**: `navigator.locks` is shared across same-extension contexts. supabase-js's default `lock` causes contention storms. We disabled it with `noopLock`.
- **JWT propagation**: supabase-js attaches it via fetch headers from whichever client instance issues the call. With the chrome.storage adapter, both contexts load from the same place so they send the same JWT.
- **`clearAllAuthStorage` in useAuth** still walks both `window.localStorage` AND `chrome.storage.local` for `sb-*` keys. The localStorage path is defensive against old sessions that pre-date v4.3.4; only chrome.storage matters going forward.

### The Flux project specifics

- Project ref: `mtdgoahskcibjbhfvofx`
- Project name: **Flux** (also used by other apps — be careful when modifying schemas other than `tabatha`)
- DB password is in [supabase/.env](../../supabase/.env) as `Flux_DB_Pass`
- Tabatha-specific tables all live in the `tabatha` schema
- The `flux_time_entries` table in `public` schema is used by the Asana time tracker widget — leave alone unless explicitly asked

### Tools / commands the next agent will want

```bash
# Apply pending migrations:
supabase db push --linked --password '<from supabase/.env>'

# Inspect remote schema:
supabase migration list --linked --password '<from supabase/.env>'

# Quick REST probe of a table (returns [] if RLS filters anonymous, an error if column/schema missing):
curl -sS "https://mtdgoahskcibjbhfvofx.supabase.co/rest/v1/<table>?select=<cols>&limit=0" \
     -H "apikey: sb_publishable_lPmWAzfBqbHkyGslkhohQA_8QgdBCu_" \
     -H "Accept-Profile: tabatha"

# Build:
npm run build

# Build artifacts present locally (NOT in git):
ls dist*/ | head
# dist/         — what the user's extension card loads from
# dist-v3.34.5/ — original rollback
# dist-v4.0.0/  — early v4 release build
# dist-v4.3.3/  — current build
```

### Where the relevant code lives

| Concern | File |
|---|---|
| Supabase client init + noopLock | [src/services/supabaseClient.js](../../src/services/supabaseClient.js) |
| Auth state, profile load, signOut, forceReset | [src/hooks/useAuth.js](../../src/hooks/useAuth.js) |
| Settings → Account UI (sync status panel, buttons, display-name editor) | [src/settings/index.jsx](../../src/settings/index.jsx) §700-820 |
| syncService — debounce, alarm, focus_items/intent_history push, SYNC_NOW handler | [src/background/services/syncService.js](../../src/background/services/syncService.js) |
| Time-logs sync (separate from main sync) | [src/services/timeTracking.js](../../src/services/timeTracking.js) |
| All Supabase migrations | [supabase/migrations/](../../supabase/migrations/) |
| Migrations 005, 006, 007 added in this work cycle | 005 (default_org_id/team_id), 006 (grants), 007 (avatar_url) |

### Conventions to honor

- **Never use `Co-Authored-By:`** in any commit or PR. Hard rule, no exceptions. See [memory/feedback_no_coauthor.md](C:/Users/mrmal/.claude/projects/c--Users-mrmal-Le-Dev-Tabatha/memory/feedback_no_coauthor.md).
- **Branch names: `staging` and `main`**, never `master`. See [memory/project_branch_naming.md](C:/Users/mrmal/.claude/projects/c--Users-mrmal-Le-Dev-Tabatha/memory/project_branch_naming.md).
- **Dev-machine version bump on every commit** — Headbox Rule 10. Bump `public/manifest.json`, then `npm run version:sync` to propagate.
- **Don't touch `dist/`, `dist-vX.Y.Z/` in git** — those are local build artifacts. Already in `.gitignore` for the most part.

### What you should NOT do

- Don't re-investigate the chain of bugs above — they're all fixed. Trust the migrations and the code, only re-touch what the diagnostic panel names.
- Don't run `supabase config push` with `--yes` — it'll push our local auth/storage defaults over the remote, which is destructive. Always answer the prompts selectively (Y for api, N for others) unless you have explicit reason.
- Don't disable RLS or run `ALTER ROLE authenticator` — Supabase reserves these in hosted environments. Migration attempts will fail with `42501` permission errors.
- Don't bypass the `Force reset auth` button by deleting `chrome.storage.local` directly during testing — it doesn't clear `window.localStorage`, which is where session lives in extension pages. The button does both.

---

## If the user reports sync still broken

Have them paste the new diagnostic events from Settings → Sync Status. Common patterns:

| Diagnostic kind | What it means | Likely fix |
|---|---|---|
| `auth_init_failed` | Network unreachable or token refresh hung | Hit Force reset auth, sign back in |
| `profile_wide_select_failed` then `profile_select_failed` | Both wide and minimal SELECT failed → table/schema/column missing | Verify migrations applied with `supabase migration list --linked` |
| `no_profile_row` | Signed in but no profile auto-provisioned | Likely RLS on profiles table blocking the INSERT — check policy |
| `focus_items_upsert_failed` / `intent_history_insert_failed` | Sync ran, RLS or schema rejected the write | Read the `detail` field of the diagnostic for the actual PostgREST error |
| `partial_sync` | Migration 005 not applied | `supabase db push --linked` |
| `sync_threw` | Generic catch — read detail | Depends |

The `↻ Sync now` button is the fastest reproducer. Have them clear the log first, then click Sync now, then paste whatever appears.
