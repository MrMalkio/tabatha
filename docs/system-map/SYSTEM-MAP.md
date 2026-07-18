# Tabatha Family — System Status Map

| | |
|---|---|
| **Last updated** | 2026-07-18 |
| **Updated by** | Argus (AG1) — read-only survey, Asana task 1216678592681467 |
| **Verified against** | live git refs (post `git fetch --all --prune`), per-branch `public/manifest.json`, local `dist/`, sibling repos, GitHub PR list |
| **Scope** | Survey + proposals only. No merges, prunes, pushes, or deploys were executed. |

---

## 1. TL;DR — top risks today

1. **The load-unpacked `dist/` is a landmine.** `C:\Users\mrmal\Le Dev\Tabatha\dist` (the ONE path Chrome loads) contains **6.8.2** built from `Koda/asana-widget-pre-rebase` — unmerged, unreviewed widget work. Malkio believes his active extension is 6.7.22. Any unpacked reload silently runs the widget line. (Details §4.1.)
2. **Two divergent staging lines.** `origin/staging` (GitHub) = 6.6.0 + all sidecar work (PRs #23–#26). Local `staging` = 6.7.8 extension line, **ahead 49 / behind 13** — the entire 6.6.0→6.7.8 extension run was never pushed. GitHub is currently NOT the source of truth for the extension.
3. **Prod extension is stuck one release behind its own update channel.** `update-channel:latest.json` advertises **6.7.23** (published 2026-07-17) but machines report **6.7.22** — the staff auto-update *swap step* fails; the fix already exists on `fix/updater-swap` (**6.7.24**, unmerged).
4. **The 6.7.x line lives only in local worktree branches**, stacked 15–34 commits ahead of local staging, none merged to any staging. Its release tip is fragmented: local `claude/tabatha-ai-integration-layer-91903b` (6.7.22) and its own origin (6.7.23) have **diverged**.
5. **Version tangle at 6.8.x.** Koda's widget branch jumped 6.7.22 → 6.8.2 inside the extension's version line while parallel branches minted 6.7.23/6.7.24. The widget needs its own 0.x line (decision already recorded in Plan 040 addendum 4; this map codifies it — §7.1).

---

## 2. Surface inventory

| # | Surface | What it is | Code lives | Own version line | Current version (repo) | Deployed where | Deployed version | Staleness |
|---|---------|-----------|-----------|------------------|------------------------|----------------|------------------|-----------|
| 1 | **Chrome extension** | Core Tabatha MV3 extension (Attention OS) | `Tabatha` repo, `src/` + `public/manifest.json`; active line = 6.7.x worktree stack (§5) | `6.x` | 6.7.24 (`fix/updater-swap`, unmerged tip); 6.8.2 on Koda widget branch | Google Workspace rollout + staff auto-update (`update-channel` branch `latest.json` → GitHub release zip) | **6.7.22** on machines; channel advertises 6.7.23 | Prod 1 behind channel (swap bug); GitHub staging 6.6.0 = far behind |
| 2 | **Tabby Sidecar PWA** | Expo RN-Web mobile companion (+ landscape Context View) | This worktree, `sidecar/` (branch `claude/tabby-sidecar-mobile-46c612`); merged to `origin/staging` via PRs #23–#26 | `0.x` (own — `sidecar/app.json`) | **0.2.1** | `https://tabatha.pondocean.co/sidecar` via CF Worker `tabby-sidecar` (route `/sidecar*`) | 0.2.0 per last stated truth; 0.2.1 merged 2026-07-18 — **verify live** | Fresh (≤1 day) |
| 3 | **Asana widget** | Flux Asana time-tracker (Express/HTTPS server + extension-side one-click actions) | Server: `flux-asana-widget/` in repo; extension-side: `Koda/asana-widget-pre-rebase` branch | **Needs own `0.x`** — currently tangled into extension 6.8.2 | server pkg `1.0.0`; extension-side features ride 6.8.2 | Local server only (dev); extension side undeployed | n/a | Unmerged, pre-rebase |
| 4 | **Marketing / public site** | Teaser homepage, waitlist, `/show` showcase, privacy, companion download | `site/` dir; latest work on `feat/site-sidecar-promo` (pushed to origin) | Date + deploy-id (stamped with ext version today) | Stamped **6.7.23** (`feat/site-sidecar-promo`) | Cloudflare Pages project `tabatha` (root of tabatha.pondocean.co) | 6.7.23-stamped deploy | Current |
| 5 | **Desktop companion** | Tauri 2.x Windows tray app (window monitor, activity log, WS :9147) | Separate repo `C:/Users/mrmal/le dev/tabatha-desktop` | `0.x` (own — `tauri.conf.json`) | **0.2.1** | Windows download shipped from site (`feat/companion-release`); updater manifest on `feat/companion-update-manifest` (v0.2.1) | 0.2.0 download live; 0.2.1 manifest branch unmerged | Manifest branch pending |
| 6 | **Screensaver** | Refocus screensaver clock (Electron) | Separate repo `C:/Users/mrmal/le dev/Flux/Refocus-Screensaver-clock` | `2.x` (own) | **2.0.0** | Local install only | n/a | Dormant |
| 7 | **Supabase backend** | Postgres + Auth + Edge Functions + Realtime + pg_cron | `supabase/` in repo; project `mtdgoahskcibjbhfvofx`, schema `tabatha` | Migration number | **033** on `origin/staging` and this worktree | Hosted Supabase (single prod project) | Migrations **001–033 applied** | ⚠ Local `staging` tree only has through 029 (missing 030–033 sidecar files) |

---

## 3. Ground truths — claimed vs verified

| Claim | Verified? | Evidence |
|-------|-----------|----------|
| Extension prod = 6.7.22 (Workspace + Malkio's machine) | Plausible, consistent | `update-channel:latest.json` = 6.7.23 but `fix/updater-swap` (v6.7.24) exists to fix the "staff auto-update swap step" — machines stuck at 6.7.22 is exactly the symptom that fix targets |
| Local main-dir `dist/` = 6.8.2 (Koda line) | **Confirmed** | `dist/manifest.json` = 6.8.2; `Koda/asana-widget-pre-rebase:public/manifest.json` = 6.8.2 (only ref at that version) |
| origin/staging = 6.6.0 | **Confirmed** | `origin/staging:public/manifest.json` = 6.6.0 (tip `5e711ce` = PR #26 merge; sidecar PRs don't touch the manifest) |
| origin/main = 6.5.0 | **Confirmed** | `origin/main:public/manifest.json` = 6.5.0 (`2b5c600`); local `main` in sync |
| Local staging = 6.7.8 | **Confirmed** | `staging:public/manifest.json` = 6.7.8, ahead 49 / behind 13 vs `origin/staging` |
| Site prod stamped 6.7.23 | **Consistent** | `feat/site-sidecar-promo` (site work, pushed to origin) = 6.7.23, last commit 2026-07-17 |
| Sidecar 0.2.0 live | Slightly stale | `sidecar/app.json` = **0.2.1**; PR #26 (v0.2.1) merged 2026-07-18 04:13Z — verify whether the 0.2.1 Worker deploy shipped |
| Migrations 001–033 applied | **Consistent** | `origin/staging` and this worktree carry through `033_realtime_focus_status.sql` |

### 3.1 The 6.8.2-vs-6.7.22 discrepancy, explained

- `Koda/asana-widget-pre-rebase` branched off the 6.7.x stack **after** `feat/companion-release` (6.7.22) but **before** 6.7.23/6.7.24 existed, then bumped to 6.8.2 for the widget work (one-click Asana/Anasa actions).
- Koda **built that branch into the shared `dist/`** — the single path Chrome's load-unpacked is pinned to (see AGENTS.md build/load constraint).
- Result: the folder Malkio believes holds prod-6.7.22 holds unreviewed 6.8.2. Either his active install is the Workspace-rolled copy (safe for now, but the dist is a reload landmine), or an unpacked reload already put him on 6.8.2 unknowingly.
- Compounding: 6.8.x now collides with the extension line — when Koda rebases onto 6.7.24+, the version must be re-minted, and per §7.1 the widget should exit the extension's line entirely.

**Proposed remedy (do not execute without Malkio):** rebuild `dist/` from the intended prod line (`fix/updater-swap` 6.7.24 after review, or the 6.7.23 release tip `origin/claude/tabatha-ai-integration-layer-91903b`), clean-mirror per AGENTS.md; Koda keeps widget builds in the worktree's own `dist`, never the main path.

---

## 4. Distribution channels (extension)

| Channel | Mechanism | Current state |
|---------|-----------|---------------|
| Google Workspace rollout | Force-install to staff | 6.7.22 |
| Staff auto-update | `update-channel` branch `latest.json` → GitHub release zip `ext-v6.7.23` | Advertises 6.7.23 (2026-07-17); swap step broken → machines stay 6.7.22; fix on `fix/updater-swap` (6.7.24) |
| Load-unpacked (dev/dogfood) | Chrome pinned to main-dir `dist/` only | **6.8.2 (Koda)** — mismatch, see §3.1 |
| Chrome Web Store | `feat/cws-api` publishing pipeline + `origin/feat/cws-package` store zip | Built, not yet in the merged line |

Historic `dist-v*` snapshots in the main dir (`dist-v3.34.5` … `dist-v6.0.0`) are archives — ignore for status, candidates for cleanup.

---

## 5. Per-branch / per-worktree action table

Ahead/behind measured against **local `staging`** (6.7.8) for the 6.7.x line and against **`origin/staging`** for merged-state; manifest version read from each branch's `public/manifest.json`. All actions are **proposals** — nothing executed.

### 5.1 Trunks

| Branch | Ver | State | Recommended action | Expected next |
|--------|-----|-------|--------------------|---------------|
| `origin/main` / `main` | 6.5.0 | In sync; production trunk | Keep. Promote next `staging` cut → `main` via PR | Receives 6.7.x + sidecar once staging reconciles |
| `origin/staging` | 6.6.0 (+ sidecar 0.2.1, migrations 030–033) | Missing entire 6.7.x extension run | **Reconcile first** (see §7.3) | Becomes single staging again |
| `staging` (local) | 6.7.8 | Ahead 49 / behind 13 vs origin | Pull/merge `origin/staging` (sidecar side), then push — the 49 extension commits belong on GitHub | Base for landing the 6.7.x stack |
| `update-channel` | latest.json 6.7.23 | Orphan distribution branch (by design) | Keep. Bump to 6.7.24 only after `fix/updater-swap` lands and a release zip exists | Next: 6.7.24 entry |

### 5.2 Active 6.7.x extension stack (all unmerged, all descend from local staging)

| Branch | Ver | Ahead of local staging | Worktree | Recommended action | Expected next |
|--------|-----|-----------------------|----------|--------------------|---------------|
| `feat/showcase-expand` | 6.7.16 | +15 | `showcase-expand` | Contained in the 6.7.22/23 tip — prune branch + worktree after the tip lands | Delete |
| `feat/public-site` | 6.7.17 | +17 | `site` | Contained in tip — prune after landing | Delete |
| `feat/showcase-family` | 6.7.18 | +18 | `showcase-family` | Contained in tip — prune after landing | Delete |
| `feat/showcase-responsive` | 6.7.19 | +21 | `responsive` | Contained in tip — prune after landing | Delete |
| `feat/teaser-site` | 6.7.19 | +21 | `teaser` | Contained in tip — prune after landing | Delete |
| `fix/privacy-accuracy` | 6.7.20 | +23 | `privacy` | Contained in tip — prune after landing | Delete |
| `feat/companion-release` | 6.7.22 | +27 | `companion-release` | Contained in tip — prune after landing | Delete |
| `claude/tabatha-ai-integration-layer-91903b` | 6.7.22 local / **6.7.23 on origin** | +34 | **checked out in MAIN dir** | ⚠ Local and origin diverged (origin has the 6.7.23 release re-sync; local has an unpushed asana-docs commit). Reconcile (rebase local onto origin), then this is the release tip to merge → staging | PR → `staging` |
| `feat/companion-update-manifest` | 6.7.22 | +33 | — | Holds companion updater manifest (companion v0.2.1). Merge into the tip or → staging with it | Merge |
| `feat/site-sidecar-promo` | 6.7.23 | +34 | `site-sidecar` | Site prod already deployed from it. Merge → staging so prod site is represented in git trunk | Merge, then prune worktree |
| `fix/backdate-overlap-clamp` | 6.7.23 | +32 | `backdate-fix` | Review + merge into tip (version collision with site-sidecar-promo's 6.7.23 — re-mint on merge) | Merge |
| `fix/updater-swap` | **6.7.24** | +32 | `fix-updater` | **Highest priority merge** — unblocks prod 6.7.22→6.7.23/24 auto-update | Review → merge → cut release zip → bump `update-channel` |
| `feat/cws-api` | 6.7.17 | +17 | `cws-api` | Parallel CWS pipeline, not in tip. Rebase onto reconciled staging when CWS publishing resumes | Keep (rebase) |
| `Koda/asana-widget-pre-rebase` | **6.8.2** | +34 | — (built into main `dist/`!) | Do NOT merge as-is. Rebase onto reconciled staging, **re-version widget work onto its own 0.x line** (§7.1), rebuild main `dist/` from the prod line | Rebase + re-version |

### 5.3 Sidecar / docs line

| Branch | State | Recommended action | Expected next |
|--------|-------|--------------------|---------------|
| `claude/tabby-sidecar-mobile-46c612` (this worktree) | Merged via PRs #23–#26; +4 docs commits since (1 unpushed: `d3960e5`) | Keep active — current sidecar + Plan 040 docs line; push, PR when next batch ready | PR #27 (docs + this SYSTEM-MAP) |

### 5.4 Fully merged into `origin/staging` (0 unique commits) — prune candidates

| Branch | Ver | Worktree attached | Recommended action |
|--------|-----|-------------------|--------------------|
| `claude/inbar-overlay-positioning-58953b` | 6.5.0 | `tabatha-chromewebstore-roles-a097d6` | Delete branch + remove worktree |
| `claude/intent-backdating-issue-6f8f5f` | 6.5.0 | — | Delete |
| `claude/laughing-blackwell-65ce2c` | 5.8.0 | — | Delete (also 80 behind origin/main) |
| `claude/tabatha-chromewebstore-roles-a097d6` | 6.5.0 | — | Delete |
| `claude/tabathta-onboarding-demo-e01cd5` | 6.5.0 | — | Delete |
| `claude/zealous-mestorf-d1cf5e` | 6.5.0 | `zealous-mestorf-d1cf5e` (detached HEAD) | Delete branch + remove worktree |
| `codex/pr-21-review`, `codex/pr-22-review` | 6.3.x | — | Delete |
| `feat/plan-036-focus-lifecycle` | 6.3.6 | — | Delete local + `origin/feat/plan-036-focus-lifecycle` |
| `fix/plan-036-followup-v6.3.6` | 6.4.0 | — | Delete local + origin counterpart |

### 5.5 Odds and ends

| Ref | State | Recommended action |
|-----|-------|--------------------|
| `feat/nb0102-schedule-profiles` | 6.5.0, 1 unique commit vs origin/staging | Inspect the 1 commit; cherry-pick or prune |
| `origin/deploy/A-sync`, `B-features`, `CD-ext`, `fixes` | Old Plan-019 deploy branches | Confirm merged → delete on origin |
| `origin/feat/cws-package` | Store zip assets | Keep until CWS publish lands, then prune |
| Remotes `odbundle`, `psbundle` | Machine bundle remotes (OD/PS fleet) | Keep; refresh cadence per deploy-infra doc |
| Sibling clones: `Tabatha-codex`, `Tabatha-sync-batch-1`, `tabatha-mobile`, `tabatha-mobile-2` | Legacy/experiment clones outside worktree system | Audit separately; likely archive |

---

## 6. Worktree map (16 total, incl. main dir)

| Path (under `Tabatha/`) | Branch | Ver | Disposition |
|--------------------------|--------|-----|-------------|
| *(main dir)* | `claude/tabatha-ai-integration-layer-91903b` | 6.7.22 | ⚠ Main dir is NOT on `staging` (AGENTS.md assumes it is). Return to `staging` after the 6.7.x line lands |
| `.claude/worktrees/tabby-sidecar-mobile-46c612` | `claude/tabby-sidecar-mobile-46c612` | sidecar 0.2.1 | **Active** (this survey written here) |
| `.claude/worktrees/fix-updater` | `fix/updater-swap` | 6.7.24 | Active — priority merge |
| `.claude/worktrees/backdate-fix` | `fix/backdate-overlap-clamp` | 6.7.23 | Active — review |
| `.claude/worktrees/site-sidecar` | `feat/site-sidecar-promo` | 6.7.23 | Merge then remove |
| `.claude/worktrees/companion-release` | `feat/companion-release` | 6.7.22 | Remove after tip lands |
| `.claude/worktrees/cws-api` | `feat/cws-api` | 6.7.17 | Keep (rebase later) |
| `.claude/worktrees/privacy` | `fix/privacy-accuracy` | 6.7.20 | Remove after tip lands |
| `.claude/worktrees/site` | `feat/public-site` | 6.7.17 | Remove after tip lands |
| `.claude/worktrees/showcase-expand` / `showcase-family` / `responsive` / `teaser` | showcase/teaser branches | 6.7.16–19 | Remove after tip lands |
| `.claude/worktrees/tabatha-chromewebstore-roles-a097d6` | `claude/inbar-overlay-positioning-58953b` | 6.5.0 | Remove (merged) |
| `.claude/worktrees/zealous-mestorf-d1cf5e` | *(detached HEAD)* | 6.5.0 | Remove (merged) |

---

## 7. Release best practices

### 7.1 Surface-scoped versioning (codifies Plan 040 addendum 4 decision)

| Surface | Line | Source of truth | Rule |
|---------|------|-----------------|------|
| Chrome extension | `6.x` | `public/manifest.json` (repo `version:sync` stays extension-only) | Patch +1 per commit (Headbox Rule 10); MAJOR only on human call |
| Tabby Sidecar | `0.x` | `sidecar/app.json` | Independent; bump on each shipped change |
| Asana widget | **new `0.x`** | own manifest/package in the widget module | **Untangle from 6.8.2**: Koda's rebase re-mints extension commits at 6.7.25+, widget features get `widget-0.1.0` |
| Marketing site | date + deploy-id | CF Pages deploy record + a stamped build id | Stop stamping the extension version on the site; stamp `site-YYYYMMDD.<deploy-id>` |
| Desktop companion | `0.x` | `src-tauri/tauri.conf.json` (0.2.1) | Independent; updater manifest must match shipped binary |
| Screensaver | `2.x` | its `package.json` | Independent |
| Supabase | migration number | `supabase/migrations/` (033) | Forward-only; every applied migration exists in `origin/staging` |

### 7.2 Promotion flow

```
feature worktree branch ──PR──▶ staging ──release PR──▶ main (production)
        │                          │                       │
   version bump               regression                Workspace rollout /
   in same commit             + deploy stamp            update-channel bump
```

- One live staging: **`origin/staging`**. Local-only staging runs (like the current 49-commit 6.7.x run) are the root cause of today's fragmentation.
- Stacked branches are fine, but the stack's tip is the only PR; contained branches are pruned on land.
- `update-channel` is only bumped after the release zip is published AND at least one machine confirms the swap (post-`fix/updater-swap`).
- The load-unpacked `dist/` is rebuilt **only from the branch matching prod or the release candidate** — never from an unmerged feature line.

### 7.3 GitHub-as-source-of-truth restoration plan (ordered, all via PR / human approval)

1. `git pull` `origin/staging` into local `staging` (merge, keep both lines), resolve, **push** — GitHub staging now has 6.7.8 + sidecar 0.2.1 + migrations 030–033.
2. Reconcile the diverged `claude/tabatha-ai-integration-layer-91903b` (local 6.7.22 vs origin 6.7.23) — rebase local commit onto origin; that tip is the extension release candidate.
3. Merge `fix/updater-swap` (6.7.24) into the tip; PR tip → `staging`.
4. Fast-follow merges: `feat/companion-update-manifest`, `feat/site-sidecar-promo`, `fix/backdate-overlap-clamp` (re-mint colliding 6.7.23s).
5. Cut release: zip, GitHub release `ext-v6.7.24+`, bump `update-channel`, verify a machine actually swaps to it.
6. Prune §5.4 branches + stale worktrees; return main dir to `staging`.
7. Koda rebases widget work onto the new staging with widget-scoped versioning (§7.1).
8. Promote `staging` → `main` once regression passes (6.5.0 → current).

### 7.4 Daily update process for this map — options compared

| Option | How | Pros | Cons |
|--------|-----|------|------|
| A. Heartbeat agent cycle | Fold a "refresh SYSTEM-MAP" step into the existing ~30-min Caspera/Asana heartbeat (bounded: refs + versions + dist stamp only) | Zero new infra; agent judgment on anomalies; posts to Asana natively | Tied to heartbeat uptime; ~daily granularity needs a "once per day" guard |
| B. Pre-commit hook | Script regenerates version tables on every commit | Always exact at commit time | Wrong tool: map spans many worktrees + remote/deploy state a local hook can't see; slows every commit; 16 worktrees = 16 hook copies |
| C. Scheduled cloud agent (cron routine) | Daily scheduled agent runs the survey (fetch, ref sweep, dist check), rewrites the header + tables, flags deltas on the Asana task | Deterministic daily cadence; runs even when no one commits; diff-noise alerting | Needs repo access from the runner; another standing job to maintain |
| **Recommended: C, with A as fallback** | Daily scheduled agent at a fixed hour (e.g. 07:30 ET, before Malkio's day) refreshes the mechanical sections (§2 versions, §3 truths, §5 tables) and stamps the header; the heartbeat agent only *reads* the map and escalates drift (e.g. dist ≠ prod, staging divergence growing). Persona: Argus retains ownership. | | |

The process MUST stamp the header block (`Last updated` / `Updated by`) on every refresh, and post a one-line delta summary ("no drift" or the changed rows) to Asana task 1216678592681467.

---

*Read-only survey. Proposals in §5 and §7.3 require Malkio/Caspera approval before execution.*

---

## Post-restoration status (2026-07-18, CeeCee)

Kael executed the §5/§7.3 actions the same day this map was written (Asana task
1216678582893487, PRs #27–#31). New ground truths, verified by CeeCee:
**origin/staging = local staging = 6.7.27** (`e393a0c`) · **dist = 6.7.24**
(6.8.2 build removed) · main untouched (6.5.0) · 11 branches + 2 stale
worktrees pruned · main dir returned to `staging`. Remaining: release-zip +
update-channel bump (§7.3 step 5), Koda widget carve-out (step 7 — blocker:
`feat/companion-update-manifest` + `feat/site-sidecar-promo` stack on widget
commits), staging→main promotion (step 8, human call).

The **Hermes daily job** (`argus` profile, 07:30 ET, watcher through the first
3 runs) refreshes §2/§3/§5 from tomorrow. Note for the automation: this file's
canonical home moves to `staging` once the sidecar branch merges — retarget the
job then (collision risk of writing into an active feature worktree is logged
in `.headbox/parking_lot.md`, main dir).
