# 🔌 Supabase Sync — Status & Handoff — May 18, 2026

**From:** Claude (Opus 4.7)
**For:** Next agent if more sync work is needed
**Branch this work lives on:** `fix/popup-harmony` (head: `1d6335f` at v4.3.3)

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

### P1 — likely follow-ups
- **Profile auto-provision behavior on first sign-in.** The INSERT path in [src/hooks/useAuth.js:121](../../src/hooks/useAuth.js#L121) writes `{auth_user_id, display_name, avatar_url}` (NOT `email`). The `email` column on `tabatha.profiles` stays NULL. If product wants email captured, add it to the insert (use `user.email` from `supabase.auth.getUser()`).
- **`tabatha.profiles.email` is never populated.** Same fix as above.
- **`tabathaOrg` (clients/projects/tasks) is local-only.** Major gap for multi-device users. Probably the next sync feature worth building. See [.headbox/sticky-notes/v4.0.0-followups.md](v4.0.0-followups.md) item 1.
- **Two-way sync.** Currently push-only. See v4.0.0-followups item 2.

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
3. `Lock "lock:sb-...-auth-token" was released because another request stole it` → Web Locks contention across extension pages (fixed by `noopLock` in [supabaseClient.js:21](../../src/services/supabaseClient.js#L21)).
4. Sign Out / Force reset auth didn't actually clear session → supabase-js stores sessions in `window.localStorage` in extension PAGES, NOT `chrome.storage.local` (fixed by `clearAllAuthStorage` in [useAuth.js:25](../../src/hooks/useAuth.js#L25) which clears both).
5. `column profiles.avatar_url does not exist` → migration 001 didn't include it but code did (fixed by migration 007).
6. Buttons stuck on loading state → supabase-js's local-scope signOut sometimes hangs (fixed by Promise.race + setTimeout backstop).

### The MV3 extension auth model — important to know

- **supabase-js session storage in extension PAGES**: `window.localStorage`.
- **supabase-js session storage in service worker**: `chrome.storage.local` (because no window).
- **Different storage layers.** Clearing one doesn't clear the other.
- **Web Locks**: navigator.locks is shared across same-extension contexts. supabase-js's default `lock` causes contention storms. We disabled it with `noopLock`.
- **JWT propagation**: supabase-js attaches it via fetch headers in the page/SW that has the session loaded. Both contexts each load from their own storage. As long as they're both populated from the same sign-in, they'll send the same JWT.

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
