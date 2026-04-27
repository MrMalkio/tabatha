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
