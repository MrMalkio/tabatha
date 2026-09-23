# Nightly Bug-Fix TaskRun — 2026-07-26/27 — Morning Report

**Lead:** CeeCee (night-shift orchestrator). **Builder:** Wren (Sonnet). **Review:** Koda (Sonnet, BLOCK → resolved).
**Umbrella:** Asana `1216901353416524` · **Builder subtask:** `1216901353380327`

---

## The one thing to know

**Quiet night, as designed.** The vetted queue was empty and every release channel
re-verified healthy. I worked one explicitly-filed, docs-only chore and left everything
architectural alone.

There is **one new decision** for you, at the bottom: plan numbers **039, 040 and 041 are
each used twice** in the registry. That is a Headbox Rule 9 violation nobody had noticed —
including the chore that sent me looking.

---

## Queue status — empty, and verified as empty

`docs/taskrun/nightly-bugfix-queue.md` does not exist. Per last night's pattern I did not
treat the missing file as proof, and checked Asana directly:

- Newest task in Flux Development is `2026-07-25T21:06:21Z` — it **predates last night's
  run**. Nothing has been filed since.
- No new feedback-widget submissions (🐛/💡). The only recent one,
  `1216867448639741`, is still the agent-generated E2E test from the 07-24 run.
- The one remaining `*queue*.md` (`2026-07-22-queue.md`) has TR-01–TR-19 closed
  2026-07-23 and TR-20 fixed 2026-07-25.

So: nothing unworked. Per the charter this was a "skip quietly" night.

## Release channels — re-verified, no regression

Last night found the fleet had silently rolled back. I re-checked before doing anything
else, cache-busted:

| Surface | Reads | Status |
|---|---|---|
| Fleet enterprise channel (jbdka) | `update.xml` → **6.7.78** | holding — the new preflight guard did its job |
| Fleet CRX | `Cr24`, **556,353 bytes** | byte-identical to last night's record |
| Staff channel (`update-channel/latest.json`) | **6.7.78** | ✓ |
| `/`, `/show/`, `/download`, `/docs/`, `/sidecar/` | all **200** | ✓ |

One false alarm of my own, recorded so it is not re-investigated: I probed
`/enterprise/latest.json` and got 18,914 bytes of HTML. That is not a broken artifact —
that path never existed; the staff manifest lives on the `update-channel` git branch.

The companion manifest at `/desktop/latest.json` still reads **0.2.1**. That is the
already-tracked open item T1c (`1216867448241331`), not a new find.

---

## Shipped — commit `6362467` (docs-only)

Chore `1216904312614852`, filed during your 2026-07-25 intake.

**Four feature numbers were each used by two docs.** The earlier-created file keeps its
number; the later one was reassigned:

| Keeper | Renumbered | New |
|---|---|---|
| `184-checkpoint-progress-notes` | `184-persistent-focuses` | **225** |
| `185-popup-harmony` | `185-focus-auto-resume-queue` | **226** |
| `186-context-link-indicator` | `186-asana-focus-linking` | **227** |
| `215-comprehensive-hotkey-coverage` | `215-body-doubling` | **228** |

Renamed with `git mv` so history follows. Every cross-reference was re-pointed only after
confirming which of the two features it actually meant — a bare `#184` was genuinely
ambiguous in several places.

**225–228 rather than the obvious next numbers**, because #220, #221 and #224 are already
claimed by open Asana tasks (Session Aggregation, Clock backdate, Thought Lanes), and the
gap at #160 may be a withdrawn feature whose old references would resurrect.

**A contradiction Koda caught.** `FEATURES-REFERENCE.md` had one row covering
"Persistent Focuses / Checkpoint Progress Notes (#184)" marked **WORKING** — but all of
its evidence is CPN, and its "both `184-*.md` docs" clause was dead the moment the files
were split. Left alone, the file would have asserted Persistent Focuses works while the
registry (edited in the same commit) said it was unassigned. Split into #184 CPN
(**WORKING**, keeps the evidence) and #225 Persistent Focuses (**NOT FOUND**). Verified:
no ongoing / "done for today" / dynamic-preset lifecycle exists anywhere in `src/`, and
plans 025 and 031 shipped the CPN half only.

**Plan registry:** the stray plan-046 row moved into the plan table, and
`Next available number` corrected **046 → 047** — which unblocks the sync-architecture
plan that was waiting on a free number.

**New drift lint** — `npm run check:docs` (`scripts/check-doc-registry.mjs`). Fails on
duplicate feature numbers and on a stale next-available pointer. Deliberately **not**
wired into `prebuild`: it warns rather than fails on duplicate *plan* numbers, because
three of those exist right now and hard-failing would wedge your build tonight.

I proved the lint instead of asserting it: injected a colliding feature file → exit 1;
set the pointer to a stale value → exit 1; restored both and confirmed a clean pass.

**Gates:** 768/768 tests, `check:docs` green, working tree clean, no `Co-Authored-By`.

### No version bump — stating it, since the standing rule is bump-every-commit

Docs-only; no extension source changed. Same call and same reason as last night: a staging
bump would mint a **6.7.77 that collides with the existing unmerged 6.7.77** on
`fix/sync-integrity-cluster`. Flagging rather than letting it look like an oversight.

---

## Left deliberately untouched

- `v0_legacy/docs/features.md` still shows the old numbers — project rule says legacy is
  reference-only, do not modify.
- `.headbox/parking_lot.md:305` still names `184-persistent-focuses.md` inside a
  2026-05-19 entry recording what was on disk that day. That is a historical fact, not a
  navigation pointer, and the parking lot is append-only.
- `.gemini/agent.md:181` — a 2026-05-26 session-log line reading "enriched existing
  features (#184, #188, #192)". Genuinely ambiguous which #184 it meant. Low stakes; left
  as-is rather than guessing.

---

## Open for you

`docs/taskrun/2026-07-26-questions.md` — one new question (duplicate plan numbers), plus
last night's two, both still unresolved.

## Queue position

Nothing pending. Next run resumes from whatever the triage agent files.
