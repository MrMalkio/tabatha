# Feature #221 — Shared Focuses & Org-Level Context (Team Context View / Master Dashboard)

**Status:** concept — under active conceptualization (CeeCee + Opus track, 2026-07-21)
**Source:** Malkio voice brain-dump, 2026-07-21
**Related:** #216 Peer View (Plan 043 — 1:1/peer visibility), #220 task-sync provider
abstraction (Asana/Anasa task → focus pull-in), Olympus (org/capability admin),
Context View (Sidecar 0.2.0+), Plan 043 U1 (view codes/expiry/element visibility)

## The idea (as told)

Today the entire system is individual-focus-based. The TV/Context View use case
already shows *one person's* current work on a big screen. The team version:

1. **Office board** — a page that shows what *everybody* is working on (he notes
   this is partially scoped elsewhere — Peer View is the adjacent scope, but Peer
   View is peer-to-peer visibility; this is an org-level board).
2. **Shared focuses** — when more than one person (or agent) is working on the same
   task/focus (e.g. a focus created from an Asana/Anasa task), that focus should be
   **organization-level context**, not N private copies. Track who is working on
   the same thing.
3. **Master dashboard** — real time, per participant: who is doing what, their
   activity, time spent — across e.g. 2 humans + 4 agents on the same epic /
   main focus / sub-focuses. Visibility tiers:
   - **Private** to the organization manager;
   - **Internal** version everyone in the org can see (e.g. on a wall screen /
     Context View, opt-in);
   - possibly a **public** version.

Agents count as participants — the fleet already works Asana tasks; a shared focus
should be able to show agent activity alongside human activity.

## Why it's coherent with the existing architecture

- Org layer already exists (organizations/teams, migrations 001+, invite kinds,
  org-as-capability-flag decision).
- Task→focus already exists one-way per person (#220 Asana PAT sync); a shared
  focus is the natural join point (same external task ⇒ same org focus).
- Context View is already a view-only remote surface with device settings; a team
  board is "Context View, plural."
- focus_events is the action log — per-participant activity/time is derivable.

## Explicitly NOT decided yet (the concept track's job)

Use cases and personas; data model (org_focus vs link table over focus_items);
privacy defaults (who sees whose time); relationship/merge boundaries with Plan 043
Peer View and Olympus; realtime fan-out costs; whether this is a new plan, an
extension of 043, or a v2 of Context View.

## Next step

Concept exploration doc (CeeCee + Opus agent) → use cases, model sketch, tier map,
open questions → Malkio review → then plan/extension decision. Board task tracks it.
