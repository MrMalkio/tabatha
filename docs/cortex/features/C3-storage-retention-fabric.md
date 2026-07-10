# C3 — Storage & Retention Fabric

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5, §6, §8, §9
Origin: user (Dump 1, Dump 3)
Phase: Phase 1 (v1 slice below); Phase 2+ items called out inline

## Purpose

The STORE layer. C3 owns *where* raw frames/audio live, how they get archived off-machine, how personal and organizational captures stay physically separated, and how retention is enforced — by age **and** by free disk space, on two independently-configured plans (personal vs org). C3 never decides *whether* to capture (C1) or *what* to redact (C2); it only decides where a guard-cleared asset is written, when it moves to external archive, and when it is deleted. C4 stores a *reference* to whatever C3 writes — never the pixel/audio blob itself.

## Detailed behaviors

1. **Local-first default.** All raw frames/audio are written on-machine first, always. There is no direct-to-cloud / direct-to-external-drive capture path — external archival is a *move*, never a *replacement* write target.
2. **Configurable storage path.** `settings.captureStoragePath` (default `Tabatha/Cortex/captures`, see `src/background/constants.js:54`) names the logical root. Personal and org partitions are separate subtrees under it (e.g. `.../personal/`, `.../org/`) so a directory-level copy/delete can never cross the partition boundary by accident.
3. **Personal ⇄ org partition is absolute.** A capture's partition is decided once, at write time, by `partitionOf()` (see C4) from the live clock state. Personal-partition assets are **never** included in org sync, org archive targets, or org retention sweeps — regardless of later clock-state changes. Re-partitioning an existing asset is out of scope; if clock state was wrong at capture time, C10 (self-correction) may relabel the *ledger reference*, but the asset itself does not move partitions retroactively without an explicit user action.
4. **Org-clocked-in scope.** While clocked in (`clocked_in` or `on_break`), *everything* capturable is org-partition by definition (mirrors `partitionOf()` in `src/utils/observationLedger.js:93`) — this is a policy statement, not just a storage rule, and it is enforced at the C1/C2 boundary before C3 ever sees the frame.
5. **External archival targets, in priority order:** (a) Google Drive (if the Drive desktop client's local sync folder is detectable, or via a future Drive API integration), (b) OneDrive (same detection strategy), (c) a configured external HDD path (e.g. a drive letter/mount that must be present). First configured + currently-reachable target wins per archive pass.
6. **Graceful fallback.** If no external target is configured, or the configured target is unreachable (drive unplugged, cloud folder not syncing, path missing) at archive time, the asset simply stays at the local path — never blocks, never drops data, never errors loudly to the user. Fallback state is logged (via `src/services/logger.js`) so Settings can surface "external archive unavailable, staying local" without polling filesystem state on every render.
7. **Archive is async and idempotent.** Archival is a background sweep (not synchronous with capture) that copies local-path assets to the external target and records the resulting `storage_uri` against the existing `cortex_capture_refs` row (see Data model below) — it updates the reference, it does not create a new one. Re-running the sweep on an already-archived asset is a no-op.
8. **Dual retention plans, evaluated independently per partition.** Personal retention is fully user-controlled (defaults: `captureRetention.personal.maxAgeDays = 30`, see `constants.js:57`). Org retention is admin-controlled (default `maxAgeDays = 90`, `constants.js:58`) and, per the braindump, must also account for free disk space — not just age. `planRetention()` (`src/utils/retentionPolicy.js`) already implements this as three ordered, pure rules: (1) per-partition age prune, (2) per-partition `maxBytes` cap oldest-first, (3) a **global** `minFreeBytes` floor that deletes oldest-first *across partitions* only after 1+2 have run. Org admin values for `maxBytes`/`minFreeBytes` are not yet wired into settings — Phase 1 ships the pure planner + personal-only knobs; org-admin-set space budgets are a Phase 1 follow-up once org settings UI exists (see Open questions).
9. **Retention sweep is destructive only against C3-owned assets.** The planner (`planRetention`) operates on an *inventory* (`{id, ts, bytes, partition}`) built by enumerating whatever storage backend C3 is actually using (see Open questions — no filesystem enumeration exists yet in-extension). Deleting an item means: delete the local file/blob, and if a `cortex_capture_refs` row references it, mark that row's `storage_uri` cleared (tombstone) rather than deleting the row — so `cortex_observations.capture_ref` never dangles against a gone-but-not-nulled reference during a running session.
10. **Space-based retention needs a free-space signal C3 doesn't have today.** In-extension, `chrome.storage.local` reports its own usage but not host disk free space; the desktop companion *can* read real disk free space (Rust `std::fs`/`sysinfo` — not yet wired). Phase 1: `ctx.freeBytes` is a stubbed/companion-reported value when the companion is connected, else retention runs age-only (rule 1) and skips rules 2/3. This is called out explicitly as an Open question, not silently degraded.
11. **No raw pixel/audio ever syncs to Supabase.** Only capture *metadata* (path/URI, redaction state, suppressed flag, byte size, timestamps) syncs, mirroring the comment in `022_cortex_ledger.sql:6-9`. Cloud batch backup (program spec §5/Decisions log) applies to the *metadata* rows, not raw assets — raw-asset cloud backup (e.g. into Supabase Storage or an org-provisioned bucket) is explicitly out of Phase 1 scope.
12. **Retention runs on a schedule, not on every write.** A periodic sweep (proposed: `chrome.alarms`, e.g. every few hours, mirroring the existing data-retention alarm pattern from the 2026-05-11 session — see Session Log) calls `planRetention()` with the current inventory + the effective policy (`settings.captureRetention` merged with org overrides when present) and executes the resulting `toDelete` list.

## Data model touchpoints

| Table / key | Role in C3 |
|---|---|
| `tabatha.cortex_capture_refs` (migration 022) | One row per archived/local asset: `partition`, `storage_uri`, `screen_index`, `redacted`, `redactions`, `suppressed`, `bytes`, `captured_at`. C3 is the sole writer of `storage_uri` and the sole actor that deletes/tombstones a row's asset. |
| `tabatha.cortex_observations.capture_ref` | FK from a ledger entry (C4) to a `cortex_capture_refs` row. C3 never writes this column — C4 does, at observation-record time. |
| `settings.captureStoragePath` (`constants.js:54`) | Local root path (aspirational — see Open questions). |
| `settings.captureRetention.{personal,org}.maxAgeDays` (`constants.js:56-59`) | Time-based retention input to `planRetention()`. |
| `settings.storage.cortexLedgerCap` (`constants.js:61`) | Not a C3 knob directly (that's C4's ledger cap) but shares the same `settings.storage` block or future retention config would live alongside it. |
| (new, not yet in constants.js) `settings.captureArchiveTarget` | Proposed: `{ type: 'drive'|'onedrive'|'hdd'|'none', path }` — external archive configuration. Not yet implemented; flagged in Open questions. |
| (new, proposed) `settings.orgCaptureRetention` | Org-admin-set `{maxAgeDays, maxBytes, minFreeBytes}` distinct from the personal defaults already in `constants.js`. Not yet implemented. |

## Dependencies (transformer graph)

- **Depends on:**
  - C1 (Adaptive Capture Engine) — supplies the frames/recordings C3 stores.
  - C2 (Sensitive-Data Guard) — only guard-cleared (redacted/non-suppressed) frames reach C3; C3 trusts `guard.redactions` was already applied to pixels before it ever sees them.
  - C4's `partitionOf()` (`src/utils/observationLedger.js`) — the partition decision C3 stores under.
- **Feeds:**
  - C4 (Observations Ledger) — every asset C3 writes gets a `cortex_capture_refs` row that a `cortex_observations` row points at.
  - C5 (Pattern Engine) — vision-on-demand reads frames via the `storage_uri` C3 maintains (local or archived).
  - C14 (Agent Data Map & Governance) — documents storage locations, partition, and retention per signal; C3 is the authoritative source for the "Storage (local/cloud)" and "Retention" columns in `docs/cortex/DATA-MAP.md`.
  - C11 (Cross-Signal Attention Accounting) — org retention policy intersects with org mandate enforcement (C12).

## Reuse points (verified)

| Asset | Path | Reuse |
|---|---|---|
| Pure retention planner (age + space-cap + min-free-disk, 3 ordered rules) | `src/utils/retentionPolicy.js` | Already implements the *entire* dual-plan, time+space policy described in the braindump. Shipped, 26 unit tests passing (`test/retentionPolicy.test.js`). |
| Retention unit tests | `test/retentionPolicy.test.js` | Covers age prune, space cap, partition independence, global min-free-disk, purity (no input mutation). |
| Partition decision | `src/utils/observationLedger.js:93` (`partitionOf`) | C3's partition boundary is derived from the same clock-state logic C4 uses — single source of truth. |
| Capture storage settings | `src/background/constants.js:49-59` | `captureStoragePath`, `captureRetention.{personal,org}.maxAgeDays` already defined and defaulted. |
| Migration 022 capture-ref table | `supabase/migrations/022_cortex_ledger.sql:40-56` | `cortex_capture_refs` — partition, storage_uri, redacted, suppressed, bytes columns already modeled; RLS mirrors profile-scoped pattern from migration 014. |
| Sync upsert/watermark convention | `src/background/services/syncService.js` (`upsertRows`, e.g. line 220) | Pattern C3's future metadata-sync path should follow: `.upsert(rows, { onConflict: 'profile_id, <natural_key>' })`. |
| Companion SQLite (candidate future free-space source) | `tabatha-desktop/src-tauri/src/activity_log.rs` (verified: `app_sessions`, `clock_sessions`, `clock_breaks` tables, `init_database`) | Companion already owns a local SQLite DB and could report host disk free space or even become the archive-write executor (see C8 companion-reads-harness-folders precedent in program spec §5 C8). |
| Capture service shell (T4 TODO markers) | `src/background/services/captureService.js:103-104` | Explicit `TODO(T4)` for `chrome.tabs.captureVisibleTab → apply guard.redactions → write to settings.captureStoragePath (personal/org partition) → set captureRef` — this TODO *is* C3's Phase 1 write path, not yet implemented. |

## What's already built (Phase 1 T1–T3)

- `planRetention()` — the full policy engine (age, space-cap, global min-free-disk), pure and unit-tested. **This is the single largest piece of C3 already done.**
- `partitionOf()` — shared partition boundary with C4.
- Migration 022 `cortex_capture_refs` table (schema only — **not yet applied** to Supabase per the migration's own header comment, "NOT YET APPLIED — staged for the Phase 1 cloud-batch increment (T4)").
- Settings scaffolding: `captureStoragePath`, `captureRetention.{personal,org}`.
- `captureService.js` has the T4 TODO stub identifying exactly where the local write belongs, but the write itself, the archive sweep, and the retention-alarm wiring are **not implemented**.

## Open questions

1. **MV3 filesystem write reality check.** Chrome extensions (MV3, service worker) **cannot write to arbitrary filesystem paths**. `settings.captureStoragePath = 'Tabatha/Cortex/captures'` reads as a real OS path but there is no API for a service worker to write there directly. Realistic v1 options, none yet chosen:
   - (a) `chrome.downloads.download()` into a fixed Downloads subfolder — simplest, but pollutes/relies on the Downloads folder and can't easily enumerate/delete programmatically (no delete API without user-visible download-manager interaction).
   - (b) OPFS (Origin Private File System) or IndexedDB blob store inside the extension's own storage — fully scriptable (write/enumerate/delete), stays inside `chrome.storage` quota-adjacent limits, but is *not* a real user-visible filesystem path, so "configurable path" and "external archive" become meaningless until something exports out of OPFS.
   - (c) Hand captured frames to the **desktop companion** over the existing WS bridge (`ws_server.rs`, port 9147) and let the companion (which has real filesystem access via Rust) do the actual path write + archive copy + retention delete.
   - **`captureStoragePath` as a literal, user-facing configurable path is therefore aspirational until the companion write path (option c) lands.** Phase 1 should default to (b) OPFS/IndexedDB as the *only-when-companion-absent* fallback, and treat (c) as the primary path whenever `companionBridge` reports connected. This needs an explicit decision before T4 implementation — flagging rather than deciding here per task scope.
2. **Free disk space signal.** No current in-extension API surfaces host free space. Needs companion-reported free bytes (`sysinfo` crate or similar) piped over the WS bridge, or the space-based rules (2/3 in `planRetention`) simply don't run for browser-only installs (companion-less users get age-only retention).
3. **Org-admin retention config surface.** `captureRetention.org` currently reads from the *same* local `settings` object as personal — there's no org-policy-override plumbing yet (no admin UI, no org-scoped settings sync distinct from personal `constants.js` defaults). Needs a `tabatha.org_policies` (or similar) table + a settings-merge step before an admin's `maxBytes`/`minFreeBytes` can actually govern a team member's local sweep.
4. **External archive detection mechanism.** "When available" (Drive/OneDrive/HDD) implies auto-detection of a synced folder or mounted drive. No implementation or library choice made yet; likely a companion concern (native filesystem access) rather than extension-side.
5. **Re-partitioning after a clock-state correction (C10).** If self-correction later determines a capture was mis-partitioned (e.g. the clock was stuck "in" when the user was actually on personal time), does the *asset* physically move, or does only the ledger reference get corrected while the org retains the (now personal-but-still-org-stored) asset? Braindump doesn't address this edge case; flagged for a privacy-spine decision, not resolved here.

## Phase & rollout

- **Phase 1 (target v7.0.0):** ship `planRetention()` (done) wired to a real retention alarm; local write path per Open Question 1 (OPFS/IndexedDB fallback, companion-write when connected); `cortex_capture_refs` migration applied; no external archive yet (stub interface only, per program spec §8 item 3 "external-archive interface stub").
- **Phase 2:** external archive detection + sweep (Drive/OneDrive/HDD); org-admin retention config surface; companion-reported free-space signal.
- **Phase 3+:** raw-asset cloud backup (if ever), mobile storage parity (C13).
