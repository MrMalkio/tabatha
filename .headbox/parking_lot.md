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

## 2026-05-28 — Video Call Idle Suppression + Calendar Tie-in
- **Noticed while:** Regression testing T6 (video call suppression)
- **What:** Current suppression relies on tab audible state. Should ALSO consider: (1) URL matching for known meeting domains, (2) calendar events with Meet/Zoom links attached (when calendar integration is available).
- **Why it matters:** Audible-only detection misses muted calls, silent presentations, and pre-meeting tabs.
- **Options:**
  1. Add URL-based detection as primary, audible as secondary ← **suggested**
  2. Wait for calendar integration (Plan 035) to add event-based detection
  3. Both: URL now, calendar later

## 2026-05-28 — Sub-Intent Creation UX Discoverability
- **Noticed while:** Regression testing T7 (sub-intent parent tick)
- **What:** Users don't know how to create a sub-intent/child focus under a parent. No visible UI affordance for creating hierarchical focus items.
- **Why it matters:** Sub-intents and parent ticking are implemented in the backend but unreachable via UI.
- **Options:**
  1. Add "Add sub-focus" button on active focus card ← **suggested**
  2. Drag-and-drop nesting in queue
  3. Context menu on queue items

## 2026-05-28 — Structured Checkpoints from State Changes
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
