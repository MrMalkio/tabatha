# Parking Lot

> Items noticed during work that need attention later.
> **Rules:** Append only. Never delete entries. Scan headers before adding to avoid duplicates.

## 2026-05-10 — InBar Pause + Sticky Note Feature
- **Noticed while:** Planning Phase 1 (homepage declutter)
- **What:** User wants InBar pause button that: (1) prompts for a "where I left off" sticky note, (2) shows a large sticky-note graphic (biased/tilted) on the paused tab's window — non-obstructive so they can still see their work, (3) stops all time tracking for that intent + children, (4) auto-parks the tab if closed while paused (never marks complete). Resume button on the sticky note overlay.
- **Why it matters:** Core UX for the follow-through engine — pausing with context is essential for multi-focus workflows.
- **Options:**
  1. Build as part of InBar Phase 4 work
  2. Build as a standalone content script feature (pause-overlay.js)
  3. Build as a lightweight first pass in Phase 4, iterate later ← **suggested**

## 2026-05-09 — background.js Monolith Refactor
- **Noticed while:** Diagnostic fix sweep
- **What:** `background.js` is ~2000 lines handling tabs, contexts, intents, focus, clock, time tracking, groups, categories, priorities, locking, markdown export, notifications, idle detection, and message routing all in one file.
- **Why it matters:** Makes debugging nearly impossible, increases risk of regressions, and makes the codebase hostile to new contributors. The service worker `type: module` fix proves Vite already supports multi-file imports — the infrastructure is ready.
- **Options:**
  1. Extract into domain modules (`src/background/clock.js`, `focus.js`, `tabs.js`, `groups.js`, `sync.js`, `messageRouter.js`, etc.) ← **suggested**
  2. Extract only the largest sections (clock, focus, groups) and leave the rest
  3. Keep as-is and rely on better tooling (code folding, search)

## 2026-05-09 — Version Discipline Automation
- **Noticed while:** Fixing hardcoded version strings in 3 places
- **What:** Version is hardcoded in `manifest.json`, `home/index.jsx`, and `settings/index.jsx` — easy to forget one when bumping.
- **Why it matters:** Leads to stale version displays and user confusion.
- **Options:**
  1. Create a single `src/version.js` that exports the version, import everywhere ← **suggested**
  2. Use a build-time replacement plugin to inject version from `package.json`
  3. Keep manual and add to release checklist

## 2026-05-09 — Debug Bar Expansion (System-Wide)
- **Noticed while:** Clock extraction + InPop fix
- **What:** Debug bar currently only shows clockSession + last message result. User wants it to show system-wide state (focus engine, tabs, settings, etc.) and be positioned at the bottom of the home page instead of under the clock bar.
- **Why it matters:** Better debugging experience — currently limited to clock state only.
- **Options:**
  1. Expand debug bar to show all storage keys with collapsible sections, pin to page bottom ← **suggested**
  2. Create a dedicated debug page (like workshifts.html) with full state inspector
  3. Both — expandable bottom bar + dedicated page for deep inspection

## 2026-05-09 — InBar Customization & Content Expansion
- **Noticed while:** Post-build feature review
- **What:** InBar needs richer content and user control over what's shown.
- **Why it matters:** Users need to understand what each element means and control bar density.
- **Requirements:**
  1. Settings: toggles for each InBar element (intent, focus, timers, notes, etc.)
  2. Settings: legend/key explaining what each InBar element represents
  3. Show current tab's intent label (if not already — verify)
  4. Show overall active focus item label
- **Options:**
  1. Add a settings sub-section "InBar Elements" with checkboxes + preview ← **suggested**
  2. Add a ? icon on InBar itself that shows an inline key

## 2026-05-09 — BlockGate Enhancement Suite
- **Noticed while:** Post-build feature review
- **What:** Multiple enhancements to the site-blocking (BlockGate) system.
- **Why it matters:** Blocking is a core attention management feature — needs depth.
- **Requirements:**
  1. **Block reasons:** User can optionally set a reason when blocking a site. BlockGate popup shows the reason when the user visits the blocked site ("You blocked this because: ___").
  2. **Delayed unblocking:** Optional 10-minute unblock guard in settings — when user removes a block, it doesn't take effect for 10 mins. Prevents impulsive unblocking.
  3. **Unblocked list:** In blocked sites settings, show recently-unblocked sites so users can easily re-block them. Support blocking URL patterns (sections of sites), not just full domains.
  4. **Custom BlockGate text:** User can customize the H1, subtext, and button text of the blocked page popup. Block reason shows conditionally if provided.
  5. **Temporary blocking from InBar/Sidebar:** Quick-block the current site with preset durations (15m, 30m, 1h, 2h, 1d, custom). Available from InBar action menu and sidebar.
  6. **Add-to-intent from BlockGate:** The blocked page popup should offer "Add this page to an existing intent/focus" as an alternative to full blocking — lets user redirect rather than just block.
  7. **InPop/BlockGate mutual exclusion:** Never show both InPop (gatekeeper) and BlockGate popup simultaneously. BlockGate takes priority if the site is blocked.
- **Options:**
  1. Implement incrementally: reasons + custom text first, then delayed unblock, then temp blocking ← **suggested**
  2. Full implementation in one pass

## 2026-05-10 — Duplicate remote branches (main + master)
- **Noticed while:** Pushing v3.0.0-alpha to master
- **What:** Remote has both `origin/main` and `origin/master`, with HEAD pointing to `origin/main`. User confirmed they only use `master`.
- **Why it matters:** Confusing for agents and contributors; `origin/main` may be stale or a GitHub default artifact.
- **Options:**
  1. Delete `origin/main` via `git push origin --delete main` and set HEAD to `master` in GitHub repo settings
  2. Keep both but update GitHub default branch to `master`
  3. Option 1 ← **suggested**

## 2026-05-11 — Entity Relationship Editing (T3.1)
- **Noticed while:** User testing Tier 3 Org UI
- **What:** Link projects to initiatives, tasks to projects, and edit associations after creation.
- **Why it matters:** Without relationship editing, the org hierarchy is rigid.
- **Options:**
  1. Add dropdown selectors in entity detail views for re-parenting ← **suggested**
  2. Drag-and-drop in tree view

## 2026-05-11 — Extended Keyboard Shortcuts (T5.1)
- **Noticed while:** User testing Tier 5 shortcuts
- **What:** Collapse-all shortcut, go-to should scroll+focus, cross-page shortcuts (sidebar toggle).
- **Why it matters:** Power users need keyboard-driven workflows system-wide.
- **Options:**
  1. Extend useKeyboardShortcuts with page-context awareness ← **suggested**
  2. Use chrome.commands API for cross-page shortcuts

## 2026-05-11 — Multiple Webhook Endpoints (T5.2)
- **Noticed while:** User testing webhooks
- **What:** Multiple webhook URLs with independent event subscriptions and secrets.
- **Why it matters:** Different services need different events.
- **Options:**
  1. Refactor storage to array of webhook configs ← **suggested**

## 2026-05-11 — Focus Completion Tab Closure Prompt
- **Noticed while:** User testing focus resolution
- **What:** Prompt to close related tabs with notes/park options when completing a focus.
- **Why it matters:** Follow-through means cleaning up after sessions.
- **Options:**
  1. FocusCompletionModal with per-tab park/close/keep toggles ← **suggested**

## 2026-05-11 — Auto-Start Next Focus Should Prompt
- **Noticed while:** User testing focus resolution
- **What:** Resolving a focus auto-starts the next one. Should prompt with context notes first.
- **Why it matters:** Mental transition between focuses prevents context confusion.
- **Options:**
  1. "Ready to start?" prompt with task context and confirm/skip ← **suggested**

## 2026-05-11 — Intent Save Button + Task Reassignment
- **Noticed while:** User testing intent editing
- **What:** No save button on intent boxes. Need task-to-project reassignment.
- **Why it matters:** Users unsure if edits saved; task misassignment can't be corrected.
- **Options:**
  1. Explicit save/discard buttons + inline project dropdown ← **suggested**

## 2026-05-11 — Tiered Deletion Confirmations
- **Noticed while:** User testing entity management
- **What:** Deletion confirmation proportional to tier (Operations=strict, Tasks=undo).
- **Why it matters:** Accidental Operation deletion could cascade-archive dozens of children.
- **Options:**
  1. 3-tier confirmation (quick/standard/strict) based on entity type ← **suggested**

## 2026-05-11 — Missing Tooltips Across UI
- **Noticed while:** User testing all tiers
- **What:** Many interactive elements lack tooltips.
- **Why it matters:** Discoverability for new users.
- **Options:**
  1. Audit all buttons/icons and add Tooltip wrappers systematically ← **suggested**

## 2026-05-11 — Voice Input in Popups and InBar
- **Noticed while:** User testing voice input
- **What:** Voice input only on homepage. Needed most in popup and InBar.
- **Why it matters:** Homepage is visited least — voice should be where quick actions happen.
- **Options:**
  1. Add VoiceInput to popup focus setter + InBar edit dropdown ← **suggested**

## 2026-05-11 — Mark Intents + Tabs as Complete
- **Noticed while:** User testing intent management
- **What:** Mark intents as complete/resolved AND individual tabs within intents. Count toward follow-through.
- **Why it matters:** Core follow-through tracking.
- **Options:**
  1. Completion toggle on intent rows + tab rows, update analytics ← **suggested**

## 2026-05-11 — Google Auth Configuration (T5.4)
- **Noticed while:** User testing auth
- **What:** Google login "Authorization page could not be loaded", email confirmation never arrives.
- **Why it matters:** Blocks cloud sync.
- **Options:**
  1. Verify Supabase Auth settings + use chrome.identity for extension ← **suggested**
## 2026-05-12 — Bulk Task Editing
- **Noticed while:** T2.3 testing
- **What:** User wants bulk editing capabilities for tasks (multi-select, bulk stage change, bulk delete, bulk move to project).
- **Why it matters:** Productivity — managing many tasks individually is time-consuming.
- **Options:**
  1. Checkbox column + bulk actions toolbar
  2. Shift+click range select + floating toolbar
  3. Combined approach with keyboard shortcuts ← **suggested**

## 2026-05-12 — In-Browser Centered Alert Overlay
- **Noticed while:** T4.4 notification testing
- **What:** User wants alerts to appear center-of-browser (not just OS notifications). Each alert type should be configurable (intrusive modal vs. toast vs. OS notification). Users should be able to create custom alerts.
- **Why it matters:** OS notifications are easy to miss or may be on DND. In-browser overlays ensure focus-critical alerts reach the user.
- **Options:**
  1. Build overlay layer in content script with alert type registry
  2. Use popup/dialog approach in extension pages only
  3. Hybrid: content script overlay for active tabs + extension page modals ← **suggested**

## 2026-05-12 — FlipClock Style Consistency
- **Noticed while:** UI review
- **What:** FlipClock/counter component doesn't match the overall theme/design language.
- **Why it matters:** Visual inconsistency undermines premium feel.
- **Options:**
  1. Restyle FlipClock with current theme tokens (glass, accent colors)
  2. Replace with simpler digital counter that uses theme vars
  3. Add theme-aware variant system to FlipClock ← **suggested**

## 2026-05-12 — Personal Realm Projects + Tags
- **Noticed while:** Intent creation
- **What:** Projects should be available for personal realm intents (not just business). Add optional personal project tags: hobby, family, self-improvement, etc.
- **Why it matters:** Personal time tracking is equally important for life management.
- **Options:**
  1. Remove realm gating on projects, add personal-specific tag presets
  2. Create separate 'Personal Projects' entity type
  3. Extend existing project system with realm-aware defaults ← **suggested**

## 2026-05-12 — Retroactive Time Entry Editing
- **Noticed while:** Usage review
- **What:** Users need ability to retroactively add/edit time entries (forgot to clock in, forgot to set focus, etc.). Entries should show as 'manually edited'. Admin should control who can add/remove this capability for sub-users.
- **Why it matters:** Real-world usage involves forgetting to track — this is critical for accurate time records.
- **Options:**
  1. Manual entry form in Work Shifts view with 'edited' badge + admin toggle
  2. Inline edit on timeline with audit trail
  3. Dedicated 'Time Corrections' panel with approval workflow for teams ← **suggested**

## 2026-05-12 — Inconsistency Audit
- **Noticed while:** Paused intent stage editing
- **What:** User reported that paused intents show 'paused' instead of the updated stage. Broader inconsistency audit requested across the application.
- **Why it matters:** Inconsistencies erode user trust and create confusion about system state.
- **Options:**
  1. Systematic audit: check all focusState/funnelStage display points for precedence issues
  2. Add state machine validation to ensure legal transitions
  3. Both: audit + state machine + visual consistency pass ← **suggested**

## 2026-05-12 — Sidebar Pause + Full Focus Engine Parity
- **Noticed while:** User testing v3.17.18
- **What:** Need ability to pause from sidebar. All focus engine features (set focus, break, switch, stage edit) should be available from sidebar.
- **Why it matters:** Sidebar is a primary interface; limited functionality forces users back to homepage.
- **Options:**
  1. Mirror FocusBar + ShiftControls into sidebar with shared action handlers
  2. Embed compact FocusBar component in sidebar header
  3. Full sidebar rewrite with focus engine integration ← **suggested**

## 2026-05-12 — Hide Shift Counter Toggle
- **Noticed while:** User testing
- **What:** Allow user to hide the shift counter/timer from the homepage.
- **Why it matters:** Some users find the counter distracting or don't use shift tracking.
- **Options:**
  1. Settings toggle + conditional render ← **suggested**
  2. User drags to dismiss

## 2026-05-12 — Collapsed Shift Controls Clock/Break Icons
- **Noticed while:** User testing
- **What:** When Shift Controls are collapsed, clock in/out and break icons should still be visible next to the section title, and also in the header right column.
- **Why it matters:** Essential actions hidden behind a click.
- **Options:**
  1. Inline action icons in CollapsibleSection header bar ← **suggested**
  2. Floating mini-bar overlay
  3. Both: inline + header pinning

## 2026-05-12 — Sidebar Notepad Section
- **Noticed while:** User testing
- **What:** Users need a notepad section at the bottom of the sidebar to create multiple notes. Should aggregate notes from InBar paused-tab notes.
- **Why it matters:** Notes are scattered across pause prompts and InBar; no central place to view/create.
- **Options:**
  1. Notepad panel in sidebar with tabbed notes + aggregation from chrome.storage
  2. Floating note widget accessible from any view
  3. Sidebar panel + auto-import from paused tab notes ← **suggested**

## 2026-05-12 — Group Focus Tabs to Own Window
- **Noticed while:** User testing
- **What:** User should be able to group all tabs from a focus/session into their own browser window.
- **Why it matters:** Physical separation of contexts improves focus discipline.
- **Options:**
  1. Button on focus card: 'Open as Window' → chrome.windows.create with tab IDs
  2. Right-click context menu on focus items
  3. Both button + context menu ← **suggested**

## 2026-05-12 — Panels Full-Screen Expand
- **Noticed while:** User testing
- **What:** When panels (intents/tasks/etc.) are expanded, the top should scroll up so panels become the main focus area, filling the screen.
- **Why it matters:** Panels are cramped at bottom; full expansion gives workspace feel.
- **Options:**
  1. CSS scroll-snap to panels section when expanded
  2. Dedicated full-screen panel mode with minimize button
  3. Auto-scroll to top of panels section when opened ← **suggested**

## 2026-05-12 — Focus State Machine + Terminology Refinement
- **Noticed while:** Inconsistency audit review
- **What:** Need formal state machine for focus stage transitions with rollback rules. Also need to clarify terminology: 'In Focus' (current priorities) vs 'The Focus'/'Primary Focus' (the one thing being addressed). This enables context-switch detection and auto-pause/resume.
- **Why it matters:** Currently any stage can transition to any other, creating impossible states. Terminology confusion between 'focus' and 'addressing' prevents automatic mismatch detection when user bounces between tabs.
- **Rules proposed by user:**
  1. Roadblocked can roll back to Focused
  2. Resolved should not roll back (unless accidental — confirmation required)
  3. Addressing/Focus do not roll back to Todo
  4. Nothing rolls back to Unsorted
  5. Rolling backward requires confirmation dialog
  6. 'In Focus' requires title + description
  7. 'Addressing' = the single thing getting active attention
- **Options:**
  1. State machine in UPDATE_FOCUS with transition matrix and confirmation prompts
  2. Full terminology rename across UI (focus → in focus, addressing → primary focus) 
  3. Both: state machine + terminology + context-switch detection ← **suggested**

## 2026-05-12 — Focus-Aware Tab Pausing System
- **Noticed while:** User testing v3.17.24
- **What:** When initiating/resuming a focus, all non-related tabs should show a wide banner: 'This tab is paused because you're focusing on [X]'. Banner allows reconnecting incorrectly paused tabs. Paused tabs should not count up on the clock. When user pauses a tab, prompt: pause just this tab (with reminder) OR pause the parent focus too.
- **Why it matters:** Currently nothing enforces focus discipline across tabs — non-focus tabs still count time and show no visual distinction.
- **Options:**
  1. InBar integration — detect focus mismatch, show pause banner with reconnect button
  2. Background handler — auto-pause unrelated tabs on focus switch, freeze their timers
  3. Full system: auto-pause + banner + reconnect + timer freeze + pause-scope prompt ← **suggested**

## 2026-05-12 — Voice Notes from InBar
- **Noticed while:** User feature request
- **What:** User should be able to capture voice notes from InBar. Transcribed into notes section with context metadata (when, where, intent relationship).
- **Why it matters:** Quick capture without typing — essential for flow state preservation.
- **Options:**
  1. Web Speech API (navigator.mediaDevices + SpeechRecognition) in content script
  2. Chrome extension offscreen document for audio capture
  3. Offscreen doc + Whisper API for high-quality transcription ← **suggested**


## 2026-05-18 — Working-tree noise to clean up
- **Noticed while:** Picking up Supabase batch 1 handoff (Codex's worktree → main, v4.3.6 → v4.7.6)
- **What:** Pre-existing uncommitted noise in main worktree, unrelated to batch 1 work:
  - **Modified (uncommitted):** `docs/features/163-background-parallels.md`, `supabase/.temp/cli-latest`, `v0_legacy/docs/features.md`
  - **Untracked feature stubs** (likely from a prior brainstorm session): `docs/features/184-persistent-focuses.md`, `187-auto-clock-startup.md`, `188-client-time-attribution.md`, `189-service-profitability.md`, `190-ai-activity-summaries.md`, `191-team-mutual-dashboard.md`, `192-calendar-auto-backfill.md`, `193-meeting-block-detection.md`, `194-mobile-schedule-nudges.md`, `195-retroactive-log-editing.md`, `196-intent-countdown-pro.md`, `197-ai-assistant-bridge.md`, `198-privacy-modes.md`, `199-morning-kickstart.md`, `200-decision-fatigue-reducer.md`, `201-follow-through-score.md`, `mike-transcript-extraction.md`
  - **Untracked stale build artifacts:** `dist-v4.3.1/`, `dist-v4.3.6/` (current build is `dist/` at v4.7.6)
- **Why it matters:** Pollutes `git status` and obscures real changes. Feature stubs may be legitimate roadmap captures that need indexing; dist-vX dirs are pure leftovers.
- **Options:**
  1. Review feature stubs → commit the keepers, discard or .gitignore the rest; delete stale dist-vX dirs
  2. Move feature stubs into a dated brainstorm subfolder and commit as a batch; delete dist-vX dirs
  3. Leave entirely — clean up alongside next docs-touching session ← **suggested**

## 2026-05-19 — Mobile app + companion parity, invite-token mint UI, auto-update distribution
- **Noticed while:** Wrapping Plan 027 Phase C (cross-profile awareness)
- **What:** Several adjacent features are needed for the multi-profile model to feel complete, but are out of scope for Phase C:
  1. **Desktop companion `browser_profiles` registration** — companion needs to insert a row with `browser='desktop_companion'`, classification picker in its tray UI, and heartbeat into `browser_profile_status`. Once done, chip strip on the extension surfaces the companion's activity alongside browser profiles. This is the Phase D top item.
  2. **Mobile app(s) follow same pattern** — iOS / Android Tabatha each register a `browser_profiles` row (`browser='mobile_ios'` / `'mobile_android'`), pick a classification, heartbeat status. Same identity substrate, same awareness chips. Table name (`browser_profiles`) is misleading once we include non-browser surfaces, but renaming churns RLS — keep the name, document as "client install".
  3. **Invite-token mint UI** — redemption is end-to-end (RPC + Settings form). Token *creation* still requires manual SQL in the cloud console. Pair with the manager dashboard so an org owner can mint + share + revoke tokens from within Tabatha.
  4. **Manager view over org_members' awareness** — current RLS on `browser_profile_status` restricts to own profile. Need a manager-scoped read policy that allows org owners/managers to read their members' status rows (mirroring `user_status`'s existing org-scoped policy from migration 002). Pairs with a "Team Activity" dashboard.
  5. **Auto-update distribution** — Tabatha is currently unpacked-only; users manually reload after each build. Auto-update arrives when we publish to Chrome Web Store (~5h polling, silent install) or self-host an `update.xml` for an unlisted CRX. Plan 019 (distribution) in the registry tracks this. Independent of multi-profile work, but every user touching multi-profile sync will want auto-update working before we scale users.
- **Why it matters:** Each unlocks a real workflow. Companion+mobile gives true cross-surface awareness. Mint UI removes the SQL-Studio crutch. Manager view unlocks team usage. Auto-update removes reload-after-every-build friction.
- **Options:**
  1. One Phase D plan covering all five ← **suggested** (they share substrate)
  2. Two plans: Phase D₁ (companion + mobile registration + manager scoping) and Phase D₂ (invite mint + manager dashboard); auto-update lives in Plan 019
  3. Three smaller plans — splits churn, slower velocity

## 2026-05-26 — Pre-Production Release Blockers
- **Noticed while:** Staging promotion + privacy audit
- **What:** Several items must be resolved before staging → main (production) release:
  1. **Rotate Supabase DB password** — old `Flux_DB_Pass` was committed to git history (now untracked, but history retains it)
  2. **Apply Supabase migrations 008–013** — schema changes for sync batch 1, browser profiles, manager scoping, companion installs not yet applied to remote DB
  3. **Full extension regression test** — no formal regression since Plans 027/028 landed; clock cycle, focus lifecycle, InBar, groups, blockgate, settings, markdown export, tasks, companion bridge all need manual pass
  4. **Chrome Web Store listing** — extension is dev-loaded only; no CWS listing exists yet (see Plan 019)
  5. **Automated test suite** — zero tests exist; risk acceptance or minimum smoke tests needed
  6. **Supabase keys in source** — publishable key hardcoded in `src/services/supabaseClient.js`; safe under RLS but should use build-time env vars for open-source
- **Why it matters:** These gate a production release to external users. None block internal dev/testing.
- **Options:**
  1. Address in priority order (DB password → migrations → regression) before any production push ← **suggested**
  2. Bundle into a "v6.0.0 release readiness" plan
  3. Address incrementally as features stabilize

## 2026-05-28 — Desktop Companion Status Detection + Download Link
- **Noticed while:** Regression testing T11 (Integrations panel)
- **What:** Companion card shows "not configured" even though the companion is running on the same PC. Also needs a stubbed download link for when it's not configured.
- **Why it matters:** Users can't tell if the integration is working; no onboarding path to get started.
- **Options:**
  1. Ping companion WebSocket from settings panel to detect running state ← **suggested**
  2. Add a manual "test connection" button
  3. Both: auto-detect + manual test + download URL placeholder

## ~~2026-05-28 — Video Call Idle Suppression + Calendar Tie-in~~ ✅ PARTIAL (URL added, calendar deferred to Plan 035)
- **Noticed while:** Regression testing T6 (video call suppression)
- **What:** Current suppression relies on tab audible state. Should ALSO consider: (1) URL matching for known meeting domains, (2) calendar events with Meet/Zoom links attached (when calendar integration is available).
- **Why it matters:** Audible-only detection misses muted calls, silent presentations, and pre-meeting tabs.
- **Options:**
  1. Add URL-based detection as primary, audible as secondary ← **suggested**
  2. Wait for calendar integration (Plan 035) to add event-based detection
  3. Both: URL now, calendar later

## ~~2026-05-28 — Sub-Intent Creation UX Discoverability~~ ✅ RESOLVED
- **Noticed while:** Regression testing T7 (sub-intent parent tick)
- **What:** Users don't know how to create a sub-intent/child focus under a parent. No visible UI affordance for creating hierarchical focus items.
- **Why it matters:** Sub-intents and parent ticking are implemented in the backend but unreachable via UI.
- **Options:**
  1. Add "Add sub-focus" button on active focus card ← **suggested**
  2. Drag-and-drop nesting in queue
  3. Context menu on queue items

## ~~2026-05-28 — Structured Checkpoints from State Changes~~ ✅ RESOLVED
- **Noticed while:** Regression testing (unrelated observation)
- **What:** Focus lifecycle changes (start, pause, backburner, etc.) and text-capture events should auto-generate structured checkpoint entries in the checkpoint log.
- **Why it matters:** Currently checkpoints are manual; auto-generation ensures complete audit trail.
- **Options:**
  1. Emit checkpoint entries from focusService for key state transitions ← **suggested**
  2. Separate checkpoint service that observes FOCUS_ENGINE_UPDATED broadcasts
  3. Both: service + broadcast observer

## 2026-05-28 — Companion Updates for New Features
- **Noticed while:** Regression testing T14b (backburner cascade)
- **What:** Desktop companion needs updates to support new features: backburner state awareness, focus priority display, video call detection via window titles, calendar event sync.
- **Why it matters:** Companion is out of sync with extension feature set.
- **Options:**
  1. Create companion feature sync plan after Plan 031 lands ← **suggested**
  2. Bundle into existing Plan 019 (distribution)

## ~~2026-05-28 — Backburner + New Focus Edge Case~~ ✅ RESOLVED
- **Noticed while:** Regression testing RT-9 (InBar edit dropdown options)
- **What:** When backburnering a focus and choosing "create new" instead of selecting from the list, the current tab loses its intent assignment and the InBar edit dropdown shows no focuses to select from. The newly created focus does become active, but the tab→focus association is broken.
- **Why it matters:** Users commonly backburner and immediately start fresh work. The new focus should auto-associate with the current tab and the InBar should reflect the new intent.
- **Options:**
  1. In `BACKBURNER_FOCUS` handler, if creating a new focus, also call `associateTabWithFocus` for the sender tab ← **suggested**
  2. Re-run `checkContextNeeded` on the active tab after backburner completes
  3. Both: explicit association + context re-check

## ~~2026-05-28 — Homepage Section Navigation Sidebar~~ ✅ RESOLVED
- **Noticed while:** User feedback during regression testing
- **What:** User wants the collapsible section headers (Shift Controls, Now, Focus Engine, Activity, Analytics, Context Activity, Panels) moved out of the main body and into a persistent left sidebar for quick navigation. Clicking a sidebar item scrolls to that section. Current header icons: ⏱️, 🎯, 🔍, 📊, 📈, 📊, 📋.
- **Why it matters:** As the homepage grows, vertical scroll to find sections becomes friction. Sidebar nav provides at-a-glance overview + one-click jumps.
- **Options:**
  1. CSS sticky sidebar with scroll-to-section links ← **suggested**
  2. Floating hamburger menu with section anchors
  3. Top horizontal nav bar (tabs-style) with scroll-spy

## 2026-05-29 — Homepage hours stat mislabeled / wrong (BD-13)
- **Noticed while:** v6.3.x QA brain-dump session
- **What:** Top-left of the home page shows ~470 (hours) framed as "this week" total, which is impossible. Likely showing lifetime/aggregate elapsed but labeled as weekly.
- **Why it matters:** First thing testers (incl. Mike) will see; an obviously-wrong headline number undermines trust. Highly visible.
- **Options:**
  1. Fix the label + add a this-week time-window filter to the aggregation ← **suggested** (quick win, do right after PR #21 merges)
  2. Replace with the full today/this-week breakdown (rolls into BD-14 accurate non-double-counted time model)
  3. Both: quick label/window fix now, full time-model later
- **Full context:** see `.headbox/backlog-braindump-2026-05-29.md` (BD-13, BD-14)

## 2026-05-29 — Vision brain-dump captured (BD-1 … BD-15)
- **Noticed while:** v6.3.x QA session — user dumped ~15 distinct ideas/questions/bugs
- **What:** Full capture lives in `.headbox/backlog-braindump-2026-05-29.md`. Covers: companion-managed distribution + CWS expandability (BD-1/2), tester distribution to non-GitHub users (BD-3), sync/team audit before testers (BD-4), CWS eligibility analysis (BD-5), onboarding v1 + help docs (BD-6), Mike "track everything" wedge (BD-7), auto-break→auto-clock-out recovery (BD-8), InPop passive/random modes (BD-9), Master Notification Matrix + surface-routing/escalation (BD-10), Agency Vault context ingestion (BD-11), in-app feedback/voting + agent-triage pipeline (BD-12), homepage hours bug (BD-13), accurate non-double-counted time + focus ratio (BD-14), auto-pause inattentive tabs + context-note prompt (BD-15).
- **Why it matters:** Zero-context-loss capture so each becomes a real plan when prioritized. Includes Claude's technical answers on companion distribution + CWS file-integrity constraints.
- **Options:**
  1. Leave as backlog; spec individually when prioritized ← **suggested**
  2. Promote the tester-enablement cluster (BD-3/4/6) to a near-term plan
  3. Promote BD-8 (auto-clock-out) — most build-ready, extends current idle engine

## 2026-06-02 — Plan 036/037/038 work landed (PR #21) — coordination pointers
- **Noticed while:** v6.x QA + Headbox cleanup
- **What:** Plan 036 (Intelligent Focus Lifecycle) executed → PR #21 (`feat/plan-036-focus-lifecycle` → staging), shipped through v6.3.6. Split into registry entries 036 (the plan), 037 (time editing), 038 (URL-rules intelligence). DB migrations 015 + 016 fixed RLS recursion + browser_profiles writes (audit: `.headbox/db-rls-audit-2026-06-02.md`).
- **Why it matters:** Open loops to close before "clean slate": merge PR #21, apply remaining migrations decision, finish in-browser RT.
- **Options:** 1. Finish RT → merge PR #21 ← **suggested**  2. Hold for the cleanup thread

## 2026-06-02 — Turn the backlog brain-dump into real plans/features (BD-1 … BD-31)
- **Noticed while:** user directive — "everything in backlog-braindump needs to become features and plans"
- **What:** `.headbox/backlog-braindump-2026-05-29.md` now holds BD-1…BD-31 (vision/ideas/bugs). None are yet real plans or feature specs. User wants to **road-map the PLANS** (each plan carries features/improvements + its own phases), not road-map loose features.
- **Why it matters:** This is the next big planning pass. Should run AFTER the clean-slate (PRs merged, uncommitted work sorted).
- **Options:**
  1. New dedicated "roadmap synthesis" thread: parking lot + backlog + docs → batched plans with phases ← **suggested**
  2. Convert BD items into individual feature specs first, then group into plans
  3. Both, in sequence

## 2026-06-02 — Headbox tracking / gitignore + uncommitted-work cleanup (CLEAN SLATE)
- **Noticed while:** user flagged "headbox shouldn't be pushed to the repo, it should be gitignored" + a pile of uncommitted staging work
- **What:** (a) `.headbox/` is currently partially git-tracked; user wants it treated as local workspace coordination (gitignore + decide what, if anything, stays versioned). (b) Staging has ~16 uncommitted files from prior sessions (v0_legacy/docs/features.md deletion, new docs/features/210-214 specs, AGENTS/CLAUDE/GEMINI edits, plan-registry edits, Plan-024 PROMPT). NOT from the 036 work. (c) Decide a single canonical Headbox location that all worktrees share (git worktrees each get their own working dir, so a gitignored .headbox is per-worktree unless symlinked or kept only in the main checkout).
- **Why it matters:** "Clean slate before more development" — the user explicitly wants a fresh thread to sort ALL uncommitted work + Headbox tracking, then proceed.
- **Options:**
  1. New cleanup thread: triage every uncommitted file → commit/discard, set `.headbox` gitignore policy, pick canonical headbox location ← **suggested**
  2. Do it inline now (risks mixing with feature work)

## 2026-06-02 — Process: where do plan docs live? (doc-sprawl guard)
- **Noticed while:** user — "is your process making new docs that aren't part of the headbox infrastructure? plan-registry and features.md are there for a reason."
- **What:** Plan 037/038 full docs were created in `docs/plans/`. Need a confirmed convention: do full implementation-plan docs live in `docs/plans/`, in `.headbox/`, or only as registry rows + features.md entries? Avoid creating parallel doc systems.
- **Why it matters:** Prevents documentation sprawl / divergence from the established Headbox (plan-registry + features.md).
- **Options:**
  1. Confirm `docs/plans/<NNN>-suffix.md` as the canonical home, referenced from plan-registry ← **suggested**
  2. Move plan docs into `.headbox/plans/`
  3. Keep plans as registry rows + features.md entries only (no separate plan doc)

## 2026-06-30 — v6.4.0 shipped to production — loops closed + new open items
- **Noticed while:** Deploying Tabatha v6.4.0 to `main` (GitHub source-of-truth `MrMalkio/tabatha`; PS == OD == GitHub) + packaging the Desktop Companion.
- **Closed by v6.4.0** (recorded here; see `.headbox/plan-registry.md` for the tracked status):
  - **Org attribution** — `redeem_invite_token` now sets `default_org_id`/`team_id` (migration 018, applied + verified to live Flux). Closes the "no default_org/team on redeem" gap flagged in the supabase-sync handoff (`default_org_id`/`default_team_id` had no writer).
  - **Owner read views** — migration 019 (service-role only), applied + verified.
  - Pinned manifest key, cloud rehydrate, sidebar sync indicator, intent backdating shipped.
  - **In-app feedback → Asana (BD-12 first slice)** — submission path shipped in the extension; **edge-function deploy still pending Asana creds** (see open items).
  - **Companion packaged** (.msi + setup.exe): install-folder creation, dummy-proof guided install, Supabase-Storage auto-update (key-guard + atomic swap), 23 Rust tests; Rust + VS Build Tools installed on OD. Advances Plan 019 to `partial`. (This is the "Companion Feature Sync" / distribution parking-lot cluster from 2026-05-28 / 2026-05-19 item 5.)
  - Extension: 123 tests, Koda(Codex)-reviewed ×2 + Claude backstop; OAuth redirect allowlisted (sign-in works).
- **Still OPEN (do before team-live / public):**
  1. **`public.flux_time_entries` RLS is DISABLED** — security risk, flagged pre-team-live (already tracked in `db-rls-audit-2026-06-02.md` finding A; now also plan-registry Wave 0 P0.5).
  2. **Feedback edge-function deploy** — pending Asana creds (P0.6).
  3. **DB pre-create of Reggie & Po** (po@ / reggie@duckandshark.com) — pending (P0.7).
  4. **Physical rollout** to testers — pending (P0.8).
- **Why it matters:** Records the production milestone against the loose-thread items already in this lot so they don't get re-raised, and surfaces the remaining pre-team-live gates in one place.

## 2026-07-06 — Unbounded chrome.storage growth (post quota outage)
- **Noticed while:** Root-causing the live pause/resume outage (storage pinned at the 10MB QUOTA_BYTES cap; fixed with `unlimitedStorage` on `fix/pause-resume-regression`).
- **What:** Several storage keys grow without bound and drove the install to the cap: `_archive_*` rolling month-buckets (archiveService.writeLocalArchive never prunes), focusEngine items/checkpoints accumulate indefinitely (history is capped but `items` is not), domain history, and per-action audit/log writes. `unlimitedStorage` removes the hard failure but the underlying growth remains (slower UI payloads, bigger syncs, slower storage.get on hot paths).
- **Why it matters:** GET_FOCUS_ENGINE ships the whole engine to every page on every FOCUS_ENGINE_UPDATED; multi-MB engines make every click sluggish and every Supabase sync heavier. A second install (PS machine) will hit the same wall if it ever runs an older manifest.
- **Options:**
  1. Cap `_archive_*` to N months + surface a Settings → Storage panel with per-key byte usage and a "clear archives" action
  2. Move archives/audit to IndexedDB (already hinted in archiveService comment) and keep chrome.storage for hot state only
  3. Prune completed focusEngine items older than the retention window into the archive during the existing retention alarm ← **suggested (pairs with 1)**

## 2026-07-09 — Extension `.pem` may break persistence across restarts
- **Noticed while:** Scoping the Cortex AI layer — user flagged it as an unrelated but pressing issue.
- **What:** A `.pem` was recently added for the extension. User suspects it's why the unpacked extension disappears on every machine restart, forcing a manual "Load unpacked" reinstall. Need a build that installs indefinitely (until Chrome Web Store deploy) **without losing history tied to the extension ID**. Chrome Web Store keys data to the extension ID; a brand-new unrelated ID would orphan the existing data — UNLESS our Supabase sync already rehydrates everything on login (needs verification).
- **Why it matters:** Daily friction for the only active user (Malkio); risks data loss if the ID changes; blocks a stable dogfood loop.
- **Options:**
  1. Verify sync fully rehydrates on login (→ ID change becomes safe), then ship a stable no-`.pem` unpacked build with a pinned `key` in manifest so the ID stays constant ← **suggested**
  2. Keep the current `.pem`/`key` but fix the actual restart-disable cause (Chrome dev-mode extension disabling on restart) via a persistence workaround
  3. Fast-track the Chrome Web Store unlisted listing so auto-update + stable ID come for free (ties to Plan 019 distribution)

## 2026-07-09 — Desktop Companion: latest changes not yet deployed + Headbox integration in flight
- **Noticed while:** Scoping the Cortex AI layer — user noted "a lot going on at once" and is losing sight of it.
- **What:** The desktop companion (`C:\Users\mrmal\Le Dev\tabatha-desktop`, separate repo) has unshipped changes; the packaged/deployed binary lags the latest work. Separately, Tabatha↔Headbox integration work is in progress and entangled with this. Cortex Phase 1 (C1 OS-capture handoff) depends on a current companion.
- **Why it matters:** Cortex's browser⇄OS capture handoff and cross-signal work assume an up-to-date companion; shipping Cortex on a stale companion would fragment behavior. Also a general "get the train back on the rails" item.
- **Options:**
  1. Before Cortex Phase 1 build starts, cut a companion release that folds in all pending changes + the Headbox integration, then baseline from there ← **suggested**
  2. Freeze companion at current deployed version; do Cortex Phase 1 browser-only (defer C1 OS-capture to Phase 2)
  3. Inventory all in-flight companion/Headbox threads first (single status doc) before deciding sequencing

## 2026-07-10 — Agent Control Layer (Tabatha CLI/MCP) — BACK BURNER until Cortex complete
- **Noticed while:** Cortex continuation session — Malkio explicitly parked it.
- **What:** Agents need to read/write/coordinate THROUGH Tabatha (set intents, focuses, clock, context notes; use Tabatha as agent working-memory during computer/browser use) via an MCP server + CLI. The efferent sibling of Cortex (which only observes). Boundary + phasing scoped.
- **Why it matters:** Closes the loop Cortex opens; required for honest attribution (C11a shipped as the prereq) and multi-agent coordination on the machine.
- **Options:**
  1. MCP-first via desktop companion WS bridge (harness-native) ← **suggested**
  2. CLI-first thin wrapper for scripting/cron
  3. Extension native-messaging host (no companion dependency)
- **Artifacts:** docs/cortex/PROGRAM-agent-control-layer.md · Asana task 1216454646338939

## 2026-07-15 — Backdate overlap: trim / backburner conflict chooser
- **Noticed while:** fixing "backdating intent start time not working" (fix/backdate-overlap-clamp).
- **What:** `SET_FOCUS_START_TIME` now sets the start the user picked (bounded by clock-in/now) and RETURNS `overlaps` — the other-focus intervals the new credited span [start, now] intersects — instead of silently clamping the start forward. Right now overlaps are only surfaced as a timeline note; nothing lets the user resolve the double-counted time.
- **Why it matters:** Malkio's intent: when a backdated window overlaps time already tracked on another focus, the user should choose to (a) trim that overlap from the other focus, or (b) move the overlapped span to backburner time — not have it auto-resolved. Current time-counting "considers all of the time in an odd way."
- **Options:**
  1. Post-backdate modal in home/sidebar: list each overlapping focus + overlapMs, with "Trim from that focus" / "Send to backburner" / "Leave as-is" per row (uses the returned `overlaps`). ← **suggested**
  2. Background auto-trim with an undo toast.
  3. Analytics-only: leave elapsed as-is, just flag double-counted spans in reports.

## 2026-07-16 — StagePicker "unsorted" active chip renders an invalid 5-digit hex
- **Noticed while:** Building the expanded component showcase (`showcase/components-focus.html`, `components-primitives.html`).
- **What:** `src/components/ui/StagePicker.jsx:24` computes the active-chip fill as `stage.color + '33'`. Every `FUNNEL_STAGES` color is a 6-digit hex except `unsorted`, which is `#888` (`src/hooks/useFocusEngine.js:150`). So the selected-unsorted chip resolves to `#88833` — a 5-digit value browsers discard, leaving the chip transparent while every other stage tints correctly.
- **Why it matters:** Cosmetic but real: the "Unsorted" stage is the only one that gives no selected-state feedback, in every surface that uses StagePicker (IntentsPanel, FocusBar edit, FocusQueue, sidebar, InBar edit dropdown). It looks like a dead control.
- **Options:**
  1. Normalise `unsorted` to a 6-digit `#888888` in `FUNNEL_STAGES`. ← **suggested**
  2. Convert the chip fill to `rgba()` via a small hex-to-rgba helper (fixes the whole class of `+'22'`/`+'33'` alpha-suffix concatenations app-wide).
  3. Leave as-is; document that Unsorted has no active tint.

## 2026-07-16 — InBar edit-dropdown focus list hardcodes the "queued" state class
- **Noticed while:** Building the expanded component showcase (`showcase/components-overlays.html`).
- **What:** `src/content/inbar.js:578` emits `<span class="focus-state queued">${stage}</span>` for every row in `buildFocusList()`. The class is a literal, so the `.focus-state.active` (green `#66bb6a`) and `.focus-state.paused` (amber `#ffa726`) styles defined right above it at lines ~437-439 are never applied. The chip also prints the *funnel stage* text inside a class named for the *focus state* — two different taxonomies.
- **Why it matters:** In the InBar edit dropdown, an active focus and a paused focus are visually identical to a queued one. The three-color affordance is defined in CSS and shipped, but dead. The `.focus-item.active` left-border still works, so the bug is easy to miss.
- **Options:**
  1. Interpolate the real state: `class="focus-state ${f.focusState || 'queued'}"` and keep the stage text. ← **suggested**
  2. Render two chips (state + stage) to keep the taxonomies separate.
  3. Drop the unused `.focus-state.active` / `.paused` CSS if the queued-only look is intended.
