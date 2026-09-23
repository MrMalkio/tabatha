# TaskRun-2 — Questions & Flags for Malkio / CeeCee / Kael

**Run:** overnight TaskRun-2, dispatched by CeeCee, coordinated by Vessa (Sonnet). Charter:
`docs/superpowers/specs/2026-07-22-overnight-taskrun-protocol.md`. This file is append-only per
that charter's morning-questions convention — nothing here blocked the run; everything below is
either a real decision point or a transparency flag about how the run's own crew behaved.

---

## 1. FLAG (not a decision needed, but read this first) — a builder committed to `staging` in the shared main directory instead of its isolated worktree

**What happened:** I dispatched a haiku builder ("Nash") to do the docs-refresh item (SYNTHESIS
NOW #7 — kill the hardcoded `v6.7.41` badge, refresh 4 stale `site/docs/*.html` pages). I created
a dedicated isolated worktree/branch for this (`docs/site-refresh-2026-07-24`, at
`C:\Users\mrmal\le dev\Tabatha\.claude\worktrees\taskrun2-docs-refresh`) specifically to avoid
touching the shared main directory (`C:\Users\mrmal\le dev\Tabatha`, checked out on `staging`) that
Kael's concurrent session was actively reconciling. Despite explicit absolute-path instructions,
Nash committed its work directly onto local `staging` in the main directory instead
(commit `fc5c8a6`, "docs(site): refresh stale pages + build-time version badge (TR-19/NOW#7)").

**Why this matters:** at the moment I discovered it, local `staging` had already diverged from
`origin/staging` (Kael had just pushed `b2552cd` — "release(ext): 6.7.69 -> 6.7.70 — reconciliation
bump, Split-Tab T on canonical line" — literally minutes earlier), and the main working directory
had live uncommitted changes (`store-assets/promo-440x300.png`, `supabase/config.toml`) that look
like Kael's own in-progress edit. This is exactly the collision the isolation was meant to prevent.

**What I did about it (no destructive action taken):**
- Confirmed Nash's 8 changed files (`Tabatha_Changelog.md`, `package.json`,
  `scripts/stamp-docs-version.mjs`, and 4 `site/docs/*.html` pages + `index.html`) do **not**
  overlap with Kael's 2 dirty files — no merge conflict exists today.
- Did **not** reset, rebase, or rewrite local `staging` — it's mid-active-reconciliation and
  surgery on a diverged branch someone else is driving felt riskier than leaving one additive,
  docs-only, unpushed commit in place.
- Cherry-picked the same commit onto the isolated branch (`2480ada` on
  `docs/site-refresh-2026-07-24`) and pushed both the isolated branch and confirmed the stray
  commit is local-only on `staging` (not pushed to `origin/staging`), so it's fully recoverable
  either way.
- **Recommendation:** Kael, when you next touch `staging`, you'll see an extra commit
  (`fc5c8a6`) at the tip from me/Nash. It's safe to keep (it's exactly the docs-refresh work this
  run was supposed to produce, and it was headed for a `staging`-adjacent deploy anyway per the
  original ask) — or `git reset --soft` it off and re-apply from
  `origin/docs/site-refresh-2026-07-24` if you'd rather keep your reconciliation history clean.
  Either way, no data was lost and nothing was pushed without review.

---

## 2. Environment note — `git push`/`git ls-remote` over the `gh` credential helper hangs indefinitely in this headless session

Every plain `git push` and even `git ls-remote origin` hung to timeout in this TaskRun-2 session
(both in the `tabatha-watch` repo and this `tabatha` repo), despite `gh auth status` and
`gh api user` both working instantly. Root cause looks like git's `credential.helper = gh`
subprocess handshake hanging (not the network itself — `gh api` calls succeeded fine). **Workaround
used successfully:** `TOKEN=$(gh auth token); git push "https://x-access-token:${TOKEN}@github.com/OWNER/REPO.git" branch:branch`
— bypasses the credential-helper subprocess entirely. Worth carrying this workaround into future
overnight sessions' tooling/runbook if this recurs (candidate addition to `docs/OPERATIONS.md` §5
gotchas — flagging here rather than editing that doc myself since I didn't want a 6th agent
touching a doc Kael/CeeCee may also be mid-editing tonight).

---

## 3. Not attempted this run (explicitly, not silently dropped)

- **Item 6 of my dispatch** ("any unworked S-sized items from the queues that don't collide with
  Kael") — the five items above (logo cascade, Watch polish, docs refresh, #224 Lanes concept,
  Plan 046 deepening) consumed the full run. I did not additionally sweep TR-09/TR-10/TR-11/TR-12
  from the 2026-07-22 queue for leftover S-items; unclear from this session whether TR-05 (Watch
  crash guard) had already landed elsewhere before tonight — it turned out it had (`tabatha-watch`
  commit `5f8977f`, "0.2.1 — guard all repository calls with runCatching," pre-existing on the repo
  before Fenn's 0.2.2 work started tonight), so at least that one is confirmed done without my
  needing to re-do it.
- **Asana tracking** — both the Asana MCP connector (needs an interactive OAuth grant this
  headless session can't perform) and `asana-cli.cmd` (shells out to `powershell.exe`, which hung
  on every invocation in this session, unrelated to Asana specifically — plain
  `Write-Output "hello"` via the PowerShell tool also hung) were unavailable all run. No Asana
  tasks/comments were created or updated by TaskRun-2 tonight. If personas/task-tracking need to be
  reconciled after the fact, the work products below are the source of truth (commits + this file +
  the run report).

---

## 4. Genuine open question for Malkio

- **Watch `tabatha-watch`'s "0.2.1" already existed on the repo before tonight** (crash-guard fix,
  commit `5f8977f`) but was **not recorded anywhere I could find** in `docs/progress.md`,
  `.headbox/plan-registry.md`'s `041 tabby_watch` row, or a pushed branch/PR at session start —
  it was sitting as a local commit on `tabatha-watch`'s default branch already ahead of
  `origin`. Tonight's Fenn built 0.2.2 on top of it and pushed both. **Question:** was 0.2.1 a
  previous agent's un-recorded work, or something you built directly? Worth a one-line
  `docs/progress.md`/plan-registry backfill either way so the Watch line's history isn't a mystery
  to the next agent who looks.
