# Lanes — Concept Exploration (Feature #224)

**Status:** concept exploration (no build) — Iris (Sonnet) track, dispatched by Vessa (overnight TaskRun-2)
**Driver:** Malkio (voice dump, 2026-07-22 — the turkey-in-the-oven moment) · **Author:** Iris
**Feature doc:** `docs/features/224-thought-lanes.md`
**Naming:** CONFIRMED by Malkio 2026-07-22 — "Lanes" over "Threads."
**Adjacent scope:** #221 Shared Focuses & Org-Level Context (concept doc below is this doc's explicit
template), sub-intents (`tags._parent`), off-computer focuses (`tags._off`), backburner
(`tags._backburner`), Context View / Sidecar, Plan 046 UI/UX Overhaul (Theme 2, Theme 5)
**Grounded against:** `sidecar/src/data/focus.ts`, `sidecar/src/data/events.ts`,
`sidecar/src/screens/FocusScreen.tsx`, `sidecar/src/screens/ContextView.tsx`,
`supabase/migrations/010_add_browser_profile_status.sql`, `034_focus_events.sql`,
`039_focus_events_extend_kind.sql`, `041_focus_events_backburner_kinds.sql`,
`045_device_management.sql`

> This is a thinking document, not a build plan. Its template is
> `docs/superpowers/specs/2026-07-21-shared-focus-org-context-concept.md` (Soren's #221 pass) — same
> structure, same rigor: use cases first, then a model that serves them, then open questions Malkio
> can yes/no fast. Everything marked **(Iris)** is my own proposal, not Malkio's brief.

---

## 0. The one-sentence thesis

Today Tabatha models exactly one thing as "in progress" at a time — the single `currentFocus` that
wins a recency-based arbitration race across every active row. **#224 is the claim that real work
is rarely that clean: a person genuinely runs several things at once that are neither paused
(backburner) nor unstarted (queue) but actually, presently progressing without anyone watching
them** — and the system should have a name and a data shape for that third thing, instead of
forcing it to either win the arbitration race (displacing the thing the user is actually doing) or
lose it entirely (disappearing from view). The turkey didn't need to BE the current focus. It
needed to be visible as something else: a lane.

The good news from the code archaeology below: Tabatha has already, organically, built half of
this by accident. `tags._off` (off-computer) already marks a focus as "active but not attended,"
and the "bug" that inspired this whole feature — the tablet showing the turkey instead of the
primary focus — is `pickMostRecentActive` doing exactly what it's designed to do: picking whichever
`active` row has the latest `_startedAt`, off-computer or not. Lanes are not a new subsystem so much
as a formalization of that near-miss, plus a rule change to arbitration.

---

## 1. Use cases

Six scenarios — the turkey plus five more spanning digital, physical, and agentic work — each with
what "done" looks like for the lane and whether it needs a reminder.

### 1.1 The turkey (origin story)

**What's running:** an oven timer, tracked as an off-computer focus (`tags._off = true`).
**Attended?** No — the user is at the computer, working something else.
**Done looks like:** the timer hits zero; the lane's job is complete regardless of whether anyone
acknowledges it, but someone needs to physically go pull it out.
**Reminder?** Yes, hard requirement — time-based, single fixed point ("check the turkey"), and the
whole feature exists because Malkio wanted this reminder to stay visible on a device (his tablet)
even while his primary attention was elsewhere.

### 1.2 The long build/render while coding something else

**What's running:** a webpack build, a video render, a training epoch — kicked off on the same
machine the user is now using for something else (a different repo, a different tab).
**Attended?** No — the user has moved on to other work; the job runs in the background of the same
device, not "off computer" at all. This is the delta from 1.1: a lane doesn't require physical
distance, only attentional distance.
**Done looks like:** the process exits (success or failure) — an *event*, not a *time*.
**Reminder?** Conditionally — only on completion/failure, not on a timer. A build lane that's asked
"remind me in 25 minutes" is being asked the wrong question; it should be asked "tell me when it's
done," which Tabatha has no native hook into today (see §7, open question 3) unless something
external pings back.

### 1.3 An agent working a delegated task while the human works something else

**What's running:** a fleet agent (in this codebase's own idiom — Iris, Soren, Koda, etc.) claimed
an Asana task and is actively working it; the human is heads-down on a different focus.
**Attended?** No, by the human. Yes, by a non-human operator — this is the exact overlap #221
already names ("an agent working your task is a lane with a non-human operator; the lane model and
the participation model should share vocabulary," per the seed doc's weave-in map).
**Done looks like:** the agent moves the task to done/blocked, or posts a completion comment — the
same signal #221 §6.2 already proposes bridging into `focus_events`.
**Reminder?** Yes, but event-based (blocked or done), not time-based — an agent lane that's still
"running" after an hour is not inherently neglected the way an unattended oven is; only a *stalled*
agent (stuck/blocked) is reminder-worthy.

### 1.4 Laundry

**What's running:** a wash cycle, then a dry cycle — a domestic chore with two sequential waits, not
one.
**Attended?** No — off-computer, like the turkey, but with an internal structure the turkey doesn't
have.
**Done looks like:** two discrete completion points, not one — "the washer is done" is a checkpoint
inside the lane, not the lane's end; the lane only truly ends when the dryer finishes.
**Reminder?** Yes, twice — this is the case that proves a lane needs to support more than one
reminder/checkpoint over its life, not just a single start/end pair (see §7 open question 3).

### 1.5 A background download / large file transfer

**What's running:** an installer, a backup sync, a large asset download — on the SAME device, in
the background, not a separate physical thing.
**Attended?** No, and — like 1.2 — not off-computer either. This is the case that most cleanly
proves lanes are NOT a synonym for "off-computer"; they're a superset. `tags._off` answers "is the
user physically away," which is orthogonal to "is this thing running unattended."
**Done looks like:** transfer completes or errors — again an event, not a time.
**Reminder?** Usually not needed at all unless it fails — the least reminder-hungry case in this
set, useful as a reminder that not every lane needs to nag.

### 1.6 A meeting recording being transcribed

**What's running:** an async transcription job kicked off right after a meeting ends; the "work" is
not attended by anyone, and its output (the transcript) needs human review afterward.
**Attended?** No — genuinely unattended compute, closest in shape to 1.2/1.5 but with a clear
downstream artifact the user will want surfaced, not just a "done" ping.
**Done looks like:** transcript exists — but "done" here has a *second* human step attached
(review), which makes this case a candidate for converting into a real queue/task item on
completion rather than just clearing the lane silently.
**Reminder?** Yes, once, on completion — and arguably the reminder should carry the artifact link,
not just a "check on this" nudge, foreshadowing that lane completions may want to hand off into the
queue rather than evaporate (see §7 open question 3).

---

## 2. Lane vs. backburner vs. queue — the semantics that must not blur

This is the single most important clarity this document has to nail, per the seed doc's own
framing ("distinct from **backburner**... and from the **queue**"). Grounded against what the
codebase actually enforces today, not aspirationally:

| | **Backburner** | **Queue** | **Lane** |
|---|---|---|---|
| **Is it running?** | No — deliberately paused | No — never started | **Yes** — actively progressing |
| **Today's shape** (`sidecar/src/data/focus.ts`) | `focus_state: 'paused'` **+** `tags._backburner: true` (an orthogonal tag over the paused state — see L409-424) | any non-backburnered row that isn't `currentFocus` (`nonBB` minus the arbitration winner, L473-479) — a queue slot is just "not currently the pick," no separate flag | no shape yet — closest existing analog is `tags._off: true` on an `active` row (L35-37), which today still contends for `currentFocus` |
| **User intent it encodes** | "Not now — I'm choosing to defer this" | "Not yet — hasn't been picked up" | "Running without me watching it" |
| **Clock behavior** | Frozen (`tags._elapsedMs` freeze pattern, same one pause already uses) | N/A — never started, no elapsed time exists | Running — its own independent elapsed clock continues, same math as an active focus (`elapsedMsOf`, L45-48) |
| **Can resurface itself?** | Only via explicit `unbackburner` (user action) or a `_snoozeUntil` timer (L424) | Only via explicit pickup (user starts it) | Yes, natively — a lane finishing (event) or hitting a reminder point (time) is exactly the thing that makes lanes worth building |
| **Reminder semantics** | None inherent — silence is the point | None inherent — surfaces when the user goes looking | **Core to the concept** — a lane without reminder-worthiness is just a second active focus with no reason to exist separately |
| **Analogy** | A shelved project in a drawer | An unclaimed ticket in the inbox | A crockpot left on the stove |

The load-bearing distinction: **backburner and queue are both "not happening right now"** (paused
vs. not-yet-started); **a lane is "happening right now, just not by me, right now."** Any data-model
option below has to keep that boundary crisp, because it's exactly the boundary the seed doc flags
as the source of "can't backburner a focus" friction actually being lane-hunger in disguise.

---

## 3. Data-model options

The core question: **where does "this is a lane, and here's its reminder policy" live?** Three
concrete shapes, evaluated against the schema actually on disk.

### Option A — Lane as a new `focus_state` enum value

Add `'lane'` (or `'running_background'`) as a value alongside the existing set. Note the existing
set is already inconsistent across two places: the Sidecar's local `FocusItem.focus_state` is a bare
`string` (`sidecar/src/data/focus.ts` L13, values used in code: `'active' | 'paused' | 'completed'`),
while `browser_profile_status.focus_state` (migration 010, L36) is explicitly commented as
`'active' | 'paused' | 'drifted' | 'completed'` — a fourth value, `'drifted'`, that only exists on
the materialized per-device status row, not on the focus item itself.

- **Pro:** cheap to reason about at the arbitration site — `pickMostRecentActive` (L66-70) could
  simply filter `f.focus_state === 'active'` and nothing marked `'lane'` would ever contend for
  `currentFocus`, which directly fixes the arbitration bug that inspired this feature.
- **Con:** `focus_state` already conflates *lifecycle* (active/paused/completed) with *attention*
  (`'drifted'` is really "active, but the user wandered off" — an attention signal bolted onto a
  lifecycle enum). Adding `'lane'` pushes further down that path and creates transition ambiguity:
  does a lane that gets picked back up as primary go `lane → active`, and does that transition
  preserve `_startedAt`/elapsed the way pause→resume already does? It's answerable, but it's new
  state-machine surface, and this repo's own migration history (010 → 034 → 039 → 041, each one
  widening an enum/CHECK rather than replacing it) suggests these enums get sticky once shipped.

### Option B — Lane as a separate lightweight table

A new `focus_lanes` (or similar) table: `id`, `focus_item_id` FK, `profile_id`, `kind` (oven /
build / agent / laundry / download / transcription / custom), `started_at`, `reminder_policy`
JSONB, `status` (running/done/dismissed), `pinned_device_id`.

- **Pro:** clean separation of lane-specific metadata (reminder policy, kind taxonomy, device pin)
  from the focus item's own state; `focus_state` stays untouched; a real table gets a real `CHECK`
  constraint on `kind` and can be queried/indexed server-side for reminder evaluation (relevant to
  open question 3) the way JSONB tags cannot easily be.
- **Con:** this is exactly the shape #221's concept doc rejected for *its* Shape (a) and for the
  same reason — it creates a second source of truth that must reconcile with the personal
  `focus_items` row it annotates. Worse here than in #221's case: #221's `shared_focuses` row
  deliberately does NOT own participant state (it only annotates a cluster of independent rows), but
  a `focus_lanes` row here would need to track "is the underlying focus_item still active" to stay
  honest, i.e. two tables describing one truth. Arbitration would also need a cross-table read
  (does this active focus_item have an open focus_lanes row?) on what is today a purely
  single-table, client-side filter (`sidecar/src/data/focus.ts` loads all `focus_items` once and
  does everything — filtering, sorting, arbitration — in JS over that one array, per the `queue`/
  `backburner`/`history` derivation at L433-489).

### Option C — Lane as a tag/attribute on the existing focus item

Generalize the mechanism already shipped for `_off`, `_backburner`, `_parent`, and `_snoozeUntil`:
`tags._lane = { kind, reminderAt, checkpoints: [...] }` (or simply `tags._lane: true` for a v1 that
doesn't yet need reminder metadata). No enum change, no new table.

- **Pro:** this is the cheapest possible option because it's not really new mechanism — it's
  recognizing that `tags._off` **already is a proto-lane** by accident. An off-computer active row
  (`isOffComputer`, L35-37) is *exactly* "running, unattended" — the origin-story bug is the direct
  observable consequence of today's code treating an off-computer row as an ordinary active row for
  arbitration purposes. `isOffComputer` could become one instance of a broader `isLane` check; the
  fix to `pickMostRecentActive` is a one-line filter (`!f.tags?._lane`), mirroring how backburner
  already works as a tag layered on top of `focus_state` rather than a state value itself (§2 table).
- **Con:** `tags` is unstructured JSONB, loaded entirely into client memory and filtered in JS today
  (no server-side index, no `CHECK` constraint on `kind`). That's fine for the current per-profile
  item counts this app operates at, but a reminder-policy engine that needs to ask Postgres "which
  lanes are past their reminder time, across all profiles, right now" (the same shape of question
  the existing `send-focus-push` edge function already answers for other event kinds) is harder to
  serve efficiently against unindexed JSONB than against real columns.

### Recommendation — tag-first now, promote reminder fields to real columns if a server-side reminder engine is needed (Iris)

Ship **Option C** as the v1 shape, for the same reason #221 rejected its own heaviest option: don't
build a second source of truth for something that can be an attribute on the thing that already
exists. Concretely:

1. **`focus_state` stays exactly as it is** (active/paused/completed, plus `browser_profile_status`'s
   separate `'drifted'`). A lane is an `active` focus item with `tags._lane` set — the same pattern
   backburner already established (a `paused` focus with `tags._backburner` set), which keeps the
   state model internally consistent: *lifecycle* stays in `focus_state`, *modifiers on top of
   lifecycle* (backburnered-ness, off-computer-ness, lane-ness) stay in tags.
2. **`isOffComputer` and "is a lane" are related but not identical** — a lane is not required to be
   off-computer (1.2/1.5 prove that), and an off-computer focus is not required to be a lane (a
   paused, backburnered off-computer thing is neither running nor a lane). Recommend `tags._lane`
   as its own boolean/object, independently settable from `tags._off`, with `_off` remaining exactly
   what it is today (a physical-distance signal, not an attention/reminder signal).
3. **Fix the arbitration bug directly.** `pickMostRecentActive` (L66-70) should exclude
   `tags._lane`-marked rows from `currentFocus` contention. This is the actual technical core of
   #224 — everything else in this document is UI, reminders, and analytics built on top of one
   filter change. The lane's own elapsed clock keeps running (`elapsedMsOf` doesn't need to change
   at all — it already computes off `_startedAt` regardless of arbitration outcome), it simply stops
   competing for the single `currentFocus` slot.
4. **If/when a server-side reminder engine is needed** (open question 3 likely forces this), promote
   only the fields that need server-side querying — e.g. add real columns `lane_kind TEXT` and
   `lane_reminder_at TIMESTAMPTZ` directly on `focus_items` (not a new table; a lane has no
   cross-profile identity the way a shared focus does, so it never needs #221's entity treatment) —
   while leaving richer/optional lane metadata (checkpoints, custom labels) in `tags`. This is a
   *column-thin* promotion, one step short of Option B's full table, kept in reserve rather than
   built pre-emptively.

**Rejected as v1:** pure Option A (overloads an already-overloaded enum, more state-machine surface
than the tag approach for the same outcome), pure Option B (reconciliation burden identical to the
one #221 already talked itself out of for a structurally similar reason).

---

## 4. Device-pin-to-lane

The seed doc's own framing: "a device can be PINNED to a lane instead of mirroring the primary" —
turning the liked bug into a setting.

**What already exists to build on:** `browser_profiles.device_settings` (migration 045,
`ADD COLUMN ... device_settings JSONB NOT NULL DEFAULT '{}'`) is already exactly the right kind of
per-device override plumbing — `ContextView.tsx` already reads device-scoped settings from it today
(e.g. `dayResetHour`, L129) to customize what one specific device's Context View renders, on top of
the shared `currentFocus`/`queue` read (L110) every device gets from `useFocus`.

**Proposed shape:** add one more key to that same JSONB — `device_settings.pinnedLaneClientId`
(referencing a `focus_items.client_id`, the same identifier `_parent` already uses for sub-intent
linkage, keeping the "what points at what" vocabulary consistent across features).

**Pin UX:**
- From the pinning device itself (e.g. the kitchen tablet's own Context View settings): "Pin this
  screen to a lane" surfaces the current lanes list (the `tags._lane`-marked active rows) and lets
  the device choose one to lock onto.
- From a primary surface (phone/extension): a lighter path — "Pin [device name] to [lane]" from
  wherever the lane is already visible, useful when the human isn't standing in front of the tablet
  (mirrors how pairing already names a device by display name, per #221's grounding of migrations
  040+045).
- **While pinned:** the device's OWN render swaps `currentFocus` for the pinned lane's row (by
  `client_id`) for display purposes only. It does **not** change what any other device — or the
  arbitration logic itself — considers the primary; the pin is purely a per-device rendering
  override, the same altitude as `dayResetHour`, not a new arbitration input. This is important:
  multiple devices can pin to the same lane (redundant displays) or different lanes simultaneously,
  because lanes, like focuses, are scoped to the profile, not to a device.

**What happens when the pinned lane ends (Iris recommendation):** don't let the pinned device freeze
on a stale "done" screen indefinitely — that's the exact staleness failure Plan 046's Theme 4 (Watch
robustness) already flags as a real bug class ("a never-reopened watch app silently shows stale data
indefinitely"). Recommended behavior: on lane completion, hold the "done" state briefly (long enough
for whoever's near the pinned device to notice — e.g. until dismissed or a short grace window), then
auto-fall back to mirroring the primary focus. If the pinned lane is deleted or never resolves
cleanly (client cleared its tags, lane object vanished), fall back to mirroring primary immediately
rather than showing an error state on what's often an ambient, unattended screen.

---

## 5. Parallelization insight — what the new data actually buys

The seed doc's claim: lane data enables analytics a single-focus model structurally cannot produce.
Three concrete shapes this could take, all derivable from existing `focus_events` machinery
(`start`/`pause`/`resume`/`resolve` interval pairing already exists per `sidecar/src/data/events.ts`
and its `computeIntervals`-style pairing used elsewhere) filtered to `tags._lane`-marked rows — no
new ingestion pipeline required, only new read-side aggregation:

1. **Lane-switch / fragmentation signal.** How many times did the *primary* focus change while N
   lanes were concurrently open? A high switch rate with several open lanes reads differently than
   the same switch rate with zero lanes open — the former may be healthy parallel-task management
   (laundry + a build + coding), the latter may be genuine attention fragmentation. Single-focus data
   alone cannot make this distinction because it has no concept of "what else was running."

2. **Lane neglect.** A lane whose reminder fired and went unacknowledged, or whose elapsed time
   materially exceeds the typical duration for that `kind` (a build lane open 3x longer than this
   user's median build), surfaces as a private, self-facing nudge — never a broadcast metric. This
   deliberately inherits #221's own anti-surveillance stance on drift (§3.3 of that doc: personal
   drift is never shared to a board): lane neglect is the same category of intimate self-signal and
   should never leave the user's own surfaces.

3. **Personal lane-capacity data.** Rather than guessing a global "lane cap," track the point at
   which neglect rate empirically rises for a given user (2 concurrent lanes rarely neglected, 4
   usually one goes stale) — turning open question 1 (lane cap?) from a design guess into a metric
   the system can eventually surface back to the user ("you tend to lose track past 3 lanes").

---

## 6. Plan 046 IA impact (brief — not a rewrite; a different agent owns that plan)

- **Theme 2 (Home/header density)** is already being asked to gate the clock wrapper's reserved
  space on `showClock`/`showCountdown` and to resolve `OtherProfilesStrip`'s full-width dead space.
  A "N lanes running" indicator is a natural candidate for that same header cluster and should be
  designed alongside those decisions, not bolted on after Theme 2 locks its layout — otherwise it's
  a second header-density regression arriving right behind the one Theme 2 is fixing. Separately,
  Theme 2 is already merging `InitiativesPanel`/`ProjectsClientsPanel`; a lanes list is a plausible
  third view in that same panel family (live-parallel, distinct from either existing tree) and is
  worth naming before that panel taxonomy is finalized.
- **Theme 5 (parity-matrix closure)** already tracks sub-intents/backburner/checkpoints as
  data-layer-native-in-Sidecar-but-UI-gap-in-extension items. If lanes ship via the tag-based Option
  C above, lanes become a structurally identical fourth item in that same list from day one — Sidecar
  gets lane UI first (it's where the origin story happened), the extension gets the underlying data
  "for free" per Theme 5's own stated pattern but needs its own render pass. Plan 046 should fold
  lanes into Theme 5's existing framing rather than spawning a separate parity track for it.
- **Theme 3 (device lifecycle)** already owns `device_settings` (migration 045) as a shared surface
  for its device-state-machine work. The `pinnedLaneClientId` addition proposed in §4 extends the
  same JSONB blob Theme 3 is actively redesigning — these two should be sequenced or at least
  diffed against each other so two efforts don't grow incompatible shapes of the same column.

---

## 7. Open questions — with recommended defaults

Each of the seed doc's four unresolved questions, answered with a position, not just repeated.

1. **Lane cap?**
   **Default: no hard cap.** Surface a gentle "N lanes running" indicator once N > 3, informed over
   time by the lane-neglect metric (§5.2/5.3) rather than a guessed number today.
   *Why:* a hard cap fights the insight the whole feature is built on — running laundry + a build +
   a download really is a normal Tuesday. Let neglect data teach the right number per user instead of
   picking one now.

2. **`focus_state` value vs. tag tier?**
   **Default: tag tier** (`tags._lane`), leaving `focus_state` untouched — Option C in §3.
   *Why:* mirrors the precedent backburner already set (an orthogonal tag over `paused`, not its own
   state value); it's the cheapest path to the arbitration fix, and it doesn't add a fifth value to
   an enum that's already inconsistently defined across two files (`sidecar/src/data/focus.ts` vs.
   migration 010).

3. **Reminder policy per lane — time-based or kind-based?**
   **Default: kind-gates-policy, not one global timer.** Timer-shaped kinds (oven, laundry) default
   to a user-set fixed-time reminder; event-shaped kinds (build/render/download, agent task,
   transcription) default to a completion/failure signal instead of a countdown. *Flagged honestly:*
   Tabatha has no native hook into an arbitrary external build/render finishing — that reminder kind
   either needs a manual "mark done" tap or a real integration (a CLI hook, a webhook) to be
   genuinely automatic; this document does not pretend that gap away. Laundry (§1.4) additionally
   proves a single lane may need *multiple* checkpoints, not just one start/end pair — v1 reminder
   metadata should allow an array, even if the UI only ever surfaces one at a time initially.

4. **Does clock/shift time attribute to lanes concurrently, or primary-only?**
   **Default: primary-only for shift/billable time** — no change to today's clock semantics
   (`clockService.js` and shift/work-hours stay keyed to the single arbitrated `currentFocus`/clock
   axis). Lane elapsed time is tracked and shown, but as a separate, clearly-labeled "lane time," never
   silently summed into shift hours.
   *Why:* directly inherits #221's own labeling discipline (§3.2 of that doc: never let a dashboard
   conflate person-hours and elapsed-span without saying which is which) — a lane running while the
   user is off-shift or mid-a-different-primary-focus must not quietly inflate a work-hours total.

---

## Disposition

This is concept-exploration, not a build-ready plan. Next step is Malkio review before any
implementation plan gets numbered — in particular his call on open questions 1-4 above, and on
whether the device-pin-to-lane work (§4) should sequence with or after Plan 046 Theme 3's
`device_settings` redesign. Do NOT build from this doc.
