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

## Published results

Release source: `333d99a34966134cc9ff310948e3c9f96c126ee8`. [PR 39](https://github.com/MrMalkio/tabatha/pull/39) merged the reviewed integration into staging; [PR 40](https://github.com/MrMalkio/tabatha/pull/40) promoted staging to main. No direct push to either protected source branch.

| Surface | Confirmed result | Limit |
| --- | --- | --- |
| Staff extension | [ext-v6.7.83](https://github.com/MrMalkio/tabatha/releases/tag/ext-v6.7.83), tag points to release source; live channel advertises 6.7.83 | Individual installations were not all inspected. |
| Enterprise extension | Live update.xml offers 6.7.83; signed CRX3 preserves ID `jbdkacccpknbiphigeabcdojemnhacjj` | Chrome controls client update timing; do not replace its identity or uninstall to force an update. |
| Website | Pages deployment `ad355e83-9f8a-4a0a-9a1e-73dd1617b750`, source metadata 333d99a; root/docs/download/show return 200 | `commit_dirty=true` is recorded by Pages. Inspected deployed content matches source; a concurrent temporary publisher worktree is a possible, unproven cause of that metadata flag. |
| Chrome Web Store | Existing item `piopncjacohahbkkmockjnpenhdbmmbc`: upload SUCCESS, trustedTesters publish OK; independent status returns HTTP 200, crxVersion 6.7.83, publicKey present | Draft uploadState NOT_FOUND after publication does not establish completed review or tester install availability; this API response exposes neither. |
| Sidecar | Live 0.13.14 bundle unchanged and byte-identical to the recovered original worktree bundle | Already deployed, not redundantly republished. Authenticated cross-device behavior remains unverified in this session. |
| Supabase | No function, migration, grant, or secret changed | Management credential 401; unsafe pairing/Asana recovery and current org-hours ACL verification remain held. |

Artifact SHA-256 values:

- Staff ZIP, 554,947 bytes: `482d6e77d679419cdeb01a94982ac02416a49fef2697db96a47b66a7283474af`.
- Enterprise CRX, 559,528 bytes: `b64cc0d1f3b6a34a9e2e4e1326aa9dc6f92b1bcb4f2504c0ed248236d5121748`.
- Live Sidecar entry bundle, 2,425,812 bytes: `ac0df37e82dbe0010e8f6adb22fca3a3a0ce6535a8e5269bc9202bd64cf7dbe2`.
- Tested and locally mirrored extension background bundle: `0fead2e483d1f1bd711715c42a286eeb591d62232abcd4c14860448b39848c82`.

Independent live comparison: root, docs, showcase, update.xml match the release working-copy bytes and normalized committed text; CRX matches the committed binary exactly. Download page differs only by Cloudflare email obfuscation and its decoding script. Final combined extension/guard suite: 846/846 passed, including 13 fail-closed enterprise guard regressions; Sidecar: 166/166 passed. Real Chrome smoke details and limits are in `2026-09-23-browser-smoke.md`.

## Local installation and open gates

The original checkout's uncommitted Headbox/Atlas snapshot was committed as 0162e59 before merging released source at d91fc3a. Original runtime source now matches the release; the only additional tracked content is a historical registry note. The tested dist was copied into a fresh sibling directory and atomically swapped into the fixed `C:/Users/mrmal/le dev/Tabatha/dist` path. Its predecessor is backed up under `.git/reconciliation-backups/2026-09-23/dist-before-local-release`.

This disk update does not prove the user's running Chrome instance updated. A real-profile read showed an older enterprise Tabatha page; interaction stopped when the desktop tool detected user input. No extension was removed or reinstalled and no real-profile storage was modified. The user should check the installed version, allow the enterprise update (or reload the existing unpacked entry, if that is the entry in use), and run a signed-in cross-device smoke test.

Next gates, kept open rather than silently shipped:

1. Verify the installed extension is 6.7.83 and smoke-test real account synchronization with Sidecar.
2. Provide a valid Supabase management credential through the existing local secret mechanism; inspect deployed functions, migration ledger and current org-hours permissions without replaying migrations wholesale.
3. Repair and test pairing fail-closed consumption/attempt accounting and lease ownership before proposing that deployment. Do not deploy archived SQL 061 as-is.
4. Define caller-to-Asana-resource authorization before enabling the rescued shared-PAT action/widget work.
5. Confirm CWS trusted-tester availability separately; accepted publication is not proof that every installation has updated.

The historical branches/worktrees and rejected work are retained, not deleted. All five original worktrees are now clean. Their substantive dirty snapshots were independently compared with the pre-work backups before committing:

| Recovery ref pushed to origin | Commit | Preserved work |
| --- | --- | --- |
| Koda/recovery-main-20260923 | d91fc3a (includes snapshot 0162e59) | Original Headbox/Atlas edit, followed by verified release merge |
| Koda/recovery-home-header-20260923 | 6d4b0fb | Historical generated 6.7.49 changelog entry; not a new release candidate |
| Koda/recovery-docs-stamp-20260923 | de6273e | Historical docs 6.7.73 badge; not deployed over 6.7.83 |
| Koda/recovery-sidecar-history-20260923 | 4c9a956 | Exact original SYSTEM-MAP history; complete body already preserved in canonical source |

Pair-code-expiry needed no commit: working file, index and HEAD had the same blob; refreshing the index cleared its stat-only dirty marker. No user content was discarded. Original backups remain local; recovery refs provide a second copy on the existing GitHub remote.

Do not deploy an old worktree merely because its Git status is clean. The enterprise rollback preflight now blocks unverifiable live versions, but it can only protect releases that use the checked deployment command.
