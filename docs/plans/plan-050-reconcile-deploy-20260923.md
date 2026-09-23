# Implementation Plan 050: Reconcile Local Work and Deploy Verified Releases

Date: 2026-09-23. Owner: Koda. User authorized reconciliation, cherry-picking, parallel review, and deployment in this conversation.

Current versions: extension source 6.7.82; shipped staff/enterprise extension 6.7.78; Sidecar live 0.13.14 while canonical source incorrectly remains 0.11.0. Expected target: extension 6.7.83 after reconciliation; Sidecar 0.13.14 retained unless a new product fix is required. No major-version promise is implied by unfinished Cortex plans.

## Scope and preservation

Work only in `C:/Users/mrmal/le dev/Tabatha-reconcile-20260923`, branch `Koda/reconcile-20260923`, initially based on origin/staging 166c1f6. Preserve the five original worktrees and branch histories. Original dirty and staged patches plus the seven-file Atlas directory were backed up under `C:/Users/mrmal/le dev/Tabatha/.git/reconciliation-backups/2026-09-23` before any reconciliation.

## Deliverables (5/7 complete; publication and final ledger pending)

1. Inventory every dirty worktree and all local branches; classify unique, already-integrated, generated, rejected, and deployment-only work with commit evidence.
2. Recover current documentation history and local staging safeguards. In particular, c429abe prevents a full-site deploy from silently downgrading enterprise Chrome; 6362467 preserves feature-number repairs.
3. Restore missing, already-shipped extension sync fixes from d04b7c2, including final 802997e clamp corrections; restore Sidecar product source from 23cc706, whose bundle SHA256 matches live. Review pairing hardening bfc912e and Asana rescue commits independently, checking current production dependencies first.
4. Reconcile all uncommitted material: Headbox config/registry, Atlas, generated changelog/version stamps, and SYSTEM-MAP history. Preserve disputed plan-number aliases and full original descriptions; never turn truncated text or unverified deployment claims into canonical fact.
5. Validate consolidated source: extension tests/build/version/changelog checks, Sidecar tests/type/build, docs registry, source-diff review, and real-browser smoke checks. Build only in the isolated worktree; preserve installed Chrome data and extension identities.
6. Promote via reviewed PRs to staging and main as appropriate; deploy each ready surface from committed source. Check live backend code/migration ledger/ACLs before any database change. Verify staff zip hash, enterprise CRX id/version, CWS status, website routes and Sidecar bundle; retain rollback artifacts. Existing live 0.13.14 Sidecar may be verified without unnecessary redeployment.
7. Record final SHA, PRs, artifact hashes, live versions, exclusions, remaining blockers, and rollback procedure; update progress and registry honestly.

## Known holds and release gates

- `feat/org-hours-v1` was rejected for privacy disclosure. Keep the UI excluded. Do not replay migration 060, which can restore revoked permissions. Verify live mitigation before any related deployment.
- Higher manifest versions do not prove source completeness. HEAD 80bc18a lacks shipped 6.7.78 sync code; product diffs and tests decide readiness.
- `update-channel` is an orphan artifact branch and must never be merged into application source.
- Companion and Watch are separate repositories/products. Inspect their existing release state if required by recovered work; do not silently rebuild or replace signed companion artifacts without validating the update identity and key continuity.
- No wholesale migration push. Compare actual deployed state and apply only reviewed forward changes with a known rollback/mitigation.
- Authentication must target the existing Cloudflare account/project and existing CWS item. Temporary preview accounts are not production deployment substitutes.

## Verification and rollback

Capture live metadata before publication. Deploy channels only after local gates and independent review pass. If an artifact fails verification, stop that surface, preserve the last-known-good live pointer, and continue independent ready surfaces. Rollback website/Worker using recorded prior deployment IDs; preserve prior CRX and staff release assets. Chrome version rollback requires a higher-version corrective build where clients reject downgrades. Database rollback must preserve user data and use forward fixes; never drop tables or reset production.

## Parallelability Review

Reviewed against `docs/parallel-development-workflow.md` on 2026-09-23.

- Zones: extension sync/clock/focus, Sidecar, backend pairing/Asana, site/release tooling, documentation.
- Shared files: manifest, package, changelog, router, version-stamped docs, Headbox. Root owns commits/merges and release version; extension agent temporarily owns current merge-conflict resolution; Sidecar agent owns only `sidecar/`.
- Existing worktrees: home-header-fix, pair-code-expiry, reconcile-6770, Sidecar and the main dirty checkout remain intact. All integration edits use the new isolated worktree.
- Parallel work: independent read audits and disjoint file edits allowed; index mutations, merges, backend writes and deployment are serialized by root.
- Maximum branch lifetime: one week; target one sustained reconciliation session. Split by verified extension/site release, Sidecar source recovery, and separately gated Asana/backend work if longer.
