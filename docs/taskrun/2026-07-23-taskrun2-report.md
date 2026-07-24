# TaskRun-2 Run Report — 2026-07-23/24

**Coordinator:** Vessa (Sonnet) · **Crew:** Nash, Fenn (haiku), Wren (haiku), Iris (sonnet, escalated
per dispatch instruction) · **Charter:** `docs/superpowers/specs/2026-07-22-overnight-taskrun-protocol.md`
**Hard exclusions honored:** did not touch staging↔integrate reconciliation, CRX/CWS publishing,
pairing-code expiry, invite-token migration 059, Asana-PAT-in-extension, org-hours v1, cross-surface
sync investigation, download-page freshness, email/SMTP, `C:\Users\mrmal\Le Dev\Tabatha\dist`, or
`site/enterprise/` — all Kael's scope. Full detail on the one boundary slip (a builder committing to
`staging` in the main dir) is in `docs/taskrun/2026-07-23-questions.md` §1 — read that first.

---

## Shipped — done, verified, live

### 1. Logo cascade completion — Sidecar 0.13.9, DEPLOYED + live-verified
- **What:** Regenerated `sidecar/public/icons/icon-192.png` + `icon-512.png` from
  `store-assets/logo-redesign/chosen/icon-master.svg` (previously stale since Sidecar v0.1.0,
  predating the logo rollout). Added two files that never existed before: `favicon.ico` (16/32/48
  multi-res, via `png-to-ico`) and a dedicated `apple-touch-icon.png` (180×180, flattened onto the
  plate's dark background per Apple's no-alpha recommendation — previously `build-web.mjs` just
  pointed the apple-touch-icon tag at `icon-192.png` as a stopgap). Regenerated the Expo-side
  `assets/images/icon.png` (1024×1024) and `assets/images/favicon.png` so native/web fallback paths
  match. Wired the new files into `build-web.mjs`'s injected `<head>` (added a `<link rel="icon">`
  pointing at the new favicon, repointed apple-touch-icon at the real file).
- **Site favicon cascade:** generated (16/32/48/ico + apple-touch) into
  `store-assets/logo-redesign/chosen/cascade/site/` — **left there for Kael**, not deployed, per
  the scope boundary (avoids touching `site/` build/deploy, which is his surface).
- **Pipeline:** clean detached-HEAD worktree at the committed tip (`5f89845`), `node_modules`
  junctioned from the main sidecar worktree, `node scripts/build-web.mjs --export`, local bundle
  preflight (2.4MB entry bundle, 20 route-string hits — not the poisoned-skeleton failure mode),
  `npx wrangler deploy`, junction removed via `cmd /c rmdir` (never `Remove-Item -Recurse`), temp
  worktree removed.
- **Koda-style adversarial spot-check (my own, before deploy):** rendered `icon-512.png` and
  `apple-touch-icon.png` visually via the Read tool — confirmed the actual Split-Tab T mark, cyan
  glow on dark plate, no corruption, no unwanted transparency on the flattened apple-touch variant.
- **Live-verify (post-deploy, via browser network log, not assertion):**
  `GET https://tabatha.pondocean.co/sidecar/icons/icon-512.png → 200` (browser tab title confirmed
  actual "512×512" dimensions), `GET .../sidecar/icons/favicon.ico → 200` (title confirmed "48×48"
  rendering), `GET https://tabatha.pondocean.co/ → 200` (root Pages site unshadowed — the exact
  regression `OPERATIONS.md` warns this Worker route has caused before), `GET .../sidecar/ → 200`
  with title "Tabby Sidecar" and zero console errors.
- **Commit:** `5f89845` on `claude/tabby-sidecar-mobile-46c612` (pushed). Version 0.13.8 → 0.13.9.

### 2. Watch 0.2.1→0.2.2 polish — Fenn (haiku), build+test verified
- **What:** `SnapshotCache.kt` gained a `cachedAtMs` timestamp; `FocusTileService.kt` and
  `FocusComplicationService.kt` grey-out/age-indicate past a 15-minute threshold. `PostgrestClient`
  now throws on network failure instead of silently returning an empty list;
  `SupabaseFocusRepository`/`FocusViewModel` propagate a distinct error/offline state (matching the
  existing `PairViewModel.submit()` house style); `FocusScreen.kt` shows "Can't reach Tabatha —
  showing last known state" instead of collapsing to "Nothing in focus" on a genuine fetch failure.
  Version bumped 0.2.1 → 0.2.2 (found, mid-run, that 0.2.1 — the separate crash-guard fix — had
  *already* landed on the repo before tonight, un-recorded anywhere; see questions doc §4).
- **Verified:** `./gradlew compileDebugKotlin` — BUILD SUCCESSFUL (1m8s); `./gradlew
  testDebugUnitTest` — BUILD SUCCESSFUL, all tests green.
- **Commits:** `017285e`, `a3bbfbe` on `fix/watch-0.2.1-polish`, pushed to
  `github.com/MrMalkio/tabatha-watch` (branch, not merged — needs sideload/PR review; README dev
  notes added with a manual test checklist for the two fixes).

### 3. Docs refresh (SYNTHESIS NOW #7) — Nash (haiku), committed
- **What:** New `scripts/stamp-docs-version.mjs` stamps `site/docs/index.html`'s version badge
  from `public/manifest.json` at `site:build` time instead of the hardcoded `v6.7.41` string.
  Rewrote/extended `pairing-devices.html` (both directions: receiving AND minting a code; softened
  TV/Watch-only-sounding copy), `phone-focus-mode.html` (3-way near/idle/away heartbeat semantics),
  `timers-extensions-backburner.html` (un-resolve action), `focus-and-intents.html` (device
  invites, Context View/TV sign-in). One-line `Tabatha_Changelog.md` entry, docs-only, no version
  bump forced.
- **Verified:** `node scripts/stamp-docs-version.mjs` ran clean; version-badge grep matched
  manifest.json's real version; each rewritten page greppable for its new content.
  **NOT deployed** — per scope, left for Kael's next `site:deploy`.
  **Provenance flag:** this commit landed on `staging` directly instead of the isolated branch I
  provisioned — see questions doc §1 for full detail and what I did about it (nothing destructive;
  cherry-picked to the isolated branch `docs/site-refresh-2026-07-24` and pushed both, so the work
  is safe under two names).

### 4. #224 Lanes concept-exploration doc — Iris (sonnet, per dispatch instruction), committed
- **File:** `docs/superpowers/specs/2026-07-24-lanes-concept.md`. Matches the #221 concept doc's
  rigor bar: 6 grounded use cases (turkey, background build/render, delegated agent task, laundry,
  background download, meeting transcription), a Lane/Backburner/Queue definitional table, 3
  data-model options with a recommendation (tag-first, `tags._lane`, promote to real columns only
  if a server-side reminder engine is needed later), device-pin-to-lane UX sketch (extends
  `browser_profiles.device_settings` from migration 045), 3 parallelization-analytics sketches, a
  Plan 046 IA-impact note (Themes 2/3/5), and the seed doc's 4 open questions each answered with a
  recommended default + justification (no lane cap; tag over enum; kind-gated reminder policy;
  primary-only clock/shift attribution).
- **Grounding verified:** claims trace to real grep hits against `sidecar/src/data/focus.ts`,
  `supabase/migrations/010_add_browser_profile_status.sql`, `045_device_management.sql` — spot-read
  by me post-completion, holds up (e.g. correctly identifies `browser_profile_status.focus_state`'s
  `'drifted'` value as inconsistent with the Sidecar-local type's `active/paused/completed` set).
- **Commit:** `621404f` on `claude/tabby-sidecar-mobile-46c612` (pushed).

### 5. Plan 046 spec deepening — Wren (haiku), committed
- **What:** Added a "Deepened detail (from source audits):" subsection to all 7 Plan 046 themes in
  `docs/superpowers/specs/2026-07-21-plan-046-uiux-overhaul-spec.md`, pulling exact file:line
  citations and severity labels out of the three raw audits (Argus/Cirra/Rook) that the existing
  skeleton had only referenced in short form via the Koda synthesis. Existing Problem/Scope
  sketch/Dependency-notes text preserved as-is; new subsections only add detail.
  **Spot-checked by me:** Theme 1 and Theme 2's added detail checked against the file — both hold
  up, real file:line references (e.g. `src/home/index.jsx:1894` for the clock-wrapper margin bug),
  no fabricated citations found in the sample checked.
- **Commit:** `d97d2a9` on `claude/tabby-sidecar-mobile-46c612` (pushed).

---

## Not shipped / not attempted

- **Item 6 (backlog sweep of leftover S-items)** — not attempted; the five items above filled the
  run. See questions doc §3.
- **Asana tracking** — no Asana tasks/comments created this run. Both the Asana MCP connector
  (needs interactive OAuth, unavailable headless) and `asana-cli.cmd` (shells to `powershell.exe`,
  which hung on every invocation this session including a bare `Write-Output` — a session-level
  tooling issue, not Asana-specific) were unusable. See questions doc §3 for detail.

## Environment notes worth carrying forward

- Plain `powershell.exe` invocations hung to timeout all session (both directly via the PowerShell
  tool and indirectly via `asana-cli.cmd`). Plain `bash`/`node`/`git` calls worked fine throughout.
- `git push`/`git ls-remote` over the `gh`-credential-helper path hung to timeout in this session;
  `gh api` calls worked instantly. Workaround: embed `gh auth token` directly into the push URL
  (`https://x-access-token:$TOKEN@github.com/...`). Used successfully to push all 3 branches this
  run (`tabatha-watch` fix branch, `tabatha` docs-refresh branch, this worktree's own branch).
  Detail in questions doc §2.

## Koda interventions
None — no authed-UI/focus-gatekeeper modals were encountered; all work was code/CLI/build-pipeline,
no interactive browser flows requiring a human-equivalent click.

## Surfaces propagated
- **Done:** Sidecar version bump + deploy (icons); Watch version bump + branch push;
  `Tabatha_Changelog.md` one-liner (docs refresh); this report; questions file.
- **Slated for Kael (not touched by me):** site favicon cascade sits in
  `store-assets/logo-redesign/chosen/cascade/site/`, ready for his next `site:deploy`; the
  docs-refresh commit needs his review of the stray-`staging`-commit situation (questions §1);
  Watch `fix/watch-0.2.1-polish` and docs `docs/site-refresh-2026-07-24` both need a PR/merge
  decision from a human or the next agent with clean git tooling.

## Verification summary
Builds green: Sidecar (`expo export` healthy bundle + live deploy verified via browser network
log), Watch (`gradlew compileDebugKotlin` + `testDebugUnitTest` both BUILD SUCCESSFUL). Docs +
concept docs verified by direct read/grep, not just builder self-report. No claim above is backed
only by a builder's own "done" — every shipped item has a proof (grep output, live HTTP 200 +
rendered dimension, build log, or my own direct file read).
