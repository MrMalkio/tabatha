# Nightly Bug-Fix TaskRun — 2026-08-21 (night of 08-20) — Morning Report

**Lead:** CeeCee (night-shift orchestrator). **Builders dispatched:** 0.
**Umbrella task:** none — empty-queue run per the charter. **Product code touched:** none.

Queue empty for the **12th consecutive night**. Standing reasons are unchanged from the 08-12 →
08-20 reports and are not repeated here.

**The headline:** the last two reports proved the feedback intake path was alive but could only
evidence the **last 24 hours**, because Supabase drops edge logs after ~1 day. That caveat is now
**permanently retired**. Asana keeps the full history, and the broker stamps every task it creates
with a unique fingerprint — so tonight's census covers the pipeline's **entire lifetime**, not a
window. The result is sharper than expected and it changes what Q4 is asking. (§2)

---

## 1. Queue: empty (12th consecutive night)

| Check | Result |
|---|---|
| `docs/taskrun/nightly-bugfix-queue.md` | Absent. Re-confirmed absent in **all five** worktrees (main, `home-header-fix`, `pair-code-expiry`, `reconcile-6770`, `tabby-sidecar-mobile-46c612`) |
| `feedback-review-6h` triage agent | Ran **65 minutes before this run** — `lastRunAt 2026-08-21T00:59:42Z` vs this run `02:04Z`; `enabled: true`, next `2026-08-21T04:03Z`. Looked, wrote nothing (designed behaviour) |
| Asana Flux Development, open tasks | Re-enumerated (100-limit, sorted by creation). **No new `🐛 [bug]` tickets.** Newest task of any kind on the board is `[NIGHTSHIFT 3.5] Crew instance — Flux` (`1217515283942028`, 2026-08-16) — not a bug. Newest bug ticket remains B10 (`1217337196357650`, 2026-08-10) |
| `docs/taskrun/2026-07-22-queue.md` | TR-01…TR-20 all accounted for; re-scanned for `TODO` / `UNWORKED` / unchecked boxes — **zero hits** |
| Git | No new commits since the last run (`f690a10` is HEAD); tree unchanged — `.headbox/config.md`, `.headbox/plan-registry.md` still modified-uncommitted, `atlas/` still untracked |

**Schedule note:** regular 10pm-ET slot (`02:04Z`), on cadence.

---

## 2. NEW — the complete lifetime census of the feedback pipeline

### How this was made airtight

`supabase/functions/feedback-to-asana/index.ts:139-152` builds every task it creates the same way:

- **Title:** `` `${emoji} [${kind}] ${text.slice(0,80)}…` `` — `🐛` for bugs, `💡` for ideas.
- **Notes:** always contain the literal line `— Submitted from Tabatha —`.

That notes line is a fingerprint no hand-filed task carries. A full-text Asana search for it,
**across every project, completed and incomplete**, returns every task the broker has ever created —
with no dependence on log retention. That is the census below.

### Every feedback submission that has ever reached the board

| # | Created | Task | What it was |
|---|---|---|---|
| 1 | 2026-07-18 17:02Z | `1216679002855862` 🐛 `[QA TEST — ignore] Rook QA blitz probe…` | **agent test** (Rook) |
| 2 | 2026-07-20 12:59Z | `1216712939534243` 🐛 `This is a test bug report` | **test** |
| 3 | 2026-07-20 12:59Z | `1216712694759006` 💡 `This is a test feature request.` | **test** |
| 4 | 2026-07-20 13:03Z | `1216713224519004` 🐛 `AThis is a test of a very long bug report…` | **test** |
| 5 | 2026-07-23 18:26Z | `1216832543077901` 🐛 `Pauses resumes … should be in the timeline log` | **the only genuine report** |
| 6 | 2026-07-25 03:18Z | `1216867448639741` 💡 `[E2E test] Vail platform review` | **agent test** (Vail) |

**Six tasks, ever. Five of them are the fleet testing its own plumbing.** Exactly one is a real
report — #5 — and it was fixed and verified live (still open on the board; yours to close).

### Three findings that follow

**(a) The drought is 28 days, not 12 nights.** The last submission of *any* kind was 2026-07-25
(27 days ago). The last *genuine* one was 2026-07-23 — **28 days ago**. The nightly run only started
reporting an empty queue on 08-09; the intake had already been silent for a fortnight before the
streak began. The streak is a symptom that started late, not the thing that started.

**(b) The 24h caveat is gone.** The 08-18 and 08-19 reports each had to say "this proves the last
day, not the last ten nights." This census proves the whole lifetime. There is no longer any live
hypothesis in which submissions are being made and lost — six were made, six landed, zero since
07-25.

**(c) The one real report came from the phone, not the extension.** #5's notes read
`surface: sidecar_android_web`, `version: 0.13.7`, `url: /sidecar/`. The single piece of organic
feedback Tabatha has ever received arrived through the **Sidecar mobile PWA**, not the Chrome
extension — the surface that is already installable by URL with no onboarding gate. Every extension
submission on record is a test.

**What this does to Q4.** It stops being "should we ship tester onboarding?" and becomes something
more specific: the extension has never produced a single organic report in its life, while the one
surface anybody could actually reach without an invite produced the only real one. Tester onboarding
(`1216785813352945`) is still the answer, but (c) suggests the cheap half — the Sidecar link — is the
half that has already demonstrably worked.

**The one limit that remains.** I still have not submitted test feedback end-to-end. That would
create a real Asana task on your board — outward-facing, and not mine to do unattended. Given the
census above, a seventh test task would also tell us nothing new: the pipeline's delivery is now
evidenced six times over. The open question is not whether it works, it is who is pointed at it.

---

## 3. Asana lockdown — 6th consecutive night (~144h), and it is broader than "writes"

Still armed. `asana-cli doctor`:

```
status: LOCKED_DOWN   local_frozen: true   safety_frozen: true
active_pauses: {}     queued_items_count: 7
```

**A correction to how prior reports characterised this.** They described it as a *write* lockdown.
It is not — the CLI's guard is global and fail-closed across every subcommand. Verified tonight:

| Command | Kind | Result |
|---|---|---|
| `asana-cli --as dex me` | pure read | `error: MUTATION_PAUSED` |
| `asana-cli --as dex projects list` | pure read | `error: MUTATION_PAUSED` |
| `asana-cli --as dex task get 1216897421002963` | pure read | `error: MUTATION_PAUSED` |
| `asana-cli --as caspera me` | pure read | `error: MUTATION_PAUSED` |

The rejection happens locally, before any network call, under every profile. Nothing on the Asana
side is degraded — **the Asana MCP reads fine**, which is how §1 and §2 were done. So the practical
operational rule while this is armed is: **CLI for nothing, MCP for reads, and no writes at all.**
Worth knowing before another agent reads `MUTATION_PAUSED` on a `me` call and concludes the PAT died.

**Still yours:** the pending-approval queue holds **7 items** — depth unchanged for six nights,
oldest `2026-06-28`, one a `DELETE` on `tasks/1216786199603889`, written under other agents'
profiles. Untouched. `queue approve <uuid>` / `queue drop <uuid>`.

No auto-recovery in 144 hours. Q5(a) remains a human-only clear.

---

## 4. Morning questions — all five still open

No human reply on any of them since the last run. Full statements are in the 08-16 report; one line
each, with tonight's deltas marked:

- **Q1 — B10 fix direction.** Viewport-fixed overlay (~28px overlap) or keep pushing host layout and
  accept one broken site class? **11 nights on one yes/no.** *(`1217337196357650`)*
- **Q2 — B09 approach.** Combined `SET_INTENT_AND_ASSIGN`, or `SET_INTENT` + `skipBridge` + explicit
  link? One word unblocks a builder. *(`1216897421002963`)*
- **Q3 — uncommitted registry edit.** Plan numbers 039/040/041 (Cortex line) or 047/048/049?
  *(`1216900494891551`)*
- **Q4 — tester onboarding.** **Sharpened tonight (§2).** The pipeline has produced six submissions
  in its life, five of them fleet tests; the single organic report came from the Sidecar PWA, never
  from the extension. Ship `1216785813352945` — and §2(c) argues the Sidecar-link half is the
  proven-cheap starting point.
- **Q5 — Asana lockdown.** (a) what armed `safety_frozen` on 08-15 and what clears it — human action
  required, no auto-recovery in **144h**; (b) approve or drop the 7 queued items, one a `DELETE`.

---

## 5. Verification summary

- **Builds:** none run — no product code touched. No branches created, no commits beyond this report.
- **Queue absence:** filesystem check across all five worktrees, plus a `TODO`/`UNWORKED`/checkbox
  scan of the surviving 07-22 queue. Zero hits.
- **Census (§2):** fingerprint derived by reading `feedback-to-asana/index.ts:139-152`, then an
  all-projects / both-completion-states Asana text search on `— Submitted from Tabatha —`, then
  `asana_get_task` on #5 to read its `surface`/`version` provenance. Read-only throughout.
- **Lockdown (§3):** four read probes across two profiles, all rejected locally; queue depth
  re-read as 7 via `doctor`.
- **Final Asana comment:** **blocked**, not skipped — same lockdown, and it now blocks reads too.
  This report is the record.
