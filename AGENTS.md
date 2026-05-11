# Agent Instructions — Tabatha

> This project uses **Headbox** for standardized agent instructions.
> All agents (Claude, Gemini, Codex, Cursor, Copilot, etc.) follow the same rules below.

---

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- HEADBOX v0.1.0 | Main: v0.1.0 | Uses: 5 | Status: active          -->
<!-- Owner: Malkio | Workspace: c:\Users\mrmal\Le Dev\Tabatha            -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

## Project State

- **Current version:** 3.0.0-alpha
- **Current focus:** Follow-Through Engine — Phase 2 complete, Phases 3-6 blocked on monolith decomp
- **Architecture:** React 19 + Vite 8 + TailwindCSS 4, Chrome MV3 Extension, Framer Motion
- **Dev command:** `npm run dev`
- **Build command:** `npm run build`
- **Port:** 5173 (Vite default)

---

## Mission

Tabatha is a **Context-Driven Tab Manager** — an "Attention Operating System" for the browser. It enforces intentional browsing by assigning Context and Intent to every tab, tracking time, and providing focus tools. Part of the Flux ecosystem.

---

## Workspace Map

See `.headbox/workspace-map.md` for the full project file tree.

---

## Critical Files

| File | Purpose | When to read |
|------|---------|-------------|
| This file (`AGENTS.md`) | Project state, rules, session log | Always — first thing |
| `.gemini/agent.md` | Gemini-specific instructions (known bugs, architecture, message types) | When working with Gemini |
| `docs/progress.md` | Session progress log | Before starting work — check last session's next steps |
| `ROADMAP.md` | 6-phase feature roadmap | When planning features |
| `Tabatha_Concept.md` | Core philosophy — "Attention Operating System" | When making architecture decisions |
| `Tabatha_Changelog.md` | Version history | When tracking what's changed |
| `src/App.jsx` | Main React entry | When touching app structure |
| `public/manifest.json` | Chrome MV3 manifest | When changing permissions/pages |
| `vite.config.js` | Multi-page build config | When adding pages or changing build |

> 📎 More files added as they become frequently used. Reviewed at 20th-use.

---

## Approach Protocol

1. **Read this file first.** Check project state, current focus, session log.
2. **Check `.headbox/sticky-notes/`** for notes from other agents.
3. **Check `.headbox/workspace-map.md`** if you need structural context.
4. **Check `docs/progress.md`** for last session's next steps.
5. **Work incrementally.** Small commits, testable changes.
6. **Practice progressive disclosure.** Read what you need, drill deeper only when necessary.

---

## Global Rules

1. **Always commit before ending a session** — use `wip:` prefix if incomplete. Before closing, **ask the user if the session is over** so nothing is left uncommitted.
2. **Follow Conventional Commits** — `{type}({scope}): {description}`
3. **Never push directly to `master`** — always via PR or explicit human approval.
4. **When in doubt — always ask.** Surface ambiguity early, propose a direction, confirm before acting.
5. **Stay on task.** If you notice something unrelated, **Valet it** (see Valeting below).
6. **On `checkpoint`** — update any known task(s) with progress and reference artifacts.
7. **Practice progressive disclosure.** Do NOT read every file. Read what you need.
8. **Check `.headbox/sticky-notes/`** at session start for notes left by other agents or humans.
9. **Number Implementation Plans** — Always uniquely name your implementation plans with a version number (e.g. `implementation_plan_011.md`). Not uniquely naming them will overwrite other files in the same project.

---

## Local Rules

- **Update `docs/progress.md`** at the end of every session with: date, goal, what was done, key findings, decisions, next steps.
- **Update `Tabatha_Changelog.md`** when shipping version changes.
- **Legacy code in `v0_legacy/`** — reference only. Do not modify. All new work happens in `src/`.
- **Multi-page build** — Tabatha has separate HTML entry points: `index.html`, `home.html`, `popup.html`, `sidebar.html`, `settings.html`. Changes to build config affect all of them.
- **Chrome extension context** — always test changes by loading unpacked at `chrome://extensions` and checking the Service Worker console.

---

## Valeting (Parking Lot Protocol)

When you notice something that is **not part of your current task**, do not act on it unless it's obligatory. Instead, **append** an entry to `.headbox/parking_lot.md`:

```
## {date} — {brief_title}
- **Noticed while:** {task}
- **What:** {observation}
- **Why it matters:** {impact}
- **Options:**
  1. {option_a}
  2. {option_b}
  3. {option_c} ← **suggested**
```

**Mechanics:**
- **Append only.** Never rewrite the parking lot.
- Before appending, scan existing headers only to check for duplicates.

---

## Checkpoint Protocol

When the user says **`checkpoint`** or you reach a natural stopping point:

1. Update all known task(s) with a progress comment.
2. Include: what was done, what's next, references to artifacts with file paths.
3. If no task is known, ask the user if there's one to associate.

---

## Session Handoff Protocol

**After every session, update the Session Log below.**

- **Append** a new entry. **Never delete** previous entries.
- **Increment the usage counter** in the headbox header by 1.
- **On every 20th use**: ask the user if anything should be updated.
- You MAY update `Current version` and `Current focus` in Project State.
- **Sync all vendor files** — after updating `AGENTS.md`, ensure `CLAUDE.md`, `GEMINI.md`, and `.gemini/agent.md` have the same headbox section.

---

## Session Log

| Date | Agent | Focus | Work Done | Next Steps |
|------|-------|-------|-----------|------------|
| 2026-04-27 | Antigravity | Headbox install | Pilot install — scaffolded .headbox/, appended headbox section to AGENTS.md and .gemini/agent.md | Begin Phase 2 feature work |
| 2026-04-27 | Gemini | Update Project State | Updated AGENTS.md Headbox Project State to reflect completion of Phase 2 features and shift to Phase 3/4 (v0.2.1-alpha) | Proceed with Phase 3/4 feature development |
| 2026-04-28 | Antigravity | Logs Panel & Theme Refactor | Finalized Link/Merge modal, Tabs actions, Logs Panel, Settings Walkthrough, and Theme expansion. | General backlog (Sync logic, Supabase) |
| 2026-04-28 | Antigravity | Supabase Sync Engine | Pushed Supabase schema, configured client, and hooked up debounced sync wrapper to background focus & intent mutations. | Implement user authentication (Auth Refinement) |
| 2026-04-29 | Antigravity | Asana Time Tracker Widget | Built Flux Asana widget server (Express/HTTPS), migration 004 (flux_time_entries), full e2e test passing. | Register app in Asana Developer Console, add user name resolution |
| 2026-05-09 | Antigravity | Diagnostic Fix Sweep | Fixed 14/16 diagnostic issues + root cause (missing type:module in manifest). Added logger service, debug mode setting, Developer panel in settings. All sendMessage errors now logged. | Architecture refactor (background.js monolith), version automation |
| 2026-05-09 | Antigravity | Clock Extraction + InPop + Work Shifts | Fixed InPop (contextSource tracking, inherited vs user contexts). Extracted clock.js + storage.js from monolith. Built Work Shifts page (3 views, stubbed analytics). Added last session + work logs to home. Fixed InBar "set intent" button (OPEN_POPUP handler). Added UPDATE_FOCUS editing. Implemented Chrome tab groups bidirectional sync. Built URL Rules settings section (3 tabs: rules, domain groups, intent changelog). URL rules auto-apply on tab creation. Sidebar parity (groups panel, work shifts link). | BlockGate enhancements, InBar customization, debug bar expansion |
| 2026-05-10 | Antigravity | Intent Bugs + Tasks + Idle | Fixed tab-to-intent association (label matching). Rewrote LinkMergeModal. Added funnel stage editor. Built TasksPanel with full CRUD. Compact LogsPanel filter bar. Idle auto-break (5min→break, auto-resume). Welcome Back flash overlay. Work schedule view. Break notes. Bumped to v0.2.8. | Sidebar tasks parity, InBar customization settings, BlockGate reason/guard |
| 2026-05-10 | Antigravity | Follow-Through Engine + Worktree | Phase 1: homepage declutter (stint terminology, clock bar merge, footer). Phase 2: ComboInput autocomplete, enhanced TagPicker with Self client, FocusInput realm/tags, FocusBar + Intent button. Sidebar tasks panel parity. Established worktree isolation (`Tabatha\` = Antigravity, `Tabatha-service-arch\` = Codex). Created next-agent handoff prompt. | Wait for decomp merge → Phase 3 (Follow-Through data model), or UI-only safe work (InBar Pause scoping, BlockGate settings) |
| 2026-05-10 | Antigravity | InBar Pause + Sticky Note | Built pause button + mini-prompt + sticky note overlay in InBar content script. Pause state persisted to chrome.storage.local per tab. Sticky note: paper texture, tilt, tape, resume/edit buttons. Bar transitions to amber PAUSED state. No background.js changes (safe during decomp). Decomp `refactor/service-arch` is code-complete (13 services, all handlers extracted) but not yet merged. | Merge decomp to master → rebase → Phase 3 (Follow-Through data model + handlers). Or: BlockGate settings UI, InBar settings polish |
| 2026-05-10 | Antigravity | Desktop Companion Build | Scaffolded tabatha-desktop repo (Tauri 2.x). Built 5 Rust modules: window_monitor (Win32 APIs), activity_log (SQLite), categorizer (50+ apps), ws_server (:9147), main (tray orchestrator). React debug UI. Installed Rust 1.95 + VS Build Tools. Binary compiles and WS server verified end-to-end. Built extension-side CompanionBridge + CompanionStatus.jsx. Idle handler augmented to suppress false-idle when user active in other apps. | Test live window monitoring, build UnifiedTimeline UI, Supabase app_activity migration |
| 2026-05-10 | Antigravity | Bug Fix Sweep + Task CRUD | Halved corner radius globally (sm:2, md:4, lg:8). Fixed InBar label fallback to activeFocus.label. Made FlipClock responsive (overflow:hidden, flexWrap, 5px margin). Task delete confirmation. Task inline editing (name+desc). Start-intent-from-task button. Link-task-to-intent button + LinkMergeModal type='task' support. CompanionStatus wired into homepage header. | Cross-view focus sync debug, shadcn/ui migration, merge decomp branch |

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- END HEADBOX                                                        -->
<!-- ═══════════════════════════════════════════════════════════════════ -->
