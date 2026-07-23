# Feature #224 — Thought Lanes

**Naming:** CONFIRMED by Malkio 2026-07-22 — "Lanes" over "Threads."
**Status:** concept — framing confirmed, awaiting concept-exploration pass
**Source:** Malkio voice dump, 2026-07-22 (turkey-in-the-oven moment)
**Candidate north star** for the attention suite — Malkio explicitly flagged this
as a possible framing for "what the platform actually does."

## The insight (origin story, preserved)

Malkio was working multiple tasks in the browser while a turkey cooked in the
oven — tracked as an off-computer focus. A sync break made his tablet Sidecar
keep showing the *turkey* timer instead of mirroring his browser focus — and
that "bug" was BETTER: he wanted to see the background thing's clock still
running while his hands and eyes were elsewhere.

## The model

- There is still exactly **one primary lane** — where the user's hands/eyes/
  attention are. Nothing about the single-current-focus doctrine changes.
- But real life runs **secondary, tertiary, n-ary lanes**: things genuinely IN
  PROGRESS (not parked, not backburnered — *running*) that the user is not
  actively attending. The oven. A long build. A render. Laundry. An agent
  working a task.
- Each lane functions almost like the focus lane: its own timer that keeps
  proceeding, its own context, reminder-worthiness ("check the turkey"),
  visibility on ambient surfaces (a tablet lane view, Context View).
- Distinct from **backburner** (deliberately NOT running; paused intent) and
  from the **queue** (not started). Lanes are live parallel work.

## Why it's core, not a gadget

The system's mandate isn't only "where is the user's attention" — it's
"everything the user is doing, and HOW they parallelize." Lanes give Tabatha
the data to show what a user parallelizes well vs badly (lane-switch
frequency, lane neglect, overrun reminders) — attention-management insight no
single-focus model can produce.

## Immediate connections (weave-in map)

- **Fix Wave/backburner complaints** — his "can't backburner a focus" friction
  is partly lane-hunger: some "backburner" wishes are really "demote to lane."
- **Sub-intents / _parent** — existing nesting is a natural lane seed.
- **Off-computer focuses** — already lane-like (turkey WAS one); lanes
  generalize them.
- **#221 Shared Focuses** — an agent working your task is a lane with a
  non-human operator; the lane model and the participation model should share
  vocabulary.
- **Context View / Sidecar** — ambient surfaces are where lanes shine
  (tablet = lane board). The "sync bug he liked" becomes a setting: a device
  can be PINNED to a lane instead of mirroring the primary.
- **Cross-surface arbitration** — pickMostRecentActive stays the primary-lane
  arbiter; lanes formalize why multiple actives may legitimately coexist.

## Open questions (for the concept pass)

1. Lane cap? (cognitive honesty vs flexibility)
2. Is a lane a focus_state ('lane'/'running_background') or a tag tier?
3. Reminder policy per lane (time-based? kind-based — oven vs build?)
4. Does clock/shift time attribute to lanes concurrently or primary-only?
5. ~~Naming: Thought Lanes vs Threads vs Lanes~~ — RESOLVED: Lanes (2026-07-22).

## Disposition

Roadmap-level: slot a concept-exploration pass (Soren-style, like #221) before
any build; candidate to reshape Plan 046's information architecture and the
Sidecar/Context View surfaces. Do NOT build from this doc.
