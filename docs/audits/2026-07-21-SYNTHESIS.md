# 2026-07-21 — Audit Synthesis (Koda)

**Inputs vetted:** Argus (extension, ~55 findings), Cirra (sidecar/companion/watch, 33 findings), Rook (cross-cutting, 22 findings).
**Method:** every item promoted below was either (a) independently re-verified against current code by a dedicated subagent read, or (b) kept at the source auditor's own evidence level where the citation was already file:line-specific and internally consistent. Two items were spot-verified and turned out **worse** than the source report stated (XSS sink count, cross-user exploitability). One sub-claim was found **wrong** in verification (companion "used to be behind a right-click") and is corrected below.

**Already-fixed, confirmed excluded from this list:** sidecar 0.13.4/0.13.5 + extension 6.7.53/6.7.54 session-aware revoked-row reclaim (extension now stamps `auth_session_id`); mint-auth error copy; sidecar magic-link loop; revoked devices filtered from Devices-panel lists. Verified during this pass: the session-aware fix closes the *application-code* path but does **not** close the RLS-layer gap — see NOW #2.

---

## NOW-fix list, ranked

### 1. Unescaped HTML injection across gatekeeper.js + inbar.js — WORSE than reported
**Finding:** Argus C2+C5. Verification found ~23 distinct unescaped `innerHTML` sink sites (not ~12 as estimated) — 4 in `gatekeeper.js` (`:255,265,274,297` — `297`'s `inheritedContext` gets quote-only escaping, everything else none), ~19 in `inbar.js` including notes/description raw inside `<textarea>` (`:564,601`), the edit-dropdown focus list (`:588→594`), sticky-note pause text (`:680/681`), backburner alert card (`:701/702`), and 9+ auto-triggered overlay sites not in Argus's original list (FTE, Welcome-Back, Combo, Backburner check-in, Idle, Drift — `:1258` through `:1608`). No `escapeHtml()` helper exists anywhere in `src/` — this isn't a partial-adoption problem, it's greenfield.
**Exploitability — corrected classification:** this is **not** self-XSS-only-today-until-#221-ships, as originally framed. `focus_items.label` and checkpoint notes already sync to Supabase and are already readable cross-user **today** via migration `012_manager_scoping_and_invite_mint.sql`'s existing manager/team RLS scoping. A malicious label set on one device renders unescaped in a manager's browser the next time `TeamActivityPanel`-adjacent code (or any future org surface) reads that row into these same sinks. This is real today, not contingent on #221.
**Fix:** one shared `escapeHtml()` util, route all ~23 sites through it. `blockgate.js` is clean (only interpolates `location.hostname`) — no change needed there.
**Files:** `src/content/gatekeeper.js`, `src/content/inbar.js`.
**Size:** M (mechanical but touches ~23 call sites across 2 files; needs care around the `<textarea>` sinks specifically, since escaping there also has to preserve legitimate newlines).
**Owner suggestion:** any agent, TDD-friendly (add escaping, snapshot-test rendered output for a payload string).

### 2. RLS has no state-aware `WITH CHECK` on `browser_profiles.revoked_at`
**Finding:** Rook #13, root cause of #11/#12. **Independently confirmed still open** despite the 6.7.54 session-aware fix. `syncService.js` (`ensureBrowserProfileRow`, ~L152-274) now checks `currentSessionId()` against `reclaimAllowed()` in **application code** before deciding to send `revoked_at: null` — good, but migration `016_restore_browser_profiles_write_rls.sql:32-35` still has a bare `USING (profile_id = current_profile_id()) WITH CHECK (profile_id = current_profile_id())` with no session-identity check, and migration `045_device_management.sql` explicitly comments that no policy change was made for the new columns. A revoked session's still-valid JWT hitting the Supabase REST API directly (not through the extension UI) can still clear `revoked_at` on its own profile's rows. Scope is same-`profile_id` only (not arbitrary cross-user), but it defeats the remote-sign-out guarantee for that specific device.
**Fix:** new migration adding a `WITH CHECK` (or a `BEFORE UPDATE` trigger) that rejects clearing `revoked_at` unless the request's session id matches `auth_session_id`, or requires a service-role/admin-function path to un-revoke.
**Files:** new `supabase/migrations/0XX_browser_profiles_revoke_hardening.sql`.
**Size:** S.
**Owner suggestion:** whoever owns Supabase migrations this cycle — this is the single highest-leverage fix in the device-lifecycle area (closes #11 and #12 from Rook's report at the root instead of patching each writer).

### 3. Companion 0.3.8 fix pass (batch of 3, confirmed real, one small PR)
**Finding:** Cirra §3. All three independently verified on `feat/companion-ux-wave` (`tabatha-desktop`, HEAD `72cddd9`), `npm run build` and `cargo check` both clean.
- **CSS truncation swap regression** — `App.jsx:279-280` now renders window-title in `.app-name` and app-name in `.app-title`, but the ellipsis rule is still pinned to `.app-title` (`styles/index.css:178-184`) while `.app-name` (holding the long unbounded string) has none (`:173-177`). Real-world window titles will blow out the row.
- **"Exit Completely" has zero confirmation** — `CompanionMenu.jsx:85,143` → `exit_companion` → `main.rs:527-531` `app.exit(0)` direct, no dialog anywhere in the app.
- **"Pair Extension" silently rotates the token** — `CompanionMenu.jsx:79-83/124` → `pair_extension_token`, whose own doc comment (`main.rs:509-511`) states rotation revokes the previous client's token; no "already connected?" check exists.
**Correction to source report:** Cirra's framing that this action "used to live one level deeper (behind a tray right-click)" is **wrong** — verified against pre-wave commit `0c883fe`: the tray already used `show_menu_on_left_click(true)`, so it was already a flat single-left-click item. The wave only *relocated* it (tray → in-app menu); it didn't add a click. The underlying bug (silent rotation, no confirm) is still real regardless.
**Fix:** all three fit in `CompanionMenu.jsx` (confirm-dialog wrapper for exit + pair-token) and `styles/index.css` (swap the truncation rule). No Rust changes needed.
**Size:** S (single PR, 2 files).
**Owner suggestion:** whoever's picking up the companion-wave branch to finish it before the update announcement — this is the gate Malkio asked about directly.
**Not in this batch, flagged separately:** Assign-to-Intent's cosmetic-dead-end status (doesn't feed time totals) is a **product-communication decision**, not a code fix — Cirra explicitly recommends escalating to Malkio before the announcement rather than silently patching; carrying that forward as-is, not folding into this NOW item.

### 4. Watch: unguarded network calls crash the app on any connectivity failure
**Finding:** Cirra §2, Critical/BUG. Not independently re-verified this pass (time-boxed to the three highest-stakes areas named in the brief), but Cirra's evidence is specific (named classes: `SupabaseFocusRepository`, `PostgrestClient`, `GoTrueClient`; named contrast case: `PairViewModel.submit()` already uses `runCatching` correctly) and internally consistent with the rest of her Watch findings (staleness signal gap, 0-rows-vs-fetch-failed collapse) — all pointing at the same missing error-handling layer. High confidence without re-verification.
**Fix:** wrap every repository call site in `runCatching`, surface inline error state, keep last-known UI.
**Files:** `tabatha-watch` — `SupabaseFocusRepository`, wherever `viewModelScope.launch{}` wraps repository calls without a `CoroutineExceptionHandler`.
**Size:** M (mechanical wrap, but touches every call site: pause/resume/extend/resolve/addCheckpoint/loadFocusItems).
**Owner suggestion:** ship-blocker for any Watch update — should land before the next Watch release regardless of what else in Plan 046 happens.

### 5. Org-hours v1 — scoped RPC + opt-in (spec tight enough to hand to a builder)
**Finding:** Rook Area 3, corroborated by the #221 concept doc's consent model. Migration `019_owner_read_views.sql` already computes the right aggregates (`v_owner_clock_daily`, `v_owner_desktop_daily`, `v_owner_intent_recent`) but grants them to `service_role` only, by explicit design (per the migration's own comment) — this is a deliberate pause pending consent, not an oversight, and #221 has now specified the consent shape.
**Concrete spec:**
- **New column:** `profiles.settings.share_hours_with_org` (jsonb path or dedicated boolean column), default `false`. Per-person opt-in, independent of org membership.
- **New RPC:** `get_team_hours_summary(p_scope_id uuid, p_range daterange) returns table(member_profile_id uuid, total_minutes int, is_aggregate_only boolean)` — `SECURITY DEFINER`, reuses 019's aggregation logic, scopes access via 026's `my_visible_member_profile_ids()` instead of `service_role`.
- **Default behavior:** returns **aggregate team/org totals only**, no per-person breakdown, regardless of opt-in state.
- **Per-person unlock:** a caller only receives a non-null `member_profile_id` breakdown row for members who have `share_hours_with_org = true`; everyone else folds into the aggregate-only total.
- **Hard fence, no exceptions:** personal-realm data stays excluded per the 001-era fence — the RPC must filter `realm IN ('work','professional','business')` identically to 001/002, regardless of opt-in.
- **UI:** extend `TeamActivityPanel.jsx` (`src/settings/index.jsx:1327`) — do not build new UI. Add an "Hours" tab/section next to the existing live-presence view, gated by the same `orgPermissions.js` check already in place.
**Files:** new migration (RPC + column), `src/settings/index.jsx` (TeamActivityPanel extension), `orgPermissions.js` (if a new permission flag is needed to gate the Hours tab specifically).
**Size:** L (new migration, RPC, UI section, opt-in settings surface for the member side to actually flip the flag).
**Owner suggestion:** needs both a migration-comfortable agent and someone who can wire the opt-in toggle into whatever personal-settings surface makes sense (Sync & Account, most likely, next to existing org controls).

### 6. Email/SMTP branding change — blocked only on Malkio's app password
**Finding:** Rook Area 2. Root cause of unbranded "from supabase.co" emails is unconfigured custom SMTP (all `smtp_*` fields null) + stock mailer templates, not `site_url` (every sign-in call already passes an explicit redirect — confirmed low-risk to change `site_url` too).
**Plan, ready to execute the moment the credential exists:**
1. Malkio generates an app password for a Workspace sending account (`tabatha@duckandshark.com`) at myaccount.google.com/apppasswords.
2. Configure custom SMTP (`smtp.gmail.com:587`, that account + app password).
3. Set `site_url` to `https://tabatha.pondocean.co`.
4. Rewrite 4 mailer templates (Confirmation, Magic Link, Invite, Recovery) — no vendor names, Tabatha voice, links to the real domain.
5. Verify both `chromiumapp.org` allow-list entries are current (adjacent hygiene, not blocking).
6. One live smoke test per surface post-change.
**Size:** S once the credential lands; zero code changes required elsewhere (confirmed no redirect flow depends on bare `site_url`).
**Owner suggestion:** whoever has Supabase Dashboard/Management-API access when Malkio hands over the credential — this is pure config, no build needed.

### 7. Docs staleness — refresh + kill the hardcoded version badge
**Finding:** Rook Area 1. `site/docs/index.html:60,189` hardcodes `v6.7.41`; 8 shipped features since then are missing or stale in the docs (device management panel, extension-minted pairing codes, count direction/precision, un-resolve, phone-away 3-way heartbeat semantics, invites, TV sign-in, PWA orientation fix).
**Fix:**
- Drive the verbadge from `manifest.json`'s version at build time (same pattern as the existing `version:sync` script) — kills the drift-failure mode permanently, cheap.
- Content rewrite pass on `pairing-devices.html`, `phone-focus-mode.html`, `timers-extensions-backburner.html`, `focus-and-intents.html`, plus new sections for invites and TV sign-in.
**Files:** `site/docs/index.html`, the 4 named pages, `scripts/sync-version.mjs` or a docs-specific build step.
**Size:** M (badge fix is trivial; the 8-feature content pass is the bulk of the work, still boundable to a day).
**Owner suggestion:** any agent with docs-writing strength; the badge fix specifically should ride along with whichever version-reconciliation work happens next (see #8).

### 8. Version/logo drift reconciliation
**Finding:** Rook Area 5, high severity, independently plausible given the git-log evidence shown (four different "current" version numbers cited across GitHub/local/commit-message/changelog). `staging` still ships the OLD "Split-Tab T" logo while `logo-rollout` sits unmerged; Sidecar PWA icons (192/512) are stale since v0.1.0, predating the logo rollout entirely.
**Fix:** merge `logo-rollout` into `staging` before the next CWS build; regenerate Sidecar PWA icons from the new mark; push local `staging` to reconcile with GitHub; update `Tabatha_Changelog.md`'s top entry (currently stuck at v6.5.0, dated 2026-07-01) to match reality.
**Files:** `public/icons/*`, `sidecar/public/icons/*`, `sidecar/public/manifest.webmanifest`, `Tabatha_Changelog.md`.
**Size:** S-M (mostly a merge + asset regen, not new code) — but sequencing matters: confirm which worktree is the intended CWS-submission source before merging, since this task's own note already flags GitHub/local/worktree disagreement as an open reconciliation chore.
**Owner suggestion:** whoever's doing release hygiene this cycle — do this before any CWS store submission, not after.

### 9. Home: Context Activity blank for companion-less users
**Finding:** Argus H7, high severity. `UnifiedTimeline` early-returns empty *before* folding in clock breaks/clock-in-out markers whenever `sessions.length === 0` — meaning any user who's never connected the desktop companion (companion is optional) sees a fully blank "Context Activity" section, not even their own clock markers, with no empty-state explanation. Plausible majority-of-users impact given companion is opt-in.
**Fix:** build break/clock-marker segments independent of companion `sessions.length`; only early-return when truly nothing exists at all; add a distinct empty-state message for the true-empty case.
**Files:** wherever `UnifiedTimeline` lives in `src/home/`.
**Size:** S-M.

### 10. Break notes silently don't persist
**Finding:** Argus W1, high severity — the one place in the whole audit where the UI actively lies about whether input was saved (unlike its correctly-"SOON"-badged siblings). `BreakNotes` saves to local React state only; comment literally says "In production this would persist via sendMessage."
**Fix:** wire a real save handler into `clockService.js`/clock history, or (fastest stopgap) add the same stub badge used elsewhere until the real persistence lands.
**Files:** `BreakNotes` component, `clockService.js`.
**Size:** S (stopgap badge) or M (real persistence).

### 11. Backburner-initiate button missing from Sidebar and Home
**Finding:** Argus B1, high severity, directly contradicts `docs/features/207-backburner.md`'s own spec ("Available on InBar, Homepage, and Sidebar") — only InBar has it. **Contested-call note:** Malkio's original seed ask ("Focus can't be backburnered, only tabs — Sidecar can do both") is inverted from what's shipped — Backburner is Focus-only everywhere, and Sidecar has no tab concept at all, so the seed's literal premise is wrong. The real, concrete bug underneath it is B1: 2 of 3 promised surfaces never got the button. Promoting B1, not the seed's literal framing.
**Fix:** add a 🔥 button next to Pause in both action rows, wired to the same `BACKBURNER_FOCUS` message InBar already uses.
**Files:** Sidebar and Home focus/queue action-row components.
**Size:** S.

### 12. Gatekeeper race — page renders before the intent gate appears
**Finding:** Argus C1, high severity — undermines the core "you must set intent before browsing" mechanism. The overlay is built only after awaiting `CHECK_CONTEXT_NEEDED`/`GET_FOCUS_ENGINE` + two storage round-trips; `document_start` doesn't guarantee the page stays frozen during those awaits.
**Fix:** inject a cheap dimming placeholder synchronously first, swap in the full form once data resolves.
**Files:** `src/content/gatekeeper.js`.
**Size:** M (needs care to avoid a flash-of-placeholder feeling worse than the current race in the common fast-resolve case).

---

## Also promoted to NOW, just outside the top 12 (quick, cheap, worth doing alongside the above)

- **BlockGate's first `sendMessage` has no try/catch** (Argus C11, med) — unlike gatekeeper.js/inbar.js, an invalidated extension context throws unhandled and the block silently fails open. Security-adjacent, one-line fix. Size: S.
- **Pairing-code copy implies TV/Watch-only** (Argus D4 / Cirra §1.1, med) — hides that it's exactly what a signed-out phone needs. Soften copy on both extension and Sidecar. Size: S.
- **Live Preview blank for 11/24 settings sections, no fallback message** (Argus S1, high visibility) — the cheap half of this (add the existing generic fallback string everywhere it's missing) is NOW-able; building real mockups for Context View/Blocked Sites (S3/S4) is OVERHAUL-scoped. Size: S for the fallback-message pass alone.
- **Popup search placeholder says "Ctrl+Space," actual shortcut is Ctrl+Shift+E** (Argus B9, low) — one-line fix, or read `chrome.commands.getAll()` dynamically. Size: S.
- **`SessionList.jsx` dead code** (Argus H6, low) — delete file + import. Size: S.
- **`site/docs` deploy lacks `--branch=main`** (Rook, already self-flagged in `docs/OPERATIONS.md`) — preview-deploy risk, one-line wrangler flag. Size: S.
- **Sidecar `SIDECAR_VERSION` hardcoded independent of `app.json`** (Rook #21, latent) — generate from `app.json` at build, same pattern as the extension. Size: S.

---

## Killed / demoted — wrong, already-fixed, or cosmetic-only

- **Seed 5's literal framing ("Focus can't be backburnered, only tabs — Sidecar can do both")** — confirmed inverted by Argus's own read and unchanged by this pass: Backburner is Focus-only everywhere; Sidecar has no tab concept. Killed as stated; the real, concrete gap (B1) is promoted above instead.
- **Cirra's "Pair Extension used to be behind a tray right-click" framing** — independently verified **wrong** against pre-wave commit `0c883fe`: the tray was already a flat single-left-click menu. The underlying bug (silent token rotation, no confirm) is real and stays in NOW #3; only the "it used to be safer-by-friction" framing is corrected.
- **Argus D8 / W10 — "docs/features/222/223 specs not present in this worktree"** — checked against the main repo's own git log (visible at session start: "docs: CWS kit… add #223 first-login onboarding," "docs(features): add #222 device management…"). These specs exist; the extension worktree simply hadn't pulled them at audit time. This is a worktree-sync artifact, not a real docs gap — killed as a standalone finding, folded into ordinary branch hygiene instead.
- **Argus S7 ("three confirmation UX patterns coexist")** — real as an observation but cosmetic-only at the severity Argus assigned it (low); the one place this actually matters (device sign-out/clear-token having *no* confirm at all) is already captured by higher-severity device-lifecycle items above. Demoted out of NOW; fold into whatever settings-consistency pass Plan 046 does.
- **Argus S11 (Tags & Associations is a static demo page)** — informational, no functional harm, correctly labeled low by Argus. Demoted to OVERHAUL/backlog, not a NOW item.
- **Argus C10 (sticky note breaks the shared visual language)** — Argus's own note says "keep if intentional." Not a bug; no action needed unless Malkio says otherwise.
- **Rook #7 (`external_google_enabled=false` despite live Google sign-in)** — Rook already correctly hedged this as "plausibly stale/inert flag... flagging for a live test, not asserting a break." Keeping it at that hedge — it's a verify-only task, not a NOW fix, until someone actually reproduces a live failure.

---

## OVERHAUL themes (feed Plan 046 — see spec skeleton for detail)

1. **Settings information architecture + Live Preview coverage.** 11/24 blank preview panes, Cortex buried under "Privacy & Capture," Team Activity vs. Devices altitude mismatch, Sidecar's 13-flat-card settings screen with mixed autosave/explicit-save models.
2. **Home/header information density.** Clock-wrapper whitespace, OtherProfilesStrip wasted-row, InitiativesPanel/ProjectsClientsPanel functional overlap, no signed-in/out signal.
3. **Device lifecycle UX, end to end.** Two non-cross-referencing "your devices" systems (Devices panel vs. Live Stints), no re-invite path on either extension or Sidecar, `machine_id` semantically overloaded across writers, grouping logic duplicated (not shared) between extension and Sidecar.
4. **Watch robustness pass.** Beyond the Critical crash fix (already in NOW #4): staleness signal on the Tile/complication, 0-rows-vs-fetch-failed disambiguation, real clock screen instead of a placeholder that already lied about its own version number, haptic overtime alert, on-device unpair.
5. **Parity-matrix closure.** Sidebar Tasks panel stripped vs. Home's full CRUD; Backburner/sub-intent/checkpoints exist data-layer-wide (Sidecar-native) but the extension UI doesn't render them yet; Feature #212 (InPop Intent Dropdown Header) confirmed unbuilt despite reusable InBar plumbing.
6. **Docs pipeline hardening.** Beyond the one-time content refresh in NOW #7: no freshness-check mechanism exists at all (no CI, no keyword-vs-changelog gate) — `docs:check` script proposal from Rook.
7. **Content-script modal discipline.** 7 distinct auto-triggered InBar overlays with no cooldown between them, no Escape-to-dismiss anywhere across gatekeeper/InBar/BlockGate, gatekeeper's 8+-choice wall contradicting Progressive Simplicity, InBar's 8 unlabeled icon buttons.

Full detail on each theme is in the Plan 046 spec skeleton.

---

## Cross-audit conflicts / sequencing notes

- **NOW #1 (XSS escaping) and NOW #11 (Backburner button) both touch InBar/related components** but are non-overlapping code regions (escaping is a rendering-layer wrap, Backburner is a new button + message wire) — safe to parallelize.
- **NOW #2 (RLS hardening) should land before or alongside NOW #8's version reconciliation** if a CWS submission is imminent — don't ship a store update with the known-open security gap if it can be closed first; it's small (S) and shouldn't block the release train.
- **NOW #5 (org-hours RPC) depends conceptually on #221's consent model**, which is itself only a concept doc (`docs/superpowers/specs/2026-07-21-shared-focus-org-context-concept.md`) — this NOW item should be sequenced after Malkio confirms the opt-in default/consent language in #221, not built ahead of that confirmation, even though the technical shape is ready.
- **NOW #3 (companion 0.3.8 fix pass) blocks the companion-update announcement**, per Cirra's own verdict ("not release-ready as-is, but close") — treat as a release gate, not a backlog item.
- **NOW #7 (docs refresh) and NOW #8 (version/logo reconciliation) should NOT be split across two separate agents working the same files concurrently** — both touch versioning; sequence #8 first (it's the source-of-truth fix), then #7 (which references the now-correct version).
