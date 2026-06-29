# Plan 024 — Backfill the v0.2.5 → v3.34.5 Documentation & Verification Gap

> **Read this whole file before starting. Your output is an implementation
> plan + three task files that three parallel agents will execute in their own
> worktrees.**

---

## Context — what's happening

Tabatha just finished **Plan 023**, a service-decomposition refactor of
`background.js`. The refactor merged into `refactor/decomp-v2` and a final
cleanup PR is open
([github.com/MrMalkio/tabatha/pull/12](https://github.com/MrMalkio/tabatha/pull/12))
bumping the version to **v4.0.0**.

The intent was that v4.0.0 ships from `refactor/decomp-v2` → `staging` (formerly
`master`) → `main`. But auditing exposed a hole:

- **Production / `main` is at an even older state** than `staging`. `staging`
  (formerly `master`) is at **v3.0.0**. The currently-installed version on the
  developer's main browser is **v3.34.5**, which lives only on
  `refactor/decomp-v2`.
- **Between v3.0.0 (staging) and v3.34.5 (integration), ~35 minor versions of
  feature work happened directly on `refactor/decomp-v2`** (and earlier
  intermediate branches). None of it has been documented in the Plan-023 ledger
  or in `Tabatha_Changelog.md`. The work that _is_ documented in the changelog
  stops at `[v3.12.4-alpha]` (2026-05-11) and `[v0.2.5-alpha]` (2026-05-09);
  everything between v3.13 and v3.34.5 is undocumented.
- Plan 023's [semantic-changes ledger](../Plan-023/semantic-changes.md) only
  catalogs the refactor itself — it does **not** describe the feature work that
  piled up on the integration branch over the prior 6 months.
- The code is there. Running the v4.0.0 build (`dist-v4.0.0/`) exercises all of
  it. What's missing is the **paper trail**: changelog entries, task-style
  breakdowns, schema/migration callouts, breaking-change flags, and verification
  that each feature still works as designed.

The developer (Malkio) does not want to ship v4.0.0 to `staging` without that
paper trail. Without it: no rollback comprehension, no per-feature regression
checklist, no ability to write release notes for `main` later, no way for any
future agent to know what's actually in v4.0.0.

---

## Your job

You are the **planning agent** for Plan 024. You will:

1. **Dig** into the integration branch's history, code, and existing docs to
   understand exactly what landed between v0.2.5 (last well-documented release
   on `staging` plus prior work) and v3.34.5 (current `refactor/decomp-v2` head
   before the Plan-023 refactor).
2. **Write an implementation plan** at
   `maintenance/Plan-024/implementation_plan_024.md` following Tabatha's plan
   conventions (see [AGENTS.md](../../AGENTS.md) §Global Rules 9–11).
3. **Produce three task files** at `maintenance/Plan-024/tasks/01-*.md`,
   `02-*.md`, `03-*.md` that three agents can execute in **parallel** on
   **independent git worktrees** with **zero scope overlap**.

Three agents because the work is large enough and roughly partitionable.
Worktrees because the agents shouldn't fight over `dist/` / `package.json` /
lockfile / changelog the way they would on a shared checkout. See
[.headbox/](../../.headbox/) for any worktree conventions the project already
follows.

You are **not** writing any application code yourself. You are not building, not
migrating, not refactoring. You are producing planning artifacts only. The three
downstream agents will do the actual writing/verification work.

---

## Required dig — what to investigate before planning

Don't guess the partition. Earn it by reading. Spend real time on these:

### 1. Commit history scope

- `git log origin/staging..origin/refactor/decomp-v2 --no-merges --oneline` —
  every non-merge commit that needs to be accounted for. Should be ~50–60
  commits.
- `git log origin/staging..origin/refactor/decomp-v2 --no-merges --stat` — get a
  sense of which areas (sidebar, home, settings, background, services, tests)
  are heaviest.
- Identify version-bump commits (`chore: bump version to vX.Y.Z`) — these are
  your natural section boundaries.

### 2. Existing changelog gap

- Read [Tabatha_Changelog.md](../../Tabatha_Changelog.md). Note that entries
  exist for `[v0.2.5-alpha]`, `[v0.2.4-alpha]`, `[v3.12.4-alpha]`, `[v4.0.0]`
  (just-added by Plan 023 cleanup). The gap from v3.12.5 → v3.34.5 is the
  documentation hole.
- Cross-reference against the [AGENTS session log](../../AGENTS.md) — many of
  those session entries reference work that landed on integration but isn't in
  the changelog. Use them as breadcrumbs.

### 3. Schema / migration / breaking surface

- Read [src/background/bootstrap.js](../../src/background/bootstrap.js) for the
  one-time migrations (`migrateIntentChangeLog`, `migrateTasksToOrg`,
  `ensureStorageSettings`). These represent migration _moments_ — pinpoint which
  integration-branch commit introduced each.
- Read
  [docs/architecture/message-contracts.md](../../docs/architecture/message-contracts.md)
  — this exists for Plan 023 and may need backfilling for pre-023 message
  changes.
- Search
  `git log -p origin/staging..origin/refactor/decomp-v2 -- src/background/constants.js public/manifest.json`
  for permission/key changes.

### 4. UI surfaces added

- `git diff --stat origin/staging..origin/refactor/decomp-v2 -- src/components/ src/home/ src/sidebar/ src/settings/`
  shows where the new UI lives. Major ones I can already see:
  `KeyboardShortcuts`, `VoiceInput`, `AnalyticsDashboard`, `ActivityHeatmap`,
  `InitiativesPanel`, `ProjectsClientsPanel`, expanded `LogsPanel`, expanded
  `StagePicker`/`TagPicker`. Each needs an entry.

### 5. Tests and verification approach

- Tabatha has no automated test suite (per `.gemini/agent.md`). All verification
  is manual: load unpacked, click around, watch the Service Worker console. Plan
  accordingly — each task file's verification section will be a manual
  checklist, not `npm test`.

### 6. The user's already-built artifacts

- `dist-v3.34.5/` — rollback artifact, this is what the user's main browser
  currently runs.
- `dist-v4.0.0/` — the cumulative release build, sits separately so it doesn't
  clobber the main profile.
- These exist locally on the developer's machine; they're not in git. Don't
  expect them in your worktree.

---

## Partition the work into three task files — the constraint

The three task files must be:

- **Independent** — no shared files modified, no cross-task ordering
  dependencies. Either-order-works.
- **Parallel-safe on worktrees** — each agent can `git worktree add` from
  `refactor/decomp-v2` (or a fresh branch off it) and work without merge
  conflicts.
- **Roughly balanced** — similar effort each, so all three agents finish near
  the same time.

Three partition strategies you might pick (you choose; defend the choice in the
plan):

| Strategy                                                                                                                                        | Pros                                                                                                                                                              | Cons                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **A — By version range** (e.g., 01: v3.13–v3.20, 02: v3.21–v3.27, 03: v3.28–v3.34.5)                                                            | Clean linear scope, mirrors release semantics, no file overlap if each agent writes its own `Plan-024/notes/0X-versions.md` then merges into changelog at the end | Risk of uneven depth — some versions are bigger than others              |
| **B — By layer** (01: backend/services + migrations, 02: frontend UI/components, 03: integrations + companion + supabase)                       | Each agent specializes; deep dives per layer                                                                                                                      | Higher risk of touching same shared files (e.g., changelog, ledger)      |
| **C — By artifact type** (01: changelog backfill, 02: task-file backfill in Plan-024 style, 03: live-code verification + breaking-change audit) | Crisp deliverables; minimal file overlap                                                                                                                          | Sequential dependencies sneak in — verification needs changelog as input |

Pick the strategy that genuinely minimizes file overlap given Tabatha's repo
layout. If A: each task owns one disjoint set of changelog `## [vX.Y.Z]`
sections. If B: split by directory globs. If C: split by output filename.

For each task file, specify exactly:

1. The branch + worktree command (e.g.,
   `git worktree add ../tabatha-024-01 -b doc/plan-024-task-01 origin/refactor/decomp-v2`)
2. Files this task is permitted to modify (whitelist)
3. Files this task must NOT touch (blacklist — anything another task owns)
4. Verification commands (mostly read-only `git log`, `grep`, etc.) and the
   manual-extension checks if needed
5. PR target: probably `refactor/decomp-v2` (so the docs land alongside the code
   they document, then the whole thing rolls to `staging` together)
6. A small acceptance test: e.g., "no `master` references introduced in new
   docs; `Tabatha_Changelog.md` has a `[v3.X.Y]` heading for every version-bump
   commit in your assigned range; every entry cites the commit SHA"

---

## What the implementation plan must contain

Follow [AGENTS.md](../../AGENTS.md) §Global Rules — the plan **must**:

- Have a `# Implementation Plan 024: <descriptive suffix>` heading and a unique
  entry in [.headbox/plan-registry.md](../../.headbox/plan-registry.md).
- State current and target version:
  `> **Current version:** 4.0.0 → **Target version:** 4.0.0` (no version bump
  from this work; doc-only).
- Have a **Context** section explaining the _why_ (the gap I described above).
- Have a **Decisions** section: which partition strategy you picked and why, and
  any structural calls you made (e.g., whether to add per-version sections to
  the changelog vs one big "Catch-up Release Notes" block).
- Have a **Tasks** section listing the three task files by filename + one-line
  summary each.
- Have a **Verification** section (whole-plan acceptance): after all three tasks
  merge, what does Tabatha's documentation surface look like? What greps should
  return what counts?
- Have a **Risk** section: what could go wrong, what could conflict, what the
  fallback is if one agent gets stuck.

The plan does **not** need to repeat what's in the task files. It needs to make
the partition legible and the success criteria testable.

---

## Constraints the agents must follow (carry these into the task files)

These exist because the developer enforced them on the previous agent:

- **No `Co-Authored-By:` footers** in any commit message or PR body. Ever. (See
  [feedback_no_coauthor.md](C:/Users/mrmal/.claude/projects/c--Users-mrmal-Le-Dev-Tabatha/memory/feedback_no_coauthor.md).)
- **Always use `staging` + `main`**, never `master`. (See
  [project_branch_naming.md](C:/Users/mrmal/.claude/projects/c--Users-mrmal-Le-Dev-Tabatha/memory/project_branch_naming.md).)
- **Don't retroactively rewrite historical session-log entries** that say
  `master` — those describe the world at time of writing. Forward-looking docs
  use `staging`.
- **Don't touch `dist/`, `dist-v3.34.5/`, `dist-v4.0.0/`.** Those are the
  developer's build artifacts.
- **Conventional Commits** for commit messages
  (`docs(changelog): backfill v3.20.0 entry`).
- **Update `docs/progress.md`** at end of session per the local rules.
- **Number plans uniquely.** This is Plan 024 — register it in
  [.headbox/plan-registry.md](../../.headbox/plan-registry.md) before writing.

---

## What success looks like

When you're done with planning (before any task agent runs):

1. [maintenance/Plan-024/implementation_plan_024.md](implementation_plan_024.md)
   exists and is internally consistent.
2. [maintenance/Plan-024/tasks/01-*.md](tasks/), `02-*.md`, `03-*.md` exist with
   non-overlapping scope.
3. The plan and tasks have been validated against actual repo state — not
   invented from this prompt's assumptions.
4. [.headbox/plan-registry.md](../../.headbox/plan-registry.md) has a `024`
   entry.

When all three downstream task agents are done (out of your scope, but inform
your planning):

5. `Tabatha_Changelog.md` has a complete entry chain from `[v0.2.5-alpha]`
   through `[v4.0.0]` with no gaps.
6. The integration branch has a paper trail equivalent in quality to what Plan
   023 produced for itself.
7. Manual regression is possible against a printable checklist drawn from the
   new changelog entries.
8. Final PR `refactor/decomp-v2` → `staging` can land with release notes that
   explain the whole jump from v3.0.0 to v4.0.0.

---

## Open questions to raise with the user before executing

The previous agent (me, Claude Opus 4.7, in the conversation that produced this
prompt) flagged these as fork points the user should decide before three agents
fan out. Surface them in your planning conversation:

1. **Verification depth.** Three modes:
   - **Document-only:** describe what each version _intended_ to ship per git
     log and AGENTS session entries.
   - **Document + audit:** also confirm the code on `refactor/decomp-v2`
     actually does what was claimed (read the files; mention deltas).
   - **Document + audit + live-verify:** also do manual extension testing on the
     v4.0.0 build for the highest-risk features. I assumed Document + audit when
     writing this prompt. Confirm or change.
2. **Changelog structure.** Three options I outlined to the user (they didn't
   pick):
   - **A:** Expand the existing v4.0.0 entry into one giant cumulative section.
   - **B:** Backfill per-version sections (v3.13 → v3.34.5) and keep v4.0.0
     focused on Plan-023 refactor.
   - **C:** Hybrid — v4.0.0 entry gets a "What's new since v3.0.0" header
     summary, and per-version sections fill the gap. My standing recommendation:
     C. Confirm before partitioning.
3. **Should the migration moments get breaking-change flags?** The Plan-023
   ledger has them as `internal-schema`. v3.20.0's task-storage migration
   arguably is one too. Decide whether v4.0.0's changelog calls out anything as
   `BREAKING` for downstream readers (e.g., if the developer ever publishes the
   extension and needs migration notes for installed users).
4. **The companion bridge.** The companion app has no profile-scoping (it's
   `ws://localhost:9147`). If any task verification needs the companion, that
   agent has to coordinate with the developer because two profiles cannot
   regression-test the companion simultaneously.

---

## Final note on scope hygiene

If you find that v0.2.5 → v3.12.4 is **already** adequately covered in the
existing changelog (it appears to be), say so in the plan and narrow the
partition to v3.13 → v3.34.5. Don't redo work that's already done.

If you find that the integration branch actually has fewer than ~30 undocumented
commits, say so and consider whether three agents is overkill — propose two if
appropriate. Don't manufacture parallelism for its own sake.

Your output is a plan + three task files. Not code. Not commits. Not PRs.
