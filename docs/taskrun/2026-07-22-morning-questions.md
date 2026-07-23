# Overnight TaskRun 2026-07-22/23 — Morning Questions

> These are the decisions/clicks that need Malkio. Each has the work already done around it
> underneath, so the morning is approvals, not investigation. Ordered by importance.
> Umbrella Asana task: `1216808296793529` (Flux Development `1214031898449333`).

---

## Q1 (HEADLINE) — The extension source-of-truth is forked. Which branch is canonical?

**What I found (verified by direct git inspection, not report):**

- **`staging`** (`3d46e37`) carries the site/docs/audit/`/download` work AND the compiled
  `site/enterprise/tabatha-6.7.56.crx` binary — but its extension **source** (`public/manifest.json`)
  is still **6.7.47**. The `release(enterprise): 6.7.54 -> 6.7.56` commit (`211a398`) only committed
  the prebuilt `.crx` + an `update.xml` bump; it did **not** bump the source manifest or carry the
  6.7.48–6.7.56 source changes. Confirmed: the XSS escaping sweep (SYNTHESIS #1) is **absent** from
  `staging`'s `src/content/gatekeeper.js` — only the binary has it.
- **`integrate/6.7.50`** (`07866c2`) holds the **real source** for 6.7.48–6.7.56: device management
  merge, home-header fix, Split-Tab T logo, device pairing-code mint (6.7.52), session-aware reclaim
  (6.7.53/54), the XSS escape sweep (`97d1827`, audit #1), and the RLS `revoked_at` guard (`07866c2`,
  audit #2). Its `public/manifest.json` reads **6.7.56**.
- The two branches **forked at `59d326b`** (privacy-policy rewrite). `git merge-base --is-ancestor`
  confirms **neither contains the other**: staging has site/docs/audit commits integrate lacks;
  integrate has the entire 6.7.48–6.7.56 extension source staging lacks.

**Why this matters:** the queue's TR-18 guessed `integrate/6.7.50` was "very likely fully superseded"
and a delete candidate. That is backwards — it is the **only** branch with the shipped extension's
source. Deleting it would orphan the source behind the live 6.7.56 CRX. And building extension fixes
on `staging` would base them on a tree 9 patches behind the shipped artifact, silently re-doing (or
regressing) already-shipped security work.

**What I did around it tonight:** all extension **source** fixes are based on `integrate/6.7.50`
(the true source line), versioned **6.7.57+**, committed **locally only** — no push, no merge, no
CRX rebuild/publish. They sit on the branch that already owns the ext source, ready to review.

**The decision(s) I need:**
1. Confirm `integrate/6.7.50` is the canonical extension source line (I'm treating it as such).
2. Approve reconciling the fork: merge `staging`'s site/docs/audit work and `integrate/6.7.50`'s
   ext source into one line. Which direction — merge integrate → staging, or the reverse? (This is a
   protected-branch operation; I prepped but did not execute it. See Q4.)
3. After reconciliation, approve rebuilding + shipping a `6.7.57` CRX with tonight's fixes.

---

## Q2 — Sidecar source-of-truth (parallel to Q1, if confirmed)

Charter says Sidecar **0.13.5** is live, but `staging` and this worktree both read `app.json`
**0.11.0**. The current Sidecar source likely lives on another branch/worktree (same pattern as the
extension fork). **Decision:** confirm which branch is the canonical Sidecar source so Sidecar work
(TR-14 feedback button, TR-17 version-gen) bases on the right tree.
_[Investigation status filled in during the run — see progress log.]_

---

## Q3 — Org-hours v1 RPC consent model (SYNTHESIS #5, queue Excluded)

Technical shape ready (`019_owner_read_views.sql` computes the aggregates, `service_role`-only today).
Koda's synthesis says build it **after** you confirm the #221 consent model
(`docs/superpowers/specs/2026-07-21-shared-focus-org-context-concept.md`). **Decision:** lock the
consent model (aggregate-only default, per-person opt-in via `profiles.settings.share_hours_with_org`)
so this — and Team worked-stints in Work Shifts (ask b), which is sequenced behind it — can build?

## Q4 — origin/staging push + branch cleanup (Global Rule 3, queue Excluded + TR-18)

Local `staging` is ahead of `origin/staging` (includes 6.7.52–6.7.56 release commits). This is a
fast-forward, but pushing a protected branch is human-gated. **Decision:** approve the `origin/staging`
catch-up push? And — dependent on Q1 — approve closing `integrate/6.7.50` only *after* its source is
merged (NOT before; see Q1, it is not superseded).

## Q5 — Email/SMTP branding (SYNTHESIS #6, queue Excluded)

Plan is written and code-complete; step 1 is "Malkio generates an app password for
`tabatha@duckandshark.com` at myaccount.google.com/apppasswords." **Decision/action:** generate and
hand over that app password (credential — Malkio-only, cannot be delegated) and everything else runs
same-day.

## Q6 — `feat/logo-rollout` merge target + CWS submission source (queue Excluded, TR-19)

Resolves largely with Q1: the logo source already lives inside `integrate/6.7.50` (merged there at
`a22b504`). **Decision:** confirm the reconciled line (per Q1) is the CWS-submission source before any
store submission.

## Q7 — staging → main promotion (queue Excluded)

Not executed tonight. **Decision:** once `origin/staging` is caught up (Q4) and the fork reconciled
(Q1), do you want a `staging → main` promotion PR prepared, and on what timeline?
