# Tabatha — Parallel Agent Development Workflow

> **Purpose:** Codify how agents create, manage, and close feature work so multiple features can develop in parallel without merge pain.
> **Referenced by:** `AGENTS.md` Global Rule 12

---

## The Problem We're Solving

Over the past 2 months, Tabatha accumulated 70+ commits of promotion debt because:
1. Feature branches lived too long and accumulated too much scope
2. Multiple features stacked on the same branch (`feat/multi-profile-sync` carried Plans 027+028)
3. No clear ownership boundaries — agents modified shared files freely
4. No merge cadence — work sat on feature branches with no promotion checkpoint

---

## Branch Model

```
main (production — tagged releases only)
 └── staging (integration — always deployable)
      ├── feat/focus-timer-harmony     (Agent A worktree)
      ├── feat/blockgate-enhancements  (Agent B worktree)
      └── fix/inbar-stale-intent       (Agent C worktree)
```

### Rules

| Rule | Why |
|------|-----|
| **All feature branches fork from `staging`** | Single merge target, no stacking |
| **One plan = one branch** | No bundling Plans 027+028 on the same branch |
| **Branch names: `{type}/{slug}`** | `feat/`, `fix/`, `refactor/`, `docs/` |
| **Max branch lifetime: 1 week** | If it's taking longer, the scope is too big — split it |
| **Merge to staging via PR** | Even for solo work — creates a paper trail |
| **Never push directly to `staging` or `main`** | Already a global rule, reinforced here |

---

## Worktree Protocol

### Creating a worktree (agent start)

```bash
# From the main checkout (c:\Users\mrmal\Le Dev\Tabatha)
git worktree add ../Tabatha-{slug} -b feat/{slug} staging
```

Naming: `Tabatha-{slug}` in `Le Dev/`. Examples:
- `Tabatha-timer-harmony`
- `Tabatha-blockgate`
- `Tabatha-inbar-fix`

### Closing a worktree (agent done)

```bash
# After PR is merged to staging
git worktree remove ../Tabatha-{slug}
git branch -d feat/{slug}
```

### Inventory check (any agent, any session)

```bash
git worktree list
```

> **IMPORTANT:** Every session must start by checking `git worktree list`. If there are orphaned worktrees from a previous agent, flag them — don't ignore them.

---

## File Ownership Zones

The decomposition (Plan 023) makes parallel work viable because files are now modular. Here are the ownership zones — **two agents should never modify the same zone in the same sprint**:

### Backend Services (each is independent)

| Zone | Files | Typical Feature Scope |
|------|-------|-----------------------|
| Focus Engine | `focusService.js`, `src/home/FocusBar.jsx`, `src/home/FocusInput.jsx` | Focus lifecycle, queue, timer |
| Clock/Time | `clockService.js`, `clockTickService.js`, `src/home/ShiftControls.jsx` | Clock in/out, breaks, stints |
| Tabs | `tabService.js`, `tabTrackingService.js` | Tab context, intent, parking |
| Tasks | `taskService.js`, `src/components/TasksPanel.jsx` | Task CRUD, stages |
| Groups | `groupService.js`, `blockgateService.js` | Tab groups, site blocking |
| Sync | `syncService.js`, `awarenessService.js`, `bootstrapPull.js` | Supabase push/pull, awareness |
| Companion | `companionService.js`, `companionInstallService.js`, `companion-bridge.js` | Desktop companion |
| Notifications | `notificationService.js`, `alarmService.js` | Alerts, alarms, CPN |
| Settings | `settingsService.js`, `src/settings/` | Settings UI + persistence |

### UI Surfaces (can overlap if scoped)

| Surface | Files | Notes |
|---------|-------|-------|
| Home | `src/home/` | Main dashboard — highest conflict risk |
| Sidebar | `src/sidebar/` | Mirror of home, lower risk |
| InBar | `src/content/` | Content script, isolated |
| Popup | `src/popup/` | Minimal, rarely touched |
| Settings | `src/settings/` | Many tabs, scope by tab |
| Work Shifts | `src/workshifts/` | Standalone page |

### Shared / High-Conflict Files (avoid parallel edits)

| File | Risk | Mitigation |
|------|------|------------|
| `background.js` | 🔴 Orchestrator | Only touch to add new service imports — never logic |
| `src/background/router.js` | 🟡 Message routing | Add new cases only, don't restructure |
| `src/hooks/useChromeStorage.js` | 🟡 Universal hook | Changes here affect everything — coordinate |
| `src/styles/` | 🟡 Theme tokens | Add new tokens, never rename existing |
| `public/manifest.json` | 🔴 Version + permissions | Only one agent bumps version per sprint |

---

## Merge Strategy: Short-Lived Branches + Frequent Rebase

### Why cherry-picking happened before

Long-lived integration branches (`refactor/decomp-v2` lived 2+ weeks and accumulated 63 commits) meant merging was a project in itself. The fix is **short branches that merge often**.

### The cadence

```
Day 1: Fork from staging, start work
Day 2-3: Dev + test on worktree
Day 3-4: Rebase on staging (pick up other merged work)
Day 4-5: PR → staging, review, merge
Day 5: Delete branch + worktree
```

### Rebase, not merge

```bash
# In the worktree
git fetch origin
git rebase origin/staging
```

Rebase keeps history linear and avoids the merge-commit spaghetti that made `refactor/decomp-v2` hard to audit. If there are conflicts, the agent resolves them immediately — not 3 weeks later.

### When to merge vs. rebase

| Situation | Action |
|-----------|--------|
| Feature branch updating from staging | `git rebase origin/staging` |
| Feature branch → staging | **Merge** (via PR — preserves the feature's identity) |
| staging → main | **Merge** (production release checkpoint) |

---

## Parallel Coordination: The Handshake

Before an agent starts a feature, it must:

1. **Check `git worktree list`** — see what's in flight
2. **Check `.headbox/sticky-notes/`** — see if another agent left coordination notes
3. **Declare intent in a sticky note**: create `.headbox/sticky-notes/{date}-{slug}.md`
   ```markdown
   ## Active: feat/{slug}
   - **Agent:** Antigravity / Codex / Claude
   - **Worktree:** ../Tabatha-{slug}
   - **Files I'll touch:** focusService.js, src/home/FocusBar.jsx
   - **ETA:** 2-3 sessions
   - **Conflicts possible with:** Anyone touching src/home/ layout
   ```
4. **Check the zone table above** — if another worktree is touching the same zone, coordinate or wait

### On completion

1. Delete the sticky note (or mark it `## Completed`)
2. Remove the worktree
3. Delete the branch (local + remote)
4. Update plan-registry status

---

## Version Bumping

| Rule | Details |
|------|---------|
| **One branch bumps the version** | The branch that ships the most user-facing change |
| **Bump at commit time, not merge time** | Dev machine is ground zero — you must know which build you're testing |
| **Use `npm run version:sync`** | Syncs manifest.json → package.json → home UI → workshifts UI |
| **Patch (Z)** for fixes | v5.3.0 → v5.3.1 |
| **Minor (Y)** for features | v5.3.0 → v5.4.0 |
| **Major (X)** for breaking/architectural | v5.3.0 → v6.0.0 (user override) |

If two features land in the same sprint, the second one to merge does the bump — it sees the first's bump during rebase and increments from there.

---

## Promotion Protocol

### staging → main (production release)

Production releases are deliberate events, not automatic:

1. **Regression test** on the dev machine (this machine)
2. **Changelog reviewed** — all entries present for the version range
3. **Migrations applied** to remote Supabase
4. **DB credentials rotated** if any were exposed
5. **PR: staging → main** with release notes
6. **Tag the release**: `git tag v5.3.0 && git push origin v5.3.0`

---

## Implementation Plan Parallelability Review

> **Every implementation plan must pass a parallelability check before execution.**

After completing an implementation plan, the authoring agent must review it against this document and append a section:

```markdown
## Parallelability Review

- **Zones touched:** [list from zone table]
- **Shared files modified:** [list any 🔴/🟡 files]
- **Conflicts with active worktrees:** [check `git worktree list` + sticky notes]
- **Can run parallel with other work:** Yes / No — [reason]
- **Max branch lifetime estimate:** [X days/sessions]
- **Scope splittable?** If >1 week, identify split points
```

This ensures no plan ships without explicitly considering its impact on parallel work.

---

## What This Prevents

| Past Problem | How This Fixes It |
|--------------|-------------------|
| 63-commit promotion debt | Max 1-week branch lifetime + weekly merge cadence |
| Plans 027+028 stacked on one branch | One plan = one branch, no exceptions |
| Cherry-picking across branches | Short branches + rebase = linear history, clean fast-forward merges |
| Lost worktrees | `git worktree list` check at every session start |
| Agents stepping on shared files | Zone ownership table + sticky note declarations |
| Forgotten version bumps | Bump at commit time rule + `npm run version:sync` |
| No paper trail for promotions | PRs required for all merges to staging |

---

## Quick Reference Card

```
START SESSION:
  1. git worktree list
  2. cat .headbox/sticky-notes/*.md
  3. git log --oneline staging -5

START FEATURE:
  git worktree add ../Tabatha-{slug} -b feat/{slug} staging
  echo sticky note → .headbox/sticky-notes/{date}-{slug}.md

DURING WORK:
  git fetch origin && git rebase origin/staging  (daily)

FINISH FEATURE:
  git push origin feat/{slug}
  Open PR → staging
  After merge:
    git worktree remove ../Tabatha-{slug}
    git branch -d feat/{slug}
    git push origin --delete feat/{slug}
    Delete/mark sticky note
    Update plan-registry
```
