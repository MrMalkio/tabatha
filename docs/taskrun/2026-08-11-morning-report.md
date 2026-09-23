# Nightly Bug-Fix TaskRun — 2026-08-11 — Morning Report

**Lead:** CeeCee (night-shift orchestrator). **Builders dispatched:** 1 (Rook, read-only Asana recon).
**Umbrella task:** none created — per the precedent set 2026-07-27/28, a skip-quietly night is
recorded here and as a comment on the affected task, not as a new umbrella.

---

## The one thing to know

**The queue was empty again — but this time the night was not empty.** I found three things worth
your attention, and **one of them is sitting uncommitted in your working tree right now and should
not be committed as-is.**

I shipped **no product code.** Per the charter this was a skip-quietly night. What I did instead was
kill a wrong answer before it cost you a regression: **B10's written root cause was incorrect, and
its recommended fix would have reintroduced the exact bug it was meant to replace.**

You owe this run **two decisions**. Both are stated at the bottom, both have the work already done
underneath them.

---

## 1. Queue status — empty, verified three ways

`docs/taskrun/nightly-bugfix-queue.md` **has never existed in git history** (`git log --all` on that
path returns nothing). Following the pattern the prior runs established, I did not treat an absent
file as proof of an empty queue — the triage agent only writes it when it finds something, so absence
is ambiguous between "nothing filed" and "triage never ran". Checked each source directly:

**1. Asana, queried directly** (Rook, read-only, `asana-cli` against Flux Development
`1214031898449333`). Nine tasks created since 2026-07-27, dates individually confirmed via
`stories list` rather than inferred from GID order (GID order in this project is **not** chronological
— verified with a direct counterexample). Of those: two are feature/architecture specs (#222 Notes,
#220 harness hooks), two are Malkio-assigned infra/billing items, two are the prior run's own
artifacts, one is a decision task, one is B10 itself, and one is a docs-only chore (see §3).
**Nothing from an automated triage agent.**

**2. `docs/taskrun/2026-07-22-queue.md`** — TR-01…TR-20 all appear as worked/closed across the
07-22 → 07-25 morning reports. No leftover unworked items.

**3. Feedback-widget intake** — the `🐛`/`💡` tagged tasks are Sidecar feedback-pipeline QA data;
three of four are explicitly self-labelled test records ("This is a test bug report",
"[QA TEST — ignore]"). No genuine user-submitted bugs pending.

> **Standing gap, now 2 weeks old:** the nightly triage agent has produced no queue artifact — file
> or task — since **2026-07-27T02:12Z**. Three consecutive runs have now had to reconstruct the queue
> by hand. That is a broken upstream, not a quiet backlog. **Morning question #2.**

**Coverage limit, stated honestly:** the Asana CLI's `--query-json` path is broken through its
`.cmd`→PowerShell→python arg chain (any JSON with embedded quotes is mangled before `json.loads`),
which blocks `opt_fields` and pagination. The project has >100 incomplete tasks; the CLI returns a
100-row page with no offset. §1's list is a thorough targeted spot-check, **not** a guaranteed-complete
enumeration. Logged as a tooling defect worth fixing.

---

## 2. B10 — root cause was wrong, and the recommended fix was dangerous

This is the substantive find of the night.

**B10** (InBar displaces host-page layout; confirmed by you on `app.asana.com` 2026-08-10, HIGH) was
written up as: the `transform: translateZ(0)` on `<body>` "was added as a paint/stacking workaround",
therefore **fix direction 1 = drop the transform entirely**.

**That premise is false.** `git blame` puts the line at commit **`8aa2d0b`** (yours, 2026-07-16,
v6.7.20). The comment it shipped with — still in the file at `src/content/inbar.js:149-154` — states
the containing-block behaviour is the *deliberately chosen mechanism*:

> Setting a transform on `<body>` makes body the containing block for its fixed descendants, **so they
> move down/up with the pushed content instead of staying pinned under the bar.**

The transform exists **specifically to fix fixed-position SPA shells** — the very class of site B10
now breaks. It is not vestigial and not a repaint hack.

**So deleting it is not a free win — it is a swap of one HIGH bug for another:**

| Option | Asana-class sites (fixed shell, offset body) | Sites `8aa2d0b` fixed (fixed header) |
|---|---|---|
| Transform ON (today) | ❌ shell displaced / off-screen | ✅ header moves with content |
| Transform OFF (old option 1) | ✅ shell correct | ❌ header hidden under the bar |

Had this run "just fixed the one-liner", it would have shipped a silent regression onto an
overlapping set of sites, unverifiable at 3am without cross-site browser testing. **This is exactly
the case the charter's small-safe-verified rule exists to catch**, so I stopped and escalated instead.

**Also corrected:** the doc suspected the body styles leak on teardown. They largely don't — the
collapse path calls `pushPage(0)` (`inbar.js:1190`), removing `transform` and zeroing the margin.
Residue is cosmetic (`transition` + a `margin: 0px !important` declaration persist). Not the defect.

**Recommendation on the record: option 2** — stop mutating host layout at all; float the bar as a
viewport-fixed overlay in its own shadow host. It is the only direction that resolves both broken
states instead of trading between them. Cost: the bar overlaps ~28px of content rather than
displacing it.

`docs/features/B10-inbar-breaks-page-layout.md` is updated with all of the above, option 1 struck
through, and the trade-off table inline.

---

## 3. ⚠️ Uncommitted work in your tree that should not be committed as-is

`git status` shows `.headbox/plan-registry.md` and `.headbox/config.md` modified but **uncommitted**,
dated ~2026-08-08 (not mine — I touched neither). Two problems:

**a) The markdown is corrupted.** Every added or modified table row carries a **doubled leading pipe**
(`|| 047 | tabby_sidecar_mobile …`, `|| 025 | 025_cortex_surface_voice.sql …`) instead of `|`. That
breaks the table render across the plan table *and* the whole migration ledger — roughly 25 rows.

**b) It unilaterally resolves a decision that is explicitly yours.** The edit renumbers plans
**039/040/041 → 047/048/049**. Asana task **`1216900494891551`** — *"DECISION: plan numbers 039/040/041
each used twice — which line keeps them?"* — is still open and says that call is yours. The
uncommitted edit picks a side without recording why.

**I left it completely untouched.** Fixing the pipes would have meant committing the renumbering
decision along with them, and Headbox Rule 13 plus the charter both put a flagged human decision out
of an unattended run's reach. This is also why I did **not** take Asana task `1217173340445344`
(registry collisions + stale migration table + stale version) even though it was the night's cleanest
small-fix candidate — it is the same work, already half-done and entangled with your pending decision.
Doing it would have produced a conflict, not a fix.

---

## Morning questions (2 decisions, both fully prepared)

**Q1 — B10 fix direction.** Accept **option 2** (bar floats as an overlay; never mutates host layout;
costs ~28px of overlap on every site), or keep pushing the page and accept that one of the two site
classes stays broken? Root cause, blame trail, trade-off table and rejected alternatives are all
written into the bug doc — this is a yes/no on option 2, not an investigation.
*(Asana `1217337196357650`.)*

**Q2 — the uncommitted registry edit.** Three sub-parts, in order: (i) do the plan numbers 039/040/041
stay with the Cortex line or move to 047/048/049 (Asana `1216900494891551`)? (ii) once you've said,
the `||` corruption needs fixing before that file is committed — happy to do it on a following run;
(iii) the migration ledger rows 025–060 are recorded as "present on disk, remote status not verified"
— they should be verified against the live Flux project rather than left ambiguous.

**Not a question, but flagged:** the nightly triage agent has been silent for 14 days. Worth deciding
whether to repair it or retire it — three runs in a row have hand-rolled the queue.

---

## Verification summary

- **Product code touched:** none. **Builds run:** none needed (no source change).
- **Files changed:** `docs/features/B10-inbar-breaks-page-layout.md` (root-cause correction),
  this report. Docs-only — no version bump, matching the precedent of the two preceding
  `docs(bugs):`/`docs(taskrun):` commits.
- **Evidence for the B10 finding:** `git blame -L 148,165 src/content/inbar.js` → `8aa2d0b`
  (2026-07-16); comment at `src/content/inbar.js:149-154`; teardown at `inbar.js:1190`.
- **Queue emptiness:** verified three ways (§1), with the Asana coverage limit stated explicitly.
- **Koda interventions:** none — no browser/authed-UI work was required this run.
- **Left untouched deliberately:** `.headbox/plan-registry.md`, `.headbox/config.md` (uncommitted,
  not mine, decision-gated); `atlas/` (untracked, unrelated).

## Queue position

Queue empty — nothing consumed. Next run resumes at whatever triage files, or at Q1/Q2 once answered.
