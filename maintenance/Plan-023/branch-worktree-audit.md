# Branch & Worktree Audit — 2026-05-13

> Pre-flight audit before starting `refactor/decomp-v2`. Goal: leave the repo with **one active branch (master) and zero stale worktrees** before Phase 1 begins.

---

> **Execution status (2026-05-13):** ✅ Complete. `refactor/service-arch`, `feat/follow-through-engine`, `feat/v3-ux-overhaul` all tagged as `archive/*` and deleted (local + pushed to origin). Stale `Tabatha-service-arch` worktree directory was already gone from disk; `git worktree prune` was a no-op. Only `master`, `chore/plan-023-pre-decomp` (Phase 0 in flight), `origin/main`, `origin/master` remain.

## Local branches

| Branch | Tip | Ahead of master | Behind master | Status | Disposition |
|---|---|---:|---:|---|---|
| `master` | `0176798` (docs: Plan 023 + session log) | — | — | ✅ Active trunk | Keep. |
| `feat/follow-through-engine` | `8fae2b7` (v3.0.0-alpha bump) | 0 | 41 | ✅ **Fully merged** into master | **Delete after confirming reflog snapshot.** Tag first if you want a marker. |
| `feat/v3-ux-overhaul` | `c63b639` (v3.12.4-α changelog) | 0 | 33 | ✅ **Fully merged** into master | **Delete.** Same as above. |
| `refactor/service-arch` | `5a92969` (router extraction) | 9 | 59 | 🟠 Stale — design is salvaged into Plan 023 | **Archive as tag, then delete.** Design docs already accounted for in Phase 0. |

### Remote branches

| Remote | Purpose | Action |
|---|---|---|
| `origin/main` | GitHub default (PR target) | Keep. |
| `origin/master` | Mirrors local master | Keep — push current master after Phase 0. |

`origin/HEAD → origin/main` — confirms PRs land on `main`. Master and main appear to be the same line (master is the local working branch, main is the remote canonical name). Verify before pushing.

---

## Worktrees

```
C:/Users/mrmal/Le Dev/Tabatha               0176798 [master]
C:/Users/mrmal/Le Dev/Tabatha-service-arch  5a92969 [refactor/service-arch]
```

| Worktree | Branch | Status | Disposition |
|---|---|---|---|
| `C:/Users/mrmal/Le Dev/Tabatha` | `master` | ✅ Primary | Keep. |
| `C:/Users/mrmal/Le Dev/Tabatha-service-arch` | `refactor/service-arch` | 🟠 Stale (59 commits behind, 9 commits of work that was salvaged into Plan 023's design) | **Remove worktree, then archive the branch.** |

Per the sticky note in `.headbox/`, this worktree was assigned to Codex. It has no uncommitted work that isn't already on the branch. Verify with `git -C "C:/Users/mrmal/Le Dev/Tabatha-service-arch" status` before removal.

---

## Recommended cleanup commands (one-time, run on master)

```bash
# 1. Verify no uncommitted work in the stale worktree
git -C "/c/Users/mrmal/Le Dev/Tabatha-service-arch" status --porcelain

# 2. Remove the worktree (safe — branch is preserved)
git worktree remove "C:/Users/mrmal/Le Dev/Tabatha-service-arch"

# 3. Archive refactor/service-arch as a tag, then delete the branch
git tag archive/service-arch-v1 refactor/service-arch
git branch -D refactor/service-arch

# 4. Archive feat/follow-through-engine (optional — fully merged)
git tag archive/follow-through-engine feat/follow-through-engine
git branch -d feat/follow-through-engine   # lowercase -d, fails if not merged

# 5. Archive feat/v3-ux-overhaul (optional — fully merged)
git tag archive/v3-ux-overhaul feat/v3-ux-overhaul
git branch -d feat/v3-ux-overhaul

# 6. Push the archive tags
git push origin --tags

# 7. Verify
git branch -a              # should show only master + remote/main + remote/master
git worktree list          # should show only the primary worktree
git tag -l 'archive/*'     # should list the three archives
```

> ⚠️ **Confirm with the user before running steps 4 and 5.** Those branches are already merged, so the only loss is the branch name itself — but the tags preserve the merge points.

---

## Forward plan — branches for Plan 023

Per your direction ("I am [comfortable]. And can we plan ahead for all others."), every service-extraction phase gets its own pre-named branch. This unblocks the parallel merge strategy evaluation in [parallel-merge-strategy.md](./parallel-merge-strategy.md).

| Phase | Branch | Branched from | Merge target | Owner (suggested) |
|---|---|---|---|---|
| Phase 0 | `chore/plan-023-pre-decomp` | `master` | `master` | Any (mostly docs + script) |
| Phase 1 | `refactor/decomp-v2-foundation` | `master` (after Phase 0) | `master` | Antigravity |
| Phase 2 | `refactor/decomp-v2-communication` | `refactor/decomp-v2-foundation` | `refactor/decomp-v2-foundation` | Claude |
| Phase 3 | `refactor/decomp-v2-data` | Phase 1 | Phase 1 | Codex |
| Phase 4a | `refactor/decomp-v2-tab-service` | Phase 2 + Phase 3 | integration branch | Antigravity |
| Phase 4b | `refactor/decomp-v2-focus-service` | Phase 2 + Phase 3 | integration branch | Claude |
| Phase 4c | `refactor/decomp-v2-task-service` | Phase 2 + Phase 3 | integration branch | Codex |
| Phase 4d | `refactor/decomp-v2-clock-service` | Phase 2 | integration branch | Gemini |
| Phase 5a | `refactor/decomp-v2-group-blockgate` | Phase 4 integration | integration | — |
| Phase 5b | `refactor/decomp-v2-companion` | Phase 4 integration | integration | — |
| Phase 5c | `refactor/decomp-v2-alarm` | Phase 5b | integration | — |
| Phase 6 | `refactor/decomp-v2-router` | integration | `master` (via PR to `main`) | — |
| Integration | `refactor/decomp-v2` | `master` | `master` (final PR) | Lead reviewer |

Naming convention: `refactor/decomp-v2-<scope>` so every PR title self-describes.

---

## Effect of these branches on Plan 023

- **No effect on the implementation order** — Plan 023's phases hold.
- **Effort lines unchanged** — branch creation overhead is included in Phase 0's 2-hour budget.
- **One new risk surfaced:** integration branch (`refactor/decomp-v2`) needs continuous rebase against `master` if any hotfix lands during the ~13-hour decomp. Mitigation: freeze master to docs/changelog-only commits during Phase 4–6, or rebase the integration branch daily.
