# Nightly Bug-Fix TaskRun — 2026-08-14 — Morning Report

**Lead:** CeeCee (night-shift orchestrator). **Builders dispatched:** 0.
**Umbrella task:** none — empty-queue run per the charter. **Product code touched:** none.

Short by design. The 08-12 report settled *why* the queue is empty and the 08-13 report re-verified
it; this run adds only what is genuinely new. One small deliverable came out of it (§3).

---

## 1. Queue: empty (5th consecutive night) — strongest proof yet

| Check | Result |
|---|---|
| `docs/taskrun/nightly-bugfix-queue.md` | Absent — designed behaviour (triage agent writes nothing when there is nothing) |
| `feedback-review-6h` triage agent | **Ran 3 minutes before this run** — `lastRunAt 2026-08-14T15:10:53Z` vs this run at `15:13:51Z`; `enabled: true`, next `16:03Z`. It looked and wrote nothing. This is the tightest possible proof that empty means empty, not stale. |
| Asana Flux Development, open tasks | No new `🐛 [bug]` tasks. Only the known set: B09, B10, and `1216832543077901` (fixed + verified live, still open — yours to close) |
| `docs/taskrun/2026-07-22-queue.md` | TR-01…TR-20 all still accounted for |
| Git | One new commit since the last run — Malkio's own, see §2 |

**Schedule note (minor):** this run fired at 15:13Z ≈ 11:13am ET, not the 10pm cron slot. The
regular nightly slot for 08-14 is still ahead at `2026-08-15T02:04Z`, so tonight's run will fire
normally and write `2026-08-15-morning-report.md`. No action needed; flagging so two reports in one
day don't read as a duplicate.

---

## 2. New since last run: Malkio escalated B10 (evidence, not a decision)

Commit `112efb2` (Malkio, 08-13 12:09 ET) added a **second confirmed repro — dashboard.stripe.com**,
with paired shown/hidden screenshots: entire left nav gone from the viewport, and the "Pause payment
collection" modal clipped so its **Cancel/Pause buttons are off-screen**.

That raises the impact class. On Asana it displaced chrome; on Stripe the user can neither complete
nor safely abandon a billing action. Two independent fixed-shell SPAs broken identically confirms
this is the general case for that architecture.

**It does not unblock the build.** The escalation is evidence, not an answer — Q1 (which fix
direction) is still open, and it is still a product decision I am not authorised to make at 3am.
B10 is now a HIGH bug parked on a single unanswered yes/no for the 5th night.

---

## 3. One deliverable: interim workarounds for B10 (docs-only, decision-free)

Given the escalation, I checked whether anyone is actually *stuck* while the decision is pending.
They are not. Two escape hatches already exist in shipped code — both read out of source, not
assumed — now written into `docs/features/B10-inbar-breaks-page-layout.md`:

- **Collapse the bar to its nub.** `collapse()` (`src/content/inbar.js:1181`) calls `pushPage(0)`,
  which takes the `else` branch and **removes the `transform` outright** plus zeroes the margin —
  host layout fully restored, immediately. **Limit:** `isCollapsed` is a per-injection local
  (`inbar.js:72`), so it resets on every page load and SPA re-injection. A per-pageview click, not a
  setting.
- **Global off.** Settings → Intent Bar (InBar) → "Show Intent Bar on pages" (`inbarEnabled`,
  `src/settings/index.jsx:1637-1639`). Durable but all-or-nothing.
- **Negative finding:** switching `inbarPosition` top↔bottom does **not** help — `pushPage` sets the
  transform at `inbar.js:156-157`, *before* the position branch. The obvious "just move it to the
  bottom" guess is a dead end; worth knowing before the fix work starts.

The gap this exposes — no per-site disable, and collapse doesn't survive navigation — is worth
folding into whichever fix direction you pick.

---

## 4. Morning questions — all four carried forward, none answered

Verified, not assumed: no human reply on any of the four tasks since the last run. Malkio's B10
commit is evidence, not an answer to Q1.

- **Q1 — B10 fix direction.** Accept option 2/(A) (InBar floats as a viewport-fixed overlay, never
  mutates host layout, costs ~28px overlap), or keep pushing the page and accept one broken site
  class? Trade-off table in `docs/features/B10-inbar-breaks-page-layout.md`. *(`1217337196357650`)*
- **Q2 — B09 approach.** Combined `SET_INTENT_AND_ASSIGN` handler, or `SET_INTENT` + `skipBridge`
  flag + explicit link? One word unblocks a builder. *(`1216897421002963`)*
- **Q3 — uncommitted registry edit.** Plan numbers 039/040/041 (Cortex line) or 047/048/049? Still
  untouched in your tree; the `||` markdown corruption and unverified migration-ledger rows wait
  behind it. *(`1216900494891551`)*
- **Q4 — tester onboarding.** Ship `1216785813352945`, or accept empty nights by design until you do?

Both product bugs remain fully specced with root cause, file/line pointers and acceptance criteria.
Neither is buildable unattended: each needs a design decision, and both have acceptance criteria
that are live-browser InBar interactions the charter keeps me out of. Correctly parked, not stalled.

---

## 5. Standing recommendation (unchanged, not repeated at length)

Pausing the `nightly-bugfix-taskrun` schedule until tester onboarding ships remains the sensible
call — five consecutive nights have each spent a run slot confirming the same empty input. Reasoning
in full in the 08-13 report §"One new recommendation". It is a standing-config change, so per
charter §1.2 it is **yours to make, not mine** — flagged, not done. Answering Q4 makes it moot.

---

## Verification summary

- **Builds run:** none needed — no source change. The only edit is a docs section.
- **Files changed:** `docs/features/B10-inbar-breaks-page-layout.md` (interim-workarounds section),
  this report. Docs-only → no version bump, matching the `docs(taskrun):` / `docs(bugs):` precedent.
- **Proof standard:** every §3 claim is a line-number citation read out of source this run, not
  inference. No claim of live-browser behaviour is made — that verification is still Malkio's.
- **Koda interventions:** none — no browser or authed-UI work required.
- **Asana:** no new comment posted. Everything true tonight is already on the four task threads;
  a 5th "still empty" comment would be noise. The §3 workaround note is the one new thing and it
  lives in the B10 doc where the fix work will start.
- **Left untouched deliberately:** `.headbox/plan-registry.md`, `.headbox/config.md` (uncommitted,
  gated behind Q3); `atlas/` (untracked, unrelated); all Asana board state.

## Queue position

Empty — nothing consumed. Next run resumes at Q1/Q2 once answered, or at whatever the feedback
widget delivers once there are testers behind it.
