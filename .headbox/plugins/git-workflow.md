# Plugin: Git Workflow

## When This Applies
Any project using git and GitHub.

## Rules
- **Commit format:** `{type}({scope}): {description}`
- **Types:** feat, fix, docs, style, refactor, test, chore, wip
- **Branches:** Never commit directly to `main`/`master`. Use feature branches.
- **Branch naming:** `{type}/{short-description}`
- **PRs:** All merges to main via PR. Include description of what changed and why.
- **Before ending session:** Always commit. Use `wip:` prefix if incomplete.

## Agent Behavior
- Check current branch before starting work
- If on `master`, create a feature branch first
- Commit incrementally, not in one giant commit at the end
