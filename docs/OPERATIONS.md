
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

### 5.y Live-testing tool constraints (learned 2026-07-25, save future runs the time)

- **claude-in-chrome cannot access another extension's pages.** Any `chrome-extension://<other-id>/*`
  URL (and `chrome://extensions` itself) returns *"Cannot access a chrome-extension:// URL of
  different extension"*. This is a deliberate isolation guard — there is no flag or workaround.
  It also fires when the page loads itself via `chrome_url_overrides.newtab`.
  **Consequence:** the extension's own UI (home / sidebar / settings / popup) cannot be E2E-tested
  through the browser tools against a real install.
  **Workaround that works:** serve the same entry points from the Vite dev server
  (`npm run dev` → `http://localhost:5173/home.html` etc.) with a `chrome.*` shim providing fixture
  data, and test layout/structure/logic there. Be explicit in reports that shimmed data ≠ real data.
- **`navigate()` force-prepends `https://`** onto already-schemed `chrome-extension://` / `chrome://`
  strings — a separate tool bug; don't waste time thinking it's a typo on your end.
- **Content scripts ARE testable** on ordinary web pages — the gatekeeper / InBar / BlockGate
  overlays can be exercised for real. That's where browser-driven regression testing pays off.
- **Respect a live human.** If test tabs get closed moments after opening, the user is at the
  keyboard: stop opening tabs in their browser, switch to localhost, and never resolve a real
  focus-gatekeeper modal on their behalf.
