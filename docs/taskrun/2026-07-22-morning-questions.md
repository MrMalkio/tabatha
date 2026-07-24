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

**RESOLVED during the run:** the only worktree at Sidecar `app.json` 0.13.5 is
`claude/tabby-sidecar-mobile-46c612` (the sidecar mobile branch) — `staging` and every other
worktree read 0.11.0. So `claude/tabby-sidecar-mobile-46c612` **is** the canonical Sidecar source
line (it ships straight to prod via the clean-worktree pipeline; it doesn't need staging). Sidecar
work tonight (TR-17 version-gen, the Sidecar half of TR-14) bases on it. **Decision (confirm only):**
agree this branch is canonical for Sidecar. See `docs/taskrun/2026-07-22-git-reconciliation.md`.

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

## Q8 — TR-01: Regina device-row cleanup (one DELETE to approve + run)

Prepped, not executed (hard-deleting production rows is a §1.2 deferred action, and no prior
server-side-cleanup run existed to replicate). **Findings (verified live via Mgmt API):**
Regina (`profile_id 07466c2e-ba6c-4a89-b701-1a550544a44e`, display_name "regina") has **37**
`tabatha.browser_profiles` rows: 33 are the null-`machine_id` chrome local_id-regen flood, the
other 4 are real distinct devices. Of the 33 flood rows, **15 carry FK-referenced history (keep)**
and **18 are unreferenced pure dupes (safe to delete)**. Post-cleanup Regina keeps **19** rows; the
15 referenced flood rows collapse visually once TR-13's chip grouping ships.
- (Correction to the queue's premise: the "~731 rows / ~650 dupes" figure describes *Malkio's own*
  historical account (`4abda377`, "Malkio R", 115 rows / 110 revoked today), not Regina's — Regina's
  flood is the milder 37→19 case.)

**The action:** review + run `scripts/regina-device-dedup-2026-07-23.sql`. It is a DRY-RUN SELECT
(expect 18), then a transactional BACKUP-to-shadow-table + DELETE with a count safety-rail and a
one-line UNDO. Fully reversible via the shadow table. Nothing else needs deciding — just approve and run.

## Q7 — staging → main promotion (queue Excluded)

Not executed tonight. **Decision:** once `origin/staging` is caught up (Q4) and the fork reconciled
(Q1), do you want a `staging → main` promotion PR prepared, and on what timeline?

---

# Resolution Addendum — 2026-07-24 (Kael, Opus coordinator; dispatched by CeeCee with Malkio's recorded morning approvals)

Each question below is marked with what was actually done.

- **Q1 — RESOLVED / EXECUTED.** `integrate/6.7.50` confirmed canonical extension source. Reconciled by merging `integrate/6.7.50` (v6.7.69, tip `1af518f`) → a fresh worktree off `staging`. 7 conflicts, all version/agent-family files (manifest, package.json, changelog, AGENTS/CLAUDE/GEMINI/.gemini) — resolved surgically (version numbers → integrate's; changelog & session-logs UNIONed, staging's site/docs history preserved). Merge commit `b9610e8`; zero conflict markers repo-wide; `npm test` 739/739 pass; `npm run build` green.
- **Q6 — RESOLVED.** `feat/logo-rollout` (Split-Tab T) was already fully contained in `integrate/6.7.50` (merge-base check confirmed bf08fcc ⊂ integrate). No separate merge needed; the icons rode in with the reconciliation. Confirmed 6.7.70 reconciled `staging` is the CWS-submission source; the CWS store draft was NOT touched (queue-reset risk).
- **Q2 — CONFIRMED (no action).** `claude/tabby-sidecar-mobile-46c612` remains canonical Sidecar source line.
- **Version bump.** 6.7.69 → **6.7.70** (reconciliation commit, version-per-commit rule), `version:sync` propagated to all 5 files, changelog + changelog.json regenerated. Commit `b2552cd`.
- **Q4 — EXECUTED (approved).** `origin/staging` fast-forwarded `98c9e5b` → `b2552cd` → `e9e0a2e` (push via gh credential helper; Windows credential-manager GUI bypassed). Local `staging` in the MAIN checkout was NOT fast-forwarded: it holds another agent's (Vessa/TaskRun-2) uncommitted docs work (`site/docs/*.html`, `scripts/stamp-docs-version.mjs`, `package.json` site:build edit) — "dirty beyond known SYSTEM-MAP.md" guard fired, so I did not clobber it. Local `staging` catches up cleanly (ff) once that tree is committed. `integrate/6.7.50` NOT deleted (retirement deferred; see reconciliation doc).
- **Enterprise CRX — EXECUTED (id+version verified).** Packed `tabatha-6.7.70.crx` with the standalone signing key; verified crx_id = `jbdkacccpknbiphigeabcdojemnhacjj` (from PEM AND CRX header) and inner manifest version = 6.7.70. Dropped into `site/enterprise/`, `update.xml` bumped 6.7.69 → 6.7.70 (6.7.69 kept for rollback). Committed `e9e0a2e`, pushed to origin/staging. Dist mirrored to the Chrome load path `C:\Users\mrmal\Le Dev\Tabatha\dist` (now 6.7.70 — reload the unpacked extension to pick it up).
- **Staff channel — EXECUTED.** `npm run publish:update -- --no-build`: GitHub release `ext-v6.7.70` (`tabatha-6.7.70.zip`, sha256 `f0b1ba51b494797ed3c6a3e8a689d0391e507d8f96531d86088f162cb3ba87ca`), `latest.json` on the `update-channel` branch bumped to 6.7.70. Download page (fetches latest.json dynamically) auto-reflects 6.7.70.
- **Site deploy — DEFERRED for lane-coordination.** The enterprise `update.xml` reaches the force-install fleet only once `wrangler pages deploy site` runs, but that deploys the whole Pages project and would race Vessa's in-flight `site/docs` work. The crx + update.xml are durable in git on origin/staging; a single combined `site:deploy` (carrying both her docs and my enterprise crx) should be run once her docs land. Flagged to CeeCee. Fleet force-install polls on Chrome's own multi-hour cadence, so the short delay is immaterial.
- **Q8 (Regina dedup) — SCRIPT REVIEWED & CONFIRMED SAFE; EXECUTION DEFERRED.** `scripts/regina-device-dedup-2026-07-23.sql` is correct and reversible (dry-run count → transactional shadow-table backup → safety-railed DELETE-by-id → survivor check → COMMIT; one-line UNDO). Could NOT execute: the Supabase MCP available this session is write-permission-denied (`-32600`), no psql, no exposed Mgmt-API token. Needs the linked-CLI/Mgmt-API path (the same channel that applied migration 058). Low urgency — 18 reversible dupe rows.
- **Q7 (staging → main promotion) — DECISION: HOLD, do not auto-prepare now.** Reasoning (product soul + Malkio's known gate): (1) his standing practice is to RELOAD + manually re-smoke-test before a prod promotion (the v4.0.0 promotion required his 9-step browser regression; the current focus line explicitly reads "Awaiting Malkio: extension RELOAD + re-smoke-test"); the reconciled 6.7.70 line has had automated tests+build but not his manual browser regression. (2) The Phase-2 fix wave (pairing P1, invite tokens, Asana PAT parity, org-hours, sync-drift) is landing on staging right now — promoting before it settles means promoting twice. (3) Tabatha's ethos is verified, intentional action, not rushing unverified code to production. Recommendation: prepare the `staging → main` PR on Malkio's say-so AFTER the fix wave rolls into one CRX and he runs his manual regression on the reconciled line. No promotion executed.
- **Q5 (email/SMTP) — UNTOUCHED (CeeCee/Malkio owns; credential-gated).**
