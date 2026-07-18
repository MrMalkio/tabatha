# Epic 8 v1 — Deploy Notes (push_log + clock-in nudge)

**Author:** Koda · **For:** CeeCee (integration owner)
**Branch:** `claude/epic8-nudges` off `claude/tabby-sidecar-mobile-46c612`
**Design:** `docs/superpowers/specs/2026-07-18-epic8-dedup-nudges-design.md` (Dex, + Koda's vet)
**Asana task:** [1216679252267610](https://app.asana.com/1/9526911872029/project/1214031898449333/task/1216679252267610)

This branch is write-only — nothing here has been applied or deployed.
Everything below is what CeeCee needs to do to bring it live.

---

## 1. What shipped

1. **`supabase/functions/send-focus-push/index.ts`** — batched the
   per-focus `focus_checkpoints` staleness lookup (was N+1, now one
   `IN (...)` query) and switched to the new shared webpush helper
   (`../_shared/webpush.ts`) instead of its own inline send/cleanup loop.
   Behavior is unchanged — this is a standalone efficiency commit, safe
   to deploy independently of the rest.
2. **`supabase/functions/_shared/webpush.ts`** (new) — shared
   send-and-cleanup, quiet-hours, and profile-local-clock helpers, used
   by both push functions.
3. **`supabase/migrations/036_push_log_nudge_dedup.sql`** — new
   `tabatha.push_log` table (day-scoped dedup, coexists with `push_dedup`
   v1; nothing else touched).
4. **`supabase/migrations/037_sidecar_schedule_nudge_cron.sql`** — new
   5-minute pg_cron job `sidecar-schedule-nudges`, mirrors migration
   031's Vault-secret shape exactly (same `sidecar_cron_key` secret, no
   new secret needed).
5. **`supabase/functions/send-schedule-nudges/index.ts`** (new) — v1
   clock-in check only. Scans `profiles`, evaluates
   `settings.sidecar.workDays` + `settings.sidecar.nudges.clockInCheck`
   per profile, checks `browser_profile_status.clock_state`, dedups via
   `push_log`.
6. **`sidecar/src/screens/SettingsScreen.tsx`** — new "Work schedule &
   nudges" card: clock-in nudge toggle, quiet hours, 7-day
   enable+start+end schedule. Writes `settings.sidecar.workDays` and
   `settings.sidecar.nudges` via the existing `saveSidecarSettings` path
   (no `AuthContext.tsx` changes). Sidecar bumped to **v0.5.0**
   (`sidecar/app.json` + `sidecar/src/lib/device.ts`).

## 2. Deviations from the design doc as drafted

- **Migration numbers:** design doc drafted `034`/`035`; this ships as
  **`036`/`037`** — 034 (`focus_events`) and 035 landed from unrelated
  work before this branch was cut. Binding revision from Koda's vet.
- **`calendar_events` scope_key:** confirmed against migration 014 —
  the client-generated dedup key is the `event_id` column
  (`UNIQUE(profile_id, event_id)`), not `id` (that's the internal UUID
  PK). Doesn't affect v1 code (v1 doesn't touch `calendar_events` at
  all — that's `blockStart`, v2), but is recorded here so whoever picks
  up v2 doesn't have to re-derive it.
- **Shared webpush module:** design doc §4.3 recommended extracting a
  shared delivery helper "rather than duplicating the try/catch/410-
  cleanup logic a third time." Implemented as
  `supabase/functions/_shared/webpush.ts`, and — beyond the letter of
  the ask — `send-focus-push` was also switched to use it (it previously
  had two internal copies of the same loop, `deliver()` and
  `deliverAwayAlert()`). Net effect: one copy of the send/cleanup logic
  instead of three.
- **Day/weekday resolution for `profileLocalClock`:** the design doc
  doesn't specify how `dayResetHour` should affect which *weekday* a
  pre-reset-hour timestamp counts as (only that the *calendar day*
  rolls back). Implemented so both roll back together — a 1am Tuesday
  check with `dayResetHour=4` is treated as Monday for both the
  `workDays.mon` lookup and the `push_log.day` value — so they can't
  disagree with each other. Not a spec deviation, just a gap the doc
  left open.

## 3. Deploy order

1. **Apply `036_push_log_nudge_dedup.sql`.** Additive-only, no
   dependencies.
2. **Apply `037_sidecar_schedule_nudge_cron.sql`.** Depends on the
   `sidecar_cron_key` Vault secret already existing from migration 031
   — if that secret is already in place (it should be, `send-focus-push`
   has been live since Plan 040), nothing new to provision.
3. **Deploy `send-focus-push`** (picks up the batching fix + shared
   module — no behavior change, safe to deploy alone or with the rest).
4. **Deploy `send-schedule-nudges`** (new function).
5. Merge the Sidecar app changes (`SettingsScreen.tsx` + version bump)
   and publish per the usual Sidecar deploy path (Cloudflare Worker,
   `/sidecar` route).

Steps 1–4 can go out independently of step 5 — the Settings UI is what
lets a user populate `workDays`/`nudges` in the first place, but the
cron+function pair is inert (no profile will match the predicate) until
someone has that data, so there's no ordering hazard either direction.

## 4. Cron verify (after step 4)

- Confirm the job registered: `select * from cron.job where jobname = 'sidecar-schedule-nudges';` — expect `schedule = '*/5 * * * *'`.
- Watch `cron.job_run_details` for the first few ticks; a 200 response
  body looks like `{"scanned":0,"fired":0,"errors":0,"byKind":{}}` until
  at least one profile has `settings.sidecar.nudges.clockInCheck.enabled`
  and a matching `workDays` entry.
- To force a real test firing: set a test profile's
  `settings.sidecar.workDays.<today>` to `{ enabled: true, start: "<a
  few minutes ago>", end: "..." }` and
  `settings.sidecar.nudges.clockInCheck.enabled = true` via the new
  Settings card, make sure that profile is NOT clocked in
  (`browser_profile_status.clock_state` null or `clocked_out`), and wait
  for the next 5-minute tick. Expect a `push_log` row
  `(profile_id, 'clock_in_check', '', <today>)` and a push notification
  if a `push_subscriptions` row exists for that profile.
- `send-focus-push`'s existing behavior (timer/drift/checkpoint/away)
  should be unchanged after its redeploy — the N+1 fix only changes
  *how* the checkpoint-staleness data is fetched, not what's evaluated.

## 5. Not in this branch (intentional v1 scope cuts, per design doc §5)

- **`blockStart`** (calendar-event-driven "starts in 5 minutes") — v2,
  needs Plan 035 (Unified Calendar) further along.
- **`idleNudge`** — v3, needs more production trust in `idle_state`.
- **`graceMinutes`/`cutoffMinutes` UI** — the Settings card doesn't
  expose these; `send-schedule-nudges` defaults them to 15/120 when
  absent from `settings.sidecar.nudges.clockInCheck`. Fine to add a UI
  for them later without a schema change — same object, new keys.
- **`workSchedule` (extension) ↔ `settings.sidecar.workDays` (Sidecar)
  unification** — still two separate schedule stores, per design doc
  §3.2's explicit scope cut. Flagged there as an open question for
  whoever picks up v2/v3.
