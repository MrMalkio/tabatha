# Epic 8 Design — push_dedup v2 + Schedule Nudges (#194)

**Plan:** 040 (`sidecar_voice_timeline_tasks`) · Epic 8, Addendum 5 item 4
**Status:** DESIGN GATE — not assignable until Koda vets this doc (per Addendum 5: *"Design-first: Epic 8 (dedup v2) — not assignable until designed"*)
**Driver:** Dex · **Owner:** CeeCee
**Extension version at write time:** 6.5.0 · **Sidecar at write time:** v0.2.0
**Asana task:** [1216679131564780](https://app.asana.com/1/9526911872029/project/1214031898449333/task/1216679131564780)

---

## 0. Why this gate exists

Koda's code-verified vet of Plan 040 (Addendum 5, item 4) found:

> Epic 8 requires `push_dedup` v2 — date-scoped key `(profile_id, kind, day)` for
> non-focus nudges + a schedule-join query pass; design first, then assignable.

`tabatha.push_dedup` (migration 030) is:

```sql
CREATE TABLE tabatha.push_dedup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  focus_item_id UUID NOT NULL REFERENCES tabatha.focus_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (focus_item_id, kind)
);
```

Two properties make it wrong for #194's nudges:
1. **NOT NULL FK to `focus_items`.** A "9:15am — are you working yet?" nudge has
   no focus row at all — it fires *before* the user has started anything.
2. **Fire-once-forever per `(focus_item_id, kind)`.** That's actually *correct*
   for the existing kinds (`timer_expired`, `drifted`, `checkpoint_stale`) —
   each `focus_items` row is already a one-shot instance, so "once per focus"
   is the right lifetime. It's wrong for a recurring daily nudge like
   "clocked in yet?", which must be able to fire again tomorrow.

`send-focus-push/index.ts` already has a live precedent for *not* using
`push_dedup` when the event isn't focus-scoped: Pass D (`focus_away`, Plan 040
Epic 0) stamps a per-episode marker directly on `browser_profile_status.metadata`
(`awayNotifiedAt` vs `awaySince`) instead of reusing `push_dedup`, with an
explicit comment explaining why (`last_ok_at` reuse would cross-contaminate
between push kinds). That pattern is single-episode, not recurring — it's a
sibling precedent, not a template Epic 8 can reuse directly, but it establishes
that this codebase already accepts "give the new event shape its own dedup
mechanism" as the house style rather than forcing everything through one table.

---

## 1. `push_dedup` v2

### 1.1 Shape

New table, coexisting with v1 (no migration of existing rows):

```sql
-- Migration 034_push_log_nudge_dedup.sql
CREATE TABLE IF NOT EXISTS tabatha.push_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,           -- 'clock_in_check' | 'block_start' | 'idle_nudge'
  scope_key TEXT NOT NULL DEFAULT '',  -- disambiguates repeats of the same kind
                                        -- within one day (e.g. a calendar_event id
                                        -- for block_start, an idle-episode id for
                                        -- idle_nudge; '' when a kind is a true
                                        -- once-per-day singleton, e.g. clock_in_check)
  day DATE NOT NULL,            -- the user's local calendar day this firing belongs to
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, kind, scope_key, day)
);

ALTER TABLE tabatha.push_log ENABLE ROW LEVEL SECURITY;
-- Service-role only, same as push_dedup: no authenticated policy. The cron
-- fn writes with the service role; users never read/write this table directly.

CREATE INDEX IF NOT EXISTS idx_push_log_profile_day
  ON tabatha.push_log(profile_id, day);
```

This is Koda's proposed `(profile_id, kind, day)` with one addition: `scope_key`.
Reason: `block_start` isn't a day-level singleton — a user can have multiple
calendar blocks in one day (§2.2), each needing its own dedup row, or the second
block's nudge would be silently swallowed by the first block's `(profile_id,
'block_start', day)` row. `scope_key` defaults to `''` so kinds that genuinely
are day-level singletons (clock-in check) behave exactly like Koda's 3-column
proposal — the 4th column is opt-in, not a burden on the simple case.

### 1.2 Coexistence, not migration

- **v1 `push_dedup` is untouched** and keeps serving Pass A/B/C
  (`timer_expired`, `drifted`, `checkpoint_stale`) exactly as today — those
  kinds are correctly focus-scoped, not date-scoped, and migrating them to
  `push_log` would be a regression (it would make them daily-recurring, which
  is wrong: a timer that already expired doesn't need to re-fire tomorrow for
  the same focus).
- **`focus_away` (Pass D) is also untouched** — it stays on its
  `browser_profile_status.metadata` per-episode stamp. That data isn't
  day-scoped either (an away-episode can span midnight), so `push_log`'s
  `day` column would be the wrong fit for it too. Three dedup mechanisms end
  up coexisting by design, each matching its event's actual lifetime:
  | Mechanism | Lifetime unit | Used by |
  |---|---|---|
  | `push_dedup` (v1) | once per focus-row | `timer_expired`, `drifted`, `checkpoint_stale` |
  | `browser_profile_status.metadata` stamp | once per episode | `focus_away` |
  | `push_log` (v2, new) | once per calendar day (± scope_key) | Epic 8 nudges |
- **No backfill needed.** `push_log` starts empty; the first cron tick after
  deploy evaluates predicates fresh and fires (or doesn't) based on live state.
- Table name is `push_log` rather than `push_dedup_v2` — deliberately not a
  versioned name, since v1 isn't being deprecated, just left alone. Naming it
  as a sibling avoids implying an in-place migration that isn't happening.

### 1.3 Helper shape in the edge fn

```ts
async function alreadyFiredToday(profileId: string, kind: string, scopeKey: string, day: string): Promise<boolean> {
  const { data } = await admin.from('push_log').select('id')
    .eq('profile_id', profileId).eq('kind', kind)
    .eq('scope_key', scopeKey).eq('day', day).maybeSingle();
  return !!data;
}
```

`day` is computed from the profile's local time, not UTC — see §2.1 timezone
note. Reuse the existing `dayResetHour` setting (already in `profile.settings.
sidecar.dayResetHour`, used by Context View's countdown) as the day-boundary
so a nudge for "today" and Context View's "today" agree, rather than inventing
a second day-boundary convention.

---

## 2. Nudge catalog for #194

Shared config namespace: `profile.settings.sidecar.nudges` (JSONB, same column
Context View and push settings already live in — see §2.5 for the merge
caveat). Each nudge has an `enabled` flag and its own tuning knobs, plus a
shared DND window.

```json
{
  "nudges": {
    "quietHoursStart": "22:00",
    "quietHoursEnd": "07:00",
    "clockInCheck": { "enabled": true, "graceMinutes": 15, "cutoffMinutes": 120 },
    "blockStart":   { "enabled": false, "leadMinutes": 5 },
    "idleNudge":    { "enabled": false, "thresholdMinutes": 20 }
  }
}
```

### 2.1 "Are you working yet?" (clock-in check)

- **Data source:**
  - Schedule: **not** `workSchedule` as it exists today (see §3 — it doesn't
    reach Supabase). For v1 shipping, schedule must live in
    `profile.settings.sidecar.workDays` — see §3.2 for the interim shape.
  - Live clock state: `tabatha.browser_profile_status` — `clock_state`
    (`'clocked_in' | 'on_break' | 'clocked_out'`), one row per install,
    already realtime-synced (migration 010, immediate upsert on every
    transition). **Not** `clock_sessions` — that table only gets a row on
    clock-*out* (`clocked_out_at NOT NULL`), so it's structurally incapable
    of answering "has the user clocked in yet today" while a shift is still
    open or hasn't started.
- **Trigger predicate** (evaluated per profile, per cron tick):
  ```
  scheduledStart = workDays[todayDOW]?.start   -- e.g. "09:00"
  scheduledStart exists AND enabled
  AND now(profile tz) >= scheduledStart + graceMinutes
  AND now(profile tz) <= scheduledStart + cutoffMinutes
  AND NOT EXISTS (any browser_profile_status row for this profile_id
                  WITH clock_state = 'clocked_in' OR 'on_break')
  AND NOT withinQuietHours(now, nudges.quietHoursStart/End)
  ```
- **Dedup scope-key:** `''` (day-level singleton — one "are you working yet"
  per day is the whole point; firing per-block doesn't apply here).
  `day` = profile-local calendar day per §1.3.
- **Copy draft:**
  - Title: `🕐 Are you working yet?`
  - Body: `Your shift was set to start at {scheduledStart}. Clocked in somewhere else, or want a nudge to get going?`
  - `data: { kind: 'clock_in_check' }`, `url: '/sidecar'`

### 2.2 "Focus block starts in 5 minutes"

- **Data source:** **`tabatha.calendar_events`** (migration 014/035's Unified
  Calendar tables), **not** Work Shifts. This is a second, separate instance
  of the schedule-data gap (§3): the *only* schedule concept that both (a)
  supports multiple named blocks per day and (b) already syncs to Supabase is
  the calendar system, not `workSchedule`. `workSchedule` as it exists today
  is a single start/end window per weekday with no per-block identity — it
  cannot represent "Client X's block starts at 2pm" at all, synced or not.
  Recommend Epic 8's "block starts" nudge sources from `calendar_events`
  directly (any event within the lead window, optionally filtered to events
  the user has tagged as focus blocks once that calendar-event metadata
  exists — v1 can nudge on all events with no filter, see §5 phasing).
- **Trigger predicate:**
  ```
  SELECT * FROM calendar_events
  WHERE profile_id = X
    AND start_time BETWEEN now() + (leadMinutes-1)*60s AND now() + (leadMinutes+1)*60s
  ```
  (a 2-minute window absorbs cron jitter around the 1-minute tick, same
  tolerance style as `timerExpired`'s `>=` check.)
- **Dedup scope-key:** the `calendar_events.id` (or `client_id` if that's the
  synced dedup key on that table — confirm against migration 014's actual PK
  before implementing). `day` = the event's local start date.
- **Copy draft:**
  - Title: `📌 Starting in 5 minutes`
  - Body: `"{event.title}" starts at {event.start_time}.`
  - `data: { kind: 'block_start', eventId }`, `url: '/sidecar'`

### 2.3 "Long idle during work hours"

- **Data source:** `tabatha.browser_profile_status.metadata.idle_state`
  (`'active' | 'idle' | 'locked'`, Plan 036) — already synced live, already
  the source Context View and cross-profile idle-suppression use. The
  dirty-check in `awarenessService.shallowEqualMostFields` means
  `browser_profile_status.updated_at` only advances on an actual
  `idle_state` transition (heartbeat-only refreshes skip it), so
  `updated_at` doubles as a reliable "idle since" timestamp when
  `idle_state = 'idle'` — no new column needed.
- **Trigger predicate:**
  ```
  EXISTS a browser_profile_status row for this profile_id WHERE
    clock_state = 'clocked_in'
    AND metadata->>'idle_state' = 'idle'
    AND now() - updated_at >= thresholdMinutes
    AND withinScheduledWorkHours(now, workDays[todayDOW])
  ```
- **Dedup scope-key:** the idle episode needs its own identity so a single
  long idle stretch doesn't re-fire every cron tick once past the threshold,
  but a *new* idle episode later the same day still can. Use
  `updated_at` (ISO-truncated to the minute) as `scope_key` — it's stable for
  the duration of one episode (only changes when `idle_state` flips again)
  and changes automatically on the next episode.
- **Copy draft:**
  - Title: `👋 Still there?`
  - Body: `You've been idle for {thresholdMinutes}+ min during work hours. Back to it, or take a break?`
  - `data: { kind: 'idle_nudge' }`, `url: '/sidecar'`

### 2.4 DND / quiet hours (shared)

All three predicates gate on `nudges.quietHoursStart`/`quietHoursEnd`
(wrapping midnight-safe, same style as any existing DND check in the
codebase — none currently exists, so this introduces the pattern; write it
once as a shared helper in the edge fn, not three copies). No kind fires
inside the window regardless of its own predicate.

### 2.5 Settings-merge caveat (found while reading `saveSidecarSettings`)

`sidecar/src/context/AuthContext.tsx`'s `saveSidecarSettings` does a
**shallow** merge at the `sidecar` key level:

```ts
sidecar: { ...(profile.settings?.sidecar || {}), ...patch }
```

A patch of `{ nudges: { clockInCheck: { enabled: false } } }` would **replace**
the entire `nudges` object, silently dropping `blockStart`/`idleNudge`/quiet
hours. Settings UI for Epic 8 must always read-modify-write the full `nudges`
object client-side (`{ ...sc.nudges, clockInCheck: { ...sc.nudges.clockInCheck, enabled: false } }`)
before calling `saveSidecarSettings`, mirroring how `dayReset`/`realm`/`timer`
are already handled as sibling scalar keys today. Flagging this now so the
Settings-screen implementation in the build phase doesn't rediscover it as a
bug.

---

## 3. The schedule-data gap

### 3.1 Finding

`workSchedule` (Work Shifts → Schedule tab, `src/workshifts/index.jsx:422`)
lives **only** in `chrome.storage.local` via `useChromeStorage('workSchedule', {})`
— a plain per-day `{ [day]: { start, end, enabled } }` map. Confirmed:
- It is the **only** reference to the `workSchedule` key in `src/` — nothing
  in `src/background/services/syncService.js` reads or pushes it. Checked
  every `.from('...')` call in `syncService.js`: `profiles`, `browser_profiles`,
  `calendars`, `calendar_events`, `intent_history` — no schedule table.
- `useChromeStorage` itself has no Supabase awareness at all — it's a thin
  reactive wrapper over `chrome.storage.local` / `localStorage`, extension-only
  by construction.
- Net effect: **the Sidecar (and any Supabase-side cron function) cannot see
  the user's work schedule today.** Feature #194 as scoped ("it knows your
  schedule, it can ask hey are you working yet") is currently unbuildable
  server-side without new sync.

### 3.2 Minimal fix — interim, ships with Epic 8 v1

Do **not** build a new sync pipeline for the existing `workSchedule` chrome-
storage object (extension → Supabase batch sync is a heavier lift, touches a
shared file (`syncService.js`), and the existing shape is a single day-window
with no per-block identity anyway — see §2.2's finding that it can't serve
the block-start nudge regardless).

Instead, for Epic 8 v1 (clock-in check only, §5 phasing), store the schedule
directly where the Sidecar already writes settings:

```json
"profile.settings.sidecar.workDays": {
  "mon": { "start": "09:00", "enabled": true },
  "tue": { "start": "09:00", "enabled": true },
  ...
}
```

Entered via a small new Settings-screen section in the **Sidecar app itself**
(`sidecar/src/screens/SettingsScreen.tsx`), using the same `saveSidecarSettings`
merge-patch path already in place — no new table, no new sync direction, no
edit to the extension. This is a deliberate scope cut: the user re-enters
their schedule once in the phone app rather than the extension's `workSchedule`
gaining a sync path. It's redundant data entry, but it unblocks Epic 8 v1
without a cross-cutting sync change, and matches the settings-merge pattern
already proven for `dayResetHour`/`focusAwayImmediate`.

**Flagged, not decided here:** whether `workSchedule` (extension) should
eventually sync to Supabase and become the single source of truth, retiring
`settings.sidecar.workDays`, is an open question for whoever picks up Epic 8
v2/v3 — the two schedule concepts (single day-window vs. calendar blocks)
will need reconciling once `blockStart` (§2.2) is built, since that nudge
already needs `calendar_events`, not either schedule shape. Recommend
revisiting once Plan 035 (Unified Calendar) lands further — it may make more
sense for "work hours" to become a calendar-event-derived concept entirely
rather than a third parallel schedule store.

---

## 4. Cron load

### 4.1 Current cost

`send-focus-push` runs every minute (migration 031, `sidecar-focus-push` job).
Pass A/C today does, per active Sidecar-sourced focus: 1 query for timer
expiry (in-memory, free) + **1 separate `focus_checkpoints` query per focus
row** for checkpoint staleness (Koda's "N+1 checkpoint lookups per minute"
finding). At current Sidecar adoption this is cheap, but it's an N+1 that
compounds with every nudge pass added on the same cron.

### 4.2 Batching fix (proposed, applies before Epic 8 adds load)

Replace the per-focus `focus_checkpoints` query with one batched query using
the already-fetched `client_id` list:

```ts
const clientIds = sidecarActive.map(f => f.client_id);
const { data: latestCps } = await admin
  .from('focus_checkpoints')
  .select('focus_client_id, created_at')
  .in('focus_client_id', clientIds)
  .order('created_at', { ascending: false });
// reduce in memory: keep first (latest) row per focus_client_id
const latestByClient = new Map();
for (const cp of latestCps ?? []) {
  if (!latestByClient.has(cp.focus_client_id)) latestByClient.set(cp.focus_client_id, cp);
}
```
One query instead of N. (A `DISTINCT ON (focus_client_id) ... ORDER BY focus_client_id, created_at DESC`
query would be even tighter but needs a matching index; the in-memory
reduce above is a one-file change with no new index and is good enough at
current scale — worth revisiting if `focus_checkpoints` volume grows.)

### 4.3 Should nudges ride the same cron or a separate one?

**Recommend a separate 5-minute cron (`sidecar-schedule-nudges`)**, not the
same 1-minute job, for three reasons:
1. **Precision doesn't need 1-minute granularity.** A 5-minute lead window on
   `blockStart` and a 15-minute grace window on `clockInCheck` both tolerate
   being checked every 5 minutes without a user-visible difference — unlike
   `timer_expired`, which genuinely wants to fire close to the exact minute.
2. **Blast-radius isolation.** Nudge predicates are new, less-proven code
   (three fresh trigger conditions + a DND helper). A bug in one shouldn't be
   able to slow down or error out the existing timer/drift/checkpoint delivery
   that users already depend on. Separate functions (or at minimum a
   try/catch-isolated pass within the same function) keep a nudge regression
   from degrading `timer_expired` latency.
3. **Query cost stays proportional.** The clock-in check and idle nudge both
   need to scan `browser_profile_status` for *every* profile with an active
   schedule (not just profiles with an active Sidecar focus, which is Pass
   A/C's much smaller working set today). Running that scan once per 5
   minutes instead of once per minute is a 5x reduction in an otherwise
   unbounded-by-focus-count query for zero loss in nudge quality.

Recommended shape: new edge fn `send-schedule-nudges`, own migration
(`035_sidecar_schedule_nudge_cron.sql`, next free number after this doc's
`034`) scheduling it at `*/5 * * * *`, reusing the same `push_subscriptions`
delivery helper (extract `deliver`-style webpush-send-and-cleanup into a
shared module both functions import, rather than duplicating the try/catch/
410-cleanup logic a third time).

---

## 5. Phasing

| Version | Scope | Depends on |
|---|---|---|
| **v1** | Clock-in check only (§2.1). New `push_log` table + `settings.sidecar.workDays` (§3.2) + `send-schedule-nudges` cron @ 5min + DND helper. | This design doc approved |
| **v2** | Block-start nudge (§2.2), sourced from `calendar_events`. | Plan 035 (Unified Calendar) far enough along that `calendar_events` has reliable coverage; confirm the table's actual PK/dedup key before wiring `scope_key` |
| **v3** | Idle nudge (§2.3). | Plan 036's `idle_state` in production long enough to trust its signal quality across installs (no known issues today, but it's the newest of the three signals this design leans on) |

Each version is additive to `push_log` (new `kind` values only) — no schema
churn between phases.

---

## 6. Open questions for Koda's vet

1. Is the `scope_key` addition to Koda's 3-column proposal justified, or is
   deferring multi-block dedup to v2 (when `blockStart` actually ships)
   preferable, keeping v1's `push_log` at exactly `(profile_id, kind, day)`
   with a `UNIQUE` violation just meaning "already fired, skip" even for the
   day-singleton v1 kind? (Leaning yes on `scope_key` now — adding a column
   later is a migration; defaulting it to `''` costs nothing today.)
2. Confirm `calendar_events`' actual client-generated ID column name
   (migration 014) before §2.2 is implementation-ready — this doc infers
   `id`/`client_id` from the `focus_checkpoints`/`focus_events` naming
   convention elsewhere but hasn't read migration 014 directly.
3. `settings.sidecar.workDays` (§3.2) is a deliberate scope cut (redundant
   entry vs. extension's `workSchedule`). Confirm that's acceptable for v1,
   or whether unifying the two schedule stores should be pulled forward
   ahead of Epic 8 v1 instead of parked as a follow-up.

---

## Recommendation summary

- **Dedup shape:** new `tabatha.push_log(profile_id, kind, scope_key, day)`
  table (Koda's 3-column proposal plus a `scope_key` for kinds needing more
  than one firing per day), coexisting with — not replacing — `push_dedup`
  v1, since v1's per-focus-row lifetime is already correct for its existing
  three kinds.
- **Schedule-data gap:** `workSchedule` is extension-local only (never synced);
  it also can't represent named blocks even if it were synced. v1 interim fix
  is a new `settings.sidecar.workDays` entered directly in the Sidecar; the
  block-start nudge should source from `calendar_events` instead once Plan
  035 is further along.
- **Top risk:** the clock-in check and idle nudge both need to scan every
  profile with an enabled schedule on every tick, which is a materially
  larger working set than today's "only profiles with an active Sidecar
  focus" — this is why §4.3 recommends a separate, lower-frequency cron
  rather than folding nudges into the existing 1-minute `send-focus-push`.
