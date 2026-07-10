# C4 — Observations Ledger

> 🔗 Google Doc: https://docs.google.com/document/d/16PptPBmPAWet8Rqa-KyMQGvUDkDB9zrNkDWmwXCLNqU/edit?usp=drivesdk&ouid=104108780460431833741

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5, §8, §9
Origin: video V2/V4
Phase: Phase 1

## Purpose

The LEDGER layer — one normalized event/observation store fusing every signal Tabatha already collects (window titles, categories, intent, tabs, domains, clock state) with capture references (C3) and, later, vision/audio extractions (C5). This is the equivalent of the source video's "~8,640 lines/day" digital trail — the video framed this as something to *build*; in Tabatha, most of the raw signal already exists (see Reuse points). C4's job is fusion and normalization, not new sensing. It is the single source the THINK layer (C5/C6) reads from.

## Detailed behaviors

1. **Every observation is normalized to one record shape before it is stored.** `normalizeObservation(raw)` (`src/utils/observationLedger.js:36`) takes a raw event with a required `at` (epoch ms) and coerces every optional field (`surface`, `host`, `app`, `title`, `category`, `focusId`, `intentId`, `captureRef`) to a concrete value or `null` — never `undefined` — so downstream storage/serialization/sync is stable. `at` must be a finite number or the function throws `TypeError` (fail loud on malformed input, not silent corruption).
2. **`kind` is derived, not asserted, unless explicitly overridden.** Precedence: `captureRef` present → `'capture'`; else `host` or `app` present → `'context'`; else → `'signal'`. Callers may pass an explicit `kind` to override derivation (used e.g. when a capture-adjacent signal event still needs `kind: 'signal'`).
3. **Host is lowercased, title is trimmed (empty-after-trim → `null`).** Both normalizations exist so `dedupeKey()` comparisons and later text/pattern matching aren't defeated by casing or whitespace noise.
4. **`dedupeKey(rec)`** (`observationLedger.js:81`) produces a stable string — `surface|host-or-app|focusId|intentId` — used to collapse **consecutive** identical contexts into one logical "dwell," so the ledger doesn't record a new row every dwell-tick capture event for an unchanged context. This is a *key generator*, not itself the collapsing logic; the collapsing/coalescing pass over consecutive ledger entries sharing a `dedupeKey` is not yet implemented (see Open questions) — today every `recordObservation()` call appends unconditionally.
5. **Partitioning is derived from live clock state at record time.** `partitionOf(rec, clockState)` (`observationLedger.js:93`) returns `'org'` when `clockState` is `'clocked_in'` or `'on_break'`, else `'personal'`. This mirrors C3's partition boundary exactly (same function) so ledger rows and their capture-ref assets are always partitioned consistently.
6. **The local ledger is a capped, FIFO chrome.storage array.** `recordObservation()` (`src/background/services/captureService.js:45-57`) reads `cortexLedger` from `chrome.storage.local`, normalizes + partitions the incoming raw event, appends, and trims to `settings.storage.cortexLedgerCap` (default **5000**, `constants.js:61`) via `ledger.slice(-cap)` when the cap is exceeded — oldest entries silently drop off the front. This cap is independent of and much larger than the existing `logsCap` (500, `logger.js`) — the ledger is a denser, longer-lived stream than the human-facing debug log.
7. **Fusion sources, today vs planned.** C4's normalized shape already accepts telemetry from any surface via the generic `raw` shape (`surface`, `host`/`app`, `title`, `category`, `focusId`, `intentId`). What's *wired* in Phase 1 is only the capture path (`captureService.captureNow()` calls `recordObservation` with `kind: 'capture'`). Wiring the *other* existing telemetry services — `tabTracking`, `domainHistory`, `clock`, `focusService`, `activityAuditService` — to also call `recordObservation()` on their own state-change events is listed in the program spec reuse map (§3) as the mechanism by which "the 8,640 lines/day already partly exist," but each individual service→ledger wire-up is **not yet implemented**; only the capture surface writes to `cortexLedger` today (see What's already built).
8. **Nightly plain-file export.** A scheduled job (proposed: `chrome.alarms`, once/day) reads the full `cortexLedger` array and writes a flat, harness-readable file (newline-delimited JSON or plain text, one observation per line — deliberately *not* a database format) so C6's cron-in-harness step (Claude Code / Codex scheduled task, per program spec §5 C8) can `cat`/`grep`/pipe it into a master optimization prompt without needing DB access or an API key. This export is the hand-off contract between the extension (where the ledger lives) and the harness (where C6's Phase 1 reasoning runs). **Not yet implemented** — the write mechanism inherits the same MV3-filesystem constraint flagged in C3 Open Question 1 (no direct filesystem write from a service worker); realistic paths are `chrome.downloads` into a fixed export folder, or handing the export to the desktop companion to write to a harness-visible directory (e.g. the user's Claude Code project folder). This is the single most load-bearing unresolved item for Phase 1, since C5/C6 in Phase 1 explicitly run *via* this export (program spec §8 item 5).
9. **Cloud-batch backup is metadata-only, opt-in, and partitioned.** `tabatha.cortex_observations` (migration 022, lines 18-38) is the Supabase mirror of `cortexLedger` rows — `observed_at`, `kind`, `surface`, `app`, `host`, `title`, `category`, `focus_id`, `intent_id`, `capture_ref` (FK to `cortex_capture_refs`), `dedupe_key`, plus `partition`, `profile_id`, `org_id`, `team_id`, `browser_profile_id` for scoping. Per the migration's own header comment, this table is **staged, not yet applied** to the live Supabase project — it's a Phase 1 T4 increment. No raw pixel/audio data is ever stored here, only the same normalized fields already in `chrome.storage.local`.
10. **RLS mirrors the existing profile-scoped pattern.** Both `cortex_observations` and `cortex_capture_refs` use `profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())` for both `USING` and `WITH CHECK` (migration 022, lines 61-69) — identical shape to migration 014's calendar tables, per the migration header comment. No org-admin read policy exists yet (an admin cannot query a team member's `cortex_observations` row directly under current RLS) — flagged in Open questions since org capture-on-clock-in (C12) implies admins need *some* aggregate visibility.
11. **Sync convention (once T4 lands).** Following `syncService.js`'s established pattern (`upsertRows(supabase, table, rows, onConflict, diagnosticKind)`, e.g. `upsertRows(supabase, 'clock_sessions', rows, 'profile_id, client_id', ...)` at line 646), the ledger's push would upsert on a natural key — likely `profile_id, dedupe_key, observed_at` or a client-generated `client_id` per the existing pattern used for other high-volume append-only tables (`clock_sessions`, `desktop_activity`) — rather than relying on the server-generated `id UUID DEFAULT gen_random_uuid()`, so retried/offline syncs don't create duplicate rows. **Not yet implemented**; flagged as a design decision for whoever builds the T4 sync path.
12. **Vision/audio extractions are a future field, not a new table.** Per program spec §5 C4 ("...+ vision/audio extractions in one store"), when C5's vision-on-demand samples a frame, the resulting extraction (e.g. OCR'd text, a short description) is expected to attach to the *same* `cortex_observations` row (likely a new nullable `extraction` JSONB column, or a `kind: 'vision-extract'` row linked via `capture_ref`) rather than a separate table — keeping the "one normalized store" property from the spec's design principle. No column exists yet; this is scoped to land alongside C5 Phase 1 vision-on-demand, not C4 T1-T3.

## Data model touchpoints

| Table / key | Role in C4 |
|---|---|
| `chrome.storage.local.cortexLedger` | The live, capped (5000) array of normalized observation records — the primary store in Phase 1 (local-first). |
| `chrome.storage.local.cortexCaptureState` | `{ lastCaptureAt, lastContextKey }` — capture-timing state, read by C1's `decideCapture()`, not itself a ledger row. |
| `tabatha.cortex_observations` (migration 022) | Cloud-batch backup mirror of `cortexLedger`, metadata-only, personal/org partitioned. **Not yet applied to Supabase.** |
| `tabatha.cortex_capture_refs` (migration 022) | Referenced by `cortex_observations.capture_ref`; owned/written by C3, read by C4 to link a ledger row to its asset. |
| `settings.storage.cortexLedgerCap` (`constants.js:61`, default 5000) | FIFO cap enforced in `recordObservation()`. |
| (proposed, not yet added) `cortex_observations.extraction` JSONB | Vision/audio extraction payload — see behavior 12. |
| (proposed, not yet built) nightly export file | Plain-file (NDJSON) snapshot of `cortexLedger` — see behavior 8. |

## Dependencies (transformer graph)

- **Depends on:**
  - C1 (Adaptive Capture Engine) + C2 (Sensitive-Data Guard) — supply `captureRef`-bearing observations only after guard clearance.
  - C3 (Storage & Retention Fabric) — owns the asset a `captureRef` points at; C4 never writes storage URIs.
  - Existing telemetry services (`tabTracking`, `domainHistory`, `clock`, `focusService`, `activityAuditService`) — the non-capture observation sources, per behavior 7 (not yet wired).
- **Feeds:**
  - C5 (Pattern Engine) — primary consumer; reads the ledger (or its nightly export) to detect repetition.
  - C6 (Optimization Loop) — reads the nightly plain-file export specifically (behavior 8), not the live `chrome.storage` array, since C6 Phase 1 runs outside the extension (cron-in-harness).
  - C10 (Passive Self-Correction) — writes corrections *back into* the ledger (e.g. relabeling a `focusId`/`intentId` after the fact); this is a planned write path distinct from `recordObservation`'s append-only behavior — not yet designed.
  - C14 (Agent Data Map & Governance) — catalogs every field in the normalized record shape as a distinct "signal" in `docs/cortex/DATA-MAP.md`.
  - C11 (Cross-Signal Attention Accounting) — will need additional `kind` values (e.g. call-log, email-reply-latency) fused into the same normalized shape.

## Reuse points (verified)

| Asset | Path | Reuse |
|---|---|---|
| Normalization + dedupe-key + partition helpers, fully unit-tested | `src/utils/observationLedger.js` | Core of C4; 26 tests in `test/observationLedger.test.js` covering null-coercion, kind derivation/override precedence, host lowercasing, title trim, dedupe-key stability/divergence, partition boundary. |
| Ledger append + cap enforcement | `src/background/services/captureService.js:45-57` (`recordObservation`) | The only current writer into `cortexLedger`; capture-path only today. |
| Ledger read/query surface | `captureService.js:77-81` (`listObservations`), `115-123` (`handleMessage` — `LIST_OBSERVATIONS`) | Existing message-router entrypoint for reading the ledger from UI/popup. |
| Migration 022 ledger tables | `supabase/migrations/022_cortex_ledger.sql:18-38` | `cortex_observations` schema matches the normalized record shape field-for-field (`observed_at`↔`ts`, `focus_id`↔`focusId`, etc.). |
| RLS + partition pattern precedent | migration 022 header comment (line 13-15), citing migration 014 (calendar) | Confirms the profile-scoped RLS shape C4 follows is an established convention, not novel. |
| Sync upsert conventions | `src/background/services/syncService.js` (`upsertRows`, `DURABLE_SYNC_KEYS` set at line 22-29) | Model for how `cortexLedger` would join the debounced sync path — note `cortexLedger` is **not** currently in `DURABLE_SYNC_KEYS`, so today a ledger write does not even trigger `triggerSync()`. This must be added when T4 sync lands. |
| Existing high-volume telemetry (candidate C4 sources) | `src/background/services/*` (per program spec §3: tabTracking, domainHistory, clock, focus) | Not yet wired to `recordObservation`; confirmed present as separate services, confirmed *not* yet fused. |
| Companion telemetry (candidate C4 source, cross-surface) | `tabatha-desktop/src-tauri/src/activity_log.rs` — verified tables `app_sessions` (app, title, category, duration, `matched_focus_id`), `clock_sessions`, `clock_breaks` | Structurally very close to what `normalizeObservation` already expects (`appName`→`app`, `title`, `category`) — a companion-side observation could be shaped into the same normalized record with minimal transform. Not yet bridged into `cortexLedger`; today companion data syncs separately via `desktop_activity` (see `syncService.js:659`). |
| Debug log (related but distinct stream) | `src/services/logger.js` (`tabathaLogs`, cap 500, `MAX_LOG_ENTRIES`) | Confirms the FIFO-capped-array-in-chrome.storage pattern C4 reuses is already an established idiom in this codebase (same shape, different key/cap). Kept as a separate, smaller, human-facing stream — not merged into the ledger. |

## What's already built (Phase 1 T1–T3)

- `normalizeObservation`, `dedupeKey`, `partitionOf` — pure, fully unit-tested (26 tests, `test/observationLedger.test.js`).
- `recordObservation` / `getCaptureState` / `listObservations` in `captureService.js` — capped-append + read surface, wired to the capture path only.
- Migration 022 `cortex_observations` + `cortex_capture_refs` tables — schema complete, **not applied** to Supabase yet.
- `LIST_OBSERVATIONS`, `CAPTURE_NOW`, `GET_CAPTURE_STATE`, `SET_CAPTURE_ENABLED` message handlers.

## Open questions

1. **Wiring non-capture telemetry into the ledger.** `tabTracking`/`domainHistory`/`clock`/`focusService`/`activityAuditService` each hold their own state and their own storage keys today — none currently call `recordObservation()`. Deciding *which* of their existing events map to a `recordObservation()` call (and at what granularity — every tab switch? every domain visit? every focus change?) is unscoped work, and risks ledger volume exploding past the 5000-item FIFO cap in hours rather than days if done naively. Needs a sampling/coalescing decision, not just a wiring pass.
2. **Consecutive-dedupe collapsing is not implemented.** `dedupeKey()` exists but nothing currently uses it to *collapse* a run of identical-context ledger entries into one row with a duration — every `recordObservation()` call appends unconditionally. Without this, wiring in behavior 7's telemetry sources at any real frequency will fill the ledger with near-duplicate rows.
3. **Nightly export write path (see behavior 8) inherits C3's MV3-filesystem question.** This is the sharpest Phase 1 risk: C6 Phase 1 is scoped (program spec §8 item 5) to run *via* this export, so if the export mechanism isn't resolved, C6 has no data source in Phase 1 as currently scoped.
4. **`cortexLedger` is not in `syncService.js`'s `DURABLE_SYNC_KEYS`.** Even once migration 022 is applied, writes to `cortexLedger` won't trigger the debounced sync today — needs an explicit addition + an `upsertRows` call for `cortex_observations`, following the pattern other high-volume tables (`clock_sessions`, `desktop_activity`) already use.
5. **Org-admin read access to `cortex_observations`.** Current RLS only allows a row's own profile to read/write it — no policy grants an org admin visibility into a clocked-in team member's ledger rows, which C12 (team/SOP mode, org mandate) will need. Needs an explicit admin-role RLS policy, deliberately not added in migration 022 to avoid scope creep before the org-policy model exists.
6. **Vision/audio extraction storage shape (behavior 12) is undecided** — new column on `cortex_observations` vs. a separate table vs. reusing `cortex_capture_refs`. Deferred to land alongside C5.

## Phase & rollout

- **Phase 1 (target v7.0.0):** migration 022 applied; `cortexLedger` FIFO store (done); capture-path writer (done); nightly plain-file export (blocked on MV3-filesystem decision, shared with C3); at minimum one additional telemetry source (e.g. `focusService`) wired in as proof of the fusion model.
- **Phase 2:** full telemetry fusion (all sources from behavior 7); consecutive-dedupe collapsing; cloud-batch sync wired into `syncService.js`.
- **Phase 3+:** vision/audio extraction column; org-admin RLS read policy (ties to C12 mandate enforcement).
