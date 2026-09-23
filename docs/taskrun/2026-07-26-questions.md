# Morning Questions — 2026-07-26/27 Nightly TaskRun

One new question. Two carried forward from last night, both still unresolved.

---

## Q1 ⭐ NEW — Plan numbers 039, 040 and 041 are each used twice. Which line keeps them?

**The decision:** which of each pair keeps its number, so I can renumber the other and
update its references.

| # | Claimant A (earlier) | Claimant B (later) |
|---|---|---|
| **039** | `cortex_program` — Cortex PROGRAM MASTER (2026-07-09) | `tabby_sidecar_mobile` (2026-07-17) |
| **040** | `cortex_phase1` (2026-07-09) | `sidecar_voice_timeline_tasks` (2026-07-18) |
| **041** | `cortex_phase2` (2026-07-10) | `tabby_watch` (2026-07-18) |

**Why it needs you and not me:** both lines are live, heavily cross-referenced work, and
both are referred to by number in specs, Asana tasks, session logs and progress entries.
Picking a winner is a judgment call about which line's identity is more expensive to
move — not a mechanical fix — so per the overnight charter it stays a decision, not code.

**My read, if you want a default:** the Cortex block (039–045) is a contiguous numbered
program where the numbers carry meaning (Phase 1 = 040, Phase 2 = 041 …). Breaking it
would cost more than renumbering the three Sidecar/Watch plans, which are independent.
That would make them 047, 048, 049 — after which the pointer moves to 050. Say the word
and I'll do it in one pass.

**What I already did around it:** `npm run check:docs` now detects and prints these three
collisions on every run as a `KNOWN DRIFT` warning, so they cannot quietly persist. It
warns rather than fails precisely so it doesn't wedge your build while this sits open.

**Note:** the chore you filed (`1216904312614852`) flagged only the stale pointer. The
duplicate plan numbers are a separate, larger drift I found while fixing it.

---

## Q2 (carried from 2026-07-25) — Merge `fix/sync-integrity-cluster` (6.7.78 source) into `staging`?

**Still open.** `staging` source remains **6.7.76** while every distribution channel —
fleet, staff, your local `dist/` — serves **6.7.78**. Re-verified tonight: the channels
are healthy and holding, so nothing is broken; but `staging` still cannot rebuild what
your fleet is running, and the next release cut from `staging` would regress the clamp
fixes unless this merges first.

Branch integration is a Global Rule 3 human-approval gate, so I did not do it.

This is also why tonight's commit carries no version bump — see the report.

---

## Q3 (carried from 2026-07-25) — "brand-faithful to v6.7.73" on `/show`

**Still open, still low stakes.** One of three whenever convenient: (a) leave it,
(b) let me auto-stamp it with the nav badge, or (c) I reword it to something that does not
rot. It appears 7 times and reads as a claim about which release the mockups actually
reproduce, so auto-stamping would make the page assert freshness the mockups may not have.

No work is blocked on it.

---

## Not a question, just so you see it

The nightly queue was legitimately empty again — verified against Asana, not just the
missing file. All release channels re-verified healthy before any work started; last
night's fleet restoration is holding and the new preflight guard has not had to fire.
