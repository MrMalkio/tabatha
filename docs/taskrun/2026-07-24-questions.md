
## Backend integrity (CeeCee, verified against prod)

**B1 — Migration 029 has no file anywhere.** It's applied in production, but no file exists in any
of the 33 worktrees. Everything since is now consolidated and ledger-correct (050/058/059/060), so
this is the last gap. Do you remember what 029 was (dashboard-applied change? deleted branch?), or
should we accept prod as truth and write a `029_historical_placeholder.sql` documenting that its
contents are unknown-but-live? **Recommended: placeholder** — it makes the sequence reproducible
and stops future agents re-flagging it.

**B2 — Two undocumented edge functions are ACTIVE in production**: `asana-task-action` (v5) and
`asana-widget` (v3, "Tabatha Asana widget"). Neither has a folder in the repo, so we can't diff
what's actually running. Likely descendants of the old Flux Asana widget server. Do you want them
(a) sourced back into the repo, or (b) decommissioned? Untouched pending your call — they're live
surface and deleting blind would be reckless.
