# Git-line reconciliation note — 2026-07-22/23 overnight (TR-18)

> Investigation only. NO pushes to protected branches, NO branch deletions, NO merges executed.
> This preps the ground so the morning is a decision, not archaeology. Verified by direct
> `git merge-base --is-ancestor` / `git log` inspection, not report.

## Headline: the extension source is forked (this is Morning Question Q1)

`staging` and `integrate/6.7.50` **forked at `59d326b`** (privacy-policy rewrite) and neither
contains the other:

- `git merge-base --is-ancestor 3d46e37(staging) integrate/6.7.50` → **NO** (staging has commits integrate lacks)
- `git merge-base --is-ancestor integrate/6.7.50 staging` → **NO** (integrate has commits staging lacks)
- merge-base = `59d326b`.

**`staging` side** (from the fork): `/download` install page, changelog regen, privacy rewrite,
the 2026-07-21 audits, Plan 046 registration, the `/download` tester onboarding — PLUS the
compiled `site/enterprise/tabatha-6.7.56.crx` binary and an `update.xml` bump. But staging's
extension **source** (`public/manifest.json`) is still **6.7.47**; the `release(enterprise)`
commits committed only the prebuilt `.crx` + `update.xml`, never the source. Confirmed: the XSS
escaping sweep (audit #1) is **absent** from `staging`'s `src/content/gatekeeper.js`.

**`integrate/6.7.50` side** (from the fork): the actual **source** for 6.7.48–6.7.56 —
`feat/ext-device-management` merge (`93d5266`), `fix/home-header-layout` merge (`c5aab3c`),
6.7.50 release, Split-Tab T logo (`feat/logo-rollout` merged at `a22b504`), device pairing-code
mint 6.7.52 (`439626f`), session-aware reclaim 6.7.53/54 (`5779700`/`9316bd8`), XSS escape sweep
audit #1 (`97d1827`), RLS `revoked_at` guard audit #2 (`07866c2`). `manifest.json` = **6.7.56**.

### Correction to the queue's TR-18 premise
TR-18 guessed `integrate/6.7.50` was "very likely fully superseded" → delete candidate. **This is
backwards.** `integrate/6.7.50` is the ONLY branch carrying the shipped 6.7.56 extension source.
Deleting it would orphan the source behind the live CRX. **Do NOT close it** until its source is
merged forward. It is NOT superseded — it is essential.

## Branch-by-branch status

| Branch | Contained in staging? | Contained in integrate/6.7.50? | Verdict |
|---|---|---|---|
| `integrate/6.7.50` | NO | — | **Canonical extension source.** Reconcile forward; do NOT delete. |
| `feat/ext-device-management` (`2c6e446`) | **NO** (staging lacks device-mgmt source) | **YES** (merged at `93d5266`) | Fully represented in integrate. Safe to close **only after** integrate reconciles to staging. |
| `feat/logo-rollout` (`bf08fcc`) | NO | **YES** (merged at `a22b504`) | Fully represented in integrate. Same condition as above. Resolves queue Q6/TR-19 logo question — the logo source already lives in integrate. |
| `fix/home-header-layout` (`8814e86`) | (is the merge-base-side commit) | YES (merged at `c5aab3c`) | Represented in integrate. |
| `staging` | — | NO | Has site/docs/audit + the 6.7.56 CRX **binary** only. Its ext source is 9 patches stale. |

## Sidecar source-of-truth (Morning Question Q2 — RESOLVED here)
Charter says Sidecar 0.13.5 is live. `staging` and most worktrees read `sidecar/app.json` **0.11.0**.
The **only** worktree at 0.13.5 is `claude/tabby-sidecar-mobile-46c612` (the sidecar mobile branch).
**Conclusion: `claude/tabby-sidecar-mobile-46c612` is the canonical Sidecar source line** (Sidecar
ships straight to prod from it via the clean-worktree pipeline; it does not need staging). Sidecar
work this cycle (TR-17 version-gen, the Sidecar half of TR-14) bases on that branch.

## Mis-tracked upstreams (cosmetic git-config artifact — safe to fix)
Four branches track `origin/claude/tabby-sidecar-mobile-46c612` instead of their own origin ref
(a worktree-creation artifact, not a content problem):
- `claude/epic3-asana-sync`, `claude/epic8-nudges`, `claude/sidecar-lane-a-chunk2`, `claude/sidecar-notes-simple`
Fix (reversible, no content change): `git branch --set-upstream-to=origin/<same-name> <branch>` each.
_Deferred to avoid touching branch config mid-run while builders are active; low priority, listed for completeness._

## origin/staging catch-up (Morning Question Q4 — NOT executed)
Local `staging` is ahead of `origin/staging` (includes the 6.7.52–6.7.56 release commits + tonight's
docs). This is a fast-forward, but pushing a protected branch is Global-Rule-3 human-gated. Prepped as
a reviewable diff; execution awaits approval.

## Recommended reconciliation sequence (for the morning, NOT executed tonight)
1. Confirm `integrate/6.7.50` is canonical ext source (Q1).
2. Merge `integrate/6.7.50` → `staging` (brings the real 6.7.48–6.7.56 source + tonight's 6.7.57+
   fixes onto the line that also has site/docs). Conflicts expected only where both touched shared
   files (changelog, manifest) — resolvable.
3. THEN the `.crx` binary on staging matches a real source tree; rebuild 6.7.57 CRX from the merged line.
4. Close `feat/ext-device-management`, `feat/logo-rollout`, `fix/home-header-layout` (now all
   represented on staging).
5. Fast-forward `origin/staging` (Q4).
6. Fix the 4 mis-tracked upstreams.
