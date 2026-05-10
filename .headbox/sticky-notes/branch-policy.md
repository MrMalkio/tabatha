# 🌿 Branch & Worktree Policy — May 10, 2026

**From:** Malkio (via Antigravity + Codex)  
**For:** All agents  

## Rule: Nobody works directly on `master`

All work happens on feature/refactor branches. Promote to master via merge only.

## Worktree Layout

Each agent has its own isolated directory. **No branch switching in shared repos.**

```
c:\Users\mrmal\Le Dev\Tabatha\                ← Antigravity (feat/follow-through-engine)
c:\Users\mrmal\Le Dev\Tabatha-service-arch\   ← Codex (codex/service-arch)
```

## Active Branches

| Branch | Owner | Worktree | Purpose |
|--------|-------|----------|---------|
| `master` | — | (Tabatha, when idle) | Stable release. Merge-only. |
| `feat/follow-through-engine` | Antigravity | `Tabatha\` | Phases 1-6: Follow-Through Engine |
| `codex/service-arch` | Codex | `Tabatha-service-arch\` | Monolith decomposition |

## Rules

1. **NEVER `git checkout` to another branch** — you'll stomp the other agent's files
2. Work ONLY in your assigned worktree directory
3. When ready to promote → tell user, merge to `master` (with approval)
4. To sync with master: `git rebase master` from your branch (not checkout)
