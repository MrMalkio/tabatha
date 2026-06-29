# Implementation Plan Registry

> **Purpose:** Canonical list of all implementation plans across conversations. Check this before creating a new plan to avoid number collisions.
> **Rule:** Always append. Never delete entries, do best not to overwrite. just write a new versioned plan.Always include original path. 
> **Progress Tracking:** At every `checkpoint`, update the status of the associated plan(s) in this registry. Use `partial (X/Y)` to indicate how many deliverables are complete out of the total. Never mark a plan `superseded` — if the work was done elsewhere, credit it and update the fraction. Plans are either `draft`, `partial (X/Y)`, `completed`, or `archived`.

---
| #        | Suffix                      | Date       | Conversation / Topic                                                                                                                                                                                                                                                                    | Status                                                                                                                                                                                                      |
| -------- | --------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001      | —                          | 2026-05-10 | Desktop Companion Build (Tauri scaffold)                                                                                                                                                                                                                                                | completed                                                                                                                                                                                                   |
| 002–011 | —                          | various    | (pre-registry — numbers used across various conversations)                                                                                                                                                                                                                             | archived (pre-registry)                                                                                                                                                                                     |
| 012      | —                          | 2026-05-10 | Bug Fix Sweep (Tabatha stabilization)                                                                                                                                                                                                                                                   | completed                                                                                                                                                                                                   |
| 013      | —                          | 2026-05-10 | Bug Fix Sweep (resolved variant)                                                                                                                                                                                                                                                        | completed                                                                                                                                                                                                   |
| 014      | —                          | 2026-05-10 | Tabatha stabilization | completed |
| 014.5    | —                          | 2026-05-10 | Tabatha stabilization (addendum) | completed |
| 015      | —                          | 2026-05-10 | Tabatha stabilization | completed |
| 016      | —                          | 2026-05-10 | Tabatha stabilization | completed |
| 018      | asana_integration           | 2026-05-11 | Asana Integration Module scaffold                                                                                                                                                                                                                                                       | partial (3/5) — backend code exists (widget server, taskUrlResolver, CPN auto-post, tab auto-intent). Gaps: frontend usage guide, e2e verification, Settings status indicator. Covered by Plan 031 Phase 5 |
| 019      | distribution                | 2026-05-12 | Tabatha + Desktop Companion distribution & update strategy                                                                                                                                                                                                                              | draft                                                                                                                                                                                                       |
| 020      | activity_editor             | 2026-05-12 | Activity Editor + Timeline enhancements + InBar sync fix                                                                                                                                                                                                                                | partial (5/7) — gaps: range trim, break segments. Covered by Plan 031                                                                                                                                      |
| 021      | intent_focus_pipeline       | 2026-05-12 | Intent→Focus pipeline + Browser Profile defaults                                                                                                                                                                                                                                       | partial (3/4) — gap: manual tab→focus in LinkMergeModal. Covered by Plan 031                                                                                                                              |
| 022      | focus_timer_idle_tracking   | 2026-05-13 | Focus Timer Harmonization & Deep Activity Tracking                                                                                                                                                                                                                                      | partial (1/6) — gaps: let-me-cook, video call suppression, sub-intent ticking, P1-P5, category expansion, audit logging. Covered by Plan 031 (parallel focuses deferred to 033)                            |
| 023      | efficiency_decomp           | 2026-05-13 | Efficiency-Driven Decomposition — audit-informed monolith breakup + storage caps                                                                                                                                                                                                       | completed                                                                                                                                                                                                   |
| 024      | changelog_backfill          | 2026-05-14 | Backfill v3.12.4→v3.34.5 documentation gap — per-version changelog entries with commit SHAs                                                                                                                                                                                           | completed                                                                                                                                                                                                   |
| 025      | popup_harmony               | 2026-05-16 | FTE/WBP Popup Fixes — singleton coordination, enhanced CTAs, configurable thresholds, off-device tag                                                                                                                                                                                   | completed                                                                                                                                                                                                   |
| 026      | auto_focus                  | 2026-05-19 | Auto Focus — URL/title/desktop heuristic inference to reduce manual focus logging                                                                                                                                                                                                      | absorbed →**036**                                                                                                                                                                                    |
| 027      | multi_profile_sync          | 2026-05-19 | Multi-Profile Awareness Sync Phase A+B+C — browser_profiles identity, classification axis, bootstrap pull org-registry dedup, Personal-classification hides clock UI, cross-profile awareness via browser_profile_status + Supabase Realtime                                           | completed                                                                                                                                                                                                   |
| 028      | team_awareness_invite_mint  | 2026-05-19 | Phase D first slice — manager RLS scoping over browser_profile_status + browser_profiles, create_invite_token RPC, Team Activity panel in Settings with member awareness chips and an in-app invite mint flow                                                                          | completed                                                                                                                                                                                                   |
| 029      | auto_pause_overhaul         | 2026-05-26 | Auto-Pause/Idle/Break lifecycle overhaul — fix 5 bugs, close 8 gaps, full configurability                                                                                                                                                                                              | absorbed →**036**                                                                                                                                                                                    |
| 030      | time_blocking_calendar      | 2026-05-26 | Time Blocking & Multi-Calendar Sync Engine (Google & Outlook Calendar Integration)                                                                                                                                                                                                      | renumbered → 035                                                                                                                                                                                           |
| 031      | gap_completion              | 2026-05-27 | Gap Completion for Plans 018/020/021/022 + Feature #207 — Activity Editor page, range trim, break segments, tab→focus creation, let-me-cook, video call idle suppression, sub-intent ticking, P1-P5, categories, audit logging, Asana frontend guide/verification, Back Burner engine | completed — v5.8.0 shipped 2026-05-28. All 8 phases implemented, regression fixes applied, auto-checkpoint + SectionNav refactor added                                                                     |
| 032      | deep_editing                | 2026-05-27 | Deep Editing — Multi-Track Activity Timeline Editor. Premiere-style drag-handle editing, gap filling, contribution notes (#173), review queue (#204), audit trail. Absorbs Plan 031 Phase 1. Features #157, #195, #173, #204                                                           | draft                                                                                                                                                                                                       |
| 033      | parallel_focuses            | 2026-05-28 | Parallel Focuses —`activeFocusId` → `activeFocusIds` architectural change. Deferred from Plan 022/031. Depends on sub-intent (031 Phase 3) and Back Burner (031 Phase 6) as stepping stones                                                                                       | reserved                                                                                                                                                                                                    |
| 034      | smart_deferral              | 2026-05-28 | Smart Deferral & Task Splitting Engine (Auto-Stint Scheduler) — Auto-stint allocation logic, splitting heuristics, calendar sync alignment                                                                                                                                             | draft                                                                                                                                                                                                       |
| 035      | unified_calendar            | 2026-05-28 | Unified Calendar & Scheduling System (renumbered from 030) — Full Month/Week/Day calendar, react-big-calendar UI, Sidebar agenda, calendarService CRUD, syncService bidirectional merge, Google & Outlook OAuth sync engine                                                            | partial (1/3) — Phase 1 backend complete (calendarService, syncService, Supabase migration). Phases 2-3 (UI, OAuth sync) pending                                                                           |
| 036      | intelligent_focus_lifecycle | 2026-05-28 | Intelligent Focus Lifecycle — combines Auto Focus (#026) + Auto Pause Overhaul (#029). Smart Idle Engine (multi-profile/companion/meeting suppression, prompt-instead-of-pause), Auto-Focus heuristic engine + decay, context drift detection, Focus Lifecycle settings + InBar prompts, auto clock-in (#187). Bugs B05/B08, features #149-#152/#187. | completed (v6.0.0–6.3.6) — Merged to staging via PR #21 and PR #22. 40 node:test regression tests green. |
| 037      | time_editing                | 2026-05-29 | Focus Time Editing — time-edit handlers + checkpoint timeline edit mode in focusService/FocusBar. ADJUST_FOCUS_TIME / SET_FOCUS_ELAPSED / REMOVE_LAST_PAUSE + checkpoint timeline edit mode (per-entry edit/delete, copy button, paused-focus review). docs/plans/plan-037-time-editing.md | completed (v6.1.0–6.3.6) — backend handlers + shared CheckpointTimeline component, 9 tests green, in live dist. On PR #21 |
| 038      | url_rules_intelligence      | 2026-05-29 | URL Rules Intelligence & Training Mode — Phase 1: persistent domain store (LRU 2000, dismiss/target). Phase 2: rule suggestions + prompt frequency. Phase 3: training mode. Phase 4: visual field-picker (merge tags → auto intent/focus). docs/plans/plan-038-url-rules-intelligence.md | partial (1/4) — Phase 1 complete @ v6.2.0 (domainHistoryService + DomainsTab rebuild, 7 tests green, in live dist). Phases 2-4 pending. BD-20/21 refine path-pattern dedup + targeting intent |

---

> **Next available number:** 039

> **Note:** Plans 026 (auto_focus) and 029 (auto_pause_overhaul) are **absorbed by Plan 036** — credit their scope there; do not execute them independently.

---

## Execution Roadmap

> **Purpose:** Dependency-aware ordering of all active/draft plans. Updated at each checkpoint.
> **Legend:** 🔴 blocker, 🟡 draft (needs scoping), ⭐ ready to execute, ✅ completed, 🔒 reserved (dependency-gated)

### Wave 0 — Pre-Production Gate (before any new feature work)

| Priority | Item                                         | Effort | Blocker For                           | Status                                                         |
| -------- | -------------------------------------------- | ------ | ------------------------------------- | -------------------------------------------------------------- |
| 🟡 P0.1  | Rotate Supabase DB password                  | 30min  | Best practice                         | ⏸️ Deferred by user decision                                 |
| ✅ P0.2  | Apply migrations 008–014 to remote Supabase | 1hr    | Sync Batch 1, multi-profile, calendar | ✅ Complete — 008–013 already applied; 014 pushed 2026-05-28 |
| 🔴 P0.3  | Full v5.8.0 regression test                  | 2-3hr  | Production release                    | ✅ Complete — user confirmed                                  |
| 🟡 P0.4  | Delete stale `origin/main` branch          | 5min   | Nothing                               | ⬜ Optional                                                    |

### Wave 1 — Intelligent Focus Lifecycle (Plan 036)

| Plan            | What                                              | Depends On      | Parallel?                                        | Est. Effort |
| --------------- | ------------------------------------------------- | --------------- | ------------------------------------------------ | ----------- |
| ⭐**036** | Auto Focus heuristics + Auto Pause/Break overhaul | Wave 0 complete | ✅ Yes — isolated to Focus Engine + Clock zones | ~1.5 weeks  |

> **Why first:** Highest UX impact. Auto-detection is the #1 differentiator (per Mike transcript). Auto-pause fixes are the #1 user friction point. They share the focus lifecycle zone and should be designed together.

### Wave 2 — Unified Calendar & Scheduling (Plans 035 → 034)

| Plan                    | What                                                                   | Depends On                        | Parallel?                               | Est. Effort   |
| ----------------------- | ---------------------------------------------------------------------- | --------------------------------- | --------------------------------------- | ------------- |
| ⭐**035** Phase 2 | Calendar UI (react-big-calendar, Month/Week/Day views, Sidebar agenda) | Phase 1 backend ✅                | ✅ Yes — UI zone, no overlap with 036  | ~1 week       |
| ⭐**035** Phase 3 | Google & Outlook OAuth sync engine                                     | Phase 2 UI                        | ⚠️ Needs settings zone (OAuth config) | ~1 week       |
| 🟡**034**         | Smart Deferral & Task Splitting Engine                                 | 035 Phase 2 (calendar data model) | ❌ Depends on 035 calendar CRUD         | ~1–1.5 weeks |

> **Why Wave 2:** Calendar is infrastructure that unlocks Smart Deferral (#034), Time Block Compliance (#206), Meeting Detection (#193), and Morning Kickstart (#199). Plan 034 is conceptually Phase 4 of the calendar system.
>
> **Parallel note:** 035 Phase 2 (UI) can run in parallel with Wave 1 (036) since they touch different zones. Phase 3 (OAuth) should wait until 036 is merged to avoid settings zone conflicts.

### Wave 3 — Deep Editing & Review (Plan 032)

| Plan            | What                                                                   | Depends On                         | Parallel?                      | Est. Effort |
| --------------- | ---------------------------------------------------------------------- | ---------------------------------- | ------------------------------ | ----------- |
| 🟡**032** | Deep Editing — multi-track timeline editor, review queue, audit trail | 035 Phase 2 (timeline UI patterns) | ✅ Isolated activity.html page | ~2 weeks    |

> **Why Wave 3:** Deep Editing absorbs features #157, #195, #173, #204. It benefits from calendar timeline patterns established in Wave 2. Can technically start in parallel with 034 if scoped to the standalone activity page.

### Wave 4 — Advanced Architecture (Plan 033)

| Plan            | What                                                       | Depends On                                            | Parallel?                              | Est. Effort |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ----------- |
| 🔒**033** | Parallel Focuses (`activeFocusId` → `activeFocusIds`) | 036 (focus lifecycle stable) + 034 (stint scheduling) | ❌ Architectural — touches everything | ~1.5 weeks  |

> **Why last:** This is a deep architectural change that modifies the core focus engine data model. It needs the focus lifecycle (036) and scheduling (034) to be stable first. Sub-intents (031 Phase 3 ✅) and Back Burner (031 Phase 6 ✅) are already stepping stones.

### Wave 5 — Distribution & Production (Plan 019)

| Plan            | What                                                   | Depends On                                        | Parallel?                                      | Est. Effort |
| --------------- | ------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------- | ----------- |
| 🟡**019** | Chrome Web Store listing, auto-update, self-hosted CRX | All Waves 0-4 ideally, but can start after Wave 1 | ✅ Mostly config/admin, no code zone conflicts | ~1 week     |

> **Can start early:** CWS listing prep (icons, descriptions, screenshots) can happen any time. The actual submission should wait until the core experience is stable (after Wave 1 at minimum).

### Parallel Lanes (safe to run alongside any wave)

| Item                        | What                                                         | Zone           | Notes                             |
| --------------------------- | ------------------------------------------------------------ | -------------- | --------------------------------- |
| Companion Feature Sync      | Backburner awareness, priority display, video call detection | Companion zone | Parking lot item — no plan # yet |
| Supabase Sync Batch 2       | Config sync (categories, urlRules, blockedSites)             | Sync zone      | Handoff in sticky notes           |
| BlockGate Enhancement Suite | Reasons, delayed unblock, temp blocking                      | Groups zone    | Parking lot item                  |
| UI Quick Wins               | Focus completion prompt, InBar customization, notepad        | Various        | Small scope, 0.5–1 day each      |

### Dependency Graph

```
Wave 0 (pre-prod gate)
  │
  ├──→ Wave 1: Plan 036 (Auto Focus + Auto Pause) ──→ Wave 4: Plan 033 (Parallel Focuses)
  │                                                         ↑
  └──→ Wave 2: Plan 035 Ph2 (Calendar UI) ──→ 035 Ph3 (OAuth) ──→ Plan 034 (Smart Deferral) ─┘
                       │
                       └──→ Wave 3: Plan 032 (Deep Editing)

  Parallel Lanes: Companion sync │ Supabase Batch 2 │ BlockGate │ UI quick wins
```

---

## Migration Status (Supabase Remote)

> **Last verified:** 2026-05-28 — **All migrations applied. Remote DB is current.**
> **Project:** Flux (`mtdgoahskcibjbhfvofx`)

| #        | File                                        | Status                      | Introduced By                    |
| -------- | ------------------------------------------- | --------------------------- | -------------------------------- |
| 001–007 | (foundation + profiles)                     | ✅ Applied (prior sessions) | Various                          |
| 008      | `008_add_batch1_sync_tables.sql`          | ✅ Applied (prior session)  | Plan 031 / Codex sync-batch-1    |
| 009      | `009_add_browser_profile_stamp.sql`       | ✅ Applied (prior session)  | Plan 027 (multi-profile Phase A) |
| 010      | `010_add_browser_profile_status.sql`      | ✅ Applied (prior session)  | Plan 027 (Phase C)               |
| 011      | `011_add_profiles_to_realtime.sql`        | ✅ Applied (prior session)  | Plan 027 (Phase C)               |
| 012      | `012_manager_scoping_and_invite_mint.sql` | ✅ Applied (prior session)  | Plan 028 (Phase D)               |
| 013      | `013_companion_install_uniqueness.sql`    | ✅ Applied (prior session)  | Plan 028 (Phase D₂)             |
| 014      | `014_add_calendar_sync_tables.sql`        | ✅ Applied 2026-05-28       | Plan 035 (Phase 1)               |

> **Push command:** `$env:SUPABASE_DB_PASSWORD = '<Flux_DB_Pass>'; npx supabase db push --linked`
> **⚠️ NOTE:** DB password rotation (P0.1) still pending — deferred per user decision.

---

## Feature ↔ Plan Cross-Reference

> **Purpose:** Track which plan implements (or will implement) each feature. Updated when plans are created or features are assigned.

| Feature # | Feature Name                          | Plan(s)                            | Status        |
| --------- | ------------------------------------- | ---------------------------------- | ------------- |
| #157      | Deep Edit Panel                       | **032**                      | draft         |
| #173      | Edit Contribution Notes               | **032**                      | draft         |
| #184      | Persistent Focuses / CPN              | **025** ✅, **031** ✅ | completed     |
| #185      | Focus Auto-Resume & Queue             | **031** ✅                   | completed     |
| #186      | Asana Task ↔ Focus Linking           | **018** partial              | partial       |
| #187      | Auto Clock-In/Out                     | **036**                      | draft         |
| #188      | Client/Project-Level Time Attribution | unassigned                         | —            |
| #189      | Service-Level Profitability           | unassigned                         | —            |
| #192      | Calendar Integration Auto-Backfill    | **035**                      | partial (1/3) |
| #193      | Meeting Block Detection               | **035** Phase 3              | draft         |
| #195      | Deep Edit / Retroactive Log Editing   | **032**                      | draft         |
| #196      | Intent Countdown Timer                | **031** ✅                   | completed     |
| #199      | Morning Kickstart                     | **034** (planning view)      | draft         |
| #200      | Decision Fatigue Reducer              | **034**                      | draft         |
| #201      | Follow-Through Score                  | **031** ✅                   | completed     |
| #202      | Session Resurrection                  | unassigned                         | —            |
| #203      | Business Taxonomy Mapping             | unassigned                         | —            |
| #204      | Activity Review & Approval Flow       | **032**                      | draft         |
| #205      | QBO / Payroll Export                  | unassigned                         | —            |
| #206      | Time Block Compliance Tracker         | **034**, **035**       | draft         |
| #207      | Back Burner Focuses                   | **031** ✅                   | completed     |
| #208      | Smart Deferral & Stint Scheduling     | **034**                      | draft         |
| B05       | Idle ignores non-browser activity     | **036**                      | draft         |
| B08       | Auto-pause false triggers             | **036**                      | draft         |

> **Unassigned features** are tracked in `v0_legacy/docs/features.md` and will be assigned as new plans are created.
>>>>>>> Stashed changes
