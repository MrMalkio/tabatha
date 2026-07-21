# Tabatha — Operations Runbook

The authoritative "how do we ship this" doc for every surface in the Tabatha
family, plus the convention for where that activity gets recorded. Every
claim below is verified against a real script or doc as of 2026-07-21 — file
paths are cited inline so drift is checkable. Read `AGENTS.md` first for the
Chrome load-unpacked build/load constraint (still in force, §5); this doc is
the release/maintenance layer on top of it.

---

## 1. Surfaces & versions

| Surface | Version file(s) | Current pipeline | Prod target |
|---|---|---|---|
| **Chrome extension** | `public/manifest.json` (source of truth; `npm run version:sync` propagates to `package.json`, `AGENTS.md` header, changelog) | `staging` → `main` via PR/human approval | Google Workspace force-install + staff self-hosted update channel (§2.2); CWS private/domain listing in progress (§2.3) |
| **Tabby Sidecar (PWA)** | `sidecar/app.json` (`version`) **and** `sidecar/src/lib/device.ts` (`SIDECAR_VERSION` literal — bumped by hand alongside `app.json`, no sync script exists for this pair, unlike the extension's `version:sync`) | Own `0.x` line, ships straight from a feature/worktree branch | Cloudflare Worker `tabby-sidecar`, route `tabatha.pondocean.co/sidecar*` (straight-to-prod, no staging slot) |
| **Desktop companion** | `tabatha-desktop/src-tauri/tauri.conf.json` | Own `0.x` line, private repo `MrMalkio/tabatha-desktop` | Windows installer via GitHub release + Supabase Storage manifest (§2.4) |
| **Tabby Watch** | `tabatha-watch/app/build.gradle.kts` (`versionName`/`versionCode`) | Own `0.x` line, separate repo | Sideload (Galaxy Watch / Wear OS), pre-store |
| **Marketing / showcase site** | Stamped with the extension's version at deploy time (`site/` in this repo) | `npm run site:deploy` (`site:build` + `wrangler pages deploy`) | Cloudflare Pages project `tabatha` (root of `tabatha.pondocean.co`) |
| **Supabase backend** | Migration number = highest file in `supabase/migrations/` (currently `050`; see §5 for the numbering-registry gap) | `supabase db push --linked` against project `mtdgoahskcibjbhfvofx`, schema `tabatha` | Single hosted prod project — there is no staging Supabase project |

---

## 2. Release steps per surface

### 2.1 Tabby Sidecar (PWA)

Source: `sidecar/scripts/build-web.mjs` (read in full).

1. Work in a **clean temporary worktree checked out at the committed tip**
   (never deploy from a dirty tree — this sidecar worktree has repeatedly
   taken cross-agent commit sweeps, `docs/progress.md` 2026-07-20 PM), with
   `node_modules` junctioned in from the main checkout (worktrees don't
   share it; same technique as the extension's Build→Load constraint in
   `AGENTS.md`).
2. `node scripts/build-web.mjs --export` — now **always** passes
   `expo export -p web --clear` (script lines 15-22). Load-bearing: Metro's
   cache in `node_modules/.cache` is shared across worktrees via the
   junction, and a concurrent `expo start` can poison it into a "routeless
   1.1MB skeleton bundle" that still reports export success (real
   2026-07-18 v0.6.1 incident, in the script's own comment and
   `docs/progress.md` "Incidents").
3. **Local bundle preflight** — before deploying, confirm the exported
   entry bundle under `dist/_expo/static/js/web/` isn't the poisoned
   skeleton (grep it for a known route/screen string; a routeless build is
   a fraction of the real size). Still tribal knowledge, not a script — gap
   noted in §5.
4. `build-web.mjs` (no flag) injects PWA `<head>` tags into
   `dist/index.html` (lines 24-42) and mirrors `dist/` into
   `deploy/public/sidecar/` (lines 44-47, nested for the `/sidecar` base).
5. `cd deploy && npx wrangler deploy` — ships CF Worker `tabby-sidecar` on
   route `tabatha.pondocean.co/sidecar*`. The Pages root site is a separate
   target; don't touch it here.
6. **Edge verify**: load `/sidecar` live, confirm a known UI string matches
   what shipped, and that `/` (root Pages site) still serves — the Worker
   route is path-scoped but has shadowed root before.
7. Remove the `node_modules` junction (`cmd /c rmdir`, never
   `Remove-Item -Recurse` — deletes the junction's *target*, same warning
   as `AGENTS.md`) and clean up the temp worktree.

### 2.2 Extension — staff self-hosted update channel

Source: `scripts/publish-update.mjs` (staging branch, read in full).

```
npm run publish:update            # build + zip + GitHub release + latest.json
npm run publish:update -- --no-build   # package the existing dist/ instead
```

- Builds **with** the pinned `key` in `manifest.json` (distinct from the
  CWS path, §2.3) — every staff install keeps the same extension id
  (`hoknmoclnhccpgofpdihmiadmnmejjod`) release over release so Cloud Sync
  never orphans.
- Zips `dist/` → `store-assets/tabatha-<version>.zip`, computes SHA-256.
- Publishes/updates a GitHub Release tagged `ext-v<version>` (not
  `v<version>`, reserved for the project's own tag scheme) on
  `MrMalkio/tabatha`, with the zip attached.
- Writes `latest.json` (`{version, zipUrl, sha256, published}`) and commits
  it to the **orphan `update-channel` branch**, served forever at
  `raw.githubusercontent.com/MrMalkio/tabatha/update-channel/latest.json`.
  Uses `git commit --no-verify` **only on this branch** — it holds nothing
  but `latest.json`, so the shared pre-commit hook (`sync-version.mjs
  --check`) has nothing to resolve and would fail every time otherwise.
- Requires `gh` CLI authenticated with push access.

### 2.3 Extension — Chrome Web Store

Sources: `scripts/build-store-zip.mjs`, `scripts/cws-publish.mjs`,
`docs/CWS-PUBLISHING.md` (all staging branch, read in full).

```
npm run build:store    # dist/ → staged copy, strip pinned "key", validate, zip
npm run cws:upload      # first release: npm run cws:upload -- --new (writes CWS_APP_ID)
npm run cws:publish     # publishTarget defaults to trustedTesters
node scripts/cws-publish.mjs --status   # check draft item status any time
```

- `build-store-zip.mjs` validates the staged payload before zipping:
  manifest parses, `manifest_version === 3`, every referenced entry file
  exists, no `*.map` files, no dotfiles.
- `cws-publish.mjs` reads `CWS_CLIENT_ID`/`CWS_CLIENT_SECRET`/
  `CWS_REFRESH_TOKEN` from `deploy-creds.local` (written by the one-time
  interactive `npm run cws:auth` — never trigger unattended) and mints a
  short-lived access token per run; never prints token values.
- Live app id `piopncjacohahbkkmockjnpenhdbmmbc` (confirmed in
  `supabase/functions/{connect-asana,device-signout,feedback-to-asana,
  pair-watch}/index.ts` CORS allowlists, dated 2026-07-21) is **different**
  from the pinned staff-channel id in §2.2 — CWS strips the pinned key and
  mints its own.
- **First-publish visibility and listing content are dashboard-set, not
  API-set** — `docs/CWS-PUBLISHING.md` §2d: Visibility, description,
  screenshots, privacy URL, category are console-only.

### 2.4 Desktop companion

Source: `tabatha-desktop/docs/RELEASING.md` (read in full). Two independent
publish targets — **skipping either leaves the release invisible or
undownloadable**:

1. **Stop the running companion exe** before `npm run tauri build` (build
   output overwrites the same binary path the running process holds open —
   practiced step, not yet written into `RELEASING.md`; see §5).
2. `npm run tauri build` → NSIS `-setup.exe` + `.msi` under
   `src-tauri/target/release/bundle`.
3. `gh release create desktop-vX.Y.Z <exe> <msi> --repo MrMalkio/tabatha
   --title "Tabatha Desktop Companion X.Y.Z (Windows)" --notes "…"` — tag
   `desktop-vX.Y.Z`, distinct from the extension's `ext-vX.Y.Z` on the same
   mirror repo. Source stays private (`MrMalkio/tabatha-desktop`); only
   built artifacts reach the public mirror.
4. **Publish `companion-latest.json`** to the Supabase Storage
   `extension-updates` bucket — what `update_check.rs`'s background checker
   (startup + every 6h) reads; a GitHub release with no manifest update is
   invisible to every installed companion. Schema, the `required:true`
   freeze-gate semantics, and the PowerShell REST-PUT command (`supabase
   storage cp` 404s on this project) are in `RELEASING.md` §2 verbatim —
   including the UTF-8 gotcha (`[System.IO.File]::ReadAllBytes`, not
   `Get-Content -Raw`, or non-ASCII in `notes` gets mangled).
5. Restart the companion; confirm the tray "Update Companion App" item
   flips to `⬆ Update available` (`RELEASING.md` §3).

### 2.5 Marketing / public site

`package.json` (staging) `site:deploy` script:
```
npm run site:build && npx wrangler@4 pages deploy site --project-name=tabatha
```
`site:build` = `build-privacy.mjs` + `build-search-index.mjs`.
**Practiced addition not in the script**: run with `--branch=main` explicit.
`wrangler pages deploy` without `--branch` infers it from the current git
ref, and agents routinely run this from a feature/worktree branch —
omitting the flag risks a Cloudflare Pages *preview* deploy instead of
production. Real gap between the written script and the safe command.

### 2.6 Supabase migrations

Standard: `supabase link --project-ref mtdgoahskcibjbhfvofx` (one-time), then
`npx supabase db push --linked` (`docs/superpowers/specs/epic3-deploy-notes.md`
§1). When local `supabase/migrations/` has a gap against what's actually
applied remotely (common — unmerged branches apply migrations out from
under `staging`; this worktree branched with 022-029 remote-only, never
landing locally), the fix recorded in `docs/progress.md` (2026-07-17) is
**placeholder-then-repair**: `supabase migration repair` marks the
remote-only numbers as applied locally so CLI state matches reality, then
`db push` only the genuinely new files. Add `--include-all` when the local
set is out of order vs. what the CLI thinks is applied. Migration-**number**
registry discipline (a related, separate problem) is in §5.

## 3. Standing automation inventory

| Job | Cadence | What it does | Evidence lands |
|---|---|---|---|
| **Hermes SYSTEM-MAP daily survey** (`argus` profile) | ~07:30 ET daily (watcher through first 3 runs) | Refreshes `docs/system-map/SYSTEM-MAP.md` §2/§3/§5 (versions, ground truths, per-branch table); stamps the header | The file's §8 log (one line/day) + a delta comment on Asana `1216678592681467`. **Not in the local `scheduled-tasks` registry** (§5 — trigger mechanism unconfirmed from this machine). |
| `anasa-orchestrator-daily` | 07:03/13:03/19:03 ET (cron `0 7,13,19 * * *`) | Reviews Anasa roadmap progress, holds gates, dispatches next wave | Asana task activity (Anasa roadmap project) |
| `anasa-ticket-reconciler` | Every 2h at :45 (cron `45 */2 * * *`) | Reconciles Anasa-T tickets vs. overnight lane progress | Asana comments on tracked tickets |
| `po-security-follow-ups` | Mon-Sat 04:05/14:05 (cron `0 4,14 * * 1-6`) | Progress pass over open security/PR tasks; nudges Po/Malkio/none; self-disables when done | Local state log + Asana comments (`enabled: true`) |
| **Companion update-check** | Startup + every 6h (`RELEASING.md` §3) | Polls `companion-latest.json`; flips tray to `⬆ Update available`/`🛑 Update required` | `%APPDATA%\Tabatha Desktop\logs\` |
| `scripts/mirror-extension.ps1` (staging) | "At logon, before Chrome validates extensions" (script's own doc comment — a Windows Scheduled Task) | Self-heals a stable load path (`%LOCALAPPDATA%\Tabatha\extension`) from `dist/`, atomically | **Not yet the live load path** — SYSTEM-MAP (2026-07-21) still shows Chrome pointed at `C:\Users\mrmal\Le Dev\Tabatha\dist` directly; treat as shipped-but-not-cut-over. |

## 4. Where activity is tracked (the convention)

Five places carry the record of maintenance/CI-CD/release activity today —
none optional, all cited above as real, populated locations:

1. **Asana — Flux Development board** (project GID `1214031898449333`,
   <https://app.asana.com/1/9526911872029/project/1214031898449333/>).
   Fleet task GIDs + comments (start/done, per this task's own convention)
   + project status updates on `checkpoint`.
2. **`docs/progress.md`** — the session log (`## Session — <date> (<title>)`:
   Agent, Branch, Goal, What Was Done, Key Decisions/Findings, Next Steps,
   Artifacts). Where deploy incidents (Metro cache poisoning, migration
   drift, worktree collisions) get their permanent post-mortem.
3. **`Tabatha_Changelog.md`** (Keep-a-Changelog format) — human-readable
   version history; `scripts/build-changelog.mjs` (staging) compiles it into
   `public/changelog.json` for the in-app "What's New" modal and Settings →
   About. `changelog:check` is wired into `prebuild` alongside
   `sync-version.mjs` — a build fails if the changelog is stale.
4. **`docs/system-map/SYSTEM-MAP.md`** — daily cross-surface snapshot (§3).
5. **GitHub Releases per artifact** — `ext-vX.Y.Z` (staff channel zip),
   `desktop-vX.Y.Z` (companion installers), both on the public
   `MrMalkio/tabatha` mirror repo.

**The convention:** every deploy, release, or migration MUST land in
**(a)** a Conventional Commit (`{type}({scope}): {description}`, `AGENTS.md`
Global Rule 2), **(b)** `Tabatha_Changelog.md` when it carries a version
bump, and **(c)** an Asana comment or status update when it's part of
tracked fleet work — a release that's only a commit, with no changelog
entry and no Asana trace, is not considered done.

---

## 5. Known gotchas

- **Shared Metro cache poisoning.** `node_modules/.cache` is shared across
  sidecar worktrees via junctions; a concurrent `expo start` can poison it
  into a routeless skeleton bundle that still reports "export succeeded."
  Fixed by `--clear` (unconditional in `build-web.mjs --export`) **plus**
  the manual local-bundle-preflight grep before deploy (§2.1 step 3) — the
  preflight is still tribal knowledge, not codified into the script.
- **Worktree collisions.** The shared sidecar worktree has taken multiple
  cross-agent commit sweeps (`docs/progress.md`, 2026-07-20 PM). Default to
  per-agent worktrees for anything that writes; use explicit per-file
  `git add` (never `-A`/`.`) to avoid sweeping another agent's change.
- **`asana-cli` single-line comments.** `comment add <task_gid> --text "..."`
  — keep comments to one line. Use `--as <profile>` for persona identity
  (`asana-cli auth list` enumerates profiles, e.g. `rook`, `argus`, `ceecee`).
- **Orphan `update-channel` branch pre-commit false positive.** That branch
  holds only `latest.json`; the shared pre-commit hook (`sync-version.mjs
  --check`) has nothing to resolve there and fails every commit. `--no-verify`
  is scoped to commits on **that branch only** — never use it elsewhere
  without a specific, understood reason (`AGENTS.md`/global git safety rules
  still apply everywhere else).
- **Network flakiness.** `git fetch --all --prune` intermittently fails here
  with `getaddrinfo() thread failed to start` (hit live during this doc's
  own research) — retry once before concluding a remote is unreachable.
- **`dist/` path is pinned for Chrome load-unpacked** (`AGENTS.md`): only
  `C:\Users\mrmal\Le Dev\Tabatha\dist` is re-validated; building in the main
  dir stamps staging's version into it (looks like a downgrade if a feature
  worktree is ahead). `scripts/mirror-extension.ps1`'s stable-path
  alternative exists on `staging` but per SYSTEM-MAP is not yet cut over —
  verify there before assuming it's live.
- **Migration-number registry discipline.** Parallel plan branches claim
  migration ranges as *placeholders* before writing SQL (Plan 043 → 051-052,
  Plan 044 → 053-055, Plan 045 → 056-057, Olympus → 046-049, 050 explicitly
  left unclaimed by Fix Wave 3) — always `ls supabase/migrations` right
  before writing a new file to re-verify the next-free number; two branches
  landing the same number is a silent-until-`db push` collision.
- **Sidecar's version is two hand-synced files, no sync script** — see §1.
