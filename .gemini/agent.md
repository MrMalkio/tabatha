# Agent Instructions — Tabatha

> This project uses **Headbox** for standardized agent instructions.
> All agents (Claude, Gemini, Codex, Cursor, Copilot, etc.) follow the same rules below.

---

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- HEADBOX v0.1.0 | Main: v0.1.0 | Uses: 19 | Status: active         -->
<!-- Owner: Malkio | Workspace: c:\Users\mrmal\Le Dev\Tabatha            -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

## Project State

- **Current version:** 6.7.7
- **Current focus:** Cortex program (Plans 039/040-044) on top of staging v6.6.0 (NB-03 to NB-09 merged in: time-editing overhaul, offline-gap detector, abandoned stints, work-shifts analytics, settings search). Phase 1 browser-regression-verified; Phases 2-5 partial (companion capture on tabatha-desktop feat/cortex-capture; voice v0 + self-correction shipped). Awaiting Malkio: extension RELOAD + re-smoke-test -> v7.0.0, companion merge/deploy, proxy secret. See docs/cortex/HANDOFF.md.
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
| `docs/parallel-development-workflow.md` | Worktree, branching, zone ownership, merge strategy | When creating implementation plans — mandatory parallelability review |

> 📎 More files added as they frequently used. Reviewed at 20th-use.

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
3. **Never push directly to `staging` or `main`** — always via PR or explicit human approval. (`staging` is what was previously named `master`; `main` is production.)
4. **When in doubt — always ask.** Surface ambiguity early, propose a direction, confirm before acting.
5. **Stay on task.** If you notice something unrelated, **Valet it** (see Valeting below).
6. **On `checkpoint`** — update any known task(s) with progress and reference artifacts.
7. **Practice progressive disclosure.** Do NOT read every file. Read what you need.
8. **Check `.headbox/sticky-notes/`** at session start for notes left by other agents or humans.
9. **Number Implementation Plans** — Every implementation plan must carry a unique number AND a descriptive suffix in its **document title/heading** (e.g. `# Implementation Plan 019: Distribution Strategy`). Register the number in `.headbox/plan-registry.md` before writing. Never reuse or overwrite an existing plan number.
10. **Version in Implementation Plans** — Every implementation plan must state the **current version** and the **expected target version** upon completion.
11. **Maintain Plan Registry** — After creating any implementation plan, **append** an entry to `.headbox/plan-registry.md` with: number, suffix, date, conversation topic, and status.
12. **Parallelability Review** — After completing an implementation plan, **read `docs/parallel-development-workflow.md`** and append a `## Parallelability Review` section to the plan covering: zones touched, shared files modified, conflicts with active worktrees, whether it can run parallel, max branch lifetime, and scope-split points if >1 week. This is the final step before requesting user approval.
13. **Honest Plan Progress** — Never mark a plan `superseded`. If work was done through other means, credit it and update the progress fraction. Plan statuses are: `draft`, `partial (X/Y)`, `completed`, or `archived`. At every `checkpoint`, update the status of the associated plan(s) in `.headbox/plan-registry.md` with the current progress fraction.

---

## Local Rules

- **Update `docs/progress.md`** at the end of every session with: date, goal, what was done, key findings, decisions, next steps.
- **Update `Tabatha_Changelog.md`** when shipping version changes.
- **Legacy code in `v0_legacy/`** — reference only. Do not modify. All new work happens in `src/`.
- **Multi-page build** — Tabatha has separate HTML entry points: `index.html`, `home.html`, `popup.html`, `sidebar.html`, `settings.html`.
- **Chrome extension context** — always test changes by loading unpacked at `chrome://extensions`.
- **Build → Load constraint (critical):** Chrome's "Load unpacked" is pinned to ONE fixed path and **cannot be re-pointed**:
  `C:\Users\mrmal\Le Dev\Tabatha\dist` is the only folder Chrome loads.
  Active dev usually lives in a feature worktree, **not** the main dir (which is `staging` and may be behind).
  Before editing or building:
  1. Run `git worktree list` and check `public/manifest.json` in each worktree to find the active line. Ask the user which branch to target if unsure.
  2. `public/manifest.json` is the version source of truth — `npm run build`'s prebuild runs `scripts/sync-version.mjs` from it. Building in the main dir stamps **staging's** version into the dist, which looks like a downgrade.
  3. If you built in a worktree, mirror **atomically**: stage the new dist beside the target, then swap via rename (`scripts/swap-dist.mjs` pattern) — NEVER remove-then-copy. Chrome drops unpacked extensions whose dir is invalid at startup (root-caused 2026-07-10).
  4. Worktrees don't share `node_modules`. Create a directory junction (`New-Item -ItemType Junction`) from the worktree's `node_modules` to the main dir's to build without a full install. Remove the junction with `cmd /c rmdir` — **never** `Remove-Item -Recurse`, which would delete the target.
  5. **After replacing/rebuilding `dist`, the unpacked extension MUST be reloaded at `chrome://extensions` (↻).** A stale MV3 service worker running against swapped assets makes every `sendMessage` hang — symptoms: dead home-page buttons, "⏳ Setting…" stuck forever. (Root-caused via real-browser regression 2026-07-10; the code was healthy.) Note for automated tests: Chrome 137+ ignores `--load-extension` — load via CDP `Extensions.loadUnpacked` with `--enable-unsafe-extension-debugging`.
  6. **Never force-kill Chrome** (`taskkill /F`) in scripts — a 'Crashed' exit triggers Chrome's startup extension-GC pass, which can DELETE the unpacked extension entry (today's trigger). Close gracefully. Also: only ONE unpacked entry may point at the dist path — remove ghost/duplicate Tabatha cards at chrome://extensions.

---

## Valeting (Parking Lot Protocol)

When you notice something that is **not part of your current task**, append an entry to `.headbox/parking_lot.md`:

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
4. **Project Update Integration:** Checkpoints when made should also be applied to the Asana project [Flux Development](https://app.asana.com/1/9526911872029/project/1214031898449333/) (GID `1214031898449333`) as a Project update, which serves as the central Asana project for all things Flux family.
5. **Plan Registry Progress:** Update the associated plan(s) in `.headbox/plan-registry.md` with the current `partial (X/Y)` progress fraction.

---

## Implementation Plan Registry

See `.headbox/plan-registry.md` for the full list of plans. Always check this file before numbering a new plan.

---

## Session Handoff Protocol

**After every session, update the Session Log below.**

- **Append** a new entry to the Session Log.
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
| 2026-05-11 | Antigravity | InBar Edit + Retention + v3.12.4 | InBar edit dropdown (✏️ intent editing, focus assignment list, new focus creation). Separated tab intent vs central focus display. Data retention alarm (90d default, configurable). Auto-park paused tabs with note. Tab rename + Link Tab. Logs overhaul (8 types, filter chips, pagination). Version 3.12.4-alpha released to master. | InBar intent live-reload after edit, blocked/task log emission, browser retention setting |
| 2026-05-13 | Antigravity | Plan 022 + Sticky Notes | Diagnosed focus timer popup stacking (dual root cause: singleton overlay + context-timer re-arm loop). Reviewed all 8 feature requests from user. Created 8 sticky notes in .headbox/sticky-notes/ for post-refactor: popup stacking, popup harmony, timer new options (let me cook/snooze), video call idle suppression, sub-intents, parallel focuses, priority P1-P5, categories expansion, cross-window timer sync, deep activity logging. Fixed Headbox rule 9 (plan naming). Corrected plan version to 3.34.5-a → 3.42.9-a. | Execute Plan 022 after refactor lands |
| 2026-05-12 | Antigravity | Headbox Updates Extraction | Reviewed full thread history (534 log entries). Extracted 11 operational rules/preferences into `headbox_updates-003.md`. Topics: branch-first workflow, worktree isolation, parallel refactor safety, handoff prompts, full file paths in plans, debug gating, version parity, terminology glossary, scope doc versioning, isolated refactor tracks. | Review & apply pending-updates-003 rules to AGENTS.md + vendor sync |
| 2026-05-13 | Antigravity | Efficiency Audit + Plan 023 | Full ecosystem audit (extension, desktop companion, screensaver). Cross-referenced with Codex audit. Created Plan 023: Efficiency-Driven Decomposition. Assessed refactor/service-arch branch (57 behind, archive recommended). Registered Plan 023 in plan-registry. Collected user feedback on caps, privacy, branching, parallelization. Identified 4 branches + 1 stale worktree for cleanup. | Address user feedback (task files, branch cleanup, parallel strategy, storage key explainer). Execute Plan 023 after approval. |
| 2026-05-14 | Antigravity | Plan 023 Task 00: Pre-Decomp | Created docs/architecture/ (4 docs: decomp plan, service map, migration checklist, message contracts -- all master-aligned at 79 handlers). Wired version sync script (version:sync, version:check, prebuild). Synced all files to v3.34.5. Installed pre-commit hook. Removed stale worktree. Archived refactor/service-arch as tag. Created privacy-modes-future sticky note. | Confirm+delete feat/follow-through-engine + feat/v3-ux-overhaul branches, push tags, merge to master, begin Task 01. |
| 2026-05-14 | Codex | Plan 023 Task 02: Notification + Settings Services | Created `refactor/decomp-v2-communication` from `origin/refactor/decomp-v2-foundation`. Extracted `notificationService.js` and `settingsService.js`, registered both in the router, removed their legacy switch cases, scoped background broadcasts to extension-only vs InBar-relevant all-target delivery, updated architecture docs/checklists/semantic ledger, and verified `npm run build`. | Load unpacked extension and manually verify popup render, InBar data/notes, settings persistence, and service worker console broadcast scoping. |
| 2026-05-14 | Codex | PR 10 Review + Plan 023 Task 05D Router Finalization | Reviewed PR 10 (`refactor/decomp-v2-alarm`) with no blocking findings. Created `refactor/decomp-v2-router` from PR 10 head, reduced `background.js` to 171 lines, removed legacy fallback routing, moved activation/idle/notification/URL-lock/sync orchestration into services, added `syncService`, updated docs/ledger, and verified `npm run build`. | Manual unpacked-extension regression, merge PR 10, rebase/retarget router branch onto integration, then total semantic ledger and bump version after full regression. |
| 2026-05-14 | Claude (Opus 4.7) | PR #11 Review/Merge + Plan 023 Task 06 closeout | Reviewed PR #11 (`refactor/decomp-v2-router` → `refactor/decomp-v2`), merged via merge commit (`c7e4522`). On `refactor/decomp-v2-task06-cleanup` removed transitional `serviceFlags.focus.ready` stub from `tabService` + matching `services: { focus: { ready: true } }` injection in `background.js`; deleted dead local `autoQueueFromIntent` / `linkTabToFocus` fallback bodies and the now-unused `addFocus` helper. Tallied semantic ledger (no `breaking`, 1 `feature`, 3 `internal-schema`) → bumped `3.34.5` → **`4.0.0` (MAJOR, user override)** via `manifest.json` + `npm run version:sync`. Build green; `background.js` at 169 lines. | User to run the 9-step manual regression checklist (clock cycle, focus lifecycle, InBar, groups, blockgate, settings, markdown export, tasks, companion bridge); then open final PR `refactor/decomp-v2` → `master`. |
| 2026-05-16 | Antigravity | Workspace Deep Review & Cleanup | Deep review of repo state. Removed `Tabatha-alarm` stale worktree. Synced local `refactor/decomp-v2` with origin. Cleaned up 7 fully-merged local branches and 11 fully-merged remote tracking branches. Protected `fix/popup-harmony` as active Plan 025 feature track. Updated `docs/progress.md` with cleanup log. | Test and integrate Plan 025 (`fix/popup-harmony`), conduct full V4 regression |
| 2026-05-18 | Codex | Supabase Sync Batch 1 | Created `codex/sync-batch-1` from merged `refactor/decomp-v2`. Added migration 008 for org registry, clock sessions, and desktop activity tables. Extended syncService to push `tabathaOrg`, focus history, clock history, companion sessions, and desktop activity with diagnostics/watermarks. Bumped to v4.7.6 and verified build. | Apply migration 008 to Flux Supabase, load unpacked extension, hit Sync now, and verify Batch 1 tables populate. |
| 2026-05-26 | Antigravity | Mike Transcript Features | Done comprehensive reconciliation, created specs #203-#206, enriched existing features (#184, #188, #192) with transcript details. | Proceed with prioritized Phase 3/4 development |
| 2026-05-28 | Antigravity | Backburner & Smart Deferral Scoping | Designed and registered Feature #207 (Backburner) and Feature #208 (Smart Deferral & Splitting Engine). Updated index and backlog. | Initiate frontend / UI implementation planning for v0.3.0 |
| 2026-05-28 | Antigravity | Calendar Scoping & Plan 035 | Drafted Plan 035 detailed technical implementation plan (Unified Calendar, Month/Week/Day scheduling, Sidebar agenda, delta sync). Renumbered from 030. | Begin Phase 2 UI implementation (CalendarView, CalendarAgenda) |
| 2026-05-28 | Antigravity | v5.8.0 Stabilization + SectionNav | Code audit (3 bugs fixed), auto-checkpoint system, sub-focus UX, video call suppression, SectionNav hover-expand refactor with smart toggle. Bumped 5.7.2→5.8.0. | Regression retest v5.8.0, Plan 035 Calendar execution, Companion sync parity |
| 2026-06-04 | Claude (Opus 4.8) | Ghost-stint / concurrent-shift fix | Diagnosed 4 root causes (install identity not persisted, orphans never reconcile, stale filter counts dead installs, open stints not synced). Added migration 017 (local_id + machine_id + unique index on browser_profiles). Upsert on (profile_id, local_id) in syncService. New LIST_LIVE_STINTS/CLOCK_OUT_INSTALL/DISMISS_INSTALL/CLEAR_ALL_OFFLINE handlers in awarenessService. Live Stints panel in Work Shifts. isLiveConcurrent filter in home + sidebar. 26 unit tests for pure helpers (stintReconciliation.js). Promoted build/load constraint into AGENTS.md. | Apply migration 017 to Supabase, load 6.3.6 dist, verify Live Stints panel and ghost cleanup end-to-end |
| 2026-07-10 | Claude (Fable 5, overnight) | Cortex program expansion + Phase 1 T4–T6 | Expanded all 15 C1–C15 feature files to full specs (6 parallel subagents) + Drive mirror; closed 3 braindump gaps in program spec; authored+registered Plans 041–044 (next: 045). Shipped Phase 1 T4 capture I/O (captureVisibleTab + redaction canvas + partitioned Downloads writes + listeners + dwell/nightly-export alarms + retention), T5 (cortexService + CortexPanel dashboard + harness cron bundles + economize-workflow.v1 prompt), T6 (DATA-MAP populated, workspace-map current). Opus diff review → 6 fixes (incognito fail-closed, serialized mutations, window-targeted capture, settingsService routing, fail-closed redaction, single erase listener). 256/256 tests, build green. 15 Asana C-subtasks + status update posted. | Malkio: Phase 1 manual regression → v7.0.0 bump (docs/cortex/HANDOFF.md); re-sync program-spec Google Doc (2 local additions); migration 022 apply decision; companion deploy gates Plan 041; reconcile C9↔#211 voice settings schema |
| 2026-07-10 | Claude (Fable 5, overnight cont.) | Cortex regression + Phases 2–5 | Real-browser regression cleared Malkio smoke-test failures (stale-SW root cause; reload rule codified; RESUME_FOCUS fallback hardening). Phase 2: companion OS capture BUILT (tabatha-desktop feat/cortex-capture, 68 Rust tests) + handoff wiring, digest/actions export, config surface, proxy fn code, routing ladder. Phase 3: voice-schema decision + voice v0 (speak-instead-of-modal, voice notes; no new permissions) + C10 self-correction (apply/revert, nightly). Phase 4: proactivity gate + EXECUTE bundle + migration 023. Phase 5: controller attribution core. 332/332 ext tests + 68/68 Rust, builds green; Opus review fixed the one confirmed finding (self-correction storage race). | Malkio: extension RELOAD then re-smoke-test → v7.0.0; merge/deploy companion branch; deploy cortex-proxy (set secret); migrations 022/023 + gateway/ElevenLabs keys + .pem when ready |
| 2026-07-10 | Claude (Fable 5, live-fix PM) | Capture UX + clock + companion v0.2.0 + DB | Migrations 018-024 pushed live (CLI, new token; remote was at 017). Save-As dialog eliminated (silent companion/OPFS writes), C1 focus-gate + title-slug filenames, clock_in idempotency fix, desk panel fixed, companion v0.2.0 swapped+relaunched, corrupted activity DB rebuilt via raw b-tree salvage (372 sessions recovered). Persistence root-caused (Chrome GC + ghost entry + build race) → atomic dist swap. C11a shipped; C10a + Agent Control Layer scoped (doc+task). ElevenLabs key minted. Ext 361 / companion 79 tests green. | Malkio: Supabase re-sign-in, ghost card removal, v0.2.0 verification, companion merge/deploy, Phase 1 regression → v7.0.0, cortex-proxy deploy |
| 2026-07-10 | Claude (Fable 5, restoration) | Missing-features investigation → staging merge | Three-analyst audit: zero in-branch regressions across 32 cortex commits; advanced time editor = NB-09 on staging (post-fork, never on branch). Merged staging v6.6.0 → branch @ 12f6147 (NB-03→NB-09 restored: time-editing overhaul, gap detector, abandoned stints, analytics, settings search; resumeFocus fallback preserved; staging 022 → 026 + applied to Flux). 536 tests green; merged build 18/18 in-browser PASS incl. live 8h20m preview. | Malkio: reload extension (v6.6.0); time-edit controls = FocusBar 📊 → inner ✏️ Edit |
| 2026-07-10 | Claude (Fable 5, evening) | Missing-features hunt, NB-01/02, version discipline, capture visibility | Root-caused Malkio's "features removed": fork-gap (branch forked pre-NB-09), not deletion — 3-analyst audit cleared all cortex commits. Merged staging v6.6.0 (NB-03→NB-09) + NB-01/02 schedule profiles (v6.7.0); rescued+ported an at-risk awareness identity fix (Live Stints no-op) extended to GET_OTHER_QUEUE/getOwnAbandonedStints; surfaced real capture folder+last-frame in Cortex panel; guarded capture reconnect-flap; backfilled changelog. Version rule reconciled (git tops ~6.7; per-commit discipline instituted 6.7.1→6.7.4). Migrations 025/026/027 applied to Flux. Captures confirmed working (745 frames/day). 591 unit + 22/22 browser regression PASS. | Malkio: reload (v6.7.4), Supabase re-sign-in + ghost card (computer-use blocked in scheduled run — walkthroughs given) |

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- END HEADBOX                                                        -->
<!-- ═══════════════════════════════════════════════════════════════════ -->
