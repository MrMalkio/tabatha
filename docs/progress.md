# Tabatha — Progress & Worklog

> Continued from `v0_legacy/docs/progress.md` (Sessions 001-005).
> This file tracks progress from v1.0.0-alpha onwards.

---

## Session 006/007 — 2026-04-24 (React Migration & Full Build)

**Agent:** Antigravity (Claude Opus 4.6 Thinking)
**Duration:** ~45 min
**Goal:** Migrate to React + Vite + TailwindCSS v4, establish Pop Art/Glassmorphism design system, build core components and dashboard

### What Was Done

- [x] **Repository Reorganization**: Moved entire vanilla JS codebase to `v0_legacy/` folder
- [x] **Vite + React Setup**: Initialized fresh Vite + React project in root
- [x] **Dependencies Installed**: React 19, TailwindCSS v4, Framer Motion
- [x] **Design System**: Created `docs/design.md` — formal protocol with Pop Art + Corporate themes
- [x] **Theme Architecture**: Built CSS variable system with `[data-theme]` switching
- [x] **Multi-page Config**: `vite.config.js` configured for Home, Sidebar, Popup, Background, and Gatekeeper entry points
- [x] **Manifest v3**: Updated `public/manifest.json` to v1.0.0 targeting Vite output paths
- [x] **Core Hooks**: Created `useChromeStorage` (reactive state sync), `sendMessage` (background comms), `useTheme` (theme switching)
- [x] **UI Components**: Built `GlassCard` and `PopButton` with theme-adaptive styling
- [x] **FlipClock Port**: Full port of Refocus 3D split-flap clock from TypeScript to React JSX (all countdown modes, settings, pulse animations)
- [x] **Home Dashboard**: Complete rebuild with FlipClock at top, intent/focus bar with shake animation, 3 nav panels (Time, Tabs, Contexts), category breakdown, active sessions list
- [x] **Sidebar**: Full tab list with priority dots, search, context groups, Framer Motion transitions
- [x] **Popup**: Quick-switch panel with fuzzy search, MRU sorting, staggered entry animations
- [x] **Build Verified**: `npm run build` succeeds cleanly — all assets compile to `dist/`
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
├── dist/                    # Built extension (load unpacked here)
├── public/manifest.json     # Chrome Extension manifest
├── src/
│   ├── hooks/               # React hooks (storage, theme)
│   ├── components/
│   │   ├── ui/              # GlassCard, PopButton
│   │   └── clock/           # FlipClock + CSS
│   ├── home/                # New Tab override
│   ├── sidebar/             # Side panel
│   ├── popup/               # Toolbar popup
│   ├── background/          # Service worker
│   ├── content/             # Content scripts
│   └── styles/              # Global CSS + themes
├── v0_legacy/               # Frozen v0.1.x codebase
├── docs/                    # Design system + progress
└── vite.config.js           # Multi-page build config
```

### Next Steps
- [ ] Load `dist/` as unpacked extension in Chrome and verify all pages mount
- [ ] Test theme switching (Pop Art ↔ Corporate)
- [ ] Wire live `chrome.storage` data to the background service worker
- [ ] Build Settings page for clock configuration
- [ ] Implement Zero-Integration URL parsing engine

---

## Session 012 — 2026-04-27 (InPop 2.0 + Intents Dashboard)

**Agent:** Antigravity  
**Goal:** InPop overhaul, Intents panel, preset management, settings wiring

### What Was Done
- [x] InPop 2.0 rewrite (presets, threading, Later button, action subtext, tooltips)
- [x] Intents tab on homepage (expand/collapse, rename, focus actions)
- [x] Persistent preset management in Settings > Intent-Popup
- [x] Settings wiring: gatekeeperEnabled, autoAssociateTabs
- [x] BlockGate site blocking (content script + backend + settings panel)
- [x] Unified Task URL Resolver (Asana V0+V1 + ClickUp — 23 patterns)
- [x] Supabase schema migration (8 tables + RLS)
- [x] User Manual created at `docs/user-manual.md`

---

## Session 013 — 2026-04-27 (InBar + Clock In/Out + Bug Fixes)

**Agent:** Antigravity  
**Goal:** InBar, InPop bug fix + strict mode, Clock In/Out, NowBar, homepage layout

### What Was Done
- [x] **Bug fix:** InPop blur-without-popup on pages where body doesn't exist at document_start
- [x] **InPop strict/relaxed mode** — strict blocks page, relaxed adds Dismiss
- [x] **Blur strength config** — 0-30px slider in settings
- [x] **InBar (Intent Bar)** — 24px bottom/top bar showing intent, task, timers, pushes page
- [x] **Clock In/Out** — homepage module with live H:MM:SS timer, break toggle, history
- [x] **NowBar** — shows highest-priority focus item on homepage
- [x] **Homepage layout** — clock moved to header center, reduced whitespace
- [x] **Priority ranking** — 1-10 scale on focus items, color-coded badges
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
| v0.1.0 | 2026-02-10 | Phase 1 — Core Foundation |
| v0.1.5 | 2026-02-12 | Phase 1.5 — User Enhancements |
| v0.1.0-alpha | 2026-04-23 | Flip Clock, Active Sessions, Zero-Integration |
| v1.0.0-alpha | 2026-04-24 | React + Vite migration, Pop Art/Glassmorphism UI, full component build |
| **v0.2.0-alpha** | **2026-04-27** | **InPop 2.0, Intents panel, BlockGate, Supabase schema** |
| **v0.2.1-alpha** | **2026-04-27** | **InBar, Clock In/Out, NowBar, strict mode, priority system** |

---

## Session 011 � 2026-04-27 (Logs Panel & Theme Refactor)

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
- [x] **Settings Sync section**: Full refactor to useAuth � profile card, linked identities, org/team display, invite token redemption with inline banners.
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
- [x] **InBar "No intent" fallback**: InBar now always shows when enabled, displaying "No intent set � click to set" prompt when no focus/context is active
- [x] **InBar nub toggle**: Close button now collapses to a tiny 20px circle nub instead of fully removing; click to re-expand
- [x] **InBar notes panel**: Added ?? button that expands a quick-note panel for jotting thoughts about the current focus/task/intent � auto-saves with debounce
- [x] **Background handlers**: Added SAVE_INBAR_NOTE and GET_INBAR_NOTES message handlers for persistent note storage
- [x] **Tabs layout fix**: Active tabs now in 2-column grid at top; recently closed moved to compact list below with trimmed domains
- [x] **Clock container fix**: Changed from flex: 1 1 auto to 0 0 auto with minimal padding � container now shrinks with clock scale
- [x] **Focus input feedback**: Added pending/loading state to Set Focus button so users see feedback when clicking

---

## Session 015 � 2026-04-29

### Goal
Build the Asana Time Tracker Widget (Flux plugin) � end-to-end from spec to working server.

### Work Done
- [x] **Design spec created**: Full v1 spec covering Asana widget API constraints, 3 widget states (tracking/idle/empty), modal form designs, and data architecture
- [x] **Express server built** (`flux-asana-widget/`): Routes for widget metadata, form metadata, form submit, and OAuth auth
- [x] **Supabase schema** (migration 004): `flux_time_entries` table with computed duration, uniqueness constraints, and performance indexes
- [x] **Migration applied** via Supabase CLI (`npx supabase db push`)
- [x] **SSL certs generated** for HTTPS (required by Asana)
- [x] **Lazy Supabase init**: Server boots cleanly even without `.env` configured (mock mode)
- [x] **Security middleware**: Request expiry validation and optional HMAC-SHA256 signature verification
- [x] **CORS**: Locked to `app.asana.com` origin
- [x] **End-to-end tested**: Start timer (Alice), start timer (Bob), stop timer (Alice), verify multi-user widget state � all passing against live Supabase

### Key Findings
- Asana widgets are JSON-only � one template (`summary_with_details_v0`), no custom HTML/CSS/JS
- Interactions happen via Modal Forms (entry point click), not widget buttons
- `datetime_with_icon` fields auto-format relative time in Asana UI
- Computed `duration_s` column avoids needing to calculate in application code

### Next Steps
- Register the app in Asana Developer Console (https://app.asana.com/0/my-apps)
- Configure Widget Metadata URL, Form URLs, and Entry Point label
- Add proper user name resolution via Asana API (currently uses GID suffix)
- Consider v1.1: manual time entry form for retroactive logging
- v1.2: Tabatha browser integration � auto-track from browser focus state

### 2026-04-29 � InPop/InBar/Asana Fixes
**Goal:** Fix InPop common list clicks, InBar visibility, and Asana URL auto-intent

**What was done:**
- [x] Fixed SET_TAB_CONTEXT � now auto-creates tab entry if missing (InPop preset clicks were silently failing)
- [x] Fixed SAVE_INBAR_NOTE � corrected equest vs message variable name bug
- [x] Rebuilt extension � InBar build was stale (old version without nub/notes/discovery state)
- [x] Added Asana URL auto-intent in CHECK_CONTEXT_NEEDED � detects app.asana.com task URLs and extracts task name from page title
- [x] Added Asana auto-intent in onTabUpdated � catches the race condition where gatekeeper fires before title loads
- [x] Verified all InPop message handlers exist in background.js switch statement

**Key findings:**
- InBar was invisible because dist/assets/inbar.js was stale (old build without nub/notes)
- InPop common preset clicks DID call closeOverlay() but SET_TAB_CONTEXT silently failed if tab data wasn't created yet
- SAVE_INBAR_NOTE used equest instead of message � would always crash

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
- [x] **Mini-prompt** � on pause click, expanding amber-tinted panel asks "Where did you leave off?"
- [x] **Sticky note overlay** � large tilted paper-textured note appears on page (non-obstructive, pointer-events only on note)
- [x] **Paused bar state** � InBar transitions to amber tint with "? PAUSED � note preview..." + inline Resume button
- [x] **Nub state** � collapsed nub shows amber ? when paused
- [x] **Persistence** � pause state stored in `chrome.storage.local.pausedIntents[tabId]`, survives page reload
- [x] **Resume flow** � resume from sticky note, inline bar button, or pause button. Clears storage + restores bar.
- [x] **Edit note** � sticky edit button expands pause prompt pre-filled with existing note
- [x] **Timer freeze** � intent timer stops ticking while paused

### Key Findings
- Decomp branch `refactor/service-arch` is code-complete (6 commits, 13 service modules, all 62 handlers extracted, build passes) but NOT merged to master
- The branch is named `refactor/service-arch`, not `codex/service-arch` as documented
- All pause state managed via `chrome.storage.local` � no background.js changes needed for MVP
- Sticky note uses CSS paper gradient + random tilt (-3� to +3�) + tape pseudo-element

### Decisions
- Used `chrome.storage.local` directly from content script (avoids needing new background handlers)
- Deferred: auto-park on close, PAUSE_INTENT handler, time tracking cascade � all need post-decomp backend work
- Deferred: Settings UI for pause (enable/disable, style picker)

### Next Steps
- Merge decomp to master ? rebase ? begin Phase 3 (Follow-Through data model + service handlers)
- Or: BlockGate settings UI enhancements (reasons, custom text, delayed unblock)
- Or: InBar settings section (element visibility toggles, progress bar config)
