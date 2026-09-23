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

**Deepened detail (from source audits):**

*Extension Settings Preview coverage (Argus Surface 1, lines 25–71):*
- **Argus S1** — 11 of 24 settings sections render blank preview panes with no fallback message (coverage table at lines 29–43 names: Context View, Focus Lifecycle, Blocked Sites, Work Clock, Follow-through, Sync & Account, Webhooks, Desktop Activity, Integrations, Developer, and one category grouping Time Tracking/Export/Privacy). `src/settings/index.jsx:2128` has a Live Preview clamp bug; S2 identifies the FlipClock scale clamped at 1.0 vs slider max 1.5 (lines 58–59 confirm bug location).
- **Argus S3** — Context View is identified as the "highest-value gap" and "most visual section in Settings," requiring a mocked frame reflecting day countdown, up-next, timeline, checkpoints toggles live. Section name: "Context View."
- **Argus S6** — Cortex buried under "Privacy & Capture" section name (lines 62–63); Cortex subsystem includes "AI recommendation engine, routing tier, digest preview, Voice v0, Context Reconciliation" and is "badly undersold by the section name."
- **Argus S8/S9** — `src/settings/index.jsx` line references (~2128 for FlipClock, section pattern at index line boundaries 2043–2400 region) reveal idle-threshold control in two places (Time Tracking + Focus Lifecycle) and duplicate Gatekeeper preview surfaces (Intent-Popup section has inline InBar mockup + shared Live Preview pane).
- **Argus IA note, line 69** — Team Activity (managing *other people*) is a sub-panel in Sync & Account while Devices gets full top-level nav, inconsistent altitude for comparable concerns.

*Sidecar Settings screen (Cirra §1.4, lines 38–44):*
- `SettingsScreen.tsx` is 13 stacked Cards in one undifferentiated scroll: Account, Notifications, Defaults, Timer mode, Context View, Voice check-ins, Work schedule & nudges, Pair a device, Devices, Invites, Task sync, Feedback, Chaperone.
- **Cirra finding:** six groups use explicit "Save X" buttons (defaults, timer mode, timer display, voice check-in, nudges, schedule) while five autosave on toggle (push, away-immediate, checkpoint counter, chaperone enable, chaperone quiet-hours), creating silent coexistence of two save models on one screen with no "unsaved changes" warning.

**Dependency notes:** Theme 1's Cortex-relocation should be sequenced with whichever Cortex plan (040-043 in the cortex-phase track) is actively shipping at the time, to avoid nav churn mid-feature-build. No conflict with Plans 042-045 (conversational Tabatha, peer-view, scheduling/calendar, growth-integrations) — those add settings surfaces, they don't restructure nav.

---

## Theme 2 — Home / header information density

**Problem (Argus H1-H5, seed 3 and 4):** Clock wrapper reserves ~40-50px unconditionally even fully hidden. `OtherProfilesStrip` is a full-width row that's mostly dead space with 1-2 chips. No visual signal anywhere on Home for signed-in vs. signed-out, no sign-in entry point from Home. `InitiativesPanel` and `ProjectsClientsPanel` overlap functionally as two separate nav tabs with unclear differentiation.

**Scope sketch:**
- Gate the clock wrapper's spacing on `showClock`/`showCountdown`; render zero-size when both are off.
- Fold `OtherProfilesStrip` into the header's existing flex-wrap cluster instead of a dedicated full-width row, or right-align/compact it.
- Add a lightweight signed-in/out header signal + a sign-in entry point reachable from Home (currently: none).
- Merge `InitiativesPanel`'s tree view (canonical) with `ProjectsClientsPanel`'s CRUD, eliminating the second nav tab.

**Deepened detail (from source audits):**

*Home header layout state matrix (Argus Surface 2, lines 73–98):*
- **Argus H1** — Clock wrapper (`src/home/index.jsx:1894`) reserves margin/padding unconditionally even when both `showClock` and `showCountdown` are false; when both are off, the middle grid cell still claims ~40–50px of padding/margin, creating an invisible box that forces the row taller than visible content requires.
- **Argus H2** — `OtherProfilesStrip` is a separate full-width row that wastes space with only 1–2 pills; its wrapper uses `justify-content: flex-start` on a ~1036px row, leaving mostly dead space when companion device count is low.
- **Argus H3** — Terminology collision: "Companion" refers both to the desktop-companion 6px dot (`CompanionStatus`, inline) and the cross-device `OtherProfilesStrip` pills, making it ambiguous which one Malkio's "wasted row" seed ask refers to.
- **Argus H4** — No visual affordance on Home distinguishes signed-in vs. signed-out state anywhere; no CTA path into cloud-sync sign-in from Home exists.
- **Argus H5** — `InitiativesPanel` and `ProjectsClientsPanel` both provide browse/manage Clients→Projects→Tasks as two separate nav tabs with unclear differentiation and functional overlap. Layout state traced via `git show 8814e86` (6.7.49 overlap fix) and `FlipClock.jsx:213–314`; the fix used `zoom` + grid minimums but never touched the middle column's unconditional `margin:5px; padding:20px` wrapper.

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

**Deepened detail (from source audits):**

*Extension device lifecycle (Argus Surface 3, lines 103–121):*
- **Argus D1** (high/BUG, Argus lines 110–111) — Remote "Sign out" is functionally a no-op after ≤5 minutes: extension never captures `auth_session_id`, so GoTrue revoke never fires; target device silently un-revokes itself on next 5-min sync via `ensureBrowserProfileRow()` unconditionally writing `revoked_at: null` back to its own row, contradicting the panel's own copy.
- **Argus D2** (high/BUG, line 112) — Signing out a device doesn't remove it from Live Stints; `fetchInstalls()` doesn't filter on `revoked_at`, leaving a "signed out" device appearing as an offline ghost until separately dismissed in Work Shifts.
- **Argus D3** (med/NOW-fix, line 113) — No way to re-invite a signed-out device; pairing codes are profile-scoped, never tied to a prior row; redeeming always creates a brand-new row, old row's history gone.
- **Argus D4** (med/NOW-fix, line 114) — Pairing-code copy on both extension and Sidecar implies TV/Watch-only ("choose 'Sign in with a code' (TVs)"), hiding that it's exactly what a phone user needs to recover from accidental sign-out.
- **Argus D5** (med/OVERHAUL, line 115) — `revoked_at` polled into `_selfDeviceStatus` every 30s but extension-side `DevicePausedBanner` only checks `.paused`, never `.revokedAt`; Sidecar has "honor logic" that force-signs-out on remote revoke; extension does not.
- **Argus D6** (low/NOW-fix, line 116) — No self-deregistration/"forget this device" action; no link from Devices into separate Live Stints cleanup.
- **Argus D7** (low/NOW-fix, line 117) — Terminology collision: "Sign out" (Devices) vs. "Clock out"/"Dismiss" (Live Stints) act on overlapping device sets with unrelated meanings, no cross-referencing copy.
- **Argus D8** (low/docs gap, line 118) — `docs/features/222-*` and `223-*` specs not present in the audit worktree; reconstructed from source + git history instead.

*Sidecar device lifecycle (Cirra §1.1, lines 18–25):*
- **Cirra med/BUG** — No "regenerate a code for a listed device" action on `DevicesCard.tsx`; `PairWatchCard.tsx`'s `mint()` has no `deviceId` parameter, forcing users to create brand-new untethered codes.
- **Cirra med/BUG** — Signing a device out has no undo/confirm dialog in `signOutDevice()` (DevicesCard.tsx ~L263); any non-self row can be signed out with one tap, incident is not self-rescuable like pause is (no analogous resume screen).
- **Cirra low/NOW-fix** — Device list grouping/dedup (`groupKey`/`groupRows`, `isDefaultVisible`, DevicesCard.tsx:111–122) is client-side band-aid over genuine data-quality bug (~731 dupes from extension-side `local_id` regeneration); comment recommends confirming parallel server-side cleanup task is closed.
- **Cirra low/OVERHAUL** — Device "kind" picker (phone/tablet/desktop/watch/browser_extra) is fully manual with no smart default beyond "phone"; real large device lists require hand-classification for Phone Focus Mode gating.

*Cross-cutting device state machine (Rook Area 4, lines 105–137):*
- **Rook:** schema evolution tracked through migrations: 001 (base profile columns), 013 (partial unique index on non-chrome browsers), 016 (RLS-only), 017 (adds `local_id` + `machine_id`, non-partial unique index on `(profile_id, local_id)`), 045 (adds `display_name`, `auth_session_id`, `paused`, `revoked_at`, `device_settings`).
- **Rook highseverity inconsistencies:** (1) extension `ensureBrowserProfileRow` (syncService.js:135–241) clears `revoked_at` unconditionally on every ~15-min sync with no guard; (2) Sidecar `registerDevice` (AuthContext.tsx:163–248) uses in-memory `registered.current` guard, one-shot-per-launch only; (3) Companion proxy never reads/writes `revoked_at`/`paused`; (4) `machine_id` means "companion-pairing FK" for extension, "arbitrary self-generated UUID" for Sidecar — not comparable despite sharing column; (5) RLS has no state-aware `WITH CHECK` (migration 016/045 bare `profile_id` checks only); (6) grouping logic duplicated in `src/utils/deviceGrouping.js` (extension) and `DevicesCard.tsx` (Sidecar), free to drift.
- **Rook canonical lifecycle sketch:** `fresh → named → active ⇄ paused (soft, self-resumable) → revoked (hard, terminal) → sign-out honor-logic returns to `fresh` on re-registration. Bug: unintended path exists — any unguarded sync silently returns `revoked` → `active` with no re-auth.

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

**Deepened detail (from source audits):**

*Watch (Wear OS, Compose) robustness pass (Cirra §2, lines 68–88):*
- **Cirra high/OVERHAUL** — No staleness signal anywhere; Tile/complication read `SnapshotCache` with no timestamp field at all — no "last synced," no visual staleness treatment. Never-opened watch app silently counts down from cache that could be hours/days old with zero indication.
- **Cirra high/BUG** — "0 rows" and "fetch failed" are indistinguishable; clean HTTP failure from `PostgrestClient` returns empty list, rendering identically to "genuinely nothing in focus" — stale/offline watch can show "Nothing in focus" while active timer runs on phone, no way for user to tell difference.
- **Cirra med/OVERHAUL** — Clock screen is static 3-line placeholder ("Your shift," preview label, "Clock in/out lands in v0.2.0"); shipped version already **is** 0.2.0; deferral target never updated when version bumped.
- **Cirra med/BUG** — "🎙 Quick add" chip on empty-focus screen is silent no-op (`{ /* voice quick-add: v0.3.0 */ }`) — tapping produces zero feedback.
- **Cirra med/NOW-fix** — No overtime alert beyond ring turning red — no vibration/notification — weak signal for wrist device whose value prop is "glanceable, don't check phone."
- **Cirra med/OVERHAUL** — Missing unpair/logout affordance — `SessionStore.clear()` exists in code but nothing in UI calls it; lost/shared watch can't be signed out from itself.
- **Cirra low/OVERHAUL** — Checkpoint "voice note" capability described in doc comments in two files but doesn't exist in code (no `RecognizerIntent` call anywhere) — aspirational documentation.
- **Cirra low/NOW-fix** — Generic "Code invalid or expired" error covers every failure mode including plain network/IO errors, misleading user into re-typing a code that was actually fine.

*Sidecar timer formatting (Cirra §1.2, lines 27–32):*
- **Cirra high/BUG** — `formatTimer()` (sidecar/lib/theme.ts L73–79) never rolls over to hours; always renders `M:SS`, even past 60 minutes (e.g. 2h24m shows `"144:30"` not `"2:24:30"`). Root cause of `ContextView.tsx`'s font-shrinking workaround (`timerFont` calc, L426–435) needed because string length became unpredictable. Meanwhile `formatClock()` and `formatElapsedDigits()` both correctly roll to `h:mm:ss`.

*Sidecar clock-state sync freshness (Cirra §1.2, line 32):*
- **Cirra low/NOW-fix** — `ClockScreen.tsx` hint reads "desktop reflects them on its next sync" — clock-state changes from phone are eventually-consistent (poll-based) to desktop, while `ContextView.tsx` and `DevicesCard.tsx` use Supabase realtime subscriptions for their own live state. One-way freshness gap: Sidecar-to-desktop not on same realtime tier as Sidecar-to-TV.

**Dependency notes:** The Critical crash fix (unguarded network calls) is a synthesis NOW item and should already be merged before this theme starts — building staleness/error-state UI on top of a codebase that can still hard-crash on the same call sites is wasted sequencing. Coordinate the unpair chip with Theme 3's device-lifecycle state machine, since "sign out" here should feed the same `revoked_at`/lifecycle model, not a parallel one-off.

---

## Theme 5 — Parity-matrix closure

**Problem (Argus B1-B9, Cirra §1.3, Rook's session-log cross-reference):** `SidebarTasksPanel` is a stripped CRUD (create/complete/reopen only) while Home's `TasksPanel` additionally has delete, inline edit, and link-to-focus — breaking a parity goal repeatedly called out in this project's own session log. Sub-intents/checkpoints/backburner are implemented Supabase-natively in the Sidecar's data layer (`focus_items`/`focus_checkpoints`/`focus_events`) — any surface reading the same tables gets them "for free" at the data layer, but the extension's UI doesn't render them the same way yet; the gap is UI-only, not data-layer. Feature #212 (InPop Intent Dropdown Header) is confirmed unbuilt in both plausible locations, despite the reusable pieces (focus list, `SWITCH_FOCUS` message) already existing in InBar's edit dropdown. `GroupsList` renders tab groups read-only with no click-to-expand.

**Scope sketch:**
- Port Sidebar Tasks up to Home's feature level, or (preferred, less drift-prone) share one Tasks component across both surfaces with a `compact` prop rather than maintaining two implementations.
- Build the extension-side UI for sub-intents/backburner/checkpoints reading the already-existing data-layer tables — this is presentation work, not new schema.
- Build `<IntentHeaderDropdown>` for gatekeeper/InPop reusing InBar's existing focus-list/`SWITCH_FOCUS` plumbing, closing #212.
- Add click-to-expand to `GroupsList`.

**Deepened detail (from source audits):**

*Sidebar/Home/Popup parity gaps (Argus Surface 4, lines 124–145):*
- **Argus B1** (high/BUG, lines 130–131) — `SidebarTasksPanel` is stripped CRUD (create/complete/reopen only); Home's `TasksPanel` additionally has delete, inline edit, link-to-focus; breaks sidebar/home parity goal repeatedly called out in session log. **Directly contradicts feature spec:** `docs/features/207-backburner.md` states "Available on InBar, Homepage, and Sidebar" but only InBar has the 🔥 button (lines 130–131 cite `#backburner-btn`).
- **Argus B2** (med/BUG, line 132) — Backburner is Focus-scoped only, everywhere (extension and Sidecar); Sidecar has no tab concept at all, so "Sidecar can do both" isn't literally accurate (confirmed inverted from original seed ask), but underlying confusion is real.
- **Argus B3** (med/BUG, line 133) — "Park" (`PARK_TAB`, tab-level deferral primitive) lives only inside BlockGate overlay, has none of Backburner's mechanics (no timer/reason/check-in log), shown read-only elsewhere as "Stash"; two unrelated "set aside" systems with different models.
- **Argus B4** (low/BUG, line 134) — Home's empty-stash copy says "Click Park in the Intent-Popup to save a tab for later" — no "Intent-Popup" component exists anywhere in `src/` (Park only lives in BlockGate overlay).
- **Argus B5** (med/OVERHAUL, lines 137–139) — Sidebar's 5-tab panel nav is icon-only (🎯📋📑📌📦), discoverable only via hover tooltip; poor first-run discoverability in narrow panel.
- **Argus B6** (med/BUG, line 141) — `SidebarTasksPanel` stripped CRUD vs. Home's full CRUD breaks parity goal; cited in session log.
- **Argus B7** (low/UX, line 142) — `GroupsList` renders tab groups read-only with no click-to-expand action.
- **Argus B8** (low/BUG, line 143) — "Restore tab" in Parked list removes by array index, not stable id; concurrent mutation (background auto-park) could remove wrong entry.
- **Argus B9** (low/BUG, line 144) — Popup's search placeholder says "Ctrl+Space" but manifest's actual registered shortcut is Ctrl+Shift+E.

*Sidecar data layer (Cirra §1.3, lines 34–36):*
- Sub-intents/checkpoints/backburner implemented Supabase-natively in Sidecar (`data/checkpoints.ts`, `data/focus.ts`'s `tags._parent`/`tags._backburner`, session log notes existing schema in `focus_items`/`focus_checkpoints`/`focus_events`). Any surface reading same tables gets them "for free" at data layer; **parity gap is UI-only**, not data-layer — extension's UI doesn't yet render these same way.

*Feature #212 status (Argus C15, lines 168–169):*
- **Argus med/OVERHAUL** — Feature #212 (InPop Intent Dropdown Header) confirmed **unbuilt** in both plausible locations. Closest analog is InBar's existing "Edit Intent" dropdown (focus list + create-new, lines 169), but it isn't a header, isn't collapsed-by-default, lives in InBar not gatekeeper/InPop. Reusable pieces exist: focus-list/`SWITCH_FOCUS` message already in InBar.

**Dependency notes:** The sub-intents/backburner/checkpoints UI work here is the natural extension-side counterpart to work already shipped Sidecar-side under the Plan 040 sidecar track (`docs/superpowers/specs/2026-07-18-sidecar-timeline-voice-tasks-design.md`) — coordinate with whoever owns that plan's "next steps" (it already lists "extension-side adoption of checkpoints/sub-intent/backburner sync" as its own pending item) rather than duplicating the effort under two different plan numbers.

---

## Theme 6 — Docs pipeline hardening

**Problem (Rook Area 1, beyond the one-time content refresh already tracked as a NOW item):** No freshness-check mechanism exists at all — no `.github/workflows`, no CI, nothing catches a shipped feature going undocumented. `docs/OPERATIONS.md` already self-admits two related gaps (missing `--branch=main` on deploy, sidecar version hand-synced in 2 files) that nothing has closed.

**Scope sketch:**
- Add a `docs:check` script: grep `site/docs/*.html` for a maintained list of "must-mention" feature keywords kept alongside `Tabatha_Changelog.md` entries; run in `prebuild` or a lightweight CI step; fail loud when a shipped feature has no doc mention.
- Add the missing `--branch=main` flag to `site:deploy` (already self-flagged, trivial one-line fix, but sequenced here since it's part of the same pipeline-hardening theme rather than a standalone NOW item).
- Generate Sidecar's `SIDECAR_VERSION` constant from `app.json` at build time instead of an independent hardcoded literal (also captured as a small NOW item in the synthesis — listed here too since it's the same class of "no single source of truth" problem this theme exists to close).

**Deepened detail (from source audits):**

*Docs site staleness (Rook Area 1, lines 12–41):*
- **Rook high/NOW-fix + content debt** — `site/docs/index.html:60,189` hardcodes version badge as `<span class="verbadge">v6.7.41</span>`; `git log --oneline -- site/docs` shows only two commits ever touched this path — `51b4fed` (v6.7.40, "new /docs help section") and `2d67623` (v6.7.41, "screensaver guide"). Live-fetched `tabatha.pondocean.co` confirms badge renders v6.7.41 today; nothing since despite `integrate-6750` at 6.7.53.
- **Rook: shipped features since 6.7.41 undocumented or stale** (lines 25–35 coverage table): Device management panel (ext 6.7.50, missing entirely), extension-minted pairing codes (6.7.52, missing), count direction/precision (Sidecar 0.13.0, missing), un-resolve (Sidecar 0.13.0, missing), phone-away 3-way heartbeat semantics (Sidecar 0.13.0, stale/older mechanism), invites (Demo/Personal/Team remodel, missing entirely), TV sign-in (missing as auth mechanism), PWA orientation fix (0.13.2, not called out).
- **Rook:** `site/docs` deploy pipeline at root `package.json` runs `node scripts/build-privacy.mjs && node scripts/build-search-index.mjs` but **does NOT touch content**; nothing catches stale copy. `docs/OPERATIONS.md` (Sidecar 0.13.0 era) already self-admits gaps: `site:deploy` lacks `--branch=main` (preview-deploy risk) and "sidecar version hand-synced in 2 files (drift risk)."

*Sidecar version hardcoding (Rook #21 / Area 5, line 171):*
- **Rook med/latent BUG** — `sidecar/src/lib/device.ts:26` defines `export const SIDECAR_VERSION = '0.13.4'` as independent hardcoded literal, unlinked to `app.json`. Renders to users (`SettingsScreen.tsx:905`, "Tabby Sidecar v{SIDECAR_VERSION}") and sent in payloads (`SettingsScreen.tsx:350`). Currently in sync by coincidence; no build-time sync step ties it to `app.json`, so next bump touching only `app.json` will silently leave About-screen string stale.

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

**Deepened detail (from source audits):**

*Content scripts: gatekeeper/InPop, InBar, BlockGate (Argus Surface 5, lines 149–172):*
- **Argus C1** (high/BUG, lines 154–155) — Gatekeeper race: overlay built only after awaiting `CHECK_CONTEXT_NEEDED`/`GET_FOCUS_ENGINE` + two storage round-trips; `document_start` doesn't guarantee page stays frozen during awaits — real window exists where page renders before "you must set intent" gate appears, undermining core enforcement mechanism.
- **Argus C2** (high/BUG, lines 156–157) — Unescaped HTML injection in gatekeeper.js: `item.label`, recent/persistent intent labels interpolated into `innerHTML` with no escaping — crafted label (typed once, replayed on every prompt) executes on render. Only `inheritedContext` gets partial (quote-only) escaping. (Koda synthesis identifies ~23 distinct unescaped sinks across gatekeeper + inbar, not ~12, with cross-user exploitability once #221 Shared Focuses ships.)
- **Argus C3** (med/OVERHAUL, line 157) — Gatekeeper shows 8+ simultaneous choices (2 toggles + text input + 3 preset lists + 6 action buttons) before user can proceed — direct contradiction of documented Progressive Simplicity principle.
- **Argus C4** (med/BUG, line 158) — No `role="dialog"`/`aria-modal`, no focus trap, no Escape handling on gatekeeper overlay.
- **Argus C5** (high/BUG, line 159–160) — Same unescaped-HTML pattern in InBar, more instances (focus label, tab intent, focus list, description, pause note raw inside `<textarea>`, backburner alert card) — materially more dangerous once #221 ships and labels cross-sync teammates' browsers.
- **Argus C6** (med/OVERHAUL, line 160–161) — InBar's persistent bar has 8 icon-only buttons with zero `aria-label` anywhere — single clearest violation of "calm, minimal-friction" for always-on-screen surface.
- **Argus C7** (med-high/BUG, line 161–162) — No Escape-to-dismiss in InBar; 7 possible full-viewport auto-triggered overlays (FTE, Welcome-Back, Combo, Checkpoint, Backburner-alert, Idle-prompt, Drift-detected) none can keyboard-dismiss; none place focus on open.
- **Argus C8** (med/OVERHAUL, line 162–163) — Seven distinct auto-triggered modal types can each pop full-viewport overlay with no cooldown/backoff between different types firing; several themselves option-heavy (checkpoint: 7 CTAs; FTE: 7 buttons).
- **Argus C11** (med/NOW-fix, line 165–166) — BlockGate's very first `chrome.runtime.sendMessage` call has no try/catch (unlike gatekeeper/inbar) — invalidated extension context throws unhandled rejection, block fails open.
- **Argus C13** (med/BUG, line 167–168) — Same missing dialog semantics/focus trap/Escape handling in BlockGate as gatekeeper.

*Positive note (Argus line 171):* All three content scripts share one consistent design system (dark card, Segoe UI, consistent accent-per-context color coding); BlockGate's escape hatch (50-char justification, generous "Leave" exit, self-chosen timer) is best-designed friction-to-purpose ratio of three.

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
