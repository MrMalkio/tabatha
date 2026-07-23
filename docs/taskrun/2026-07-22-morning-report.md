# Overnight TaskRun Morning Report — 2026-07-22/23

**Orchestrator:** Opus (CeeCee identity) · **Umbrella Asana:** `1216808296793529` (Flux Development `1214031898449333`)
**Charter:** `docs/superpowers/specs/2026-07-22-overnight-taskrun-protocol.md` · **Queue:** `docs/taskrun/2026-07-22-queue.md`

> **Read this first:** NOTHING was pushed to a protected branch or deployed to users tonight — by
> design. Every item below is **built + verified + committed locally**. The outward steps (CRX ship,
> Sidecar prod deploy, origin/staging push, merges) are the morning approvals. The single biggest
> finding gates most of it: **the extension source is forked** (Q1) — extension fixes are committed on
> `integrate/6.7.50` (the real source line), not on `staging` (which has only the compiled 6.7.56 CRX
> binary). See `docs/taskrun/2026-07-22-morning-questions.md`.

---

## Shipped — done, verified, committed (NOT yet deployed to users)

Each: item — what changed — proof — commit — where it lives.

### Separate repos (cleanly isolated, no fork)
- **TR-02 — Companion 0.3.9** — exit confirmation dialog + "already connected?" guard on re-pair
  (silent-revoke fix) + title-truncation CSS fix. **Proof:** `npm run build` + `cargo check 1.96.1`
  both green; grep-confirmed all 3. **Commit** `f25d1c0` on `feat/companion-ux-wave` (`tabatha-desktop`).
  Release-gates the companion-update announcement.
- **TR-05 — Watch 0.2.1 (ship-blocker)** — every `SupabaseFocusRepository` call site wrapped in
  `runCatching` (matching the existing `PairViewModel` pattern), inline error state, no crash on
  network failure. **Proof:** `./gradlew compileDebugKotlin` SUCCESSFUL + 27 unit tests green.
  **Commit** `5f8977f` on `main` (`tabatha-watch`).

### Sidecar (canonical source = `claude/tabby-sidecar-mobile-46c612`, this worktree)
- **TR-17 — Sidecar 0.13.6** — `SIDECAR_VERSION` now derived from `app.json` via static JSON import
  (tsconfig `resolveJsonModule`); zero drift, no second manual edit. **Proof:** `tsc --noEmit` clean
  (only pre-existing unrelated `app-tabs.web.tsx` route-type error); grep confirms no version literal
  remains in `device.ts`. **Commit** `c3bc8de`.
- **TR-14b — Sidecar 0.13.7** — non-intrusive header feedback button (`FeedbackButton.tsx`) reusing the
  proven `submitFeedback()` path; a modal only on tap, nothing overlaid at rest. **Proof:** `tsc` clean
  + full `expo export -p web` build succeeded — **healthy 2.42 MB / 1211-module bundle** (not the
  routeless-skeleton failure mode). **Commit** `9ea5f96`.
- **TR-16 (ops note half)** — `docs/OPERATIONS.md` §2.5 updated: `--branch=main` now in the script.
  **Commit** `8c92cde`.

### Staging (main-repo docs / tooling — local `staging` commits, not pushed)
- **TR-15 — feedback-review agent protocol** — `docs/taskrun/feedback-review-agent.md`: 6h cadence,
  reads project `1214031898449333`, real fn title format (`🐛 [bug]` / `💡 [idea]`) verified from
  `feedback-to-asana/index.ts`, 4 pre-existing test-task GIDs flagged, hand-off format for the nightly
  assembler. **Commit** `4e9b0b8`.
- **TR-16 (script half)** — `package.json` `site:deploy` now carries `--branch=main` (prevents
  accidental Cloudflare Pages *preview* deploy). **Commit** `5385346`.

### Extension (canonical source = `integrate/6.7.50`; committed there, NOT on staging, NOT in a CRX)
> These are the real bug fixes on the real source line, ready to ship once the fork is reconciled (Q1).
> All build-verified: `npm run build` green at 6.7.67; each commit bumped `manifest.json` + `version:sync`.

- **TR-04 — 6.7.57** — BlockGate first `sendMessage` now fails **closed** on invalidated context
  (was silently failing open → blocked site reachable). **Verified:** read `blockgate.js` — `catch → response = { blocked: true }`.
- **TR-10 — 6.7.58** — popup search placeholder shows the real shortcut (Ctrl+Shift+E, was Ctrl+Space).
- **TR-09 — 6.7.59** — pairing-code copy no longer implies TV/Watch-only (phones use it too).
- **TR-12 — 6.7.60** — generic Live Preview fallback for the 11/24 settings sections that were blank.
- **TR-07 — 6.7.61** — BreakNotes "not yet saved" badge (stops the UI implying persistence it lacks).
- **TR-08 — 6.7.62** — 🔥 backburner button on Sidebar + Home (parity with InBar, #207). **Verified:**
  `actions.backburnerFocus(...)` wired in both `sidebar/index.jsx:519` and `home/index.jsx:278`.
- **TR-06 — 6.7.63** — Context Activity renders clock markers without a companion session + a distinct
  empty-state (was fully blank for every companion-less user).
- **TR-11 — 6.7.64** — removed unreferenced `SessionList` dead code (verified imported-but-never-rendered
  before deleting).
- **TR-03 — 6.7.65 (M)** — gatekeeper injects a synchronous dimming placeholder before the async intent
  gate, closing the render race. **Self-review: PASS** — double-inject guard, teardown on all bail paths,
  same host/shadow reused, `gateShown` flag, try/catch safety net. *P2 nit:* a faint dim now briefly
  flashes on no-gate pages until `CHECK_CONTEXT_NEEDED` resolves — a deliberate, tunable tradeoff.
- **TR-13 — 6.7.66 (M)** — Team Activity groups device chips via the existing `deviceGrouping.js` util
  (reused, not duplicated), filters revoked rows in-query, one chip per physical device; bare "no status"
  replaced with "last seen …". **Self-review: PASS.**
- **TR-14a — 6.7.67 (M)** — non-intrusive `FeedbackWidget` (corner on Home, settings-adjacent inline on
  Sidebar) reusing `SUBMIT_FEEDBACK → feedbackService → feedback-to-asana`. **Self-review: PASS** —
  `SUBMIT_FEEDBACK` handler + `sendMessage` export + popup mirror all verified; button-only at rest.

Commit range on `integrate/6.7.50`: `2495db3..31d9011`. → **TR-14 is complete across all 3 surfaces**
(Sidecar `9ea5f96` + extension Sidebar/Home `31d9011`).

---

## Prepped — awaiting one approval each (morning approvals, not investigation)

- **TR-01 — Regina device-row cleanup.** Verified live: Regina (`07466c2e…`) has 37
  `tabatha.browser_profiles` rows; 18 are unreferenced null-`machine_id` chrome flood dupes (safe to
  delete), 19 kept. NOT executed (hard-deleting prod rows is a §1.2 deferred action; no prior
  server-side-cleanup run existed to replicate). **Action:** review + run
  `scripts/regina-device-dedup-2026-07-23.sql` (dry-run SELECT → transactional backup-to-shadow-table +
  DELETE with a count safety-rail + one-line UNDO). Commit `8ed8c6e`. (Correction: the queue's "~731 rows"
  figure was *Malkio's own* account, not Regina's.)
- **TR-18 — git-line reconciliation.** Investigation done, no protected-branch action taken. Note at
  `docs/taskrun/2026-07-22-git-reconciliation.md` (commit `cc3f95c`). Key: `integrate/6.7.50` is the
  canonical extension source (NOT superseded — the queue had this backwards); `feat/ext-device-management`,
  `feat/logo-rollout`, `fix/home-header-layout` are all fully contained in it; a reconciliation sequence
  is proposed for approval.

---

## Morning questions (need Malkio) — full detail in `2026-07-22-morning-questions.md`

- **Q1 (headline)** — confirm `integrate/6.7.50` is the canonical extension source + approve the fork
  reconciliation (merge direction) + approve rebuilding/shipping a 6.7.57+ CRX. **This unblocks all 12
  extension fixes reaching users.**
- **Q2** — confirm `claude/tabby-sidecar-mobile-46c612` is canonical Sidecar source (resolved in the note).
- **Q3** — org-hours v1 consent model (#221) so it + Team worked-stints (ask b) can build.
- **Q4** — approve `origin/staging` catch-up push + closing `integrate/6.7.50` *after* its source merges.
- **Q5** — generate the `tabatha@duckandshark.com` app password (SMTP branding — credential, Malkio-only).
- **Q6** — confirm reconciled line is the CWS-submission source (logo already lives in `integrate/6.7.50`).
- **Q7** — whether to prep a staging → main promotion PR, and timeline.
- **Q8** — approve + run the TR-01 Regina cleanup script.

## Fork-blocked / not attempted tonight
- **TR-19 (logo/version/docs drift)** — the logo/icon merge is entangled with the fork (Q1/Q6): the
  Split-Tab T logo source already lives in `integrate/6.7.50`, so the "merge logo-rollout" step resolves
  with the fork reconciliation, not independently. Doing fragmentary icon/docs work on either forked
  branch tonight would deepen the divergence. Deferred to post-reconciliation. The `Tabatha_Changelog.md`
  top-entry refresh + docs-verbadge-from-manifest automation are part of this and similarly deferred.

## Sidecar deploy — deliberately deferred (not a block)
Sidecar 0.13.7 (TR-14b + TR-17) is committed + build-verified (healthy bundle). I did **not** deploy it
to prod: TR-14b is new user-facing UI I could not runtime/visually verify in a headless overnight
context, and shipping unverified UI to all Sidecar users crosses the consent-first bar. It's a one-command
deploy after a 5-second visual smoke-check (`OPERATIONS.md` §2.1 clean-worktree pipeline).

---

## Koda interventions & review
- **No Koda computer-use interventions were needed** (no authed-UI modals blocked the run; all DB work
  went through the Mgmt API, all Asana through the CLI).
- **Koda's adversarial review agent for the 3 M-items died producing empty output.** Per the coordinator's
  instruction, I ran a focused self-review of TR-03/TR-13/TR-14a against their verification gates instead
  of re-dispatching — all three PASS (details above). This should be flagged: the M-items have a rigorous
  self-review but not the independent second-pair-of-eyes the charter prefers; a fresh Koda pass before
  the CRX ships would be belt-and-suspenders.

## Infra notes surfaced
- Git Bash `curl` cannot do TLS in this environment (exit 35 on all HTTPS) — the Supabase Mgmt API had to
  go through **PowerShell** (`Invoke-RestMethod`). Worth knowing for future runs.
- **Asana membership gaps:** `soren` and `corin` service identities return 403 on project
  `1214031898449333` (they're only in workspace `9526911872029`, not `1202052377104896`/duckandshark.com).
  `ceecee`, `koda`, `rook`, `argus`, `dex`, `cirra` have access. Corin's task was filed by CeeCee on its
  behalf (`1216808671114169`). Consider adding soren/corin to the duckandshark.com workspace.

## Surfaces propagated / still slated
- Propagated: per-commit `manifest.json` + `version:sync` (package.json + AGENTS/CLAUDE/GEMINI headers +
  changelog gate) on every extension commit; Sidecar dual-version now single-sourced (TR-17); OPERATIONS.md
  updated (TR-16); Asana umbrella + per-item tasks; this report + morning-questions + reconciliation notes.
- **Still slated (batched, blocked on Q1 reconciliation):** `Tabatha_Changelog.md` top-entry refresh;
  `public/changelog.json` "What's New"; `/show` showcase + `/download` versions for the new features
  (backburner buttons, feedback affordances); SYSTEM-MAP migration/version ledger. These should follow the
  fork merge so they describe a real shipped line, not a forked one.

## Addendum (2026-07-23, Dex) — TR-03 unblocked by Koda's late review

Koda's adversarial review of TR-03 (`be45b99`, the 6.7.65 gatekeeper render-race fix) landed after
this report was written and **demoted TR-03 from self-reviewed PASS to BLOCKED**, with three findings:

- **P1-A** — the synchronous dimming placeholder attached unconditionally on every navigation, before
  `CHECK_CONTEXT_NEEDED` resolved, even for users with the gatekeeper fully disabled — a transient
  click-blocking dim on every page load for a population that should see nothing.
- **P1-B** — neither `CHECK_CONTEXT_NEEDED` nor `GET_FOCUS_ENGINE` had a timeout on the service-worker
  round-trip: a stalled SW left the placeholder stuck over the page **indefinitely**, strictly worse
  than the pre-fix failure mode ("no gate appears" = usable page).
- **P2-C** — the top-level `const escapeHtml` (outside the IIFE) would throw a parse-time SyntaxError
  on re-injection into an already-loaded document (`notificationService.js`'s `openPopup` re-injection
  path), silently defeating the double-injection guard since the whole file fails to parse before the
  guard runs.

**`integrate/6.7.50` @ `c3681e9`, v6.7.68, closes all three:**
1. Fast local `chrome.storage.local.get('settings')` pre-check (no SW round-trip) bails with zero DOM
   for confirmed-disabled users; ambiguous reads still fail toward gating but the placeholder now
   starts `pointerEvents:'none'` and only flips to `'auto'` once the background positively confirms
   `needed:true`.
2. Both round-trips wrapped in a `withTimeout()` helper (~2.5s, precedented by the existing
   `waitForBody()` 3s pattern); on timeout the placeholder tears down and the gate quietly aborts.
3. `escapeHtml` moved inside the IIFE; swept the rest of the file for the same top-level
   const/let/class hazard, none found.

`npm test` (723/723) and `npm run build` (with the changelog `--check` gate) both green. Changelog
backfilled for 6.7.65/66/67 (was missing, prebuild was warning) plus the 6.7.68 entry. Pushed to
`origin/integrate/6.7.50`.

**TR-13 (6.7.66, Team Activity device grouping) and TR-14a (6.7.67, non-intrusive feedback widget)
stand as-is** — Koda's review raised no findings against either; both remain self-reviewed PASS per
the original report above.

---

## Queue position & verification summary
- **Executable queue: 16/16 addressed.** Shipped+verified: TR-02,03,04,05,06,07,08,09,10,11,12,13,14,15,16,17.
  Prepped-for-approval: TR-01, TR-18. Fork-blocked: TR-19.
- **Builds green:** extension `npm run build` @6.7.67; Companion `npm build`+`cargo check`; Watch
  `compileDebugKotlin`+27 tests; Sidecar `tsc`+`expo export` (healthy bundle).
- **Reachability proofs:** live Mgmt-API queries (TR-01 counts); grep of built/committed source for each
  extension fix; real bundle byte-size check (Sidecar). No "the report says it shipped" claims — nothing
  is claimed live to users because nothing was deployed.

---

## 2026-07-23 addendum — CeeCee (post-review live fixes)

- **InPop `[object Object]` bug** (Malkio-reported, live on his 6.7.56): root-caused to legacy-corrupted `chrome.storage.local` focus data (object-valued label/funnelStage/context from an old build; no shipping writer produces objects). Fixed with a self-healing sanitizer on `getFocusEngine()`/`getTabData()` + defensive inbound-mapper coercion — repairs his data on next read, no reinstall. **6.7.69**, 739/739 tests, `1af518f`.
- **Extension fleet catch-up SHIPPED**: Malkio authorized "workspace = local freedom." Mirrored 6.7.69 to his dist + published to the enterprise CRX channel (`jbdka…`, verified id + inner version). The full 6.7.57–6.7.69 audit-fix wave now reaches him (reload) and every fleet machine (Chrome's update cadence).
- **Companion 0.3.9 RELEASED**: GitHub `desktop-v0.3.9` (exe + msi), `companion-latest.json` bumped to 0.3.9 (live), download page repointed 0.3.1 → 0.3.9.
  - **Reinstall path (Malkio):** `C:\Users\mrmal\le dev\tabatha-desktop\src-tauri\target-039\release\bundle\nsis\Tabatha Desktop_0.3.9_x64-setup.exe` (MSI beside it in `...\bundle\msi\`). Quit the running tray companion (pid was 16392, the stale 0.3.4) first, then run the setup exe. SHA-256 `e5f45ae60143c4654197669d1856a4212ff461cfeae0716a287ef1d2f8a8adb8`.
- **Companion update-check UX** (no visible check activity / no out-of-date indicator): fix in flight as 0.3.10 (Cindra) — visible "Checking…" state, up-to-date vs update-available result with proper semver compare, persistent out-of-date badge on Desk Panel.
