# Tabatha reconciliation — 2026-09-23

## Inventory and disposition

| Source | Finding | Disposition |
| --- | --- | --- |
| Main checkout 80bc18a | Extension version 6.7.82; 23 local documentation commits; dirty Headbox config/registry; untracked Atlas | Merged documentation history, preserved config update, repaired migration table formatting, archived exact original registry proposal, recovered all seven Atlas files. |
| Local staging 83c295e | Enterprise rollback protection, feature numbering repairs, later operational records absent origin/staging | Merged at 1441bfb; session records preserved on both sides. |
| fix/sync-integrity-cluster d04b7c2 | Already-shipped 6.7.78 runtime fixes absent from 6.7.82 source | Merged at 0089933; final clamp fixes and tests preserved. |
| Sidecar 23cc706 | Source 0.13.14, while trunk was 0.11.0 | Restored product tree exactly at e12d748; 166 tests and clean export pass. Live original bundle hash matches. |
| Sidecar dirty SYSTEM-MAP | 61 daily log entries; old narrative mixed with current date; extension/Sidecar versions compared incorrectly | Full dirty snapshot preserved with explicit historical correction. |
| home-header-fix | Code already integrated; dirty changelog is generated 6.7.49 history now covered by consolidated changelog | No duplicate fix applied. Original snapshot backed up. |
| pair-code-expiry 2607705 | CWS origin addition; historical copied-code expiry test; dirty JSON is line-ending/index noise | CWS origins recovered from 624031a; historical expiry test archived with pairing source. |
| reconcile-6770 | Code already integrated; dirty docs badge only 6.7.72→6.7.73 | Regenerated badges at final version. |
| bfc912e pairing hardening | Reproduced consume-failure token return, fail-open attempt ledger; unowned SQL lease | Reviewed then reverted from deployable tree; source/SQL/test preserved in docs/recovered/pair-watch-bfc912e. Not deployed. |
| Asana rescue 58eb001 | Missing widget/action/migration source; action uses global PAT without caller-resource authorization | Backend/migration recovered under docs/recovered/asana-58eb001; original full source branch retained. New controls not activated. |
| feat/org-hours-v1 | Recorded critical privacy rejection; historical grants were revoked live | UI remains excluded; no migration replay. Current live ACL not verified due management-token 401. |
| preview harness cadfd35 | Useful missing isolated UI test harness | Recovered helper/config files without old version bump; npm test targets real test files. |
| older branches | Home header, device management, logos already ancestors; sync-drift and short-invite fixes already salvaged | Do not replay patch-equivalent work. |
| update-channel | Orphan release metadata | Keep separate from source history. |

## Preservation

Before integration, every original worktree's staged/unstaged binary diff and the untracked Atlas directory were copied to `C:/Users/mrmal/le dev/Tabatha/.git/reconciliation-backups/2026-09-23`. Original worktrees were not switched, reset or deleted. Recovery documents identify their original commit/path. Twenty-two unique Sidecar specs were retained under a qualified recovery path to avoid silently reusing feature/plan numbers.

The Headbox renumbering proposal 047–049 remains reserved but unapproved. Existing 039/040/041 aliases and complete descriptions are preserved; the original malformed/truncated edit is retained as historical evidence. Plan 050 is this reconciliation; next free number 051.

Atlas validation: 128 unique nodes, 201 edges, 9 clusters, no dangling edges, CommonJS script syntax valid. Atlas is internal project intelligence, not added to the public website deployment.

## Verification before release

- Extension: 833 tests passed after reconciliation, production build passed, version/changelog consistency passed.
- Sidecar: 166 tests passed; 1,212-module clean Expo export, 2,426,580-byte entry bundle. TypeScript passes with Expo types. Existing generated-route typing can flag the unused starter `/explore` link; no runtime change introduced.
- Docs registry: passed with known historical plan-number collision warnings.
- Live Sidecar 0.13.14 bundle SHA256: `AC0DF37E82DBE0010E8F6ADB22FCA3A3A0CE6535A8E5269BC9202BD64CF7DBE2`; original worktree bundle exact match.
- Browser smoke and final guard tests are recorded separately before publishing.

## Deployment baseline and rollback

- Cloudflare Pages account `6626f19592552625c9104cf0659662f4`, project `tabatha`, previous production deployment `3c07965c-43f9-410f-8533-336759e089b1` from c429abe. Pages-specific credential works when account ID is explicit; default account listing is empty due scope.
- Enterprise live before release: 6.7.78, ID `jbdkacccpknbiphigeabcdojemnhacjj`; prior CRX retained. Prepared 6.7.83 CRX SHA256 is recorded in final release results.
- Staff live before release: ext-v6.7.78; release/channel pointer retained in Git history. Release tag must point to the reviewed source SHA before running publisher (publisher otherwise defaults to GitHub's default branch).
- Sidecar live 0.13.14 already matches recovered source. Worker credentials lack deployment rights; no redundant redeployment is required to reconcile this surface.
- Supabase management credential returned 401; no backend functions, SQL, grants, or secrets were changed. Public endpoint probes do not prove source or ACL state.
- CWS existing item `piopncjacohahbkkmockjnpenhdbmmbc`; use existing trusted-testers audience. Authentication requires Node system CA trust in this environment; TLS verification remains enabled.

Rollback uses the previous Pages deployment and preserved artifact pointers; clients already upgraded may require a higher-version corrective build. Never reset/drop production data to roll back application code.
