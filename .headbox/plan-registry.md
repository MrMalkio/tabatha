# Implementation Plan Registry

> **Purpose:** Canonical list of all implementation plans across conversations. Check this before creating a new plan to avoid number collisions.
> **Rule:** Always append. Never delete entries.
> **Progress Tracking:** At every `checkpoint`, update the status of the associated plan(s) in this registry. Use `partial (X/Y)` to indicate how many deliverables are complete out of the total. Never mark a plan `superseded` — if the work was done elsewhere, credit it and update the fraction. Plans are either `draft`, `partial (X/Y)`, `completed`, or `archived`.

---

| # | Suffix | Date | Conversation / Topic | Status |
|---|--------|------|---------------------|--------|
| 001 | — | 2026-05-10 | Desktop Companion Build (Tauri scaffold) | completed |
| 002–011 | — | various | (pre-registry — numbers used across various conversations) | archived (pre-registry) |
| 012 | — | 2026-05-10 | Bug Fix Sweep (Tabatha stabilization) | completed |
| 013 | — | 2026-05-10 | Bug Fix Sweep (resolved variant) | completed |
| 014 | — | 2026-05-10 | Tabatha stabilization | completed |
| 014.5 | — | 2026-05-10 | Tabatha stabilization (addendum) | completed |
| 015 | — | 2026-05-10 | Tabatha stabilization | completed |
| 016 | — | 2026-05-10 | Tabatha stabilization | completed |
| 018 | asana_integration | 2026-05-11 | Asana Integration Module scaffold | partial (3/5) — backend code exists (widget server, taskUrlResolver, CPN auto-post, tab auto-intent). Gaps: frontend usage guide, e2e verification, Settings status indicator. Covered by Plan 031 Phase 5 |
| 019 | distribution | 2026-05-12 | Tabatha + Desktop Companion distribution & update strategy | draft |
| 020 | activity_editor | 2026-05-12 | Activity Editor + Timeline enhancements + InBar sync fix | partial (5/7) — gaps: range trim, break segments. Covered by Plan 031 |
| 021 | intent_focus_pipeline | 2026-05-12 | Intent→Focus pipeline + Browser Profile defaults | partial (3/4) — gap: manual tab→focus in LinkMergeModal. Covered by Plan 031 |
| 022 | focus_timer_idle_tracking | 2026-05-13 | Focus Timer Harmonization & Deep Activity Tracking | partial (1/6) — gaps: let-me-cook, video call suppression, sub-intent ticking, P1-P5, category expansion, audit logging. Covered by Plan 031 (parallel focuses deferred to 033) |
| 023 | efficiency_decomp | 2026-05-13 | Efficiency-Driven Decomposition — audit-informed monolith breakup + storage caps | completed |
| 024 | changelog_backfill | 2026-05-14 | Backfill v3.12.4→v3.34.5 documentation gap — per-version changelog entries with commit SHAs | completed |
| 025 | popup_harmony | 2026-05-16 | FTE/WBP Popup Fixes — singleton coordination, enhanced CTAs, configurable thresholds, off-device tag | completed |
| 026 | auto_focus | 2026-05-19 | Auto Focus — URL/title/desktop heuristic inference to reduce manual focus logging | draft |
| 027 | multi_profile_sync | 2026-05-19 | Multi-Profile Awareness Sync Phase A+B+C — browser_profiles identity, classification axis, bootstrap pull org-registry dedup, Personal-classification hides clock UI, cross-profile awareness via browser_profile_status + Supabase Realtime | completed |
| 028 | team_awareness_invite_mint | 2026-05-19 | Phase D first slice — manager RLS scoping over browser_profile_status + browser_profiles, create_invite_token RPC, Team Activity panel in Settings with member awareness chips and an in-app invite mint flow | completed |
| 029 | auto_pause_overhaul | 2026-05-26 | Auto-Pause/Idle/Break lifecycle overhaul — fix 5 bugs, close 8 gaps, full configurability | draft |
| 030 | time_blocking_calendar | 2026-05-26 | Time Blocking & Multi-Calendar Sync Engine (Google & Outlook Calendar Integration) | renumbered → 035 |
| 031 | gap_completion | 2026-05-27 | Gap Completion for Plans 018/020/021/022 + Feature #207 — Activity Editor page, range trim, break segments, tab→focus creation, let-me-cook, video call idle suppression, sub-intent ticking, P1-P5, categories, audit logging, Asana frontend guide/verification, Back Burner engine | partial (7/8) — All phases implemented + review correction fixes applied (RESUME_BACKBURNER, cascade logic, audit path, message contracts). Remaining: manual regression testing |
| 032 | deep_editing | 2026-05-27 | Deep Editing — Multi-Track Activity Timeline Editor. Premiere-style drag-handle editing, gap filling, contribution notes (#173), review queue (#204), audit trail. Absorbs Plan 031 Phase 1. Features #157, #195, #173, #204 | draft |
| 033 | parallel_focuses | 2026-05-28 | Parallel Focuses — `activeFocusId` → `activeFocusIds` architectural change. Deferred from Plan 022/031. Depends on sub-intent (031 Phase 3) and Back Burner (031 Phase 6) as stepping stones | reserved |
| 034 | smart_deferral | 2026-05-28 | Smart Deferral & Task Splitting Engine (Auto-Stint Scheduler) — Auto-stint allocation logic, splitting heuristics, calendar sync alignment | draft |
| 035 | unified_calendar | 2026-05-28 | Unified Calendar & Scheduling System (renumbered from 030) — Full Month/Week/Day calendar, react-big-calendar UI, Sidebar agenda, calendarService CRUD, syncService bidirectional merge, Google & Outlook OAuth sync engine | partial (1/3) — Phase 1 backend complete (calendarService, syncService, Supabase migration). Phases 2-3 (UI, OAuth sync) pending |

---

> **Next available number:** 036
