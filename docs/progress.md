# Tabatha â€” Progress & Worklog

> Continued from `v0_legacy/docs/progress.md` (Sessions 001-005).
> This file tracks progress from v1.0.0-alpha onwards.

## Session - 2026-07-17 (Native Asana App Component, unreleased branch based on v6.7.22)

**Goal:** Deliver the Tabatha integration as a real Asana App Component before treating the browser-extension helpers as a release.

**Done:**
- Rebased the isolated Asana work directly onto v6.7.22 and preserved the former feature tip at `Koda/asana-widget-pre-rebase`.
- Implemented and deployed the HMAC-validated Asana App Component service with Modal Form metadata/submission, Widget metadata, health, auth, and task-attachment routes.
- Added human and named-agent attention controls, direct and nested-task rollups, per-actor totals, and lightweight task context backed by `flux_time_entries`.
- Verified Deno formatting/type checks and 4/4 focused service tests; verified the live health route and rejection of unsigned widget requests.
- Configured Asana app `1214413273944527`: Entry Point, Modal Form, and Widget now report **On**; Lookup and Rule Actions remain intentionally Off.
- Set the Entry Point action to **Track attention**, registered the deployed metadata and attachment URL pattern, saved the app description, and restricted distribution to `gnge.co`.
- Attempted the approved 128x128 app-icon upload through both visible controls; Chrome's protected file-upload bridge rejected the local file handoff, so the icon remains the only manual console step.

**Version/merge status:** v6.7.22 remains the authoritative version. The Asana work is isolated, unmerged, and unpushed; no subsequent release number is assigned.

**Next steps:** Manually upload `public/icons/icon128.png`. Request separate confirmation before installing the app into a project or submitting a real task timer for live validation.

---

## Session - 2026-07-17 (One-click Asana and Anasa task actions, unreleased branch based on v6.7.22)

**Goal:** Let a user move between Tabatha, Asana, and Anasa from an existing task context without expanding Tabatha into a project-management system.

**Done:**
- Added one-click **Open in Asana** and **Open in Anasa** destinations to linked task cards in Home and Sidebar. Anasa opens a known internal task directly or pre-filters its task explorer by the Tabatha task name.
- Added **Link Asana** using an existing task URL/GID and **Create in Asana** using the local task name/description. Both operations preserve the existing Tabatha task ID and user-owned local fields.
- Expanded the authenticated server action to the narrow `get`, `create`, and `complete` operation set with bounded inputs; the Asana PAT remains server-side.
- Added a configurable Anasa base URL for the current tailnet deployment and future public hostname.
- Built a branch candidate into the fixed `dist` path before the priority was corrected to the native Asana app. It was not installed or released, and version metadata is restored to v6.7.22.

**Verification:** 639/639 Node tests pass, focused ESLint and `git diff --check` pass, production Vite build passes, and the deployed anonymous server-action probe correctly returns HTTP 401.

**Deployment:** `asana-task-action` was deployed through the Supabase Management API as ACTIVE version 2 after the local CLI upload transport hung.

**Pending:** Chrome/Browser extension installation is still waiting on the required action-time confirmation. Anasa's intended public hostname is DNS-pending, so Settings can temporarily hold its working tailnet base URL.

**Next steps:** Keep this supporting extension work isolated. Finish and validate the native Asana App Component first; do not install or merge the extension branch without approval.

---

## Session - 2026-07-17 (Asana task focus, attributed attention, and task context, unreleased branch based on v6.7.22)

**Goal:** Turn the earlier Asana widget foundation into a direct task-page workflow for setting focus and tracking human or agent attention, with correct nested-task attribution.

**Done:**
- Added an Asana-only task strip with **Set focus**, **My time**, **Agent time**, named concurrent agent stints, live elapsed state, and explicit stop controls.
- Added deterministic Asana SPA and `?focus=true` / `/f` detection so the InBar follows the visible task title without relying only on tab-title regexes.
- Added `asanaService` and pure tracking primitives for local-first stint persistence, focus reuse, tab-scoped agent-controller spans, parent relation learning, cycle-safe ancestor chains, and direct/rolled-up human/agent totals.
- Extended `flux_time_entries` in migration 029 and updated the native widget query to include nested-task rollups and agent attention.
- Added lightweight `contextOnly` Asana mirrors to Tabatha's existing task store: source identity/link, project and parent references, freshness, attention summary, and source completion state—without importing Asana's project-management surface.
- Linked Asana-created focuses to the mirrored local task ID and brought the sidebar onto the unified task service.
- Added an explicit completion choice: Tabatha completes locally first, then may complete the Asana source through the authenticated `asana-task-action` Edge Function. Declining or a remote error never undoes the local resolution.
- Updated Feature #186, the integration guide, Settings copy, and changelog, and produced an isolated branch build. That build was not installed or released; version metadata is restored to v6.7.22.

**Verification:** 634/634 Node tests pass; targeted service/test ESLint passes; widget route syntax check passes; production Vite build passes and includes `assets/asana.js`. The two full-router ESLint findings are pre-existing `chrome` global declarations, not introduced by this change.

**Deployment:** Migration 029 was applied through the Supabase Management API after the local CLI login-role transport failed. Verification returned all seven attribution columns and one `029 / asana_attention_attribution` migration-ledger row. The completion-only `asana-task-action` function was deployed through the Management API as ACTIVE version 1 after the CLI's upload transport failed.

**Blocked/pending:** Windows control reached the managed Chrome profile and found a disabled Tabatha v6.7.22 card (`jbdk…`). No extension installation is authorized; the native Asana App Component is the priority.

**Next steps:** Validate equivalent focus, human/agent attention, parent rollup, task context, and optional source completion through the native Asana app before reconsidering the extension helpers.

---

## Session - 2026-07-16 (Overlock contribution signing)

Tabatha's configurable webhook output now signs the exact JSON request body with HMAC-SHA256.
Caspera can accept privacy-bounded activity events through the Overlock connector without trusting
a reversible token. Targets configured without a secret remain backward compatible. Test suite:
623 passing.

---

## Session - 2026-05-29 (Plan 036 Intelligent Focus Lifecycle — v6.0.0) — CHECKPOINT

**Agent:** Claude (Opus 4.8)
**Branch:** `feat/plan-036-focus-lifecycle` (off `staging`, in isolated worktree)
**Goal:** Execute Plan 036 (authored by Antigravity) end-to-end — all 4 phases, absorbing Plans 026 (Auto Focus) + 029 (Auto-Pause Overhaul).

### What Was Done

- [x] **Grounded in real code** — read clock/focus/companion/awareness/tab/alarm/storage services + background router + settings UI before writing; verified every plan claim against the actual codebase.
- [x] **Phase 1 — Smart Idle Engine** (`clockService`): `collectIdleSuppressors()` consults other browser profiles, the desktop companion, and a hardened 3-layer `isUserInMeeting()` (all-tab scan + companion app) before ever pausing the global focus. `IDLE_PROMPT` (on-task/diverged/pause) instead of silent hard-pause, with a 5-min hard-pause fallback. Companion bridge gained `lastHeartbeat`/`getActiveApp`/`isRecentlyActive`. Awareness publishes per-profile `idle_state` via status `metadata` jsonb (no migration). Auto clock-in (#187): chrome-open default + os-unlock option.
- [x] **Phase 2 — Auto-Focus** (new `autoFocusService`): URL-rule (explicit auto-create) → category/domain (high) → companion app (medium) matching; non-blocking InBar chip; per-domain exponential decay engine (30→60→120→240→480m).
- [x] **Phase 3 — Drift detection**: 5-layer association hierarchy + localhost/chrome:// whitelist + companion overrule; wandering→drifted state machine on `auto-focus-drift` alarm; `FOCUS_DRIFT_DETECTED` + `context_drift` webhook.
- [x] **Phase 4 — UI**: Settings **🧠 Focus Lifecycle** panel (idle/auto-focus/drift/clock-in + meeting-domain editor + dismissal viewer), per-rule **🎯 Auto-create focus** toggle on URL Rules, InBar overlays for idle/drift + auto-focus chip.
- [x] **Phase 5 — Release**: bumped manifest → **v6.0.0**, propagated via `version:sync`, changelog entry added.
- [x] **Regression tests**: 22 `node:test` tests with an in-memory `chrome` mock (no new deps) covering meeting detection, multi-profile sync-race suppression, decay engine, drift association, companion helpers. `npm test` script added.
- [x] **Dist**: produced `dist-v6.0.0/` in the main Tabatha dir (matches existing `dist-vX.X.X` convention) for unpacked loading; also `tabatha-v6.0.0.zip`.

### Key Decisions

- Published per-profile idle state through the existing `browser_profile_status.metadata` jsonb rather than a new column — satisfies challenge-audit Resolution 1 (sync-race) with **zero migration** (migrations 008-013 are still unapplied, a separate Tier-1 blocker).
- Auto clock-in defaults to "When Chrome opens" with a Settings option for "On OS unlock" (per user decision).
- URL-rule `autoCreateFocus` defaults to `false` (opt-in) so existing rules are unaffected.
- All 4 phases on a single branch (per user), committed per-phase, build verified each phase.

### Verification

- `npm test` → 22/22 green · `npm run build` → green · `npm run version:check` → in sync at 6.0.0.
- **NOT yet done:** in-browser manual regression matrix; companion-dependent paths (OS-unlock, desktop idle suppression) untestable without the companion running. Branch not pushed/merged.

### Next Steps

- User to load `dist-v6.0.0` unpacked and run the 10-point manual matrix (idle suppression, meeting suppression, idle/drift prompts render, auto-focus chip, settings persistence, auto clock-in).
- Address findings, then push branch + open PR `feat/plan-036-focus-lifecycle` → `staging`.
- Separately (Tier-1 release gate, out of Plan 036 scope): rotate Supabase password, apply migrations 008-013.

### Artifacts

- Branch `feat/plan-036-focus-lifecycle` (6 commits)
- New: `src/background/services/autoFocusService.js`, `test/*.test.js`, `testutils/chromeMock.js`, `src/settings` FocusLifecyclePanel
- `dist-v6.0.0/` (main dir), `tabatha-v6.0.0.zip`
- Plan registry: entry 036 = `partial (4/5)`

---

## Session - 2026-05-28 (v5.8.0 Stabilization + SectionNav Refactor)

**Agent:** Antigravity (Gemini)
**Branch:** feat/gap-completion
**Goal:** Finalize regression fixes, code audit, and SectionNav UX refactor.

### What Was Done

- [x] **Regression Fix RT-9** — Fixed backburner create-new-focus path: inherit `associatedTabIds` and `backburnerTransitionFocusId` cross-linking.
- [x] **Sub-focus Discoverability** — Added `📌 Sub-focus` button to FocusBar action row + purple `child` badge in FocusQueue items.
- [x] **Video Call Idle Suppression** — Enhanced idle detection to check both audible meeting tabs AND active tab URL patterns (Meet, Zoom, Teams, WebEx).
- [x] **Auto-Checkpoint System** — Built `autoCheckpoint()` helper that records lifecycle transitions (started, paused, resumed, completed, backburnered) as `triggeredBy: 'system'` entries. UI shows them with ⚙️ prefix at 60% opacity.
- [x] **Code Audit** — Found and fixed 3 bugs: incomplete focus skeleton in backburner create-new (12 missing fields), missing `priority` in `addFocus`, and checkpoint badge count inflation from system entries.
- [x] **SectionNav Refactor** — Sidebar now hover-expandable (44px→160px), shows icon+title labels on hover. Smart click: same section = toggle collapse; different section = navigate + expand. Collapsed sections drop to bottom of sidebar with divider + line-through. Collapsed sections render zero-height anchor (no wasted vertical space).
- [x] **Version bump** — 5.7.2 → 5.8.0 (2 features, 4 fixes).

### Key Decisions

- System checkpoints do NOT reset the `lastCheckpointAt` or stale timer — user still gets nudged for manual notes.
- Badge count filters out system entries; timeline visibility uses total count.
- Sidebar keeps titles in body header when open (needed for action buttons); collapsed sections have no body header at all.

### Next Steps

- Full regression retest on v5.8.0 (SectionNav interaction, backburner with create-new, auto-checkpoints visible in timeline)
- Plan 035 (Unified Calendar) execution
- Companion sync parity (backburner, priority, video call title)
- Changelog entry for 5.8.0

---

## Session - 2026-05-28 (Unified Calendar Plan 035 Architecture)

**Agent:** Antigravity (Gemini)
**Branch:** working tree (master/staging)
**Goal:** Architect the Unified Calendar & Scheduling System (Plan 035) with Google, Outlook, and iCal parity.

### What Was Done

- [x] **Technical Scoping & Architecture Design** — Authored the comprehensive implementation plan for Plan 030 in `docs/Plan-030-time-blocking-calendar.md`.
- [x] **Database Schema Specification** — Designed local SQL schemas for calendars (`tabatha_calendars`) and events (`tabatha_calendar_events`) including RRule recurrence engines and focus/task bindings.
- [x] **UI/UX Component Mockups** — Designed React structural specifications for both the full-page Month/Week/Day `CalendarView` (Homepage) and the vertical compact agenda view `CalendarAgenda` (Sidebar).
- [x] **Sync Engine Definition** — Detailed the incremental sync protocol utilizing delta tokens, background fetch loops via alarms, and immediate outbound push triggers with debounced writes.
- [x] **Parallelability & Handoff Review** — Analyzed dependencies against the current `feat/gap-completion` worktree to guarantee safe, parallelized task distribution.

### Key Decisions

- **Visual Parity**: Committed to a React Big Calendar component architecture with custom Framer Motion drag/drop event triggers.
- **Offline-First Storage**: Stored local calendar items inside Chrome extension state, with Supabase database backing as the authoritative sync registry.

### Next Steps

- Initiate Phase 1 implementation by executing the local calendar schema migrations.
- Build out the React Homepage Calendar grid view.

## Session - 2026-05-28 (Backburner Frontend & Core Alarm Engine Implementation)

**Agent:** Antigravity (Gemini)
**Branch:** working tree (master/staging)
**Goal:** Implement the "Back Burner" (#207) momentary check-in UI and core alarm notification engine.

### What Was Done

- [x] **Backburner Focus Implementation** — Created the `backburnerFocus` business logic inside `focusService.js` that updates the item in `focusEngine` with `backburnered: true`, duration, reason, and registers alarms. Handles automatic switching to an existing focus or creating a brand new temporary focus.
- [x] **Chrome Alarms Service Integration** — Added the `backburner-timer-*` alarm listener in `alarmsService.js`. When the alarm fires, it flags the focus as `backburnerExpired: true`, clears active overlay states, and broadcasts a `BACKBURNER_ALERT` event to all pages and content scripts.
- [x] **InBar Prompt & Overlay Card UI** —
  - Added the Backburner button in the InBar footer.
  - Implemented the dropdown popup for setting backburner duration, entering the reason, selecting a fallback focus from active focus items, or creating a new temporary focus.
  - Built the `backburner-alert-card` that pops up when a backburner timer expires. Includes **Dismiss** (clears backburner states), **Snooze** (adds 10m to alarm), and **Resume Focus** (activates backburnered focus and dismisses).
- [x] **Message Handler Registration** — Added `DISMISS_BACKBURNER` and `SNOOZE_BACKBURNER` runtime message handlers to the service router.
- [x] **Successful Build** — Ran `npm run build` with 100% success (0 errors).

### Key Decisions

- **InBar Presence**: Decided to utilize standard content script overlays within the shadow DOM to keep alerts completely non-intrusive and natively integrated without requiring complex host window context manipulations.
- **Snooze Duration**: Hardcoded to 10 minutes by default for high predictability.

### Next Steps

- Proceed with testing of the Backburner UI and full lifecycle in a live unpacked Chrome extension environment.
- Integrate the remaining features from Plan 031 once this foundation is fully verified.

---

## Session - 2026-05-28 (Backburner & Smart Deferral Scoping)

**Agent:** Antigravity (Gemini)
**Branch:** n/a (docs-only, working tree)
**Goal:** Formalize and integrate the "Back Burner" (#207) and "Smart Deferral/Stint Scheduling" (#208) focus management features into the Tabatha ecosystem.

### What Was Done

- [x] **Technical Scoping & Spec Drafting** — Created full feature specs in `docs/features/`:
  - `docs/features/207-backburner.md`: Outlines non-intrusive InBar reminders, Momentary Check-in mechanics, and continuous time tracking defaults.
  - `docs/features/208-smart-deferral-stint-scheduling.md`: Details the Auto-Stint Scheduling heuristic, calendar-gap matching, and task fragmentation rules.
- [x] **Feature Matrix Integration** — Registered Features #207 and #208 in `v0_legacy/docs/features.md` and added them to `tabatha_feature_backlog.md` (Batch 12).
- [x] **Plan Registry Update** — Registered Plan 034 for the Smart Deferral Engine and set Plan 031 progress to `partial (1/8)`.
- [x] **Documentation Sync** — Updated the Headbox instructions and synced `GEMINI.md`, `CLAUDE.md`, and `.gemini/agent.md`.

### Key Decisions

- **Reminder Presentation**: Confirmed floating non-intrusive InBar alerts as the default reminder pattern to prevent user flow disruption.
- **Time Logging Options**: Set continuous focus time logging with check-in classification as the default operational mode for Backburner items.

### Next Steps

- Initiate frontend/UI implementation planning for v0.3.0.
- Implement the desktop-extension handshake in the `alarmsService`.

---

## Session - 2026-05-26 (Mike Transcript Features Assimilation)

**Agent:** Antigravity (Gemini)
**Branch:** n/a (docs-only, working tree)
**Goal:** Assimilate all missing Mike Transcript concepts and features into the master feature list and feature specifications.

### What Was Done

- [x] **Comprehensive Audit & Reconciliation** — Verified every single competitive insight, taxonomic category, and operational flow from `tabby_idea_call_feature_list.md` against existing docs.
- [x] **New Feature Specifications** — Created 4 new top-tier feature specifications in `docs/features/`:
  - `#203`: Business Taxonomy Mapping (On vs. In the Business) — separating client billable vs internal overhead (Sales/Marketing, HR, Admin, R&D)
  - `#204`: Activity Review & Approval Flow (Rise-Style Pending Queue) — draft log editing, heuristic client/service guessing, and bulk approval prior to payroll sync
  - `#205`: QuickBooks Online Payroll Export Workflow — OAuth integration, employee/client mapping, and Timesheets API sync to run payroll in 2 minutes
  - `#206`: Time Block Compliance & Deviation Tracker — dual-track planned vs actual visual overlay, divergence triggers, and accountability compliance scoring
- [x] **Enriched Existing Features** — Updated core specifications with high-fidelity insights:
  - `#188`: Added integration heuristics for the third-party **Write Tool QuickBooks Extension** for reliable browser-level active tab client-name harvesting.
  - `#184`: Scoped the timed **stuck escalation prompts flow** (Do you need help? → Who? → Are you getting pulled?) and the **self-unstuck gamified reward points** (+5 Follow-Through Score boost).
  - `#192`: Scoped **Priority-Based Empty-Slot Autofill** for scheduling high-priority pending items between calendar gaps to reduce choice paralysis.
- [x] **Verification** — Ran `npm run build` cleanly — 100% success with 0 errors.

### Key Decisions

- Kept the "On vs. In the Business" taxonomic taxonomy unified with existing "Realms" but clearly separated billable service/client flows from internal department overhead.
- Bridged passive tracking and manual timesheets with an editable Rise-style pending review queue to eliminate timer-switching friction.

### Next Steps

- Proceed with development of these core prioritized Phase 3/4 feature sets (specifically automatic client detection #188 and review queue #204).

---

## Session - 2026-05-19 (Feature #202: Session Resurrection Spec)

**Agent:** Antigravity (Claude Opus 4.6 Thinking)
**Branch:** N/A (documentation only)
**Goal:** Research Chrome session restore APIs and draft a creative feature spec for context-aware session recovery.

### What Was Done

- [x] **API Research** — Investigated `chrome.sessions` API, `chrome.runtime.onStartup`, `chrome.runtime.onSuspend`, and proactive snapshot strategies for session recovery
- [x] **Feature Spec** — Created `docs/features/202-session-resurrection.md` — full spec for context-aware session recovery with:
  - **Ghost Snapshot**: rolling 60s heartbeat backup of full session state (tabs, focuses, intents, tasks, clock, groups, windows)
  - **Death Detection**: graceful vs. ungraceful close classification via `onSuspend`/`onStartup` signals
  - **Resurrection Screen**: full-page homepage overlay grouping lost tabs into Focus Capsules with selective restore checkboxes
  - **The Ice Box 🧊**: "restore later" persistent frozen session archive with thaw/peek/melt controls, 30-day retention
  - **`chrome.sessions` fallback**: deduped recently-closed tabs as secondary data source
  - **Graceful close integration**: clock-out clears ghost, optional manual freeze
- [x] **Convention compliance** — Spec follows established feature doc format (#202, next in sequence after #201)

### Key Findings

- `chrome.sessions.getRecentlyClosed()` returns max 25 items — insufficient alone, but useful as fallback
- Proactive Ghost Snapshot (Tabatha's own rolling backup) is the superior strategy — preserves all Tabatha metadata
- Only new permission needed: `"sessions"` (for the fallback API)
- Concept doc already envisioned "Return to Flow" on the Welcome Page (line 71) — this feature is the full realization

### Next Steps

- Answer 5 open questions in the spec (overlay vs. banner, per-tab granularity, cloud sync, death-during-resurrection edge case)
- Assign version target and dependencies once implementation is scheduled
- No code changes made this session

---

## Session - 2026-05-19 (Mike Transcript Feature Extraction)

**Agent:** Antigravity
**Branch:** n/a (docs-only, working tree)
**Goal:** Extract feature concepts from the Mike CPA transcript and assimilate into the feature backlog.

### What Was Done

- [x] Read and analyzed full 2865-line transcript (`MIke-chat-get-feature-needs.md`)
- [x] Identified 15 new feature concepts (N01–N15) with user quotes and transcript references
- [x] Cross-referenced all concepts against existing roadmap (ROADMAP.md) and feature docs (docs/features/)
- [x] Mapped 18+ existing features that already address Mike's stated needs
- [x] Created extraction artifact: `docs/features/mike-transcript-extraction.md`
- [x] Created 15 individual feature concept files (#187–#201) in `docs/features/`:
  - 187: Auto Clock-In/Out on Startup/Shutdown
  - 188: Client/Project-Level Time Attribution
  - 189: Service-Level Profitability Reporting
  - 190: AI-Generated Activity Summaries
  - 191: Team Activity Dashboard (Mutual Visibility)
  - 192: Calendar Integration with Auto-Backfill
  - 193: Meeting Block Detection
  - 194: Scheduled Auto-Engagement (Mobile Nudges)
  - 195: Deep Edit / Retroactive Log Editing
  - 196: Intent Countdown Timer (Visible Pressure)
  - 197: Context-Aware AI Assistant Bridge
  - 198: Privacy Modes / Scaled Visibility
  - 199: Morning Kickstart / Daily Planning View
  - 200: Decision Fatigue Reducer (Routine vs. Choice)
  - 201: Follow-Through Score / Accountability Metric
- [x] Appended all 15 features to master feature matrix (`v0_legacy/docs/features.md`) in 4 category groups

### Key Findings

- Mike's #1 pain: forgetting to switch manual timers between clients — auto-detection is the killer differentiator
- Privacy framing is critical for team adoption: "profitability tool, not spy tool"
- Calendar integration is unique angle: retroactive backfill, not just forward planning
- Follow-through accountability validates the entire product thesis

### Next Steps

- Review new feature concepts for priority/phase assignment
- Consider creating a "Mike Persona" user profile document for product decisions
- No code changes needed — all docs-only

---

## Session - 2026-05-18 (Supabase Sync Batch 1)

**Agent:** Codex
**Branch:** `codex/sync-batch-1`
**Goal:** Implement the next high-value Supabase sync batch from `.headbox/sticky-notes/supabase-sync-handoff.md`.

### What Was Done

- [x] Created an isolated worktree/branch from merged `github/refactor/decomp-v2`.
- [x] Added `supabase/migrations/008_add_batch1_sync_tables.sql` for local org registry tables, clock sessions, and desktop activity.
- [x] Extended `src/background/services/syncService.js` to push `tabathaOrg`, `focusEngine.history`, `clockHistory`, `companionRecentSessions`, and `desktopActivity`.
- [x] Added storage-change sync triggers for durable direct page writes (`tabathaOrg`, `clockHistory`, `companionRecentSessions`, `desktopActivity`).
- [x] Wired `clockService` clock-out to request sync immediately.
- [x] Bumped development version to `4.7.6` and updated changelog/headbox mirrors.

### Verification

- [x] `node --check src/background/services/syncService.js`
- [x] `node --check src/background/background.js`
- [x] `npm run version:check`
- [x] `npm run build`
- [x] `npx eslint src/background/services/syncService.js --global chrome`

### Notes

- Repo-wide lint still fails on existing project configuration noise (`chrome` globals in extension files, generated/dist snapshots, legacy files). The new `syncService` target passes when `chrome` is declared.
- Migration 008 must be applied to the Flux Supabase project before `Sync now` can populate the new Batch 1 tables.

### Next Steps

- Apply `supabase/migrations/008_add_batch1_sync_tables.sql` remotely.
- Load the unpacked extension, click Settings -> Sync now, and verify the new Batch 1 tables populate.
- If diagnostics report table-specific upsert failures, use the new diagnostic kind names as the starting point.

---

## Session 006/007 â€” 2026-04-24 (React Migration & Full Build)

**Agent:** Antigravity (Claude Opus 4.6 Thinking)
**Duration:** ~45 min
**Goal:** Migrate to React + Vite + TailwindCSS v4, establish Pop Art/Glassmorphism design system, build core components and dashboard

### What Was Done

- [x] **Repository Reorganization**: Moved entire vanilla JS codebase to `v0_legacy/` folder
- [x] **Vite + React Setup**: Initialized fresh Vite + React project in root
- [x] **Dependencies Installed**: React 19, TailwindCSS v4, Framer Motion
- [x] **Design System**: Created `docs/design.md` â€” formal protocol with Pop Art + Corporate themes
- [x] **Theme Architecture**: Built CSS variable system with `[data-theme]` switching
- [x] **Multi-page Config**: `vite.config.js` configured for Home, Sidebar, Popup, Background, and Gatekeeper entry points
- [x] **Manifest v3**: Updated `public/manifest.json` to v1.0.0 targeting Vite output paths
- [x] **Core Hooks**: Created `useChromeStorage` (reactive state sync), `sendMessage` (background comms), `useTheme` (theme switching)
- [x] **UI Components**: Built `GlassCard` and `PopButton` with theme-adaptive styling
- [x] **FlipClock Port**: Full port of Refocus 3D split-flap clock from TypeScript to React JSX (all countdown modes, settings, pulse animations)
- [x] **Home Dashboard**: Complete rebuild with FlipClock at top, intent/focus bar with shake animation, 3 nav panels (Time, Tabs, Contexts), category breakdown, active sessions list
- [x] **Sidebar**: Full tab list with priority dots, search, context groups, Framer Motion transitions
- [x] **Popup**: Quick-switch panel with fuzzy search, MRU sorting, staggered entry animations
- [x] **Build Verified**: `npm run build` succeeds cleanly â€” all assets compile to `dist/`
- [x] **Dev Server**: `npm run dev` runs on localhost:5173
- [x] **Roadmap Updated**: Added Phase 5 (Flux Ecosystem) to ROADMAP.md

### Files Created
| File | Description |
|------|-------------|
| `src/hooks/useChromeStorage.js` | Reactive chrome.storage hook + theme hook |
| `src/components/ui/GlassCard.jsx` | Theme-aware glass panel container |
| `src/components/ui/PopButton.jsx` | Animated interactive button |
| `src/components/clock/FlipClock.jsx` | Full 3D flip clock React component |
| `src/components/clock/FlipClock.css` | Flip clock animation styles |
| `src/home/index.jsx` | Home Dashboard (command center) |
| `src/home/SessionList.jsx` | Active sessions display |
| `src/sidebar/index.jsx` | Sidebar tab manager |
| `src/popup/index.jsx` | Quick-switch popup |
| `src/styles/global.css` | TailwindCSS v4 theme tokens |
| `docs/design.md` | Design protocol with dual themes |
| `public/manifest.json` | Manifest V3 for v1.0.0 |

### Architecture
```
Tabatha/
â”œâ”€â”€ dist/                    # Built extension (load unpacked here)
â”œâ”€â”€ public/manifest.json     # Chrome Extension manifest
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ hooks/               # React hooks (storage, theme)
â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ ui/              # GlassCard, PopButton
â”‚   â”‚   â””â”€â”€ clock/           # FlipClock + CSS
â”‚   â”œâ”€â”€ home/                # New Tab override
â”‚   â”œâ”€â”€ sidebar/             # Side panel
â”‚   â”œâ”€â”€ popup/               # Toolbar popup
â”‚   â”œâ”€â”€ background/          # Service worker
â”‚   â”œâ”€â”€ content/             # Content scripts
â”‚   â””â”€â”€ styles/              # Global CSS + themes
â”œâ”€â”€ v0_legacy/               # Frozen v0.1.x codebase
â”œâ”€â”€ docs/                    # Design system + progress
â””â”€â”€ vite.config.js           # Multi-page build config
```

### Next Steps
- [ ] Load `dist/` as unpacked extension in Chrome and verify all pages mount
- [ ] Test theme switching (Pop Art â†” Corporate)
- [ ] Wire live `chrome.storage` data to the background service worker
- [ ] Build Settings page for clock configuration
- [ ] Implement Zero-Integration URL parsing engine

---

## Session 012 â€” 2026-04-27 (InPop 2.0 + Intents Dashboard)

**Agent:** Antigravity
**Goal:** InPop overhaul, Intents panel, preset management, settings wiring

### What Was Done
- [x] InPop 2.0 rewrite (presets, threading, Later button, action subtext, tooltips)
- [x] Intents tab on homepage (expand/collapse, rename, focus actions)
- [x] Persistent preset management in Settings > Intent-Popup
- [x] Settings wiring: gatekeeperEnabled, autoAssociateTabs
- [x] BlockGate site blocking (content script + backend + settings panel)
- [x] Unified Task URL Resolver (Asana V0+V1 + ClickUp â€” 23 patterns)
- [x] Supabase schema migration (8 tables + RLS)
- [x] User Manual created at `docs/user-manual.md`

---

## Session 013 â€” 2026-04-27 (InBar + Clock In/Out + Bug Fixes)

**Agent:** Antigravity
**Goal:** InBar, InPop bug fix + strict mode, Clock In/Out, NowBar, homepage layout

### What Was Done
- [x] **Bug fix:** InPop blur-without-popup on pages where body doesn't exist at document_start
- [x] **InPop strict/relaxed mode** â€” strict blocks page, relaxed adds Dismiss
- [x] **Blur strength config** â€” 0-30px slider in settings
- [x] **InBar (Intent Bar)** â€” 24px bottom/top bar showing intent, task, timers, pushes page
- [x] **Clock In/Out** â€” homepage module with live H:MM:SS timer, break toggle, history
- [x] **NowBar** â€” shows highest-priority focus item on homepage
- [x] **Homepage layout** â€” clock moved to header center, reduced whitespace
- [x] **Priority ranking** â€” 1-10 scale on focus items, color-coded badges
- [x] **Settings:** Strict mode, blur slider, InBar enable/position

### Next Steps
- [ ] Expanded Intent View (title, description, linked task, "make task" checkbox)
- [ ] Drift notifications
- [ ] Desktop parity research
- [ ] Supabase: unpause project + deploy schema

---

## Version History

| Version | Date | Milestone |
|---------|------|-----------|
| v0.1.0 | 2026-02-10 | Phase 1 â€” Core Foundation |
| v0.1.5 | 2026-02-12 | Phase 1.5 â€” User Enhancements |
| v0.1.0-alpha | 2026-04-23 | Flip Clock, Active Sessions, Zero-Integration |
| v1.0.0-alpha | 2026-04-24 | React + Vite migration, Pop Art/Glassmorphism UI, full component build |
| **v0.2.0-alpha** | **2026-04-27** | **InPop 2.0, Intents panel, BlockGate, Supabase schema** |
| **v0.2.1-alpha** | **2026-04-27** | **InBar, Clock In/Out, NowBar, strict mode, priority system** |

---

## Session 011 — 2026-04-27 (Logs Panel & Theme Refactor)

**Agent:** Antigravity
**Goal:** Finalize Link/Merge modal, Tabs actions, Logs Panel deep filtering, and Theme expansion.

### What Was Done
- [x] **Link/Merge Modal**: Implemented UI for linking tabs to intents and merging intents.
- [x] **Dashboard Tab Actions**: Added Link and Close buttons to active tabs.
- [x] **Theme System Expansion**: Updated Corporate theme for high contrast and added 5 new drastically different themes (Neo-Brutalism, Glass Ocean, Retro Pixel, Solarized Warm, High Contrast Dark).
- [x] **Settings Walkthrough**: Finished wrapping all settings in the tooltips.

### Next Steps
- Address the general backlog (Sync logic, Supabase backend integration).

---

## Session 012 - 2026-04-29 (Auth UI, Clock Fix, Full Audit)

**Agent:** Antigravity
**Goal:** Complete auth UI, fix clock handlers, audit homepage/sidebar/settings parity, investigate InBar.

### What Was Done
- [x] **useAuth hook**: Created src/hooks/useAuth.js with reactive Supabase session, auto-profile provisioning, org/team membership tracking.
- [x] **Settings Sync section**: Full refactor to useAuth — profile card, linked identities, org/team display, invite token redemption with inline banners.
- [x] **Duplicate clock handlers removed**: Deleted inferior CLOCK_IN/CLOCK_OUT/TOGGLE_BREAK (~L1606); kept robust versions (~L1822) with break archiving.
- [x] **Homepage theme sync**: Theme cycle now includes all 12 themes (was only 7).
- [x] **Dead polling removed**: Removed unused GET_TIME_TRACKING intervals from homepage and sidebar.
- [x] **Work Clock settings**: Added new settings section with auto-clock-in, break reminder, and clock history toggles.
- [x] **InBar investigation**: Traced full injection chain (manifest ? content script ? background handler). InBar works but only appears when focus/context is active.
- [x] **InBar discoverability**: Added helper text in Settings explaining activation requirements.
- [x] **Cross-representation audit**: Verified all Settings toggles have backend support and all features have Settings representation.

### Key Findings
- InBar is fully wired (manifest, build, content script, background) but silently invisible without active focus/context.
- Sidebar is feature-complete for its compact form factor.
- Export and Privacy backend handlers need deeper audit.

### Next Steps
- Consider making InBar show a minimal "No intent" prompt for discoverability.
- Audit Export backend handlers.
- Verify Privacy capture toggles have backend support.
- Add GET_AUTH_STATUS message handler for cross-page auth queries.

### Session 012 Addendum (continued work)

- [x] **InBar visual preview**: Added interactive preview in Settings showing both the full bar and collapsed nub states
- [x] **InBar "No intent" fallback**: InBar now always shows when enabled, displaying "No intent set — click to set" prompt when no focus/context is active
- [x] **InBar nub toggle**: Close button now collapses to a tiny 20px circle nub instead of fully removing; click to re-expand
- [x] **InBar notes panel**: Added ?? button that expands a quick-note panel for jotting thoughts about the current focus/task/intent — auto-saves with debounce
- [x] **Background handlers**: Added SAVE_INBAR_NOTE and GET_INBAR_NOTES message handlers for persistent note storage
- [x] **Tabs layout fix**: Active tabs now in 2-column grid at top; recently closed moved to compact list below with trimmed domains
- [x] **Clock container fix**: Changed from flex: 1 1 auto to 0 0 auto with minimal padding — container now shrinks with clock scale
- [x] **Focus input feedback**: Added pending/loading state to Set Focus button so users see feedback when clicking

---

## Session 015 — 2026-04-29

### Goal
Build the Asana Time Tracker Widget (Flux plugin) — end-to-end from spec to working server.

### Work Done
- [x] **Design spec created**: Full v1 spec covering Asana widget API constraints, 3 widget states (tracking/idle/empty), modal form designs, and data architecture
- [x] **Express server built** (`flux-asana-widget/`): Routes for widget metadata, form metadata, form submit, and OAuth auth
- [x] **Supabase schema** (migration 004): `flux_time_entries` table with computed duration, uniqueness constraints, and performance indexes
- [x] **Migration applied** via Supabase CLI (`npx supabase db push`)
- [x] **SSL certs generated** for HTTPS (required by Asana)
- [x] **Lazy Supabase init**: Server boots cleanly even without `.env` configured (mock mode)
- [x] **Security middleware**: Request expiry validation and optional HMAC-SHA256 signature verification
- [x] **CORS**: Locked to `app.asana.com` origin
- [x] **End-to-end tested**: Start timer (Alice), start timer (Bob), stop timer (Alice), verify multi-user widget state — all passing against live Supabase

### Key Findings
- Asana widgets are JSON-only — one template (`summary_with_details_v0`), no custom HTML/CSS/JS
- Interactions happen via Modal Forms (entry point click), not widget buttons
- `datetime_with_icon` fields auto-format relative time in Asana UI
- Computed `duration_s` column avoids needing to calculate in application code

### Next Steps
- Register the app in Asana Developer Console (https://app.asana.com/0/my-apps)
- Configure Widget Metadata URL, Form URLs, and Entry Point label
- Add proper user name resolution via Asana API (currently uses GID suffix)
- Consider v1.1: manual time entry form for retroactive logging
- v1.2: Tabatha browser integration — auto-track from browser focus state

### 2026-04-29 — InPop/InBar/Asana Fixes
**Goal:** Fix InPop common list clicks, InBar visibility, and Asana URL auto-intent

**What was done:**
- [x] Fixed SET_TAB_CONTEXT — now auto-creates tab entry if missing (InPop preset clicks were silently failing)
- [x] Fixed SAVE_INBAR_NOTE — corrected 
equest vs message variable name bug
- [x] Rebuilt extension — InBar build was stale (old version without nub/notes/discovery state)
- [x] Added Asana URL auto-intent in CHECK_CONTEXT_NEEDED — detects app.asana.com task URLs and extracts task name from page title
- [x] Added Asana auto-intent in onTabUpdated — catches the race condition where gatekeeper fires before title loads
- [x] Verified all InPop message handlers exist in background.js switch statement

**Key findings:**
- InBar was invisible because dist/assets/inbar.js was stale (old build without nub/notes)
- InPop common preset clicks DID call closeOverlay() but SET_TAB_CONTEXT silently failed if tab data wasn't created yet
- SAVE_INBAR_NOTE used 
equest instead of message — would always crash

**Next steps:**
- Reload extension in chrome://extensions and test all 3 features
- Consider adding Asana API integration (via personal access token) for richer task details beyond just the title

---

## Session 016 - 2026-05-09

### Goal
Fix all issues identified in the full diagnostic report (16 issues across critical/high/medium/low severity).

### Work Done
- [x] **Critical #1**: Merged duplicate
otifications.onClicked listeners into single unified handler
- [x] **Critical #2**: Fixed undefined ctiveTabId ReferenceError - replaced with WINDOW_ID_CURRENT
- [x] **Critical #3**: Removed export from 	riggerSync() preventing service worker module loading failure
- [x] **High #4**: Fixed clock-in/out race condition - removed double-writes to clockSession storage
- [x] **High #6**: Passed explicit ctiveFocus.id to completeFocus/extendTimer in home + sidebar
- [x] **Medium #8**: Bridged 	imeTracking.byTab gap - added updateTimeTrackingAggregates() to populate UI data
- [x] **Medium #9**: Fixed Gatekeeper Sugar Box/Park/Later buttons to close overlay + tab
- [x] **Medium #10**: Fixed useChromeStorage stale closure bug using useRef
- [x] **Low #12**: Wrapped
ew URL() in popup with try/catch
- [x] **Low #14**: Added auth session guard to 	riggerSync to avoid unnecessary Supabase calls
- [x] **Low #15**: Extracted shared ormatTime utility to src/utils/formatTime.js
- [x] **Low #16**: Fixed patternToRegex double-escape edge case

### Files Modified
| File | Changes |
|------|---------|
| src/background/background.js | #1, #2, #3, #14, #16 |
| src/home/index.jsx | #4, #6, #15 |
| src/sidebar/index.jsx | #6, #15 |
| src/popup/index.jsx | #12, #15 |
| src/hooks/useChromeStorage.js | #10 |
| src/content/gatekeeper.js | #9 |
| src/services/timeTracking.js | #8 |
| src/utils/formatTime.js | #15 (new) |

### Key Decisions
- Skipped #11 (FlipClock magic numbers) - cosmetic, needs design review
- Skipped #13 (Supabase anon key) - anon keys are public by design
- #5 (FocusInput stuck) already had adequate error handling
- #7 (sidebar clock buttons) resolved by fixing #10 (the hook itself)

### Next Steps
- Reload extension in chrome://extensions and verify Service Worker console is error-free
- Test clock-in/out flow, focus set/complete, and gatekeeper buttons end-to-end
- Monitor time tracking data populating in the UI

---

## Session 019 - 2026-05-10

### Goal
Build InBar Pause + Sticky Note overlay feature (UI-only, safe during decomp)

### Work Done
- [x] **Pause button** added to InBar action bar (? icon, between note and collapse)
- [x] **Mini-prompt** — on pause click, expanding amber-tinted panel asks "Where did you leave off?"
- [x] **Sticky note overlay** — large tilted paper-textured note appears on page (non-obstructive, pointer-events only on note)
- [x] **Paused bar state** — InBar transitions to amber tint with "? PAUSED — note preview..." + inline Resume button
- [x] **Nub state** — collapsed nub shows amber ? when paused
- [x] **Persistence** — pause state stored in `chrome.storage.local.pausedIntents[tabId]`, survives page reload
- [x] **Resume flow** — resume from sticky note, inline bar button, or pause button. Clears storage + restores bar.
- [x] **Edit note** — sticky edit button expands pause prompt pre-filled with existing note
- [x] **Timer freeze** — intent timer stops ticking while paused

### Key Findings
- Decomp branch `refactor/service-arch` is code-complete (6 commits, 13 service modules, all 62 handlers extracted, build passes) but NOT merged to master
- The branch is named `refactor/service-arch`, not `codex/service-arch` as documented
- All pause state managed via `chrome.storage.local` — no background.js changes needed for MVP
- Sticky note uses CSS paper gradient + random tilt (-3° to +3°) + tape pseudo-element

### Decisions
- Used `chrome.storage.local` directly from content script (avoids needing new background handlers)
- Deferred: auto-park on close, PAUSE_INTENT handler, time tracking cascade — all need post-decomp backend work
- Deferred: Settings UI for pause (enable/disable, style picker)

### Next Steps
- Merge decomp to master ? rebase ? begin Phase 3 (Follow-Through data model + service handlers)
- Or: BlockGate settings UI enhancements (reasons, custom text, delayed unblock)
- Or: InBar settings section (element visibility toggles, progress bar config)

---

## Session 018 â€” 2026-05-10 (Bug Fix Sweep + Task CRUD)

**Agent:** Antigravity
**Duration:** ~30 min
**Goal:** Tier 1 bug fixes + Tier 2 Task CRUD enhancements

### Work Done
- [x] **Corner radius halved** â€” global CSS vars (sm: 4â†’2, md: 8â†’4, lg: 16â†’8px)
- [x] **InBar label fix** â€” falls back to ctiveFocus.label so it shows the current focus even when tab context is unset
- [x] **FlipClock responsive** â€” overflow: hidden, lexWrap: wrap on header, 5px margin top/bottom
- [x] **Task delete confirmation** â€” window.confirm() guard before deleting tasks
- [x] **Task inline editing** â€” âœï¸ button toggles inline name + description edit mode with Enter/Escape/Save/Cancel
- [x] **Start intent from task** â€” ðŸŽ¯ button creates a new focus with the task name + tag link
- [x] **Link task to intent** â€” ðŸ”— button opens LinkMergeModal with new 	ype='task' support
- [x] **LinkMergeModal expanded** â€” now handles 	ype='task', shows intents list, sends UPDATE_FOCUS with task tag
- [x] **CompanionStatus** â€” already imported on line 19, already rendered on line 886 (compact dot in header)

### Key Findings
- Extension errors: "Unable to download images" = transient Chrome quirk (icons exist), "WebSocket :9147 refused" = companion not running (expected)
- CompanionStatus component was built in desktop session but never imported â€” now wired in
- TasksPanel now accepts onLinkRequest prop for modal integration

### Decisions
- Deferred icon display mode setting (Icons Only / Labels Only / Both) to Tier 3
- Deferred shadcn/ui migration to post-decomp
- Used window.confirm() for task delete rather than custom modal â€” simple and effective

### Next Steps
- Merge decomp to master â†’ rebase â†’ Phase 3 (Follow-Through data model + handlers)
- Cross-view focus state sync debug (sidebar/popup â†’ homepage broadcast)
- shadcn/ui incremental component migration

---

## Session 021 — 2026-05-11 (v3.12.4-alpha — Full UX Overhaul Release)

**Agent:** Antigravity
**Duration:** ~2 hours
**Goal:** Execute all 9 phases of implementation_plan_017 and release to master

### Work Done
- [x] **Phase 0** — Header spacing + clock decoupling (prior session)
- [x] **Phase 1** — InBar edit dropdown: intent editing, focus assignment, new focus creation. Separated tab intent vs central focus display.
- [x] **Phase 2** — Focus pause/resume + side-quest auto-pause (prior session)
- [x] **Phase 3** — Auto-park paused tabs on close with sticky note. Tab rename in Tabs panel. Link Tab button in IntentsPanel with inline picker. Parked tabs show context/notes/source.
- [x] **Phase 4** — Collapsible sections with persisted state (prior session)
- [x] **Phase 5** — Context Activity Bar rename + scope expansion (prior session)
- [x] **Phase 6** — 3× Activity Heatmaps (Browser, Overall, Follow-Through) (prior session)
- [x] **Phase 7** — LogsPanel overhaul: 8 log types with toggleable filter chips, pagination (50/page), desktop activity excluded.
- [x] **Phase 8** — Data retention alarm (90d default, configurable in Settings). Daily pruning of companion/desktop activity.
- [x] **Versioning** — Bumped to 3.12.4-alpha across manifest, settings, and homepage.
- [x] **Changelog** — Full v3.12.4-alpha entry in Tabatha_Changelog.md.
- [x] **Merged to master** — Released as v3.12.4-alpha on live profile.

### Decisions
- Used prompt() for tab rename (simple, effective) rather than custom inline input
- Desktop activity excluded from Logs — reserved for Context Activity Bar analytics
- Auto-park uses parkedTabs storage (separate from closedContexts) with 200 entry limit

### Next Steps
- InBar intent live-reload after edit (currently needs page refresh)
- Settings UI for browser data retention
- Blocked site + task update log types need background event emission to populate

---

## Session — 2026-05-14 (Plan 023 Task 00: Pre-Decomp)

**Agent:** Antigravity (Claude Opus 4.6 Thinking)
**Branch:** `chore/plan-023-pre-decomp`
**Goal:** Execute Task 00 — architecture docs, version sync, branch cleanup, privacy sticky

### What Was Done

- [x] **Architecture Docs** — Created `docs/architecture/` with 4 master-aligned documents:
  - `service-decomp-plan.md` — Full decomp plan updated for 79 handlers / 2920 lines (was 62 / 2302 in archived branch)
  - `service-map.md` — Complete handler-to-service mapping with line numbers
  - `migration-checklist.md` — Fresh checklist with all handlers in unchecked state
  - `message-contracts.md` — Frozen response-shape registry for every message type
- [x] **Version Sync** — Wired `scripts/sync-version.mjs` into `package.json`:
  - `npm run version:sync` — propagate manifest version to all files
  - `npm run version:check` — CI/pre-commit guard
  - `npm run prebuild` — auto-sync before every build
  - Installed `.git/hooks/pre-commit` (plain shell, no Husky)
  - Synced all files from 3.31.5 ? 3.34.5 (manifest is source of truth)
- [x] **Branch Cleanup (partial)**:
  - Removed stale `Tabatha-service-arch` worktree (was clean)
  - Archived `refactor/service-arch` as tag `archive/service-arch-v1`
  - Deleted `refactor/service-arch` branch
  - PENDING: `feat/follow-through-engine` and `feat/v3-ux-overhaul` archive+delete (awaiting user confirmation)
  - PENDING: `git push origin --tags`
- [x] **Privacy Sticky Note** — Created `.headbox/sticky-notes/privacy-modes-future.md`
- [x] **Build Verified** — `npm run build` passes (prebuild hook fires correctly)

### Decisions
- Counted 79 unique message handlers on master (vs 62 in the old branch) — 17 new handlers added since service-arch was created
- `companionService` added as 12th service (was not in original plan)
- `UPDATE_TAB_CONTEXT` discovered as 22nd tab handler (post-v1 addition)
- Pre-commit hook is plain bash (no Husky dependency)

### Next Steps
- Confirm deletion of `feat/follow-through-engine` and `feat/v3-ux-overhaul` branches
- Push archive tags to origin
- Finalize commit (remove `wip:` prefix)
- Merge `chore/plan-023-pre-decomp` ? master
- Begin Task 01 (Phase 1 foundation)

---

## Session - 2026-05-14 (Plan 023 Task 02: Notification + Settings Services)

**Agent:** Codex
**Branch:** `refactor/decomp-v2-communication`
**Goal:** Initiate Task 02 - extract notification and settings handlers from `background.js`.

### What Was Done

- [x] Created `refactor/decomp-v2-communication` from `origin/refactor/decomp-v2-foundation`
- [x] Added `src/background/services/notificationService.js` for `OPEN_POPUP`, `GET_INBAR_DATA`, `GET_INBAR_NOTES`, `SAVE_INBAR_NOTE`, and `START_POMODORO`
- [x] Added `src/background/services/settingsService.js` for `GET_SETTINGS` and `UPDATE_SETTINGS`
- [x] Registered both services in the router and removed their legacy switch cases
- [x] Replaced `broadcastMessage` with scoped helpers: `broadcastToExtension` for extension-only events, `broadcastAll` for InBar-relevant events
- [x] Updated `docs/architecture/message-contracts.md`, `migration-checklist.md`, `service-map.md`, the task checklist, and the semantic changes ledger
- [x] Verified `npm run build` passes

### Key Findings

- Only the InBar content script currently listens to background broadcasts from tabs.
- `FOCUS_ENGINE_UPDATED`, `TAB_UPDATED`, `WELCOME_BACK`, and `FOCUS_TIMER_EXPIRED` need all-target delivery; the rest can stay extension-runtime scoped.
- `UPDATE_SETTINGS` now rejects invalid `settings.storage` blocks before persisting.

### Next Steps

- Load unpacked extension and verify popup render, InBar data/notes save, settings persistence, and service worker console scoping.
- Continue Plan 023 with Task 03 data services after manual checks or merge into the integration branch.

---

## Session - 2026-05-14 (Plan 023 Task 05D / Router Finalization)

**Agent:** Codex
**Branch:** `refactor/decomp-v2-router`
**Goal:** Review PR 10 and take the next Plan 023 router-finalization slice after alarmService.

### What Was Done

- [x] Reviewed PR 10 (`refactor/decomp-v2-alarm`) locally; no blocking code-review findings found
- [x] Created `refactor/decomp-v2-router` worktree from PR 10 head
- [x] Collapsed `src/background/background.js` from 921 lines to 171 lines
- [x] Removed the legacy runtime-message fallback function; unknown messages still return `{ error }`
- [x] Moved tab activation/context-drift tracking into `tabTrackingService`
- [x] Moved idle/off-Chrome/welcome-back handling into `clockService`
- [x] Moved notification click/button handling into `notificationService`
- [x] Moved URL-lock navigation interception into `tabService`
- [x] Added `syncService` for Supabase sync, auth-session lookup, debounce, and `supabase-sync` alarm registration
- [x] Updated architecture docs, migration checklist, message contracts, and semantic ledger

### Key Findings

- Task `05D` was not present as a checked-in task file; treated it as the documented next slice after 05c (`06-router-finalization` scope).
- `npm run build` passes after linking this worktree to the existing `Tabatha-codex\node_modules`.
- `npm run lint` still fails on pre-existing repo-wide lint configuration issues (`chrome` globals, `v0_legacy`, CommonJS widget files, React purity warnings). New background router target itself builds successfully.

### Decisions

- Did not bump version yet; the Plan 023 task file says final version selection should happen after the full regression checklist and semantic-ledger total.
### Next Steps

- Proceed with testing and integration of `fix/popup-harmony` (Plan 025).
- Run manual regression on the `refactor/decomp-v2` branch since it encompasses all the Plan 023 integrations and prepare the final PR to `master`.

## 2026-05-16 — Workspace Deep Review & Cleanup

### Goal

Perform a deep review of the workspace, audit all existing worktrees, and clean up fully merged branches to reduce cognitive load and organize the repository for the next development phase.

### What Was Done

- Removed stale worktree: `Tabatha-alarm` (was tied to `refactor/decomp-v2-alarm` which was merged).
- Audited `origin/refactor/decomp-v2` integration branch and fast-forwarded local repo to match origin.
- Purged 7 fully-merged local branches. 
- Deleted 11 stale remote branches on `origin` that were fully merged.
- Audited local active feature branches and identified `fix/popup-harmony` (Plan 025) as the active development track.

### Decisions

- `refactor/decomp-v2` remains the primary integration branch for all V4 / Phase 3 architectural work, fully up to date locally.
- `fix/popup-harmony` is protected from cleanup as it contains active work for Plan 025.

---

## Session — 2026-05-16 (Plan 025: Popup Harmony & CPN Execution)

**Agent:** Antigravity
**Branch:** `fix/popup-harmony`
**Goal:** Execute Plan 025 — singleton popups, CPN system, Follow-through Support settings, all UI surfaces

### What Was Done

- [x] **Feature Docs** — Created `#184` (CPN) and `#185` (Popup Harmony) with `Scoped at v4.0.0` header convention
- [x] **Constants** — Added `POPUP_TYPES`, `CPN_PROGRESS_VALUES`, and Follow-through Support defaults to `constants.js`
- [x] **Singleton Popup Coordination** — `_activePopup` storage key, `POPUP_DISMISSED` broadcast, `registerPopup()`/`dismissPopup()` in `focusService.js`
- [x] **Enhanced FTE** — 6-CTA modal (Extend, Switch, Pause, Break, Complete, Note) in `inbar.js`
- [x] **Combo Popup** — FTE+WBP merge when user returns from idle with expired timer, in `clockService.js`
- [x] **WBP Thresholds** — Configurable min idle time and show-after-break gate in `clockService.js`
- [x] **Off-Device Tag** — `offDevice` boolean on focus items; suppresses all popups/notifications. Toggle in home FocusBar. Wired through `updateFocus()` handler.
- [x] **CPN Data Model** — `checkpoint[]`, `progressLevel`, `progressValue`, `lastCheckpointAt` fields on focus items
- [x] **CPN Engine** — `saveCheckpointNote`, `snoozeCheckpoint`, `getCheckpointStatus` in `focusService.js`
- [x] **CPN Auto-Prompt** — `checkpoint-prompt-{focusId}` alarm routing via `alarmService.js` at configurable fraction intervals
- [x] **CPN Smart Suppression** — Auto-prompt suppressed if linked task completed within 2 minutes
- [x] **InBar CPN Overlay** — Checkpoint prompt form with 5 progress level buttons (`none`/`little`/`lot`/`almost_done`/`stuck`)
- [x] **InBar Staleness Signal** — Amber pulsing dot (`.stale-dot` CSS animation) next to focus label when checkpoint is overdue
- [x] **Sidebar Checkpoint Button** — 📋 button with staleness indicator, inline CPN form with AnimatePresence
- [x] **Home FocusBar** — Off-device toggle (📱/📴), Checkpoint button with count badge, inline CPN form, Checkpoint Timeline viewer
- [x] **Settings UI** — "📋 Follow-through" section with WBP thresholds, CPN enable/interval/staleness config, Asana auto-post toggle
- [x] **Auto-Dismiss Stale Popups** — `FOCUS_ENGINE_UPDATED` handler in `inbar.js` auto-removes overlays if focus is no longer drifted/paused
- [x] **Asana Stub** — `POST_ASANA_COMMENT` webhook event type added (server-side handler deferred)

### Branch Fix
- Commit `f97ecc4` was accidentally created on `refactor/decomp-v2`. Cherry-picked to `fix/popup-harmony` and reset `refactor/decomp-v2` to clean state.

### Commits (3 on `fix/popup-harmony`)
1. `5d0e4a8` — Core: singleton popups, 6-CTA FTE, combo, CPN system, sidebar checkpoint
2. `d70ddb9` — Settings: Follow-through Support section
3. `f97ecc4` — Home FocusBar off-device toggle, CPN form + timeline, InBar staleness pulse

### Next Steps
- Manual regression test with extension loaded unpacked
- Asana widget server: implement `POST_ASANA_COMMENT` webhook handler
- Merge `fix/popup-harmony` into `refactor/decomp-v2` or `master` after regression
- Version bump (Plan 025 adds ~3 minor features → 4.3.0 candidate)

---

## 2026-05-30 — Feature Intake: Priority, Voice, InPop (#210–#214)

**Goal:** Capture new feature requests into the feature backlog (docs/features/).

**Done:** Authored 5 new feature specs from user intake —
- **#210 Priority Challenge & Accountability Interrupts** — rotating/anti-fatigue prompts ("is this the most important thing?", "more important than [higher-priority item]?"), Yes/No flows, digression timers, forced justification or priority re-rank, escalation ladder.
- **#211 Audio Input & Voice Control** — field-level mic on every title/description, omnipresent floating voice button (every tab/window + extension bar + hotkey), phased non-AI → AI build, full voice control of Tabatha (create focus/task, settings, open windows, "plan my day" brain-dump).
- **#212 InPop Intent Dropdown Header** — full-bleed header doubling as a quiet intent switcher (chevron), reassign tab to any active/all focus, inline new-intent create.
- **#213 Focus/Task Data Architecture Normalization** — focus = priority-bearing parent task; every task must attach to a focus or be promoted to one; no orphan tasks.
- **#214 Priority Matrix & Lazy Priority** — two tiers: lazy P1–P5 (fast) + Priority Matrix (urgency × relevance quadrants, nested 1–5, age tie-break). Unified comparable ordering for challenge/scheduler consumers.

**Key findings/decisions:**
- Priority split into TWO features (#213 data model, #214 priority system) per user.
- #214 canonical Priority Matrix terms live in the **Asana skill** (not in repo) — flagged reconcile-before-implement.
- No central feature registry exists; docs/features/*.md is the canonical list.

**Next steps:** Reconcile #214 with the Asana skill matrix definition; slot #210/#213/#214 into Phase 3/4 prioritization; define the AI-counterpart boundary for #211 (which phases ship without AI).

---

## 2026-07-09/10 — Cortex Overnight (Fable): Program Expansion + Phase 1 T4–T6

**Goal:** Autonomous overnight session for the Tabatha Cortex program (Plans 039/040): finish the program spec expansion, continue Phase 1 with TDD discipline, mirror docs to Drive, keep Asana current.

**Done:**
- **Docs/spec:** All 15 feature files (C1–C15) expanded stub → full spec via 6 parallel subagents; reconciled against the verbatim braindumps and closed 3 spec gaps (universal audio-input replacement, tabatha-mobile repos in the reuse map, multi-screen/per-window capture nuance). Plans 041–044 (Phases 2–5) authored + registered; registry next number = 045. DATA-MAP.md populated (27 signals, real retention/redaction/access values); workspace-map current. Drive mirror: features/prompts/plans subfolders + Google-Doc link headers on all locals. HANDOFF.md written for Malkio.
- **Phase 1 T4 (capture I/O):** captureVisibleTab (window-targeted) → canvas redaction (blackout/blur BEFORE persist, fail-closed) → partitioned frame writes via chrome.downloads under Downloads/Tabatha/Cortex/captures/<personal|org>/YYYY-MM/; suppressed frames record context-only observations; tab/window/focus listeners; 30s dwell heartbeat; 03:30 nightly ledger export; per-partition age retention. New TDD utils: captureArtifacts.js, ledgerExport.js.
- **Phase 1 T5 (cron-in-harness + dashboard):** harnessCron.js (claude-code + codex bundle builder, cortex-recommendations.v1 contract), master prompt economize-workflow.v1 (docs/cortex/prompts + embedded mirror), cortexService (list/import/approve/dismiss), CortexPanel dashboard in Settings → Privacy & Capture.
- **Quality loop:** Opus reviewer audited the T4/T5 diff — 6 findings, all fixed: incognito capture fail-closed, serialized ledger/state mutations, capture pinned to guarded window, setEnabled routed via settingsService, redaction fails closed on invalid rules, single download-erase listener.
- **Asana:** 15 C-cluster subtasks under program task 1216437560480330; progress comments on program + Phase 1 tasks; gating comments on .pem + companion-deploy board items; green project status update.

**Key findings:** MV3 can't write arbitrary filesystem paths (captureStoragePath is Downloads-relative until the companion handoff, Plan 041); chrome.alarms floor makes dwell resolution ≥30s; C9 voice has a settings-schema collision with feature #211 (blocker for Plan 042); tabatha-mobile is scaffold-only (a feature doc over-claimed it — DATA-MAP corrected); pruning removes ledger rows but not orphaned frame files (open question).

**Tests/build:** 256/256 node --test green; npm run build green. Commits d228dc1, 85d8100 (+ final wrap-up commit) on claude/tabatha-ai-integration-layer-91903b. Nothing pushed.

**Next steps:** Malkio manual regression of Phase 1 (see HANDOFF.md smoke-test) → v7.0.0 bump; re-sync program-spec Google Doc (2 local additions); decide migration 022 apply; companion deploy gates Plan 041; reconcile C9↔#211 before voice work.

---

## 2026-07-10 (continuation) — Cortex: regression cleared + Phases 2–5 advanced

**Goal:** Verify Malkio's smoke-test failures, then continue autonomously through the remaining Cortex phases.

**Regression verdict:** Real-browser regression (Playwright + Chrome 150, fresh profile; Chrome 137+ requires CDP Extensions.loadUnpacked) — 11/11 PASS on the current dist including the exact reported failures (clock-out, unpause, "Setting…"). Root cause: stale MV3 service worker after overnight dist rebuilds; reload rule codified in AGENTS.md (Build→Load #5). Hardening: RESUME_FOCUS id-fallback.

**Shipped (extension, commits c98e459→wrap-up; 332/332 tests, build green):**
- Phase 2: morning digest + approved-actions export (cortex-actions.v1) + C15 config surface v1 (routing/proactivity); cortex-proxy edge fn code (tier-②, deploy pending secret); routing-ladder resolver; companion handoff wiring (CAPTURE_TAKEN → ledger, config mirroring, host-only rules never travel).
- Phase 3: T0 voice-schema decision (C9↔#211, Drive-mirrored); voice v0 — Tabby speaks instead of FTE/drift overlays (tone → hold-off mic window → varied generated line → modal fallback; no new permissions), home voice-note button → ledger; C10 self-correction v1 (detectors + confidence-laddered apply/revert via activityAudit, nightly 04:00, opt-in).
- Phase 4: proactivity gate, overnight EXECUTE bundle builder (review-first hard rules), migration 023 org_capture_policy (not applied).
- Phase 5: controller-attribution decision core.

**Shipped (companion, tabatha-desktop feat/cortex-capture @ 006c3aa; 68/68 cargo tests):** screen_capture.rs + settings.rs — GDI window/per-monitor-same-timestamp/virtual capture, browser-focused handoff rule, guard parity (fail-closed redaction), age+bytes retention, CAPTURE_CONFIG/GET_CAPTURE_STATE/CAPTURE_TAKEN WS contract, tray toggle.

**Quality loop:** Opus review over the Phase 2/3 diff → 1 confirmed finding fixed (self-correction storage race narrowed to single-round-trip targeted mutations); InBar voice interception verified safe (modal can never be swallowed; voice-off path byte-identical; no ESM leak into the content script).

**Next steps:** Malkio: extension reload + re-smoke-test → v7.0.0; merge/deploy companion branch (closes the deploy gate); deploy cortex-proxy (set secret); later: migrations 022/023, gateway/ElevenLabs keys, .pem before manifest-permission phases. Remaining phase work: routed STT/TTS + realtime voice + dictation engine (042), multi-cadence + SOP mode + Headbox placement (043), signals/analytics/camera/mobile/Mac (044).

---

## 2026-07-10 (afternoon) — Live-fix session: capture UX, clock, companion v0.2.0, DB push + repair

**Goal:** Address Malkio's live-testing reports (Save-As dialogs, capture not following activity, clock desync, desk panel dead, sync stale) under the new delegation rules (Fable orchestrates; Opus agents own terminal/browser; Sonnet agents launch/synthesize; Supabase+Asana via CLI).

**Done:**
- Migrations **018–024 pushed to live Flux** via CLI with Malkio's new token (remote was at 017 — registry record corrected). Sync's schema drift closed.
- Extension `2f171b5` (361 tests): silent capture writes (companion WS CAPTURE_FRAME / OPFS fallback — Save-As dialog eliminated), C1 focus-gate (tab capture only while Chrome focused), tab-title slug in filenames, clock-state request on connect, pendingCortexExports buffering.
- Companion `b94f7d0` @ feat/cortex-capture (79 tests): desk panel fixed (custom-protocol default → embedded UI), **v0.2.0** shown in title/tray, clock_in idempotency fix (root cause of clock desync), CAPTURE_FRAME/WRITE_EXPORT/FILE_WRITTEN handlers (path-safe), OS-frame title slugs; verified desktop capture was already writing (62+45 frames) — visibility artifact, not a capture failure.
- Companion **v0.2.0 swapped in + relaunched** (Sonnet operator); then its SQLite activity DB (pre-existing corruption, likely from dual-instance writes + force-kills) **rebuilt via raw b-tree page salvage — 372 app_sessions + 1 clock_session recovered**, integrity ok, clean startup.
- Persistence root-caused (Chrome GC on crashed exit + ghost pre-key entry + build race) → atomic dist swap shipped, constraint rules updated, Asana board comment posted via CLI.
- ElevenLabs scoped key minted → env store (K10 ✅). C10a + Agent Control Layer scoped (doc + Asana task each; control layer BACK BURNER post-Cortex). C11a attribution v1 shipped.
- WHAT-REMAINS.md maintained as the living status page.

**Next steps (Malkio):** Supabase re-sign-in (sole sync blocker) · remove ghost extension card · verify v0.2.0 (panel/clock/silent capture) · merge/deploy feat/cortex-capture · Phase 1 regression → v7.0.0 · deploy cortex-proxy.

---

## 2026-07-10 (evening) — Delegated push: deploy closed, Phases 2/3/4 advanced, proxy live

**Done (all via delegated agents per Malkio's tiering — Opus in-flight work finished, new dispatches Sonnet):**
- **Companion deployed**: feat/cortex-capture merged → master @ dbf8cd7, tagged v0.2.0, master-built exe swapped + relaunched clean (Plan 041 T1 CLOSED, Asana board item updated). Companion SQLite DB rebuilt earlier via raw b-tree salvage after corruption.
- **cortex-proxy live** (tier-② routing; 401-protected; OpenAI secret server-side) — Plan 041 T3 done.
- **Migration 025 applied** (surface CHECK incl. voice/desktop/mobile — discovered 022 never had the constraint the docs assumed).
- **C10a Context Reconciliation v1 shipped** (b8a1fb7): Reconcile-now panel, 4 proposal kinds incl. retroactive time edits, confirm/skip + context box; C11a-stamped, audited, reversible.
- **Plan 043 T3 multi-cadence shipped**: cadence decision table, intraday slice exports + economize-intraday.v1, dual-cadence harness bundle, opt-in flags.
- **Plan 045 registered** — Agent Control Layer formalized as Cortex Phase 6 (back-burnered post-Cortex).
- Ghost extension entry confirmed on disk (dph… still in Secure Preferences) w/ removal steps; CortexPanel live-status fix (b9a1965); dist verified to carry the silent-capture fix (15/16 in-browser PASS).
- Suite: **408/408 node tests**, builds green both repos.

**Next steps:** Malkio — reload extension, Supabase re-sign-in, ghost card removal, Phase 1 regression → v7.0.0. Engineering — 041 archive adapters; 042 voice (routed STT/TTS via live proxy, .pem-gated hotkeys); 043 T5 SOP + T6 Headbox placement; 044 wired later with 041 per Malkio.

---

## 2026-07-10 (night) — "Removed features" investigation → staging merge restoration (v6.6.0)

**Report:** Malkio noticed the advanced intent time editor was gone. Three Sonnet analysts ran parallel audits:
1. In-branch sweep: all 32 cortex commits verified — ZERO regressions/overwrites; every on-branch feature intact at HEAD.
2. Time-editor hunt: the advanced editor = NB-09 (c429db5, authored by Malkio on staging Jul 5) — AFTER the cortex branch forked from main@6.5.0 (Jul 1). Never on this branch; never deleted.
3. Fork-gap: staging = v6.6.0 with 17 commits we lacked (NB-03 roles, NB-04 analytics, NB-05 abandoned stints, NB-08 settings search, NB-09 time editing + gap detector, storage guard, PGRST204 sync resilience). Previous dist was built from that line.

**Fix (Opus merge):** staging merged into the cortex branch @ 12f6147 — both feature sets verified coexisting (resumeFocus fallback re-preserved), version → 6.6.0, staging's colliding migration 022 renumbered → 026 and applied to Flux (local==remote @ 026). Tests 408 → **536 green**; build green; content scripts clean. Lesson reinforced: the pinned dist path serves whichever line the main dir is on — the build/load constraint's worktree warning was the mechanism.

**Next:** Malkio reloads → verifies time editor back; NB-01/02 schedule profiles remain on their branch (explicitly gated) — bring over on request.
