# Feature #208 Design — Smart Deferral & Splitting Engine (v1 slice)

**Feature:** [`docs/features/208-smart-deferral-stint-scheduling.md`](../../features/208-smart-deferral-stint-scheduling.md)
**Sibling (shipped):** [`docs/features/207-backburner.md`](../../features/207-backburner.md)
**Status:** DESIGN GATE — for Koda vet before any build task is assigned
**Driver:** Cindra · **Owner:** CeeCee
**Extension version at write time:** 6.8.2 (dist) / 6.7.22 (prod) · **Sidecar at write time:** v0.9.2
**Asana task:** [1216679252111329](https://app.asana.com/1/9526911872029/project/1214031898449333/task/1216679252111329)

---

## 0. Why this doc re-derives v1 instead of building #208 as written

`docs/features/208-smart-deferral-stint-scheduling.md` was written 2026-05-28, before
Backburner (#207) shipped, before the `focus_events` log existed (migrations 034/039/041),
and before Plan 040 recorded **Progressive Simplicity** in `Tabatha_Concept.md`: *"every new
feature should ask what it removes from the user's upfront attention, not just what it adds."*
The original spec proposes a full calendar-reading auto-scheduler, a bespoke `deferralMeta`
JSON blob with `splitParts`, and a P1–P5 priority scale that was never adopted (shipped
`focus_items.priority` is `1..10`, migration 021). None of that reflects what's actually on
disk today.

What *is* on disk today is close to everything #208 needs:
- `focus_events` (mig 034, extended 039/041) already carries `start | pause | resume |
  resolve | extend | snooze | backburner | unbackburner`, each with the meta #208 asked for
  informally ("extensions... need to be tracked... to be used, for the user's benefit" —
  Malkio, Addendum 6).
- Backburner's `snoozeBackburner(id, mins)` (`sidecar/src/data/focus.ts:320`) already *is* a
  "defer to a specific stint" primitive — it sets `tags._snoozeUntil`, flips
  `tags._backburner`, and emits a `snooze` `focus_event`.
- Sub-intents (`tags._parent`, `createIntent(..., { parentId })`,
  `sidecar/src/data/focus.ts:164`) already *are* the "split into parts" primitive, minus the
  auto-trigger and the parent/part choreography.
- `settings.sidecar.workDays` (Epic 8, `profiles.settings` JSONB, no migration) already
  encodes the user's schedule that #208 wanted to read from a calendar.

So v1 of #208 is reframed as: **a suggestion layer that reads the history and schedule data
we already collect, and offers to drive the existing snooze/split primitives — never a new
scheduling engine, never new schema.** This is the Progressive-Simplicity cut: capability
(the system now notices patterns and offers help) grows while the upfront surface (one
dismissible card, reusing buttons that already exist) does not.

---

## 1. What "smart" means, concretely, in v1

**Not** in v1: reading Google/Outlook calendars (Calendar Sync #193 isn't wired into Sidecar),
ML-personalized timing, auto-displacing other queue items, auto-applying anything without a
tap. All of that was in the original #208 spec; all of it is cut below (§4).

**Is** in v1: a deterministic pattern-matcher over data we already have, producing at most one
suggestion per focus at a time, always presented as an accept/decline card.

### 1.1 Reschedule suggestion (deferral history → a better time)

Trigger: a focus sitting in the queue (not active) has **≥2** `snooze` or `backburner`
`focus_events` in its history, OR it has been in the queue (created, never started) for
**≥3** calendar days with zero `start` events.

Suggestion payload: 1–3 concrete presets, computed from `settings.sidecar.workDays`:
- **"Later today"** — only offered if today is an enabled work day and the current time is
  before `end`; target = now + a fixed step (default 90 min, configurable later).
- **"Next work block"** — the start time of the next enabled `workDays` entry (today if a
  window remains, else the next enabled day), read exactly like
  `send-schedule-nudges/index.ts` already reads it (`profileLocalClock` + `hhmmToMinutes`).
- **"Custom"** — falls through to the existing free-form snooze picker (already shipped;
  no new UI needed for this option).

If `workDays` has no enabled days configured, only "Custom" is offered — the suggestion
degrades to "you keep pushing this off, want to snooze it?" without inventing a time.

Accepting any preset calls the **existing** `actions.snoozeBackburner(id, minutesUntilTarget)`
unchanged. Smart Deferral v1 does not introduce a new deferral action — it introduces a
better-informed *reason to open the one that exists*.

### 1.2 Split suggestion (ballooning intent → propose parts)

Trigger: a focus (active or paused, not yet split) accumulates **≥3** `extend` events, OR
**≥3** combined `snooze`+`backburner` events, within the current `focus_events` history for
that `focus_client_id`.

Suggestion payload: "This is taking longer than expected — split it into parts?" with a
default of 2 parts (user can pick 2–4 in the accept flow, §2).

### 1.3 Dismissal, not disappearance

Declining a suggestion writes a dismissal marker to `focus_items.tags` (two new tag *keys*,
no schema — see §5) so it doesn't re-render on every screen mount. The suggestion is eligible
to reappear only after a **new** qualifying event lands after the dismissal timestamp (e.g.
one more `extend` after a decline re-arms the split suggestion). This mirrors the existing
`_snoozeUntil` / `_backburner` tag pattern already in `focus.ts` — nothing novel.

---

## 2. Splitting mechanics

Reuses the shipped sub-intent machinery exactly, with one added choreography step: the
**parent focus goes to backburner** for the duration of the split (composing #207, which the
user's original #208 quote explicitly named as a related mechanism: *"related to... queuing,
pausing, and backburner"*).

Accept flow:
1. User picks part count `N` (2–4, default 2) and, optionally, adjusts the default even split
   of the parent's remaining `timer_minutes` (floor of 10 min/part).
2. `actions.sendToBackburner(parentId)` runs unchanged (existing #207 action) — parent focus
   → `paused`, `tags._backburner = true`, emits a `backburner` `focus_event`. No new "split
   parent" status is invented; backburner already means *"waiting, I'll return."*
3. `N` sub-intents are created via the **existing** `createIntent(label, timerMinutes, realm,
   { parentId: parent.id, active: i === 0, tags: { _splitIndex: i + 1, _splitTotal: N } })`
   loop. Labels get a literal `" (Part i/N)"` suffix, matching #208's original example
   (`"Audit database indexes (Part 1/2)"`) — plain text, not a rendering rule every consumer
   has to decode.
4. Part 1 becomes the active focus (mirrors the existing `active` flag path in `createIntent`
   — no new state machine). Parts 2..N sit in the queue as sub-intents, already filtered
   under the parent by the existing `tags?._parent === cf.client_id` check in
   `FocusScreen.tsx:133`.
5. **Auto-close on completion:** when the last sibling sub-intent under a given `_parent`
   resolves, the parent (which has been sitting backburnered) auto-resolves too. This is a
   client-side computed check (does the queue still contain any non-resolved item with this
   `tags._parent`?) — no new event kind, no new column. If the parent was *also* independently
   resumed by the user mid-split (they un-backburnered it manually), auto-close is skipped —
   the user is back in control of it.

`_splitIndex`/`_splitTotal` are informational tags for UI grouping/ordering only; the
authoritative parent/child relationship remains `tags._parent`, unchanged from #207/existing
sub-intents.

---

## 3. Surfaces

| Surface | v1 behavior |
|---|---|
| **Sidecar `FocusScreen`** | Primary v1 surface. A small badge/chip on eligible queue rows ("Deferred twice — reschedule?" / "3× extended — split?"). Tap opens the suggestion card inline (reschedule presets or split-count picker). |
| **Sidecar `ContextView` (CV)** | Signal only, no interaction. CV's existing B2b empty-state queue cards (`ContextView.tsx:149`) are explicitly view-only ("no press handlers — selection happens from the phone or extension" — existing comment). A suggestion, if present, renders as a passive badge on the card; accept/decline never happens on CV. |
| **Extension Sidebar / InBar** | **Out of v1.** The extension does not yet write `focus_events` (Addendum 5 item 2: durations are labeled "📱 Sidecar-tracked" until it does). Surfacing suggestions there would either read a partial history or require the extension-side `focus_events` adoption that Plan 040 already tracks as separate follow-through work. Revisit once that parity work lands. |
| **Push nudge (Epic 8 rail)** | **Out of v1**, see §4. |

---

## 4. Explicit v1 / v2 cut (Progressive Simplicity applied)

**v1 (this doc, buildable now):**
- Reschedule + split suggestion computation (pure functions, §6 Unit 1).
- Sidecar `FocusScreen` badges + accept/decline cards (§6 Units 2–3).
- Dismissal persisted via tags, re-arms on new qualifying events.
- Accept always drives an **existing** action (`snoozeBackburner`, `sendToBackburner` +
  `createIntent`). No auto-mutation of anything the user didn't tap.

**v2 (named, not designed here):**
- **Push delivery** via the Epic 8 rail (`push_log`, new `kind: 'defer_suggest'`) — ship only
  after the in-app v1 heuristic proves it isn't noisy. Reuses `push_log`'s existing
  `(profile_id, kind, scope_key, day)` shape with `scope_key = focus_client_id`; zero schema
  change, same pattern as `clock_in_check`/reserved `block_start`/`idle_nudge`.
- **Extension/Sidebar surfacing** — waits on extension-side `focus_events` writes (tracked
  separately in Plan 040 Addendum 6's follow-through).
- **Real calendar-aware slot-finding** (Google/Outlook read, meeting-avoidance) — the
  original spec's ambition; needs Calendar Sync (#193) wired into Sidecar first. v1's
  `workDays`-only heuristic is the honest substitute until then.
- **Personalized timing** (learn each user's typically-accepted defer window/time-of-day
  instead of fixed presets/step sizes) — v1 uses fixed heuristics only; needs an acceptance
  audit trail to tune against (see §5's schema-if-ever-needed note).
- **Dependency/blocker-aware gating** (#208 §4, "blocked by PR merge" auto-push) — no
  blocker/dependency model exists in Sidecar yet; its eventual home is Epic 3's `task_links`
  relation table (Plan 040 Addendum 5 item 3). Park until Epic 3 ships.
- **Priority-based auto-displacement of other queue items** — the original spec's "higher
  priority items can displace lower-priority queue items (auto-shifting them down)". Rejected
  outright for any version under the current interaction contract (§7): a suggestion never
  touches a focus other than the one it's about. If ever revisited, it would need to be an
  explicit opt-in setting, not default behavior.

---

## 5. Data / schema verdict: **none required for v1**

Argued against what already exists, per Cindra's directive to argue from `focus_events`
before inventing anything:

| #208's original ask | v1 uses instead | New schema? |
|---|---|---|
| Deferral/wait history | `focus_events` kinds `snooze` / `backburner` / `unbackburner` (mig 034/041) | No |
| "Extensions tracked" | `focus_events` kind `extend` (mig 039), meta `{addedMinutes, fromMinutes, toMinutes}` | No |
| Suggestion dismissal state | Two new **tag keys** inside `focus_items.tags` JSONB: `_deferSuggestDismissedAt`, `_splitSuggestDismissedAt` | No — JSONB, no column |
| Split parts (`deferralMeta.splitParts`) | Existing `tags._parent` + `createIntent(..., { parentId })` sub-intents, plus informational `_splitIndex`/`_splitTotal` tags | No |
| Schedule constraints | Existing `settings.sidecar.workDays` (`profiles.settings` JSONB, Epic 8) | No |
| Priority scale (`P1`–`P5`) | Existing `focus_items.priority` (`1..10`, mig 021) — #208's scale was never adopted; don't reintroduce it here | No |

**If v2 push delivery is picked up:** still no migration — `push_log` (mig 036) is already
generalized for `(profile_id, kind, scope_key, day)`; a `defer_suggest` kind is a new string
value, not a new table.

**The one case that would need real schema:** a durable acceptance/decline audit trail to
train v2's "personalized timing" (§4). That doesn't exist today and isn't needed for v1's
fixed-heuristic behavior. If it's ever built, it is new schema — per Cindra's directive,
assign it **migration 045 or later**: 044 is the next open slot as of this doc
(`supabase/migrations/` runs through `043_app_level_invites.sql`), but multiple epics are in
flight, so re-check `ls supabase/migrations` at build time rather than trusting this number.

---

## 6. Build breakdown — 2–4 parallelizable units

**Unit 1 — Suggestion engine (pure logic, new file, no UI).**
`sidecar/src/data/deferralSuggestions.ts` — two pure functions:
`computeRescheduleSuggestion(events: FocusEvent[], focus: FocusItem, workDays, now): Suggestion | null`
and `computeSplitSuggestion(events: FocusEvent[], focus: FocusItem, now): Suggestion | null`.
No dependency on React/Supabase — unit-testable the same way `stintReconciliation.js`'s pure
helpers already are on the extension side. Fully independent; lands first and unblocks the
other units against a stable interface.

**Unit 2 — Split accept flow.**
Touches `sidecar/src/screens/FocusScreen.tsx` (badge + split-count picker on queue rows) and
`sidecar/src/data/focus.ts` (new `actions.splitFocus(id, parts)` that composes the existing
`sendToBackburner` + `createIntent` calls per §2 — emits no new `focus_event` kind, only the
already-wired `backburner`/`start` ones). Depends on Unit 1's `computeSplitSuggestion` shape
only (can stub it while Unit 1 is in review).

**Unit 3 — Reschedule accept flow.**
Touches `sidecar/src/screens/FocusScreen.tsx` (badge + preset card on queue rows, different UI
region from Unit 2's) calling the **unchanged** `actions.snoozeBackburner`. Needs a read of
`settings.sidecar.workDays` — `SettingsScreen.tsx` already reads/normalizes this
(`normalizeWorkDays(sc.workDays)`); Unit 3 either factors that into a small shared helper or
reads it inline the same way. Depends on Unit 1's `computeRescheduleSuggestion` shape only.

**Unit 4 (optional — can slip to v2 kickoff instead of blocking v1) — Dismissal plumbing.**
Small `actions.dismissSuggestion(id, kind: 'defer' | 'split')` helper in `focus.ts` writing
the tag keys from §5. Cheap enough to fold into whichever of Unit 2/3 lands first instead of
running as a standalone unit; called out separately only so it isn't silently dropped.

**Coordination note:** Units 2 and 3 both edit `FocusScreen.tsx`'s queue-row rendering, so
they are parallel-*safe* but not parallel-*independent* — same file, different regions. Run
Unit 1 solo first (fast, unblocks both), then either sequence 2→3 with one owner, or run 2 and
3 concurrently with two owners and a fixed merge order (Unit 2 merges first; Unit 3 rebases
before merging) to avoid a late three-way conflict in one screen file.

---

## 7. Interaction contract (binding for build)

1. Every suggestion is **accept or decline** — no timer-based auto-apply, no silent default,
   no action taken without a tap.
2. A suggestion **never** touches a focus other than the one it's about — no auto-displacing
   or auto-rescheduling other queue items as a side effect of accepting one suggestion.
3. Accepting a suggestion **always** rides an existing, already-shipped action
   (`snoozeBackburner`, `sendToBackburner`, `createIntent`) — no shadow write path, no
   suggestion-only mutation that bypasses the same `focus_events` logging every manual action
   already gets.
4. Declining is not permanent silence — it re-arms on the next new qualifying event, so a
   focus that keeps getting extended keeps getting asked, gently, per Backburner's own design
   philosophy: **"subtle, consistent, demanding, but not derailing."**
