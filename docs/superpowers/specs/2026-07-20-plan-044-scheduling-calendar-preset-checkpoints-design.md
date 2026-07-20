# Implementation Plan 044: Scheduling, Calendar & Preset Checkpoints

**Status:** draft — Koda review next
**Driver:** Malkio · **Author:** Cindra
**Current version:** Extension 6.7.44 · Plan 035 status: **partial (1/3)** — Phase 1 backend
  (`calendarService.js`, `calendar_events`/`calendars` schema, migration 014) shipped
  2026-05-28; Phases 2 (UI) and 3 (OAuth) never built.
**Target version on v1 completion:** Extension minor bump (exact number per Headbox
  Rule 10 at commit time).
**Relationship to Plan 035:** this plan **continues** 035's Phases 2-3 rather than
  re-deriving them — per Headbox Rule 13, 035 stays `partial`, its Phase 1 work stays
  credited, and this doc's Units 2-3 close it out. New scope beyond 035 (scheduled-intent
  auto-activation, preset checkpoints) is this doc's own contribution.
**Migration claim:** 053-055 (placeholder — Olympus claims 046-049, Plan 043
  claims 051-052 (050 is left unclaimed — fix-wave-3 needs no migration);
  re-verify via `ls supabase/migrations` before writing SQL).
**Interpretation chosen:** the brief doesn't name a surface. Google OAuth + calendar UI
  land on the **extension** first because that's where the existing backend
  (`calendarService.js`) already lives — Sidecar calendar surfacing is out of v1, named
  in §6 as v2.

---

## 1. What's already real (from `docs/parallel-development-workflow.md` research)

- `supabase/migrations/014_add_calendar_sync_tables.sql`: `tabatha.calendars`
  (`provider VARCHAR(50) DEFAULT 'native'` — comment already lists
  `'native'|'google'|'outlook'|'ical'`, `sync_token` for delta sync) and
  `tabatha.calendar_events` (RRULE/EXDATE recurrence, `associated_focus_id`,
  `associated_task_id`, `provider_event_id`, `etag`, `last_synced_at`). Schema
  was built with third-party sync in mind; nothing needs to be re-added, only
  populated by a real sync engine.
- `src/background/services/calendarService.js` (329 lines): pure local
  CRUD + client-side RRULE expansion. No network calls to Google/Outlook.
- `src/background/services/syncService.js`: pushes Tabatha's own tables
  (clients, clock_sessions, focus_items) to Supabase — grepped for
  oauth/google/outlook tokens, zero hits. Not a calendar-sync engine.
- **Conclusion:** the data model is ready; the OAuth engine, the pull/push
  sync loop, and the UI are the entire gap.
- `tabatha.focus_items` (migration 001) has no `scheduled_at` concept — needs
  a new column (§3).
- `tabatha.integration_credentials` (migration 035) is Asana-shaped:
  `provider TEXT NOT NULL CHECK (provider IN ('asana'))`. Widening this CHECK
  is shared scope with Plan 045 §2 (task-provider abstraction) — **both plans
  touch the same CHECK constraint on the same column.** Flagged as a
  coordination point in §7; whichever branch lands second must rebase its
  migration onto the other's widened CHECK rather than reverting it.

---

## 2. Google Calendar OAuth (extension, Unit 2)

Per-user OAuth connection, explicitly distinct from the separately-tracked
CWS (Chrome Web Store) OAuth work — confirmed no overlap exists in this tree
(zero hits for "CWS OAuth" anywhere in `src/`/`sidecar/`/`docs/`).

- New edge function `supabase/functions/connect-google-calendar/index.ts`,
  mirroring `connect-asana`'s shape: exchanges an OAuth code for
  access/refresh tokens, stores them via `integration_credentials` (provider
  `'google_calendar'`, widened CHECK per §1), vaults the refresh token the
  same way `connect-asana` vaults its PAT-equivalent secret.
- New cron-driven pull: `supabase/functions/sync-google-calendar/index.ts`,
  same pg_cron cadence pattern as `sync-asana-tasks` (5-min interval).
  Upserts into `calendar_events` keyed on `provider_event_id`, using `etag`
  for change detection — the columns already exist for exactly this.
- v1 is **poll-only** (no Google push-notification webhook) — matches the
  existing Asana cron pattern rather than inventing a webhook receiver for
  Google on day one. Webhook-based push is named in §6 as v2.
- Extension-side UI: a "Connect Google Calendar" button in Settings
  (`src/settings/`), same visual pattern as the existing Asana connect flow.

---

## 3. Intents consider the calendar + scheduled future intents (Unit 4)

**Calendar-aware intent creation.** When creating or scheduling an intent for
a specific window, check `calendar_events` for overlaps in that window and
surface a non-blocking hint ("You have 'Standup' at 10:00 during this
block"). Pure read, client-side, no schema change.

**Scheduled future intents.** New migration 054 columns on `focus_items`:
`scheduled_at TIMESTAMPTZ`, `scheduled_activated_at TIMESTAMPTZ`. A new
funnel affordance: an intent can be created with `scheduled_at` set and sits
outside the normal queue/backburner rendering (a new lightweight "Scheduled"
section) until activation. New cron `supabase/functions/activate-scheduled-intents/index.ts`
(same cadence family as `send-schedule-nudges`, migration 037) sweeps
`focus_items WHERE scheduled_at <= now() AND scheduled_activated_at IS NULL`,
flips the item into the normal queue (or active, if nothing else is active —
mirrors existing auto-activation semantics already used elsewhere), stamps
`scheduled_activated_at`, and fires an alert through the existing push
pipeline (`send-focus-push`, already generalized for multiple kinds).

**Push a scheduled intent into the calendar.** A button in the intent
edit panel calling either (a) `calendarService.createEvent()` locally if no
Google connection exists (writes a `provider = 'native'` row — already
supported, zero new code beyond wiring the button), or (b) a new
`push-intent-to-calendar` edge function that calls the Google Calendar API
create-event endpoint using the stored OAuth token, then writes the resulting
`calendar_events` row with `provider_event_id` and `associated_focus_id` set.

---

## 4. Preset checkpoints (Unit 6-7)

User or AI pre-defines checkpoints for an intent; auto-linked to subtasks;
tracked hit/miss against an expected time.

### 4.1 Schema (migration 055)

```sql
CREATE TABLE tabatha.preset_checkpoints (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  focus_client_id       TEXT NOT NULL,             -- matches focus_items.client_id
  text                  TEXT NOT NULL,
  expected_offset_min   INTEGER,                    -- minutes from focus start, nullable
  expected_at           TIMESTAMPTZ,                 -- absolute, for scheduled intents; one of offset/at is set
  linked_task_id        UUID REFERENCES tabatha.tasks_registry(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','hit','missed','skipped')),
  created_by             TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user','ai')),
  hit_checkpoint_id      UUID REFERENCES tabatha.focus_checkpoints(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((expected_offset_min IS NOT NULL) <> (expected_at IS NULL) OR (expected_offset_min IS NULL AND expected_at IS NULL))
);
```

RLS owner-scoped, matching every other profile-scoped table in this schema.

**"Auto-linked to subtasks, both directions" — interpretation chosen:** one
FK column (`linked_task_id`) is sufficient for bidirectional lookup (index
both ways); the "both directions" requirement is about the **creation flow**,
not two DB columns — creating a preset checkpoint from an existing task
auto-populates `linked_task_id`, and creating one from scratch with a
description that matches an open subtask offers to link it. No second column
needed; flagged here so a future reader doesn't wonder why there's only one
FK.

### 4.2 Hit/miss tracking

New cron `supabase/functions/sweep-preset-checkpoints/index.ts` (same cadence
family): for each `pending` preset past its `expected_at`/offset, checks for
a real `focus_checkpoints` row logged after the preset's creation and before
now for the same `focus_client_id` — if found, links it (`hit_checkpoint_id`,
`status='hit'`); if the expected time has passed by more than a tolerance
window (default 15 min, configurable) with nothing to link, `status='missed'`.
A user can also explicitly mark a real checkpoint as matching a specific
preset from the UI (skips the heuristic entirely).

### 4.3 AI-authored presets

Out of v1. Requires Plan 042's v2 LLM path (§4 of that doc) to generate
sensible expected checkpoints from an intent's description — named as a
cross-reference, not designed here.

---

## 5. Build breakdown — units, file-level scope

| Unit | Scope | Files | Depends on |
|---|---|---|---|
| **1 — Widen `integration_credentials`** | ALTER CHECK to add `'google_calendar'` | `supabase/migrations/053_*.sql` | Coordinate with Plan 045 (§7) |
| **2 — Calendar UI (closes Plan 035 Phase 2)** | Month/Week/Day views, Sidebar agenda, react-big-calendar | `src/settings/` or new `src/calendar/` surface, `src/sidebar/` agenda widget | none new — reuses shipped `calendarService.js` |
| **3 — Google OAuth engine (closes Plan 035 Phase 3)** | Connect flow + poll-sync cron | `supabase/functions/connect-google-calendar/`, `supabase/functions/sync-google-calendar/`, Settings UI button | Unit 1 |
| **4 — Scheduled intents** | `scheduled_at` columns + activation cron + calendar-aware hint | `supabase/migrations/054_*.sql`, `supabase/functions/activate-scheduled-intents/`, `src/background/services/focusService.js` (new scheduling path) | none |
| **5 — Push intent → calendar** | Native path (Unit-independent) + Google path | Intent edit panel button, `supabase/functions/push-intent-to-calendar/` | Unit 3 for the Google path only; native path ships standalone |
| **6 — Preset checkpoints schema** | New table | `supabase/migrations/055_*.sql` | none |
| **7 — Preset checkpoints UI + sweep cron** | Create/view presets in intent edit panel, hit/miss display | `sidecar/src/screens/FocusScreen.tsx` and/or `src/` extension edit panel, `supabase/functions/sweep-preset-checkpoints/` | Unit 6 |
| **8 (v2) — Auto-carve focus blocks from free/busy (CeeCee idea)** | Reads Google free/busy, suggests blocks | not designed here | Unit 3 |
| **8b (v2) — AI-authored presets** | — | not designed here | Plan 042 v2 |
| **8c (v2) — Outlook/iCal providers** | — | not designed here | Unit 3 pattern, new OAuth per provider |

---

## 6. v1 / v2 cut

**v1:** Units 1-7 — Google-only OAuth, poll-based sync, scheduled-intent
auto-activation, native+Google calendar push, preset checkpoints with
user-authored content and heuristic hit/miss.

**v2 (named, not built now):** Unit 8/8b/8c above, plus Sidecar-side calendar
surfacing (this plan is extension-first per §0's stated interpretation),
Google push-notification webhooks replacing polling.

---

## 7. Dependencies section

| Depends on | For |
|---|---|
| Plan 035 Phase 1 (shipped) | All of this plan — schema already exists |
| Coordination with Plan 045 §2 (shared `integration_credentials.provider` CHECK) | Unit 1 — whichever branch lands second rebases |
| Nothing else | Units 2-7 |

| Blocks | Why |
|---|---|
| Plan 044 §4.3 (AI-authored presets, self-referential v2) | Needs Plan 042 v2 |
| CeeCee's auto-carve idea (§6, v2) | Needs Unit 3 (OAuth) shipped first |

---

## Parallelability Review

- **Zones touched:** Settings (`src/settings/`), Sidebar (`src/sidebar/`),
  Focus Engine (`focusService.js` — 🔴-adjacent, additive scheduling path
  only, not restructuring existing logic), Supabase migrations + functions.
- **Shared files modified:** `focusService.js` (Unit 4, additive) —
  coordinate with anyone else touching Focus Engine zone per the ownership
  table.
- **Conflicts with active worktrees:** Unit 1's migration touches the same
  CHECK constraint as Plan 045 §2 — explicit coordination required, not a
  silent landmine (documented in §1 and §7 above). Also re-verify migration
  numbers 053-055 don't collide with Plan 043 (051-052) at build time (050
  is unclaimed — fix-wave-3 needs no migration).
- **Can run parallel with other work:** Partially — Units 2, 6, 7 are
  isolated and parallel-safe; Units 1, 3, 5 need the coordination above;
  Unit 4 touches a 🔴-adjacent shared file (additive only, lower risk but
  still needs a solo pass, not concurrent edits).
- **Max branch lifetime estimate:** ~1.5 weeks for the full unit set — this
  is the largest of the four new plans.
- **Scope-split points:** Split at Unit boundary 1-3 (OAuth+UI, closes Plan
  035) vs 4-5 (scheduling) vs 6-7 (preset checkpoints) — three separate
  branches, each under a week, sequenced by the dependency table above.

---

## Koda vet + expansion (2026-07-20)

### Top finding — the `preset_checkpoints` CHECK constraint is inverted

§4.1's CHECK is written as:

```sql
CHECK ((expected_offset_min IS NOT NULL) <> (expected_at IS NULL) OR (expected_offset_min IS NULL AND expected_at IS NULL))
```

I truth-tabled all four cases and this constraint does the **opposite** of
what the surrounding prose promises ("one of offset/at is set"):

| offset | at | prose says | this CHECK actually does |
|---|---|---|---|
| NULL | NULL | *(ambiguous — "one is set" implies neither should be allowed)* | **PASSES** |
| SET | NULL | valid — the whole point of the offset column | **FAILS — rejects a legitimate row** |
| NULL | SET | valid — the whole point of the `expected_at` column | **FAILS — rejects a legitimate row** |
| SET | SET | invalid — can't have both an offset and an absolute time | **PASSES — silently allows both** |

This constraint would make the table effectively unusable as designed: every
preset checkpoint that sets *only* `expected_offset_min` or *only*
`expected_at` (the two cases the schema exists to support) gets rejected by
Postgres at insert time, while the one combination that should never happen
(both set) sails through. **Revise, exact — replace with:**

```sql
CHECK ((expected_offset_min IS NOT NULL) <> (expected_at IS NOT NULL))
```

This is real XOR (exactly one of the two must be set, neither-null also
rejected, matching "one of offset/at is set" literally). If a checkpoint
with no expected time at all should be a legal state (e.g. a pure checklist
item with no timing expectation), use
`CHECK (NOT (expected_offset_min IS NOT NULL AND expected_at IS NOT NULL))`
instead — this permits neither/either but still blocks both. Either is a
one-token fix; the version as drafted needs Malkio/Cindra to pick which of
the two semantics is actually wanted, then land the corrected clause before
migration 055 is written for real.

### Verified claims

- `tabatha.focus_items` (migration 001, line 57) genuinely has no
  `scheduled_at`/timing-future-intent concept — confirmed by direct read,
  Unit 4's premise holds.
- `tabatha.integration_credentials` (migration 035) Vault-pointer pattern
  (never stores the raw secret, only a `vault_secret_name`, resolved only
  inside `SECURITY DEFINER` RPCs like `tabatha.get_vault_secret`) is real and
  exactly as described — a legitimate template for Unit 3's Google OAuth
  token storage.
- The "existing auto-activation semantics already used elsewhere" citation
  in Unit 4 checks out: `src/background/services/focusService.js` lines
  481-498 (the resolve path) already promote the most-recently-paused item
  to `active` when the resolved item was the active one — Unit 4's
  activation cron can genuinely mirror this logic rather than invent new
  semantics.
- `send-focus-push` is genuinely already `kind`-keyed and multi-purpose
  (`focus_away`, `timer_expired`, `checkpoint_stale`, `drifted` all confirmed
  in the live edge function) — Unit 4's claim that firing a new alert kind
  through it is "already generalized" is accurate, not aspirational.

### Gap — Google OAuth token refresh has no design, unlike the Asana PAT it's modeled on

§2's "vaults the refresh token the same way `connect-asana` vaults its
PAT-equivalent secret" undersells a real difference: an Asana PAT
(`upsert_asana_credential`, migration 035) **never expires** — it's a single
long-lived secret, stored once, read once per sync. A Google OAuth **access**
token expires in ~1 hour; only the **refresh** token is long-lived, and
`sync-google-calendar` (a 5-minute cron per this doc) will need to exchange
the refresh token for a fresh access token on effectively every run, then
handle the refresh token itself eventually being revoked (user revokes app
access from their Google Account, refresh token expires from inactivity,
etc.) by flipping `integration_credentials.status` to `'error'` and
surfacing a "reconnect Google Calendar" prompt — none of which the Asana
integration needed to solve because PATs don't expire. **Revise:** Unit 3
needs an explicit sub-step for token refresh (a `google_access_token`
short-lived Vault entry alongside the long-lived refresh token, refreshed
inline at the top of each `sync-google-calendar` run, with a defined
"refresh failed → mark `status='error'`, stop retrying until reconnect"
failure path) — this is not a detail that falls out of "mirror
connect-asana," it's new scope the doc should name.

### Coordination point — give Plan 044/045's shared CHECK a default winner

Both this doc (§1, §7) and Plan 045 (§B1) correctly flag that they both
widen `integration_credentials.provider`'s CHECK and both say "whichever
lands second rebases." That's a real coordination point correctly named
twice, but "whichever lands second" has no default answer if both branches
open around the same time. **Revise:** nominate Plan 045 §B1 as the
canonical widening commit (it already needs the fuller list — `'tabatha',
'asana','anasa','notion','clickup','google_tasks','monday'` — adding
`'google_calendar'` to that same list is a one-token addition), and have
Plan 044 §1 simply depend on 045 §B1 landing first rather than each doc
independently writing its own ALTER CHECK. This turns a soft "coordinate at
build time" into an explicit sequencing decision made now, while it's cheap.

### Verdicts per unit

| Unit | Verdict | Notes |
|---|---|---|
| **1 (widen CHECK)** | **REVISE-WITH-EXACT-REVISION** | Depend on Plan 045 §B1 instead of parallel-authoring the same ALTER (coordination point above). |
| **2 (Calendar UI)** | **PROCEED** | Reuses shipped `calendarService.js` cleanly; no schema risk. |
| **3 (Google OAuth engine)** | **REVISE-WITH-EXACT-REVISION** | Add the token-refresh sub-step named above before this is build-ready. |
| **4 (Scheduled intents)** | **PROCEED** | Auto-activation citation verified real. |
| **5 (Push intent → calendar)** | **PROCEED** | Native path is genuinely unit-independent as claimed. |
| **6 (Preset checkpoints schema)** | **REVISE-WITH-EXACT-REVISION** | Fix the CHECK constraint per the top finding above before migration 055 is written. |
| **7 (Preset checkpoints UI + sweep)** | **PROCEED, blocked on Unit 6's fix** | Sweep-cron logic itself is sound; just needs a working schema underneath it. |

### Koda additions

- **Preset-checkpoint template library.** Once presets exist as a table,
  the next natural step is user-authored *reusable* templates ("standup
  prep: 1) pull yesterday's notes 2) check calendar 3) post update" — three
  presets in one shot, reused across every standup-labeled intent). A tiny
  addition: `tabatha.preset_checkpoint_templates` (profile-scoped, `label
  TEXT`, `items JSONB` — array of `{text, offset_min}`), with one "apply
  template" action in the intent edit panel that bulk-inserts into
  `preset_checkpoints` for the current `focus_client_id`. This is
  independent of AI-authored presets (§4.3/v2) — it's the manual-but-
  reusable middle step between "type one checkpoint by hand every time" and
  "AI writes them for you," buildable entirely in v1 scope with no LLM
  dependency, and a template pool is exactly what a v2 AI-authoring feature
  would want to seed from/write into later anyway.
- **Streak/consistency signal from hit/miss tracking.** §4.2's sweep cron
  already classifies every preset as `hit`/`missed`/`skipped` — that's a
  ready-made input for a lightweight "consistency streak" surfaced
  somewhere small (Settings, or a one-line stat on the Focus screen): "8 of
  your last 10 preset checkpoints hit on time." Zero new schema — it's a
  read-only aggregate query over `preset_checkpoints.status` grouped by
  week. Worth flagging now because it's the kind of thing that's cheap
  today and expensive to retrofit once hit/miss data has been accumulating
  ungrouped for months — if there's any intent to ever show this, tag
  `created_at`'s week bucket in the initial UI pass rather than as a
  follow-up migration.
- **Calendar-conflict auto-carve, concretized (CeeCee's v2 idea, given a
  cheaper v1 slice).** §6 defers "auto-carve focus blocks from free/busy" to
  v2 as reading Google free/busy. A cheaper first slice, buildable entirely
  on Unit 2's UI + already-synced `calendar_events` (no new Google API
  surface): when scheduling a future intent (Unit 4) for a specific
  duration, client-side-only, scan already-synced `calendar_events` for that
  window and if it's fully booked, suggest the *next* open slot found by
  walking forward from the requested time — same non-blocking-hint pattern
  §3 already describes for overlap detection, just extended to propose an
  alternative instead of only warning. No free/busy API call needed since
  the data's already local from the poll sync; genuinely a v1-shippable
  slice of the v2 idea rather than the full free/busy-API version.
