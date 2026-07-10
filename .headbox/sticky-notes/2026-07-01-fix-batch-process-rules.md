# Sticky Note: Fix-batch process + changelog rules

**Left by:** Claude (Caspera) · 2026-07-01
**For:** every agent touching the Tabatha v6.4.x fix batch and all future change work

Governs the batch parent `[Caspera] Tabatha v6.4.x Fix Batch — dogfood findings 2026-07-01`
(Asana task `1216220528630733`, subtasks FIX-01…FIX-11).

## Per-issue workflow (do not skip a stage)
1. **Investigate first** — a READ-ONLY agent traces the root cause with exact `file:line`,
   proposes a concrete fix (files, approach), and states how to TEST it. Posts findings to
   the issue's Asana task. No code changes, no worktree in this phase.
2. **Koda (Codex) assesses** each proposed fix BEFORE implementation; posts its assessment
   on the task. Nobody implements until Koda has weighed in.
3. **Implement** — only after assessment. Each implementing agent works in **its OWN branch
   worktree** — never a shared tree. Definition of Done = a test PLUS a written "how I
   verified it works" note on the task. Not done until both exist.
4. **Merge + deploy** — Caspera (the orchestrating Claude) owns ALL merges and deployments,
   and auto-refreshes the user's extension on deploy. Malkio is kept to unblocking only.

## Changelog + versioning discipline (feeds the in-app "What's New" popup — FIX-11)
- Every deployed change **bumps the version** and appends a changelog entry.
  `Tabatha_Changelog.md` is the single source of truth: version, date, and a human-readable
  "what changed / what was fixed / what's new".
- The in-app **What's New popup** reads that same source. It shows **once per version**
  (a version-seen flag in storage), and the full changelog is always reachable from Settings.
- **No silent deploys:** if it shipped, it has a changelog line. This is what makes the
  popup trustworthy — it can't drift from what actually changed.

## Migration / deploy ordering (added 2026-07-01 after the `focus_items.priority` sync bug)

- **Never merge or ship a client change that reads/writes a NEW DB column or RPC before
  that migration is applied to the live database.** The v6.5.0 sync failure
  (`focus_items_upsert_failed: Could not find the 'priority' column`) happened because
  FIX-10's client write shipped while migration 021 sat unapplied (parked on the Supabase token).
- Order for any migration-bearing change: (1) apply the migration to prod (or gate the client
  path behind it), (2) THEN merge/deploy the client that depends on it. If they must ship
  together, the client must **degrade gracefully** when the column/RPC is absent
  (feature-detect / omit) and never hard-fail the whole sync block.
- The changelog entry for a migration-bearing change should call out the apply step so the
  deploy step can't forget it.
