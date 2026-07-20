# Tabatha â€” Progress & Worklog

> Continued from `v0_legacy/docs/progress.md` (Sessions 001-005).
> This file tracks progress from v1.0.0-alpha onwards.

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

## 2026-07-17 — Tabby Sidecar v0.0.1 (Plan 039)

**Goal:** Ship the extension sidebar as a mobile web companion at
`tabatha.pondocean.co/sidecar`, synced to the user's Tabatha account, built in
React Native so a real mobile app is an incremental step later.

**Done (LIVE):**
- New Expo + React Native Web app in `sidecar/` (SPA web export, `baseUrl:/sidecar`).
  Auth-gated single shell + custom bottom tab bar: Focus, Tasks, Clock, Recent, Settings.
- Direct Supabase data layer (schema `tabatha`, publishable key, owner-RLS): reads
  `focus_items` (active + full queue + history), `tasks_registry`, `clock_sessions`,
  `intent_history`; writes off-device intents (`tags._src='sidecar'`, `_off=true`),
  a phone clock (own open session → `browser_profile_status` + closed `clock_sessions`),
  and registers the phone as its own `browser_profiles` mobile surface.
- Auth: Google OAuth + magic link (web flows, no chrome.identity). Redirect allowlist
  patched via Management API to add `/sidecar` URLs (existing entries preserved).
- Web Push: SW at `/sidecar/sw.js`, subscription capture → `push_subscriptions`
  (migration 030), edge fn `send-focus-push` (deployed + smoke-tested HTTP 200,
  `npm:web-push` + VAPID), pg_cron every-minute trigger (migration 031, key in Vault).
- Deploy: Cloudflare Worker `tabby-sidecar` on route `tabatha.pondocean.co/sidecar*`
  (Pages root site untouched — verified 200 on both). App renders login UI live.

**Key findings / decisions:**
- This worktree branched at v6.5.0; remote Supabase is at migration 029 (unmerged
  branches). Used placeholder-then-repair to push only 030/031 without phantom drift.
- Sync is push+pull-on-signin, not realtime → v0.0.1 is account-synced ("appears on
  the extension's next pull"); instant desktop round-trip deferred (user-chosen).
- `focus_items` is a synced subset (no live startedAt) → live countdown only for
  sidecar-created focuses (carry `_startedAt`).

**Next steps:** User to verify end-to-end on a phone (sign in → create intent → see it
sync → 1-min-timer push). Then v0.0.2: instant desktop realtime ingest, native
iOS/Android (Expo run), checkpoint-staleness pushes, richer stash/awareness.

**Autonomous verification + fix (same session):** minted a real user session for
mr@duckandshark.com (admin `generateLink` + `verifyOtp`) and ran the app's exact
RLS-scoped queries — **14/14 pass**. Caught + fixed a real bug: `browser_profiles`
upsert used `onConflict (profile_id,browser)` (a partial index ON CONFLICT can't
target) → device registration silently failed; switched to the full
`(profile_id,local_id)` index (the extension's own target) and redeployed. Push
pipeline confirmed: an expired sidecar focus was scanned by `send-focus-push` and
delivered to a **real registered device** (existing FCM subscription on the account).
**PR #23 → staging.** Asana Flux Development project update posted.

## 2026-07-17 (cont.) — Tabby Sidecar v0.1.0

Merged v0.0.1 PR #23 to staging (kept in the main repo — shares Supabase
schema/migrations). Built + deployed v0.1.0:
- **Full Focus parity:** edit (label/timer/stage/client/project/backdate),
  checkpoint notes + timeline (new `focus_checkpoints` table, migration 032),
  sub-intents (tags._parent), backburner dock (tags._backburner + snooze),
  on/off-computer toggle. **Pause now pins the current focus** at the top
  (AsyncStorage currentFocusId) instead of demoting to queue.
- **Clock:** "Your shift" (was "this phone's shift"); surfaces other devices on
  the clock. **off-device → off-computer** rename; create CTA dropped "(off-device)".
- **PWA:** manifest + icons + Apple meta injected post-export (scripts/build-web.mjs)
  → installable to Home Screen (unlocks iOS push). **Phone Focus Mode** via Page
  Visibility (leave-detection → nudge).
- **Push parity:** send-focus-push now covers timer + drift + checkpoint-staleness.
- **Fix:** browser_profiles upsert → (profile_id,local_id) full index.
Re-verified 4/4 new RLS paths (checkpoints + tag ops) with a minted session;
`tsc` clean on all new code. Deployed Worker (v0.1.0), edge fn redeployed.

**Sync-limit note:** checkpoints/sub-intents/backburner are Sidecar-side until the
extension syncs those fields — full desktop round-trip is the next extension slice.

## 2026-07-17 (cont.) — Tabby Sidecar v0.2.0 + showcase-update skill

- **Fixed** the pause→resume timer restart (freeze elapsed, shift start).
- **Shipped the landscape Context View** into `/sidecar` (real data via
  useFocus/useClock; auto-switch on large landscape; brand BL / day-countdown TR
  / time BM; giant focus + timer + up-next; view-only w/ toggle). Added a
  `dayResetHour` setting for the 1440 countdown.
- **Realtime** (migration 033): focus_items + browser_profile_status in the
  realtime publication; useFocus subscribes. Verified query OK + subscribe
  SUBSCRIBED via a minted session. tsc clean. Deployed v0.2.0.
- **Marketing site** (via background agent, verified live): homepage Sign-in
  button → /sidecar, /show reflagged "Tabby Sidecar · Shipped", roadmap cards
  added; branch pushed.
- **New skill** `.claude/skills/showcase-site-update` — checklist-driven updates
  to the existing showcase site (tiles/roadmap/search-index/version/deploy/verify)
  so "Update the */show with…" lands everywhere and ships safely.

## 2026-07-18 — Tabby Sidecar v0.2.1 (phone-away accountability)

Phone Focus Mode now broadcasts a `focusAway` signal to
`browser_profile_status.metadata` on navigate-away; the Context View (realtime)
turns red ("Put the phone down") with a slow fade-in (~7s), or immediate via a
new Settings toggle `focusAwayImmediate`. Cross-device path verified 2/2 under
RLS with a minted session; tsc clean; deployed v0.2.1. Mockup updated with a
"📵 Phone away" preview.

## 2026-07-18 — Persona ops: System Map + Feature Matrix + Plan 040 vet (CeeCee orchestrating)

Operating model live: CeeCee (CC1) orchestrates; named players on real Asana tasks.
- **Argus** → docs/system-map/SYSTEM-MAP.md (Asana 1216678592681467; posted own
  comments via `asana-cli --as argus`). Top risks: dist/ landmine (6.8.2 unreviewed
  Koda build on the Chrome load-unpacked path while user believes 6.7.22), two
  divergent staging lines (local 6.7.8 vs origin 6.6.0; extension run never pushed),
  prod stuck behind update channel (swap-step bug; fix on fix/updater-swap 6.7.24),
  6.8.x version tangle, 11 prunable branches + 2 stale worktrees. 8-step GitHub
  restoration plan PROPOSED (not executed). Daily update: scheduled cloud agent rec.
- **Cirra** → docs/FEATURE-MATRIX.md (Asana 1216678675876448; comments relayed).
  124 rows / 8 domains × 6 surfaces + update-in-same-commit protocol. Top gaps:
  checkpoints don't round-trip, per-task time is widget-only, Sidecar tasks bare,
  voice missing on Sidecar, team/org extension-only.
- **Koda** → Plan 040 vet (Asana 1216678720421332; comment relayed). 8/13 proceed,
  5 revise (B1 pause-ownership, E2/E4 Sidecar-only time label, E3 relation table +
  conflict strategy, E8 dedup v2, E9 settings write-race). Delegation lanes decided
  (addendum 5): sequential ContextView lane, parallel 1/5/7(+10), design gates 3/9,
  design-first 8. Deeper collaboration: YES.

## 2026-07-18 (cont.) — Wave 1 shipped: Sidecar v0.3.0 + repo restoration

Fleet outcomes (all verified by CeeCee before ship):
- Merged Rook (4f0b4fa), Cirra (13d79bc), Cindra (2c24803/68e66cf/4597744);
  resolved SettingsScreen + ContextView conflicts; tsc clean; bumped 0.3.0;
  deployed Worker 4d72371c. Edge fns: send-focus-push (focus_away pass, Cindra's
  per-episode dedup) + feedback-to-asana (CORS widened to sidecar origin,
  ASANA_PAT/ASANA_PROJECT_GID secrets set) both deployed; preflight verified.
- Kael: PRs #27-#31 → origin/staging 6.7.27 (verified), dist 6.7.24 (verified),
  main untouched (verified). Blocker queued: feat/companion-update-manifest +
  feat/site-sidecar-promo are stacked on Koda's widget commits — needs Koda
  carve-out or cherry-pick (follow-up task for Koda).
- Aegis (Haiku) board monitor cycling every 30m; Argus/Hermes updater in flight.

## 2026-07-18 (PM) — CeeCee: Plan 040 execution wave (Sidecar 0.4.2→0.7.0, ext 6.7.32→6.7.34, companion 0.3.1)
- **Goal:** continuous Plan 040 execution with the persona fleet; Malkio directives folded in live (extension tracking, extension deploy, watch app, voice check-ins).
- **Shipped Sidecar:** 0.4.2 (useRef hotfix), 0.4.3 (extend/snooze as focus_events + ⏳ CV timeline nodes, mig 039), 0.5.0 (Epic 9 RPC writers + CV prefs, Epic 8 nudges card), 0.6.0 (Epic 3 U5 Tasks view + Asana connect; CrashGuard; PWA stale-bundle auto-reload; surfaced write errors), 0.6.1 (CV title-col clip fix from Rook visual QA), 0.6.2 (build --clear guard), 0.7.0 (proactive voice check-ins v1, Addendum 7).
- **Migrations applied:** 035 (task sync foundation), 036/037 (push_log + nudge cron), 038 (update_profile_settings RPC), 039 (extend/snooze kinds). Edge fns deployed: send-focus-push (batched), send-schedule-nudges, connect-asana, asana-webhook, sync-asana-tasks.
- **Extension:** staging 6.7.31→6.7.34 (Epic 9 CV customization card 6.7.32; companion HELLO pairing client 6.7.33; changelog 6.7.34). Chrome dist at 6.7.34; both update channels published + hash-verified (Koda).
- **Companion:** PR #1 (WS Stage-2 handshake auth, Cindra) security-reviewed line-by-line by CeeCee, merged → 0.3.1, 105/105 tests. Distribution hold lifts once 0.3.1 installers built.
- **Incidents:** (1) "stuck Sidecar" — stale PWA running broken v0.4.1 bundle; fixed via CrashGuard + freshness auto-reload; (2) routeless skeleton deploy — shared Metro cache (node_modules/.cache via junctions) poisoned by concurrent dev-server; fixed via --clear in build script + mandatory local bundle preflight before deploy.
- **In flight:** Soren (Opus) — Tabby Watch (Plan 041, Galaxy Watch 6 / Wear OS, own repo tabatha-watch); Argus — /show milestone update.
- **Next:** integrate Soren's watch deliverable; extension-side voice/checkpoint sync epics; Epic 3 v1.1 (due_on mapping, workspace name); flip STAGE1_COMPAT_WINDOW=false in companion 0.3.2 after HELLO rollout.

## 2026-07-19 (early AM) — CeeCee: feedback-batch closeout (Sidecar 0.8.1, ext 6.7.37, companion 0.3.2, watch 0.2.0, screensaver 2.1.0)
- **Malkio feedback batch, all shipped:** CV overtime-timer clip fix (0.7.2); backburner in/out as focus_events + 🔥/▲ timeline nodes + checkpoint-stream interleave (mig 041, 0.8.0); cold-load lag fixed via hydrate-then-revalidate profile cache + parallelized fetches, 68% waterfall cut (0.8.1, Rook); `?view=context`/`?embed=desk` embed mode with neutral TABATHA branding (0.8.0); companion **Desk View** tray window at the embed URL + always-on-top (0.3.2, merged); Flux Refocus screensaver **Tabatha Context View mode** (2.1.0, merged — hardened webview, offline flip-clock fallback, one-time sign-in partition); /show full Sidecar page (12 cards) + Tabby Watch page (8 cards, sideload-beta framing) at 6.7.36; companion download panel → public-mirrored, hash-verified 0.3.1 installers at 6.7.37 (Argus caught the private-repo 404 trap).
- **Watch:** pairing-gap incident — v0.1.x had redeemPairingCode with NO UI caller (Malkio caught on-device). v0.2.0 ships the Pair screen (first-item affordance, number pad, live-mode swap, 27/27 tests incl. routing pair + live endpoint 4xx test); CeeCee independently verified wiring in source. New permanent fleet rule recorded in memory: reachability proof (artifact grep + entry-point evidence) required before accepting any user-facing "done". Also v0.1.3 targetSdk 35 = Watch 6/7/8 forward-compat.
- **Companion 0.3.1 released** (NSIS+MSI, hash-verified, updater artifacts disabled pending signing key) — distribution security hold LIFTED; public mirror release desktop-v0.3.1 on MrMalkio/tabatha.
- **Pending Malkio:** sideload watch v0.2.0 + pair; optional 0.3.2 companion build for his machine; signing-key decision.

## 2026-07-20 — CeeCee: gusto wave 2 closeout (Sidecar 0.11.0, ext 6.7.44 → production)
- **Sidecar 0.9.0→0.11.0 all live:** invite signups (gate + mint card; Demo/Personal/Team remodel, migs 042-044, account_type stamp; E2E-proven incl. bad-code zero-trace), TV "Sign in with a code" (pair-watch reuse; Malkio-verified on his TV), provider-aware login (dead Google button guard — provider is OFF at auth layer), Pomodoro timer mode (pure lib, view-only over sacred timing), device management (naming at pairing, remote sign-out w/ real session revocation via device-signout fn, pause screens, per-device settings plumbing; mig 045).
- **Extension 6.7.43 round-trip parity** (Cirra): focus_events emission map, checkpoint two-way sync, sub-intent nesting + backburner grouping, switch-bug fix — dist + both channels published. 6.7.44 = reconcile stamp.
- **Companion 0.3.4** built+swapped onto Malkio's machine (Desk View live in tray), released + public mirror + manifest (update system's first announce target). 0.3.3 update detect/notify/freeze merged prior.
- **CWS path 1 activated** (Rook): pipeline merged (6.7.42), store zip validated; creds absent on this machine — Malkio says account paid/set up previously; hunt continuing. **/docs live** incl. screensaver guide (6.7.41). **Designs Koda-vetted:** #208 Smart Deferral (2 revisions incl. dismissed-vs-resolved deadlock catch) + super-admin console — **renamed Olympus/flux-olympus** (argus collision confirmed real).
- **Production: main = v6.7.44 tag** (second full-line promote).
- **Hazard log:** shared sidecar worktree had TWO more cross-agent commit sweeps (both self-recovered); worktree is over-subscribed — future waves should default to per-agent worktrees.
- **Pending Malkio:** CWS one-time steps (OAuth client/consent + first private-to-domain listing) unless creds found; Olympus open questions (billing writer, demo org_create default); Google provider enablement decision.
