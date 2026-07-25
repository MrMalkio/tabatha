
### 5.x Migration-ledger hygiene (rule added 2026-07-25 after real drift)

Two failure modes bit us; both are now rules.

1. **Applying a migration via the Management API `/database/query` endpoint does NOT record it
   in `supabase_migrations.schema_migrations`.** The SQL runs, the effects are live, but the
   CLI ledger still shows a gap — so `supabase migration list` reports it as "not applied" and a
   later `db push` would re-run it. If you apply that way, INSERT the version into the ledger in
   the same session (`insert into supabase_migrations.schema_migrations (version) values ('NNN')
   on conflict do nothing`), and only ever apply idempotent SQL that way.
2. **A migration applied to prod from a feature worktree must land on the canonical line
   (`staging`) immediately** — not "when the branch merges." Migrations 059 and 060 were live in
   production while their only files sat on unmerged branches (`short-invite-tokens`,
   `org-hours-v1`), making prod's schema unreproducible from the canonical repo. Copy the file to
   `staging/supabase/migrations/` and commit it the moment the migration is applied; the feature
   branch keeps its copy until merge.

Historical note: migration `029` is applied in prod with no file in any known worktree — a
pre-existing gap, not reproducible from the repo. Flagged, not fixed (needs Malkio's history).
