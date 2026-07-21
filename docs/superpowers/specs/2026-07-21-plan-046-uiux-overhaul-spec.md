# Implementation Plan 046: UI/UX Overhaul

**Status:** draft (spec skeleton — not registered; CeeCee handles plan-registry entry after Malkio review)
**Current version:** extension 6.7.54, Sidecar 0.13.5
**Target version on completion:** extension 7.0.0 (breaking IA changes to Settings nav + Home header warrant a major bump per the semantic-ledger convention already used for prior majors), Sidecar 0.14.0 (Settings regroup is the largest single change on that surface)
**Source material:** `docs/audits/2026-07-21-extension-ux-audit.md` (Argus), `docs/audits/2026-07-21-sidecar-companion-watch-ux-audit.md` (Cirra), `docs/audits/2026-07-21-crosscutting-systems-audit.md` (Rook), synthesized in `docs/audits/2026-07-21-SYNTHESIS.md` (Koda). This plan covers only the **OVERHAUL**-classed findings from that synthesis — the **NOW-fix** list is tracked and executed separately, outside this plan.

---

## Goals

1. Make Settings navigable and honest — every section either has a real Live Preview or clearly doesn't need one; related concerns (behavior, appearance, integrations) are grouped by altitude, not flattened into one undifferentiated list, on both the extension and Sidecar.
2. Reduce Home/header visual noise to match the actual information being shown — no dead whitespace, no wasted rows, a real signed-in/out signal.
3. Unify the device lifecycle into one coherent mental model across extension, Sidecar, and Watch — one place to see "your devices," clear terminal vs. soft states, a working re-pair path everywhere.
4. Bring Watch to the same robustness bar as the other two surfaces — no crashes, no silent staleness, no placeholder screens claiming to be a shipped version.
5. Close the parity matrix — what one surface can do (Sidecar's data-layer-native sub-intents/backburner/checkpoints; Home's full Tasks CRUD), every comparable surface can do, or the gap is explicitly documented as a scope decision rather than an accidental miss.
6. Make the docs pipeline self-correcting instead of manually-remembered — a shipped feature without doc coverage should be a build-time signal, not a someday-audit finding.

## Non-goals (explicitly out of scope for Plan 046)

- Any of the NOW-fix list in the synthesis doc — those ship independently and should not wait on this plan's sequencing or approval.
- Cortex/AI-layer feature work (Plans 040-043 in the cortex-phase track) — Theme 1 relocates Cortex's *settings-nav position*, not its functionality.
- The org-hours v1 RPC + opt-in flag (synthesis NOW #5) — that's a NOW item gated on #221 consent-model confirmation, not an OVERHAUL theme, even though it touches similar `TeamActivityPanel` surface area as Theme 3.
- Native iOS/Android builds, Pomodoro-as-controllable-feature, or any other item from the Plan 040 session-log "next steps" not named in the audits.
- Rewriting the InBar/gatekeeper/BlockGate design system from scratch — Theme 7 is about modal *discipline* (cooldowns, escape handling, choice-count), not a new visual language. Argus's own audit confirms the three content scripts already share one consistent design system; that's preserved, not replaced.
- Chaperone/personality-interrupts feature build-out (that's Plan 040 Epic 10 territory) — Theme 4's Chaperone item is limited to the audio-permission UX bug (silent no-op on kiosk/TV), not the feature's broader scope.

---

## Theme 1 — Settings information architecture + Live Preview coverage

**Problem (from synthesis OVERHAUL themes + Argus S1/S3/S6, Cirra §1.4):** 11 of 24 extension Settings sections render a completely blank Live Preview pane with no fallback message. Cortex — a full AI-recommendation subsystem — is buried inside a section literally named "Privacy & Capture." Team Activity (managing other people) is a sub-panel inside Sync & Account while Devices (managing your own) gets a full top-level nav entry — inconsistent altitude for comparable concerns. Separately, Sidecar's `SettingsScreen.tsx` is 13 flat, equal-weight Cards in one scroll with two different save models (explicit-save vs. autosave) silently coexisting on the same screen, with no "unsaved changes" indicator.

**Scope sketch:**
- Extension: build real Live Preview mockups for Context View and Blocked Sites (the two highest-value gaps per Argus, both already flagged NOW-adjacent for the cheap fallback-message pass — this theme is the *real* mockup work, not the stopgap). Promote Cortex to its own top-level nav section. Reconcile Team Activity/Devices altitude — likely: both become peer top-level entries, or both fold under a single "People & Devices" parent.
- Sidecar: group the 13 cards into 3-4 collapsible top-level sections (Account & devices / Focus behavior / Integrations / Feedback), reusing the disclosure pattern each card already applies internally. Pick one save model (autosave-everywhere with debounce is the lower-friction default) or add a persistent unsaved-changes indicator if explicit-save stays for some groups.
- Fold in the small IA items from Argus's S-series that are genuinely OVERHAUL-scoped: S9 (dedupe the two Gatekeeper preview surfaces), S8 (idle-threshold control lives in two places).

**Dependency notes:** Theme 1's Cortex-relocation should be sequenced with whichever Cortex plan (040-043 in the cortex-phase track) is actively shipping at the time, to avoid nav churn mid-feature-build. No conflict with Plans 042-045 (conversational Tabatha, peer-view, scheduling/calendar, growth-integrations) — those add settings surfaces, they don't restructure nav.

---

## Theme 2 — Home / header information density

**Problem (Argus H1-H5, seed 3 and 4):** Clock wrapper reserves ~40-50px unconditionally even fully hidden. `OtherProfilesStrip` is a full-width row that's mostly dead space with 1-2 chips. No visual signal anywhere on Home for signed-in vs. signed-out, no sign-in entry point from Home. `InitiativesPanel` and `ProjectsClientsPanel` overlap functionally as two separate nav tabs with unclear differentiation.

**Scope sketch:**
- Gate the clock wrapper's spacing on `showClock`/`showCountdown`; render zero-size when both are off.
- Fold `OtherProfilesStrip` into the header's existing flex-wrap cluster instead of a dedicated full-width row, or right-align/compact it.
- Add a lightweight signed-in/out header signal + a sign-in entry point reachable from Home (currently: none).
- Merge `InitiativesPanel`'s tree view (canonical) with `ProjectsClientsPanel`'s CRUD, eliminating the second nav tab.

**Dependency notes:** No known conflicts with in-flight plans. This is a self-contained Home-surface theme; safe to parallelize against Theme 1 and Theme 3 (different files).

---

## Theme 3 — Device lifecycle UX, end to end

**Problem (Argus D1-D8, Cirra §1.1, Rook Area 4 — the largest cross-cutting theme in all three audits):** Two non-cross-referencing "your devices" systems exist on the extension alone (Settings→Devices over `browser_profiles`, Work Shifts→Live Stints over `browser_profile_status`) sharing no code, no table, and almost no cross-cleanup. No re-invite/re-pair path exists on **any** surface (extension, Sidecar) for a signed-out device — redeeming a pairing code always creates a brand-new row, losing the old row's history. `machine_id` means two incompatible things depending on which writer touches it (companion-pairing FK for the extension, arbitrary self-generated UUID for Sidecar). Device-grouping/dedup logic is independently reimplemented in the extension (`deviceGrouping.js`) and Sidecar (`DevicesCard.tsx`), free to drift. Pairing-code copy on both surfaces implies TV/Watch-only, hiding the phone-recovery use case (partially covered as a NOW-fix copy tweak; the deeper "make re-pairing an actual first-class row-level action" work is this theme).

**Scope sketch:**
- Design one canonical device-lifecycle state machine (sketched in Rook's report: `fresh → active ⇄ paused (soft, self-resumable) → revoked (hard, terminal) → fresh on legitimate re-registration`) and make every writer (extension, Sidecar, Companion proxy) actually honor it — today the Companion writer never reads or writes `revoked_at`/`paused` at all.
- Add a real "Re-invite/re-pair" action on a revoked row, on both extension Devices and Sidecar `DevicesCard`, pre-filled with the old row's display name — not a brand-new disconnected row.
- Cross-reference Devices ⇄ Live Stints: signing out a device should remove/mark its Live Stints presence, not leave a ghost that needs separate manual cleanup.
- Extract device-grouping/dedup logic to one shared implementation (or at minimum, one shared spec both surfaces test against), closing the drift risk.
- Resolve the `machine_id` overload — likely split into two columns with distinct names, or document the divergence explicitly and stop conflating in code comments/migrations.
- Sidecar-specific: add a confirm step to `signOutDevice()` (currently zero-friction for any non-self row, one mis-tap away from the exact incident this whole feature area exists to prevent).

**Dependency notes:** This theme's data-model changes (device state machine, `machine_id` split) should land **before** any Watch pairing-flow work, since Watch reuses the same 6-digit code mechanism and would otherwise need a second migration. Sequence Theme 3 before Theme 4's Watch items that touch pairing/unpair. Also depends on synthesis NOW #2 (RLS hardening) already being merged — building new lifecycle UI on top of an unhardened RLS layer would just add more surface area to the same gap.

---

## Theme 4 — Watch robustness pass

**Problem (Cirra §2, beyond the Critical crash fix already tracked as a NOW item):** No staleness signal anywhere — Tile/complication cache has no timestamp field at all, so a never-reopened watch app silently shows stale data indefinitely. "0 rows" and "fetch failed" are indistinguishable, so a stale/offline watch can show "Nothing in focus" while the phone has an active timer running. Clock screen is a static 3-line placeholder that already claims to be a past version ("Clock in/out lands in v0.2.0" — shipped version already is 0.2.0). No haptic overtime alert. No on-device unpair/logout (`SessionStore.clear()` exists in code, nothing in UI calls it). "Quick add" voice chip is a silent no-op with zero feedback.

**Scope sketch:**
- Add `cachedAtMs` to `SnapshotCache`; grey out/age-indicate the Tile past a threshold.
- Thread a distinct error/offline state through `FocusUiState` instead of collapsing empty-and-failed to the same null state.
- Ship the real clock read/write cycle, or at minimum stop the placeholder screen from promising an already-passed version.
- Add haptic buzz on timer expiry.
- Add a "Sign out" chip alongside the existing "Re-pair" chip, wired to the already-existing `SessionStore.clear()`.
- Hide the Quick-add voice chip until built, or wire the app's existing `Confirmation` dialog primitive to show "Coming soon."
- Fix the generic "Code invalid or expired" error to distinguish network/IO failure from genuine rejection.

**Dependency notes:** The Critical crash fix (unguarded network calls) is a synthesis NOW item and should already be merged before this theme starts — building staleness/error-state UI on top of a codebase that can still hard-crash on the same call sites is wasted sequencing. Coordinate the unpair chip with Theme 3's device-lifecycle state machine, since "sign out" here should feed the same `revoked_at`/lifecycle model, not a parallel one-off.

---

## Theme 5 — Parity-matrix closure

**Problem (Argus B1-B9, Cirra §1.3, Rook's session-log cross-reference):** `SidebarTasksPanel` is a stripped CRUD (create/complete/reopen only) while Home's `TasksPanel` additionally has delete, inline edit, and link-to-focus — breaking a parity goal repeatedly called out in this project's own session log. Sub-intents/checkpoints/backburner are implemented Supabase-natively in the Sidecar's data layer (`focus_items`/`focus_checkpoints`/`focus_events`) — any surface reading the same tables gets them "for free" at the data layer, but the extension's UI doesn't render them the same way yet; the gap is UI-only, not data-layer. Feature #212 (InPop Intent Dropdown Header) is confirmed unbuilt in both plausible locations, despite the reusable pieces (focus list, `SWITCH_FOCUS` message) already existing in InBar's edit dropdown. `GroupsList` renders tab groups read-only with no click-to-expand.

**Scope sketch:**
- Port Sidebar Tasks up to Home's feature level, or (preferred, less drift-prone) share one Tasks component across both surfaces with a `compact` prop rather than maintaining two implementations.
- Build the extension-side UI for sub-intents/backburner/checkpoints reading the already-existing data-layer tables — this is presentation work, not new schema.
- Build `<IntentHeaderDropdown>` for gatekeeper/InPop reusing InBar's existing focus-list/`SWITCH_FOCUS` plumbing, closing #212.
- Add click-to-expand to `GroupsList`.

**Dependency notes:** The sub-intents/backburner/checkpoints UI work here is the natural extension-side counterpart to work already shipped Sidecar-side under the Plan 040 sidecar track (`docs/superpowers/specs/2026-07-18-sidecar-timeline-voice-tasks-design.md`) — coordinate with whoever owns that plan's "next steps" (it already lists "extension-side adoption of checkpoints/sub-intent/backburner sync" as its own pending item) rather than duplicating the effort under two different plan numbers.

---

## Theme 6 — Docs pipeline hardening

**Problem (Rook Area 1, beyond the one-time content refresh already tracked as a NOW item):** No freshness-check mechanism exists at all — no `.github/workflows`, no CI, nothing catches a shipped feature going undocumented. `docs/OPERATIONS.md` already self-admits two related gaps (missing `--branch=main` on deploy, sidecar version hand-synced in 2 files) that nothing has closed.

**Scope sketch:**
- Add a `docs:check` script: grep `site/docs/*.html` for a maintained list of "must-mention" feature keywords kept alongside `Tabatha_Changelog.md` entries; run in `prebuild` or a lightweight CI step; fail loud when a shipped feature has no doc mention.
- Add the missing `--branch=main` flag to `site:deploy` (already self-flagged, trivial one-line fix, but sequenced here since it's part of the same pipeline-hardening theme rather than a standalone NOW item).
- Generate Sidecar's `SIDECAR_VERSION` constant from `app.json` at build time instead of an independent hardcoded literal (also captured as a small NOW item in the synthesis — listed here too since it's the same class of "no single source of truth" problem this theme exists to close).

**Dependency notes:** Independent of every other theme; safe to build in parallel any time. No shared files with Themes 1-5.

---

## Theme 7 — Content-script modal discipline

**Problem (Argus C1, C3, C6, C7, C8 — the clearest, most-repeated violation of the product's own documented Progressive Simplicity principle):** Gatekeeper shows 8+ simultaneous choices before a user can proceed. InBar's persistent bar has 8 icon-only buttons with zero `aria-label`s. None of InBar's 7 possible auto-triggered full-viewport overlays (FTE, Welcome-Back, Combo, Checkpoint, Backburner-alert, Idle-prompt, Drift-detected) can be Escape-dismissed or receive initial focus on open. No cooldown/backoff exists between different overlay types firing in quick succession.

**Scope sketch:**
- Collapse gatekeeper's secondary actions behind a "More options ▾" affordance; keep Continue + Nevermind primary.
- Add `aria-label`s to InBar's 8 persistent-bar icon buttons; consider an overflow menu for less-frequent actions.
- Add a shared keydown listener per overlay type: Escape → safest dismiss; focus the first actionable button on open.
- Add a shared "last modal shown at T" timestamp; suppress a new auto-triggered modal within N minutes of the last one; trim the heaviest button sets (checkpoint: 7 CTAs; FTE: 7 buttons).
- Add `role="dialog"`/`aria-modal` + focus trap to gatekeeper and BlockGate (BlockGate's copy is otherwise the best-designed friction-to-purpose ratio of the three surfaces per Argus — this is purely the missing dialog semantics, not a rework).

**Dependency notes:** Should land **after** Theme 1's escaping fix pattern exists in the codebase if any of the button/label work touches the same rendering call sites — low actual risk of conflict since escaping is a data-interpolation concern and this theme is a structure/interaction concern, but worth a quick diff-check before merging both in the same window.

---

## Parallelability review

*(Per `docs/parallel-development-workflow.md`, required before requesting Malkio's approval — filled in against this skeleton's current level of detail; a full review should be re-run once each theme is broken into its own implementation plan/branch.)*

- **Zones touched:** all three product surfaces (extension `src/settings/`, `src/home/`, `src/content/`; Sidecar `sidecar/src/screens/`, `sidecar/src/lib/`; Watch `tabatha-watch/` Kotlin/Compose layer; shared `site/docs/`). No zone is touched by more than 2-3 of the 7 themes.
- **Shared files modified:** `src/settings/index.jsx` (Theme 1 primarily, Theme 5's `#212` dropdown may touch adjacent gatekeeper-side code but not this file), `TeamActivityPanel.jsx` (Theme 3 for device cross-referencing UI, and separately the NOW-list's org-hours RPC item — these two should coordinate on this one file to avoid a merge clash even though they're on different tracks). `deviceGrouping.js`/`DevicesCard.tsx` (Theme 3 only). No file is a genuine hotspot across more than 2 themes.
- **Conflicts with active worktrees:** Theme 1's Cortex-nav relocation should sequence against whichever cortex-phase plan (040-043) is mid-build at execution time — nav churn during an active feature build is the main risk. Theme 5's extension-side sub-intent/backburner UI should coordinate with the sidecar-track Plan 040 (`sidecar_voice_timeline_tasks`)'s own listed next-step of the same name, to avoid two agents building the same thing under two plan numbers. No conflicts identified against Plans 042-045 (conversational Tabatha, peer-view, scheduling/calendar, growth-integrations/governance) — those add net-new surfaces rather than restructuring existing ones this plan touches.
- **Can this run parallel?** Yes, theme-by-theme — Themes 2, 4, 6 are fully self-contained with no shared files against any other theme and can start immediately once approved. Themes 1, 3, 5, 7 have soft sequencing preferences noted above but no hard blocking dependencies between each other.
- **Max branch lifetime:** each theme should be scoped to its own branch/worktree and should not run longer than ~1 week before a scope-split; Theme 3 (device lifecycle) is the largest single theme and is the most likely to need a mid-week split (see below).
- **Scope-split points (>1 week):** Theme 3 splits cleanly into (a) data-model/state-machine + migration work, (b) extension Devices-panel UI, (c) Sidecar DevicesCard UI — these three can run as separate branches off one shared migration once (a) lands. Theme 1 splits into (a) extension Settings IA + Live Preview mockups, (b) Sidecar Settings regroup — already effectively two different codebases, no reason to force one branch.

---

## Open questions for Malkio (surface before execution starts)

1. Theme 1: does Cortex become its own top-level nav entry, or a promoted sub-section? Does Team Activity/Devices altitude get reconciled by merging under one parent, or by promoting Team Activity to full top-level?
2. Theme 2: confirm which "wasted row" the original seed ask referred to — the desktop-companion status dot or the cross-device `OtherProfilesStrip` pills (Argus H3 flagged these as a naming collision worth resolving before the fix, not after).
3. Theme 3: is `machine_id`'s split worth a migration now, or is documenting the divergence sufficient for this cycle?
4. Target version bump: confirmed as major (7.0.0 / 0.14.0) given Settings-nav restructuring is user-visible and arguably breaking for anyone with saved deep-links/muscle-memory to current nav positions — confirm this reasoning holds before locking it in.
