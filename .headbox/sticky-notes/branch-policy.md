# 🌿 Branch Policy — May 10, 2026

**From:** Malkio (via Antigravity)  
**For:** All agents  

## Rule: Nobody works directly on `master`

All work happens on feature/refactor branches. Promote to master via merge only.

## Active Branches

| Branch | Owner | Purpose | Status |
|--------|-------|---------|--------|
| `master` | — | Stable release. Merge-only. | Protected |
| `refactor/service-arch` | Codex | Monolith decomposition | Active |
| `feat/follow-through-engine` | Antigravity | Phases 1-6 of the Follow-Through Engine | Active |

## Workflow

1. Create a branch from `master` for your work track
2. Commit to YOUR branch only
3. Periodically `git rebase master` to stay current
4. When ready to promote → merge to `master` (with user approval)
5. After merge, delete the feature branch

## If you find yourself on the wrong branch

```bash
git stash --include-untracked
git checkout <your-branch>
git stash pop
```
