# Fix Wave 3 — Bug/UX Fixes (not a numbered plan)

**Status:** draft — Koda review next
**Driver:** Malkio · **Author:** Cindra
**Current version:** Sidecar 0.11.0 · Extension 6.7.44
**Migrations:** **none required.** Every item below is satisfiable with schema
that already exists (`browser_profiles.device_settings` JSONB, migration 045;
`profiles.settings` JSONB; existing `focus_items`/`focus_checkpoints`
columns). Migration number **050 is therefore left unclaimed by this wave** —
Plan 043 (Peer View) remains the next real consumer at 051-052, no
renumbering needed across the other three plan docs in this batch.

---

## 1. Context View timer — full digits, count direction, precision

**Current state (verified):** `sidecar/src/lib/theme.ts` —
`formatElapsedMs()` renders coarse units that drop precision as time grows
("6h 12m" once past an hour, "6m" once past a minute, only "42s" stays
second-precise under a minute — never combines all three). `formatTimer()`
(the countdown ring) already renders full `m:ss` digits, so the "never say
'6m elapsed', always full h:mm:ss" complaint is specifically about
**elapsed-mode** display (used both in `ContextView.tsx`'s small meta text
and as the ring's fallback when there's no `remaining` left to count down).

**Fix:**
- `formatElapsedMs()` → replace with a digit-only formatter matching the
  ring's own style: `h:mm:ss` when ≥1h, `m:ss` otherwise — never a bare
  unit-suffix string. Rename to make the contract explicit
  (`formatElapsedDigits`), update both call sites (`ContextView.tsx` meta
  text, ring fallback).
- **Count up vs down (user-configurable):** today `ContextView.tsx` already
  branches on whether `remaining` exists (countdown) vs elapsed-only — this
  is data-driven, not a user choice. Add `profiles.settings.sidecar.cv.countDirection:
  'up' | 'down'` (JSONB, no migration); when `'up'` is chosen for a timed
  focus, the ring always shows elapsed digits climbing even though a
  `timer_minutes` target exists (the target still governs when "over" styling
  kicks in — only the *display direction* changes, not the underlying timer
  semantics). Default preserves current behavior (`'down'` when a target
  exists).
- **Precision config:** `profiles.settings.sidecar.cv.precision: 'second' |
  'rounded_minute'` — `'second'` (new default digit formatter above) vs
  `'rounded_minute'` (today's coarse behavior, kept as an opt-in for anyone
  who preferred the calmer display). Down-to-ms display is explicitly **not**
  offered — the brief says "down-to-ms visibility" as a config *option*, but
  a millisecond-ticking display would force a re-render every frame on a
  kiosk-mode view meant to sit on a TV for hours; propose capping precision
  at whole seconds and flag this cut for Malkio to confirm rather than
  silently dropping it.
- **Files:** `sidecar/src/lib/theme.ts`, `sidecar/src/screens/ContextView.tsx`,
  `sidecar/src/screens/SettingsScreen.tsx` (new CV precision/direction
  controls).

---

## 2. Un-resolve intents

**Current state (verified):** Sidecar's `resolve()`
(`sidecar/src/data/focus.ts` — sets `focus_state:'completed'`,
`funnel_stage:'resolved'`, `completed_at`) has **no inverse anywhere in
Sidecar**. The only reconstruction that exists is `VoiceCheckIn.tsx`'s inline
6-second Undo toast after a *voice-triggered* resolve — not reachable from
the History list, not reusable. **The extension already solved this
correctly**: `src/background/services/focusService.js` (~lines 716-720) has
a confirm-gated reopen path — changing a completed item's stage away from
`'resolved'` requires an explicit `confirmed` flag, returns "This focus is
completed. Confirm to reopen." if not yet confirmed, then sets
`focus_state:'paused'`, clears `completed_at`. Sidecar should port this exact
pattern rather than invent a new one.

**Fix:**
- New `actions.unresolve(id)` in `sidecar/src/data/focus.ts`, mirroring the
  extension's semantics: sets `focus_state:'paused'`, `funnel_stage`→ back to
  whatever pre-resolve stage is inferable (default `'addressing'` if no
  better signal exists — the resolve path doesn't currently preserve the
  prior stage, which is itself a small gap worth closing at the same time:
  have `resolve()` stash the pre-resolve `funnel_stage` into
  `tags._preResolveStage` so `unresolve()` can restore it exactly instead of
  guessing).
- UI: History section in `FocusScreen.tsx` (currently read-only rendering,
  no buttons) gets a restore action per row, with a confirm step (matches
  the extension's `confirmed` gate — this is a destructive-adjacent action,
  worth one tap of friction).
- **Files:** `sidecar/src/data/focus.ts`, `sidecar/src/screens/FocusScreen.tsx`.
  No migration — reuses existing columns.

---

## 3. Edit description of non-active intents

**Current state (verified):** `EditPanel` in `sidecar/src/screens/FocusScreen.tsx`
renders only for `cf` (the single current focus — active, or the one paused
focus pinned as "current"), inside `{showEdit && <EditPanel key={cf.id}
focus={cf} .../>}`. `QueueRow` (non-current queue items) exposes only
switch-to/resolve/priority/stage/backburner controls — **no label or
description edit affordance at all** for anything not currently pinned.
Backburner rows expose even less (resume/snooze/dismiss only).

**Fix:** Extend `QueueRow` (and the backburner row variant) with an
edit-entry affordance (pencil icon → opens the same `EditPanel` component,
parameterized by that row's focus instead of always `cf`). `EditPanel` itself
doesn't need to change — it already takes a `focus` prop; the gap is purely
that only `cf` is ever passed to it today. **Files:**
`sidecar/src/screens/FocusScreen.tsx` only.

---

## 4. Timeline day/week/month separators

**Current state (verified):** `FocusTimeline.tsx` (Context View's node
timeline — checkpoints + focus_events start/resume/extend/backburner nodes)
positions everything via `posOf(t)`, a pure fraction-of-duration mapping
along one continuous axis. This works well for a single sitting but has no
concept of calendar-day boundaries — for a focus that's been backburnered
and resumed across multiple days (exactly the "piecemeal long-running
intents" the brief names), the axis compresses real elapsed calendar time
into one undifferentiated bar, which is the actual complaint: there's no
visual signal that a gap in the timeline was "3 hours later" vs "3 days
later."

**Fix (real design decision, not a cosmetic tweak):** `posOf(t)` needs to
become boundary-aware rather than purely duration-fractional. Compute day
boundaries crossed between consecutive nodes (using the same local-clock
helpers already shipped for schedule nudges, `profileLocalClock`); render a
vertical separator at each crossing, with weight/length keyed to boundary
size — thin/short for a day crossing, medium for a week crossing (first
node of a new ISO week), heavy/tall for a month crossing. Nodes on either
side of a separator keep their existing checkpoint/event iconography
unchanged — only the axis gains boundary markers.
**Files:** `sidecar/src/components/FocusTimeline.tsx` only. No migration —
purely a rendering change over data already fetched.

---

## 5. Phone-off false "phone away" + device type/priority categorization

Two related fixes; the second is the actual fix for the first's root cause.

### 5a. Instant-fire on `hidden` has no heartbeat concept

**Current state (verified):** `sidecar/src/components/PhoneFocusMode.tsx`
(`onVis`, lines 122-144) fires `signal(true)` (writes
`browser_profile_status.metadata = {focusAway:true, awaySince:Date.now()}`)
the instant `document.hidden` becomes true — no debounce, no distinction
between "user glanced away for a second" and "phone genuinely powered off."
The only staleness handling that exists is on the **read** side —
`ContextView.tsx` (lines 130-162) ignores an away signal once `Date.now() -
awaySince > 30*60000` — 30 minutes. That's the false-positive window Malkio
is hitting: a phone that's truly off (screen locked, JS suspended, or
genuinely powered down) still shows the aggressive "put the phone down" nag
for up to half an hour after the last thing it managed to write, because
nothing ever re-confirms "still just away" vs promotes to "actually gone."

**Fix — the "away vs gone" semantic split the brief asks for:**
- **Away** (nag, red banner): `hidden === true` AND a heartbeat was received
  within a short recent window (default 3 min, configurable — this replaces
  the 30-min constant).
- **Gone / ended** (neutral "phone offline" state, no nag, treated as a
  finished session rather than a deviation): no heartbeat received for
  longer than the away window. A phone that's truly powered off cannot run
  JS to say so explicitly — "gone" is inferred by absence, which is the
  correct heuristic (matches the brief's own framing: "likely needs a
  heartbeat-timeout semantic instead of instant fire").
- **New heartbeat write:** `PhoneFocusMode.tsx` gains a periodic write (every
  60s while `document.hidden === false`, plus one final write on the
  visible→hidden transition) touching
  `browser_profile_status.metadata.lastHeartbeatAt`. This is the missing
  half of the picture — today `awaySince` is the *only* timestamp, set once,
  never refreshed, so its own age is being (mis)used as a recency proxy for
  something it was never designed to measure.
- **Consumer change:** `ContextView.tsx`'s staleness check switches from
  `awaySince` to `lastHeartbeatAt`, threshold shrinks from 30 min to a
  configurable `settings.sidecar.cv.awayGraceMin` (default 3), and the
  render branches three ways (active/away/gone) instead of two
  (active/away).
- **Files:** `sidecar/src/components/PhoneFocusMode.tsx`,
  `sidecar/src/screens/ContextView.tsx`. Settings surfaced via existing
  `profiles.settings` JSONB, no migration.

### 5b. Device type/priority categorization

**Current state (verified):** Migration 045 (`045_device_management.sql`)
added `device_settings JSONB NOT NULL DEFAULT '{}'` to `browser_profiles`
explicitly as "v1: plumbing only, no editor UI yet" — the column exists,
nothing writes or reads a device-type concept into it yet. There is **no
device type/category column anywhere** — naming is free-text
(`display_name`/`profile_name`) with no phone/tablet/desktop/watch/
browser-extra enum.

**Fix — no new migration, this is exactly what `device_settings` JSONB was
left open for:**
- Define `device_settings.kind: 'phone' | 'tablet' | 'desktop' | 'watch' |
  'browser_extra'`, set at device-naming time (the existing pairing-time
  naming flow, per the 2026-07-20 progress entry "naming at pairing") — add
  a kind picker to that same screen, plus an editor in the Devices card in
  Settings (closing the "no editor UI yet" gap migration 045 explicitly left
  open).
- **Phone Focus Mode gates on `device_settings.kind === 'phone'`** instead of
  running on any device that happens to run the Sidecar PWA in the
  background — a tablet or an "extra browser" surface (a second desktop
  browser window, per the brief's explicit "tablet/extra browser shouldn't
  trigger phone deviation") stops triggering away/gone signals entirely once
  it's categorized as anything other than `'phone'`.
- Devices paired before this ships have `kind: undefined` — treated as
  `'phone'` for backward compatibility (today's only real-world case) until
  the user re-categorizes via the new Devices-card editor; **not**
  `'desktop'`, since defaulting to "never trigger" would silently disable
  Phone Focus Mode for every existing phone pairing.
- **Files:** `sidecar/src/screens/PairScreen.tsx` (or wherever pairing-time
  naming lives — confirm exact filename at build time), Settings Devices
  card, `PhoneFocusMode.tsx` (gate condition).

---

## Dependencies section

| Depends on | For |
|---|---|
| `browser_profiles.device_settings` JSONB (migration 045, shipped) | 5b |
| `profiles.settings` JSONB (shipped, schemaless) | 1, 5a config |
| Extension's existing confirm-gated reopen pattern (`focusService.js`, shipped) | 2 |
| `profileLocalClock` helper (shipped, `send-schedule-nudges`) | 4 |

No item in this wave blocks or is blocked by Plans 042-045 — all five items
are Sidecar-only, schema-free, and independently shippable.

---

## Parallelability Review

- **Zones touched:** Sidecar only — `sidecar/src/lib/theme.ts`,
  `sidecar/src/screens/ContextView.tsx`, `sidecar/src/screens/FocusScreen.tsx`,
  `sidecar/src/components/FocusTimeline.tsx`,
  `sidecar/src/components/PhoneFocusMode.tsx`,
  `sidecar/src/screens/SettingsScreen.tsx`. No extension-side files, no
  Supabase migrations, no shared 🔴/🟡 files per the ownership table.
- **Conflicts with active worktrees:** none known — this worktree already
  owns `sidecar/`; re-check `git worktree list` before starting.
- **Can run parallel with other work:** Yes — fully isolated, and the five
  items barely overlap each other (only 3 and 5a touch `ContextView.tsx`,
  different regions).
- **Max branch lifetime estimate:** ~3-4 days for all five items; each is
  small enough to be its own commit.
- **Scope-split points:** Not needed — this whole wave is well under a week.
  If split anyway, natural boundary is items 1+4 (display-only) vs 2+3
  (edit/history actions) vs 5a+5b (phone-away, ship together since 5b is the
  real fix for 5a's root cause).

---

## Koda vet + expansion (2026-07-20)

### Verified claims

Spot-checked the highest-risk citations directly; all held up exactly:

- `sidecar/src/lib/theme.ts` lines 46-54: `formatElapsedMs` is confirmed to
  behave exactly as described — `${h}h ${m}m` above an hour (losing seconds),
  `${m}m` under an hour (losing seconds entirely), `${s}s` only under a
  minute. `formatTimer` (line 56) is confirmed already full `m:ss` digits.
  Item 1's characterization is accurate down to the exact output shapes.
- `sidecar/src/components/FocusTimeline.tsx` line 90: `posOf` is real and is
  the fraction-of-duration positioning function described — confirmed it's
  purely duration-fractional today, no day-boundary awareness.
- `sidecar/src/components/PhoneFocusMode.tsx`'s `onVis` handler is confirmed
  to fire `signal(true)` unconditionally on `document.hidden` with zero
  debounce and zero heartbeat concept — the away/gone distinction genuinely
  doesn't exist today.
- `ContextView.tsx`'s stale-away threshold is confirmed hardcoded at exactly
  `30 * 60000` (30 minutes) against `metadata.awaySince` with no
  `lastHeartbeatAt` concept anywhere in the query — item 5a's root-cause
  read is correct, not approximate.
- `focusService.js`'s confirm-gated reopen pattern (extension) is confirmed
  real: `applyStageTransition` returns `{error: 'This focus is completed.
  Confirm to reopen.', needsConfirm: true}` and only flips
  `focusState:'paused'`/clears `endedAt` once `confirmed` is true — item 2's
  "port this exact pattern" instruction has a real, working reference
  implementation to copy.
- No `PairScreen.tsx` exists in `sidecar/src/screens/` (verified via
  directory listing) and no `device_settings.kind` read/write exists
  anywhere in `sidecar/src/` today — item 5b's hedge ("confirm exact
  filename at build time") is honest, not a cover for an unverified guess.
  The actual pairing-adjacent UI is `sidecar/src/components/DevicesCard.tsx`
  (imported and rendered in `SettingsScreen.tsx:637`) — worth naming
  directly rather than leaving it as "wherever pairing-time naming lives,"
  since it's findable now: DevicesCard is very likely where both the
  device-kind picker (5b) and any future pairing-time naming step belong.

### Gap — item 5a's heartbeat write competes with the same PWA suspension it's trying to detect

The proposed fix (60s periodic heartbeat while `document.hidden === false`,
plus one final write on the visible→hidden transition) has a subtle timing
hole: **the write on the hidden transition itself is the last heartbeat a
truly-dying session gets to send**, but if the OS is aggressively suspending
the PWA (screen lock, background tab throttling, iOS Safari's background
JS suspension), that final write is a fire-and-forget network call racing
the process actually being frozen — it may never complete. That's fine and
expected (it's exactly why "gone" is inferred by *absence* rather than an
explicit signal, per the doc's own framing) — but it means the **practical
away-window** a real user experiences isn't the configured 3 minutes, it's
"time since the last heartbeat that actually completed before suspension,"
which could be almost a full interval short of 3 minutes if suspension hits
right after a heartbeat fires. **Not a blocking issue** — just worth setting
expectations that "3 min configurable" is an upper bound on staleness
tolerance, not a promise of exactly-3-minutes freshness, so nobody debugs
a "why did it say gone after 2:40" report as a bug later.

### Verdicts per unit

| Item | Verdict | Notes |
|---|---|---|
| **1 (CV timer digits/direction/precision)** | **PROCEED** | The ms-precision cut (capped at whole seconds) is the right call for a kiosk display — re-rendering every second is already borderline for a TV-mode surface; every frame would be a real perf regression, not just a cosmetic overkill. Confirm the cut with Malkio as the doc already proposes, don't silently ship it either way. |
| **2 (Un-resolve intents)** | **PROCEED** | Reference implementation confirmed real; port is low-risk. |
| **3 (Edit non-active intents)** | **PROCEED** | `EditPanel` already takes a generic `focus` prop — this really is just a wiring gap, not a component redesign. |
| **4 (Timeline boundary separators)** | **PROCEED** | `posOf` confirmed as the correct single edit point. |
| **5a (Phone-away heartbeat)** | **PROCEED, with the timing caveat above noted, not blocking** | |
| **5b (Device kind categorization)** | **PROCEED** | `DevicesCard.tsx` identified as the concrete UI home. |

### Koda additions

- **"Gone" state should be recoverable into the timeline, not just a neutral
  icon.** Item 5a's three-way active/away/gone split is good, but once a
  phone flips to "gone," item 4's new day/week boundary markers on
  `FocusTimeline.tsx` are the natural place to *also* render a small "phone
  went offline here" marker distinct from a checkpoint/event node — these
  two items (4 and 5a) both touch the same underlying "what happened over a
  multi-hour/day gap" story and are worth building with that shared
  narrative in mind even though they're separate files. Concretely: when
  `FocusTimeline` computes its boundary crossings (item 4), it's already
  walking `focus_events` in time order — a `gone`→`active` pair of
  `browser_profile_status` transitions (already written by item 5a's own
  heartbeat logic) could feed the same axis as a distinct short marker,
  giving "here's where your phone was gone for 40 minutes" for free once
  both items ship, instead of two unrelated features that happen to share a
  timestamp axis.
- **Device-kind default should drive Context View eligibility too, not just
  Phone Focus Mode.** Item 5b correctly gates Phone Focus Mode on
  `device_settings.kind === 'phone'`. The same column is a natural gate for
  Context View's existing "auto-switch on large landscape" behavior
  (`ContextView.tsx`, shipped v0.2.0) — a `'watch'` or a small `'tablet'`
  landing in landscape shouldn't auto-promote to the giant kiosk layout
  meant for a TV. Worth a one-line addition to the same PR since the column
  and the picker are already being built: gate CV auto-switch on
  `device_settings.kind IN ('desktop','browser_extra', undefined)` rather
  than purely on viewport dimensions.
- **Un-resolve (item 2) should stamp its own provenance tag**, same
  convention as `_src='dispatch'`/`_src='peer'` elsewhere in this batch of
  docs: `actions.unresolve(id)` should tag `tags._lastUnresolvedAt` (or
  reuse the existing `tags._preResolveStage` stash point item 2 already
  proposes) so a focus that's been resolved-and-reopened multiple times
  has a visible trail in the edit panel, not just silent state flipping.
  Cheap to add in the same commit since the stage-stash mechanism is
  already being built for this item.
