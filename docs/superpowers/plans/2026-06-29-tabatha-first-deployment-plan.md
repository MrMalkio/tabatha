# Tabatha v6.4.0 First Team Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** Ship Tabatha v6.4.0 to Reggie & Po today — unpacked extension + desktop companion — with working org-attributed sync, data-safe remote updates, and a dummy-proof install.

**Architecture:** Chrome extension (React/Vite, MV3) syncs to Supabase (`mtdgoahskcibjbhfvofx`, schema `tabatha`). A Tauri 2 desktop companion (Rust + React) tracks desktop activity, bridges to the extension over `ws://localhost:9147`, creates/owns the unpacked-extension folder, and pulls code-only updates from Supabase Storage.

**Spec:** `DEPLOYMENT.md` (repo root) is the source of decisions. This plan implements its Phase 1–3 checklist.

## Global Constraints (apply to every task)
- **Version:** v6.4.0 is the line. GitHub `MrMalkio/tabatha` is source of truth; `staging` = dev, `main` = production. Feature → PR → `staging`; promote `staging` → `main` for releases.
- **No Co-Authored-By** footers in commits/PRs (owner rule).
- **Tests:** `node:test` + `node:assert/strict`, files in `test/*.test.js`, chrome mock at `testutils/chromeMock.js` (repo root). Run `npm test` (= `node --test`). Build a reusable `testutils/supabaseFake.js` (records upsert/insert/update payloads, returns scripted selects) — shared by sync-attribution + rehydrate tests.
- **Edit in the MAIN checkout** `C:\Users\mrmal\le dev\Tabatha` (the worktree is sparse). Build agents use fresh worktrees off `origin/staging`.
- **Canonical install path:** `%APPDATA%\Tabatha Desktop\extension\` via one Rust `extension_dir()` helper. Do NOT change the Tauri identifier (`com.flux.tabatha-desktop`) — that would move/orphan the existing SQLite DB. Extension code and DB live in separate trees → an update swap can never touch data.
- **Build order:** build the extension `dist/` from 6.4.0 FIRST, then the companion bundles it.
- **Secrets never ship in the extension** (it loads unpacked, world-readable). Asana PAT lives only in a Supabase Edge Function.
- **Manifest `key` (Task A2) is a hard prerequisite** for C/D reload-safety, OAuth redirect stability, and edge-function CORS. Land it first.

## Cross-plan reconciliations (resolved)
- Migrations: `018_redeem_sets_profile_defaults.sql` (A) and `019_owner_read_views.sql` (D). `CREATE OR REPLACE` for idempotency (matches migration 012).
- Owner reads team data via **service role / Supabase dashboard** (RLS is own-rows-only; not changing RLS today). Views granted to `service_role` only.
- Live Supabase migration verification is a **runtime step** done with the project's own credentials (the Claude-session MCP is scoped to a different org and cannot reach this project).

## Workstream → agent map
- **A. Sync + durability** → Claude Code #1
- **B. New features (time-edit + feedback)** → Claude Code #2
- **C. Companion install** → Argus (Antigravity)
- **D. Remote update + owner views** → Argus (Antigravity), after C
- **Vetting + code review** → Koda (Codex)

---

# Workstream A — Sync attribution + data durability + sync indicator

### A1. Org attribution fix (THE sync bug)
**Root cause:** `redeem_invite_token` (migration 003) inserts membership rows but never sets `tabatha.profiles.default_org_id` / `default_team_id`. Nothing else writes them → synced rows get `org_id=NULL` → not attributed to the org. `syncToSupabase()` (`src/background/services/syncService.js:660`, scope at `:118`, `:682-683`) already stamps org/team correctly *when the defaults are populated*.

**Fix (two layers):**
- **Server (authoritative):** `supabase/migrations/018_redeem_sets_profile_defaults.sql` — `CREATE OR REPLACE` `redeem_invite_token` adding, after membership inserts:
  ```sql
  UPDATE tabatha.profiles
     SET default_org_id  = COALESCE(default_org_id, v_invite.org_id),
         default_team_id = COALESCE(default_team_id, v_invite.team_id)
   WHERE id = v_profile_id;
  ```
- **Client (defense-in-depth):** extract `src/services/orgAttribution.js#applyInviteDefaults({supabase,profile,result})`; call from `handleRedeemToken` (`src/settings/index.jsx:654`) after a successful redeem when `profile.default_org_id` is falsy; then `refreshProfile()`.

**Tests** (`test/syncAttribution.test.js`, needs `testutils/supabaseFake.js`):
- [ ] Defaults set → captured `clock_sessions` upsert has `org_id/team_id`.
- [ ] `applyInviteDefaults` fires `profiles.update({default_org_id})` when null.
- [ ] `intent_history` inline insert (`syncService.js:725`) carries org/team.

**Runtime verification (against live `mtdgoahskcibjbhfvofx`, project creds/dashboard):** confirm 005/010/012/015/016/017 applied; after a test member redeems, `profiles.default_org_id` non-null and `clock_sessions` rows for that profile have `org_id IS NOT NULL`.

### A2. Pin stable extension `key` (PREREQUISITE)
`public/manifest.json` has no `key` → unstable unpacked ID. Generate RSA key, derive base64 SPKI, add top-level `"key": "<base64>"` after `"version"`. Consequence: `chrome.identity.getRedirectURL()` becomes one stable `https://<id>.chromiumapp.org/` — **add it to the Supabase Auth redirect allowlist** (runtime config).
- [ ] `test/manifestKey.test.js`: assert `manifest.key` is a string >100 chars, MV3.
- [ ] Add key; load on two machines → identical ID; reload → `chrome.storage` survives.

### A3. Cloud rehydrate-on-sign-in
**Gap:** `bootstrapPull.js` pulls only the org registry; `clock_sessions`/`desktop_activity`/`intent_history`/`focus_items` are push-only → a fresh/new-ID install shows empty until new local activity. Violates DEPLOYMENT.md §6.
**Fix:** new `src/background/services/dataRehydrate.js` (`rehydrateUserData({supabase,scope})`, gated by `_dataRehydratedAt` keyed by `{profileId}`), mirroring `bootstrapPull.js`. Reconstruct `clockHistory`, `intentHistory`, `focus` items from server rows (newest-wins merge); set watermarks (`lastClockSync` etc.) to newest pulled to avoid re-push churn. Wire into `syncToSupabase` right after the org bootstrap (`syncService.js:~701`). Clear watermark on sign-out (`useAuth.js`). Desktop_activity rehydrate optional for day one.
- [ ] `test/dataRehydrate.test.js`: pull reconstructs `clockHistory` + sets `lastClockSync`; merge no-dupes; idempotent; intent rebuild sets `lastIntentSync` so next push finds 0 new.

### A4. "Last synced remotely" indicator
Already fully in Settings (`settings/index.jsx:524,685-760,1048-1050`). Gap = sidebar. Extract `src/hooks/useSyncStatus.js` (fresh/stale/error/never logic from `_lastSyncSuccess` + `_syncDiagnostics`), refactor settings to use it (no behavior change), add a compact sync chip to the sidebar header (`src/sidebar/index.jsx`).
- [ ] `test/syncStatus.test.js`: signed_out / fresh / stale / never / error branches.

**A sequencing:** A2 → A1 → A3 → A4.

---

# Workstream B — New extension features

### B1. Intent start-time editing (backdating)
**Gap:** Plan-037 handlers (`focusService.js:853-950`: `ADJUST_FOCUS_TIME`, `SET_FOCUS_ELAPSED`, `REMOVE_LAST_PAUSE`) all clamp against `startedAt` but none can MOVE it — so you can't represent "I was working before I created this focus." `CheckpointTimeline.jsx` edit UI + audit + `test/focusTimeEdit.test.js` already exist.
**Net-new:**
- `src/utils/focusTimeValidation.js#validateStartTime({proposedStartMs,currentStartMs,now,clockInMs,otherIntervals})` → clamps to `>= clockInMs`, `<= now`, rejects/clamps overlap with other focuses' active intervals (anti-double-count, DEPLOYMENT.md §8). Pure, unit-testable. (`stintReconciliation.js` is clock-install reconciliation, not focus overlap — only its `clampMs` spirit reused.)
- `SET_FOCUS_START_TIME {focusId,startedAt,reason}` handler in `focusService.js` (near `:160`): validate, set `item.startedAt`, credit `addedMs = max(0, oldStart-newStart)` into `elapsedMs` bounded by `wallClockMax` (reuse `:878-880`), `autoCheckpoint`, broadcast `FOCUS_ENGINE_UPDATED`. Add to `AUDITABLE_ACTIONS` (`:199-205`). Bound never-started (`startedAt=null`, `wallClockMax=MAX_SAFE_INTEGER`) by `now-newStart`.
- UI: `datetime-local` (`max=now`) field + "backdated +Xm" preview in the inline edit panels — `src/sidebar/index.jsx:430-464` (`openEdit`/`saveEdit` `:192-211`) and `src/home/index.jsx:104-132,231-251`.
**Tests:** `test/focusTimeValidation.test.js` (clamp/reject/gap/no-session) + extend `test/focusTimeEdit.test.js` (backdates & credits; clamps to clock-in; rejects future; unknown focus; elapsed never exceeds wall-clock).

### B2. In-app feedback → Asana (edge-function brokered)
**Architecture:** Extension form → `SUBMIT_FEEDBACK` → `src/background/services/feedbackService.js` (reuse `webhooks.js:38-74` fetch shape, `AbortSignal.timeout`, anon key as Bearer) → `supabase/functions/feedback-to-asana/index.ts` (holds `ASANA_PAT` + `ASANA_PROJECT_GID` as secrets) → `POST app.asana.com/api/1.0/tasks`. Register `feedbackService` in `background.js:168` services array.
**UI:** compact form in `src/popup/index.jsx` (type select bug/idea + textarea + submit) and optional Settings card (reuse Asana card pattern `settings/index.jsx:1784-1819`).
**Payload contract:** `{kind, text, version, context:{surface,localId,machineId,url}, submittedAt}`.
**Tests** (`test/feedbackService.test.js`, mock `fetch`): well-formed POST to `/functions/v1/feedback-to-asana`; error on non-OK; rejects empty; includes version + identity context.
**Deploy:** `supabase secrets set ASANA_PAT=… ASANA_PROJECT_GID=…`; deploy via `deploy_edge_function`. Pull the project GID + agent PAT via `anasa-context`/`asana-plugin` skills — do NOT hardcode.
**Scheduled review task:** NOTED, not built today — a scheduled agent lists open feedback tasks, drafts fix plans into `docs/plans/`, comments back. Agent-side only; no extension code.

**B sequencing:** B1 (validator → handler → UI) and B2 (handler+register → UI; edge fn in parallel) are disjoint and parallelizable.

---

# Workstream C — Companion install folder + dummy-proof guided install

### C1. Bundle extension + create install folder
- `bundle:ext` npm script copies `../../Tabatha/dist` → `src-tauri/resources/extension/`; `tauri.conf.json` `beforeBuildCommand` = `"npm run build && npm run bundle:ext"`; add `bundle.resources` `{"resources/extension/*":"extension/"}`; gitignore `resources/`.
- New `src-tauri/src/installer.rs` (`pub mod` in `lib.rs`): `extension_dir()` (canonical path), `deploy_extension(app)` → resolve bundled resource (`BaseDirectory::Resource`), version sentinel `.tabatha_version` (skip if equal → idempotent), **atomic replace** (copy → `extension.tmp-<uuid>`; rename existing → `.old-<uuid>`; rename tmp → `extension`; delete old; rollback on failure). Code-only; never touches `app_data_dir` SQLite.
- Commands in `main.rs` `invoke_handler!` (`:629-638`): `get_extension_dir`, `deploy_extension`, `open_extension_folder`, `get_extension_state`. Call `deploy_extension` once in `setup()` (after DB init `:207`); failure logs, doesn't crash.
- **Tests:** `installer.rs` `#[cfg(test)]` + `tempfile` dev-dep — deploy creates manifest + sentinel; idempotent when version matches; atomic-replace preserves on mid-swap failure. Factor copy/swap to take `src`/`dst` Paths (no Tauri runtime in tests).

### C2. Detection states (never-installed vs broken vs connected)
- `ws_server.rs`: add `ever_connected: Arc<AtomicBool>` + `last_disconnect_at`; set on connect (`:186-190`), record on disconnect (`:239-243`); persist `ever_connected` to a marker file in app-data (survives restart). `extension_state()` → `connected` (clients>0) / `disconnected` (ever_connected & 0) / `never_installed`. Expose via `get_extension_state`.
- **Tests:** never_installed initially; connected with clients; disconnected after ever_connected (manual `wscat` integration).

### C3. Guided install UI (React)
- Add clipboard: `tauri-plugin-clipboard-manager` (Cargo + JS dep + register in `main.rs:197-198` + capability `clipboard-manager:allow-write-text`).
- New `src/components/InstallGuide.jsx` — 3 branches: `installed` (green ✓, collapse), `disconnected` (distinct amber "extension stopped responding"), `never_installed` (full flow: [Copy path] via `writeText(get_extension_dir())`, [Open chrome://extensions] with copy-the-URL fallback since Chrome blocks programmatic nav, numbered steps, "waiting…" spinner auto-advancing on state flip). Wire into `App.jsx` (reuse 1s poll `:46-49`).
- **Known limitation:** `chrome://extensions` can't be reliably opened programmatically → mitigate with copy-URL + clear steps (anticipated in DEPLOYMENT.md §5).

---

# Workstream D — Remote update + owner read views (after C)

### D1. Companion update (code only) — `src-tauri/src/updater.rs`
- Crates: `reqwest` (rustls-tls), `zip` (deflate), `semver`, `sha2`; `tempfile` dev-dep.
- Path helpers reuse C's `extension_dir()`; staging/backup/tmp siblings under app-data; **assert none equals/contains the SQLite path**.
- `fetch_latest()` → `latest.json` on Supabase Storage public bucket `extension-updates` (`{version,url,sha256,min_companion}`). Compare `semver` to the installed version read from `extension_dir/manifest.json` (NOT companion's own version). Stream zip → verify SHA-256 → extract to fresh staging → validate (`manifest.json`+`assets/background.js`) → atomic rename swap with rollback → delete backup/tmp.
- Trigger: `check_for_update` command + tray item + optional periodic `tokio` interval. On success → broadcast `UPDATE_READY`.
- **Tests** (`tempfile`): swap leaves DB byte-identical; rollback on mid-swap failure; semver table; SHA mismatch refused.

### D2. Auto-reload (`UPDATE_READY` → `chrome.runtime.reload()`)
- Companion: add `UpdateReady{version,notes}` to `OutboundMessage` (`ws_server.rs:23`); broadcast after swap (ordering: swap THEN broadcast).
- Extension: `companionService.js` `_handleMessage` (`:169`) add `UPDATE_READY` → `_handleUpdateReady`: compare `msg.version` to `chrome.runtime.getManifest().version`; if newer, write `_pendingUpdate` breadcrumb, defer ~1.5s (flush writes), `chrome.runtime.reload()`; if equal, ignore (loop guard). Post-reload bootstrap logs from→to, clears breadcrumb, fires a sync.
- **Tests:** serde round-trip for `UpdateReady`; `_handleUpdateReady` reloads only when newer, writes breadcrumb, ignores equal.

### D3. Owner read views — `supabase/migrations/019_owner_read_views.sql`
- `tabatha.v_owner_clock_daily` (clock time per profile/day, joined to profiles), `v_owner_desktop_daily` (per profile/day/category), `v_owner_intent_recent` (last 14 days). `GRANT SELECT … TO service_role` only (NOT authenticated). Comment: "owner reads via service role / table editor; not client-exposed." Optional `v_owner_capacity_daily` (clock+desktop) deferred.
- **Verify:** apply via service role; rows aggregate for the PS×2 + OD×1 test bed (§8); authenticated user gains no cross-member visibility.

### D4. Three-store integrity
- Stores: companion SQLite (`<app_data>\tabatha_activity.db`), extension `chrome.storage.local` (durable `_browserProfile.localId`), Supabase (keyed by `profile_id` + dedup `UNIQUE(profile_id,client_id/activity_id)`).
- Update never touches stores 1&2 (path-guard test). chrome.storage survival depends on pinned `key` (A2). Post-update probe: confirm `localId` + companion clock persist, fire one sync, advance `_lastSyncSuccess`; warn if `localId` missing (= ID changed, key not pinned).

---

## Global sequencing
1. **A2 (manifest key)** — unblocks stable-ID testing for everything.
2. **A1 (attribution + migration 018)** + live runtime verification — the core correctness fix.
3. **Build extension `dist/` from 6.4.0.**
4. **C (companion install)** — bundles the dist, creates folder, detection states, guided UI.
5. **A3 (rehydrate), A4 (indicator), B1, B2** — parallelizable.
6. **D (update + migration 019 + owner views)** — after C; needs A2's pinned key.
7. **End-to-end on the live test bed** (PS×2 + OD×1), then build companion `.msi`.

## Open runtime/config items (owner or build agent)
- Apply migrations 005/010/012/015/016/017 to live `mtdgoahskcibjbhfvofx` if missing; apply 018 + 019.
- Add the pinned-ID OAuth redirect URL to Supabase Auth allowlist.
- Create Supabase Storage bucket `extension-updates` + upload `latest.json` + the update zip.
- `supabase secrets set ASANA_PAT / ASANA_PROJECT_GID`; deploy `feedback-to-asana`.
- PS `gh` device-login (owner, on PS) for PS push/pull parity.
