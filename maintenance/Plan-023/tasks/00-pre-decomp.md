# Task 00 — Pre-decomp (docs, version sync, branch cleanup)

| Property | Value |
|---|---|
| **Branch** | `chore/plan-023-pre-decomp` |
| **Branched from** | `master` |
| **Merge target** | `master` |
| **Depends on** | — |
| **Parallel with** | Nothing (sequential gate) |
| **Effort** | ~2 hours |
| **Risk** | Low |

## Goals
1. Bring `docs/architecture/` into existence with **current** (master-aligned) versions of the three docs.
2. Land the version sync script with `pre-commit` + `prebuild` wiring.
3. Archive obsolete branches and remove the stale worktree.
4. Land the privacy-mode-defaults sticky note for the future-modes discussion.

## Steps

### 1. Architecture docs

```bash
# Pull from the archived branch (after step 3 it'll be a tag, before that it's a branch)
mkdir -p docs/architecture
git show refactor/service-arch:docs/architecture/service-decomp-plan.md     > docs/architecture/service-decomp-plan.md
git show refactor/service-arch:docs/architecture/service-map.md             > docs/architecture/service-map.md
git show refactor/service-arch:docs/architecture/migration-checklist.md     > docs/architecture/migration-checklist.md
```

Then **manually update** each against master:
- `service-map.md`: re-derive the handler list from current `background.js`. Expect ~79 cases vs the doc's 62.
- `migration-checklist.md`: replace with a fresh table that has every current message type and columns: `Service` / `Extracted?` / `Build green?` / `Same response shape?` / `Manual test pass?`.
- `service-decomp-plan.md`: keep extraction order + router pattern, update handler counts.

Also create `docs/architecture/message-contracts.md`: a frozen response-shape registry, one row per message type. Populate as services are extracted.

### 2. Version sync script

The script lives at `scripts/sync-version.mjs` (already written). Wire it up:

`package.json` additions:
```json
{
  "scripts": {
    "version:sync": "node scripts/sync-version.mjs",
    "version:check": "node scripts/sync-version.mjs --check",
    "prebuild": "node scripts/sync-version.mjs"
  }
}
```

Pre-commit hook (`.git/hooks/pre-commit` — plain shell, no Husky dependency added):
```bash
#!/usr/bin/env bash
node scripts/sync-version.mjs --check || {
  echo "Version drift. Run: npm run version:sync"
  exit 1
}
```

Run once to align everything to `manifest.json`'s `3.34.5`:
```bash
npm run version:sync
git add package.json AGENTS.md CLAUDE.md GEMINI.md .gemini/agent.md
```

### 3. Branch cleanup

Per [branch-worktree-audit.md](../branch-worktree-audit.md):

```bash
git -C "/c/Users/mrmal/Le Dev/Tabatha-service-arch" status --porcelain   # must be empty
git worktree remove "C:/Users/mrmal/Le Dev/Tabatha-service-arch"

git tag archive/service-arch-v1 refactor/service-arch
git branch -D refactor/service-arch

git tag archive/follow-through-engine feat/follow-through-engine
git branch -d feat/follow-through-engine

git tag archive/v3-ux-overhaul feat/v3-ux-overhaul
git branch -d feat/v3-ux-overhaul

git push origin --tags
```

**Confirm with user before deleting `feat/follow-through-engine` and `feat/v3-ux-overhaul`.**

### 4. Privacy sticky note

Create `.headbox/sticky-notes/privacy-modes-future.md` capturing your direction: defer Full/Balanced/Minimal until application experience differences are mapped; default is Full; settings copy explains title+URL usage.

## Ledger entry (required before merge)

Append to [../semantic-changes.md](../semantic-changes.md):
- `chore/plan-023-pre-decomp` | docs added, branches archived, version-sync script wired | `internal-only`

## Verification

- [ ] `npm run version:check` exits 0
- [ ] `npm run build` succeeds
- [ ] `git branch -a` shows only `master`, `origin/main`, `origin/master`
- [ ] `git worktree list` shows only the primary worktree
- [ ] `git tag -l 'archive/*'` shows three tags
- [ ] `docs/architecture/{service-decomp-plan,service-map,migration-checklist,message-contracts}.md` all exist and reflect master state
