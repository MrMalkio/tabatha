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
| 019      | distribution                | 2026-05-12 | Tabatha + Desktop Companion distribution & update strategy                                                                                                                                                                                                                              | partial — Companion v0.1.0 packaged (.msi + setup.exe): install-folder creation, dummy-proof guided install, Supabase-Storage auto-update (key-guard + atomic swap), 23 Rust tests. Rust + VS Build Tools installed on OD. Remaining: Chrome Web Store listing/auto-update for the extension. |
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
| 039      | cortex_program              | 2026-07-09 | **Tabatha Cortex — AI Observation & Optimization Layer (PROGRAM MASTER)** — 5-layer architecture, 15 capability clusters (C1–C15) mined from Nick Saraev screenshot-optimization video + Malkio design dumps. Local-first opt-in capture → Observations Ledger → Pattern Engine (≥3–4×) → Optimization Loop → Recommendation/Action + Autonomy Ladder. Voice (two-way + 3 hotkeys), privacy/redaction spine, personal/org partition. docs/cortex/00-cortex-program-spec.md | draft — spec authored, Google Doc mirrored, per-feature files scaffolded. Fable to expand + author phase plans (040+) autonomously 2026-07-09 ~22:00 ET. Target v7.0.0. |
| 040      | cortex_phase1               | 2026-07-09 | **Cortex Phase 1** (first AI layer, local-first, cheapest path) — Adaptive Capture v1 (browser+companion handoff, context-driven timing), Sensitive-Data Guard v1 (per-site suppression + capture-time redaction), Storage Fabric v1 (local, personal/org partition, time+space retention), Observations Ledger v1 (migration 022 + nightly export), Pattern+Optimization via cron-in-harness (Claude Code/Codex), read-only Recommendation Dashboard, Agent Data Map v1. Plan doc `docs/plans/plan-040-cortex-phase1.md`. | partial (5/6) — Claude 2026-07-09: T1 pure decision core (62 TDD tests), T2 captureService shell + settings wiring, T3 migration 022 skeleton. **Fable 2026-07-10: T4** capture I/O (captureVisibleTab + canvas redaction + partitioned Downloads writes + event listeners + dwell/nightly-export alarms + age pruning), **T5** cron-in-harness (bundle generator, economize-workflow.v1 prompt) + cortexService + CortexPanel dashboard. **T6** DATA-MAP populated + workspace-map current. Opus diff review → 6 fixes applied (incognito fail-closed, serialized mutations, window-targeted capture, settingsService routing, fail-closed redaction). 256/256 tests green, build green. Code-complete 6/6 — pending Malkio manual regression → v7.0.0 bump + ship. |

| 041      | cortex_phase2               | 2026-07-10 | **Cortex Phase 2** — Companion OS-capture handoff (Rust), real storage fabric (arbitrary paths, free-space, external-archive adapters), routing tiers ② backend proxy + ③ Vercel Gateway, C7 action execution + morning digest, C15 config surface v1. `docs/plans/plan-041-cortex-phase2.md`. Gated on companion-deploy board item. | partial (5/6) — 2026-07-10 PM: T1 CLOSED — feat/cortex-capture MERGED to master @ dbf8cd7, tagged v0.2.0, deployed (master-built exe running, Asana board item closed). Earlier: T1 companion OS capture BUILT (tabatha-desktop feat/cortex-capture @ 006c3aa: screen_capture.rs + settings.rs, GDI window/monitors/virtual modes, guard parity fail-closed, retention by age+bytes, CAPTURE_CONFIG/CAPTURE_TAKEN WS contract, 68 Rust tests) + extension-side handoff wiring (bridge events → ledger, config mirroring); T2 partial (companion-side real paths done; Drive/OneDrive adapters pending); T3 proxy edge fn CODE done (deploy needs Malkio secret); T4 gateway config-gated (key pending); T5 action specs + morning digest + approved-actions export SHIPPED; T6 config surface v1 (routing+proactivity+voice toggles). Pending: companion branch merge/deploy, external-archive adapters, proxy deploy. |
| 042      | cortex_phase3_voice         | 2026-07-10 | **Cortex Phase 3** — Voice & ears (C9: speak-instead-of-modal, 3 hotkeys, dictation engine, universal audio-input groundwork) + C10 passive self-correction. Must reconcile #211 voice.* settings-schema collision first. `docs/plans/plan-042-cortex-phase3-voice.md`. | partial (4/9) — 2026-07-10 PM: C10a Context Reconciliation v1 SHIPPED (b8a1fb7: proposeReconciliations 4 kinds + confirm/skip panel + context box, 18 tests, applies via C10 path w/ C11a stamping). Earlier: T0 DONE (DECISION-voice-settings.md unifies C9↔#211: webspeech default, routed via C8, 3 hotkeys); voice v0 SHIPPED (no-permission slice: tabbyAnnounce speak-instead-of-modal on FTE/drift overlays w/ hold-off mic window + modal fallback, voice-note button → ledger, 17 tests); T7 C10 self-correction v1 SHIPPED (30 tests: tab↔intent + work-time detectors, confidence-laddered apply/revert via activityAudit, nightly 04:00, opt-in). Pending: offscreen/global-hotkey plumbing (gated on .pem/manifest), realtime speak-to-Tabby, dictation engine, routed STT/TTS. |
| 043      | cortex_phase4_autonomy      | 2026-07-10 | **Cortex Phase 4** — Proactive/autonomous overnight builds (C8), multi-cadence optimization (C6), org capture mandate + SOP observation mode (C12), Headbox harness integration. `docs/plans/plan-043-cortex-phase4-autonomy.md`. | partial (5/6) — 2026-07-10 PM: T3 multi-cadence SHIPPED (optimizationCadence decision table, intraday slice exports + economize-intraday.v1 prompt, buildCadenceBundle self-selecting harness task, opt-in cortexIntradayEnabled; 31 tests) + T4 migration 023 APPLIED. Earlier: T1 proactivity gate SHIPPED (pure; reactive default, codegen always review-first) + config surface selector; T2 overnight EXECUTE bundle builder SHIPPED (consumes cortex-actions.v1, review-first hard rules); T4 migration 023 org_capture_policy WRITTEN (not applied). Pending: T3 multi-cadence, T5 SOP observation mode, T6 Headbox harness placement. |
| 044      | cortex_phase5_crosssignal   | 2026-07-10 | **Cortex Phase 5** — Human-vs-AI-agent attribution + reply-latency/power signals + leverage analytics (C11), ergonomic camera + mobile parity via tabatha-mobile (C13), Mac companion parity. `docs/plans/plan-044-cortex-phase5-crosssignal.md`. | partial (1/6) — Fable 2026-07-10: T1 groundwork SHIPPED (controllerAttribution.js decision table: human/ai-agent/unknown w/ confidence, 6 tests). Pending: detection-surface wiring, reply-latency signals, leverage analytics, ergonomic camera, mobile, Mac parity. |
| 045      | agent_control_layer         | 2026-07-10 | **Cortex Phase 6 — Agent Control Layer (Tabatha CLI/MCP)** — efferent sibling of Cortex: agents read/write/coordinate through Tabatha (MCP server + CLI via companion bridge), every write gated on a C11a agent session, audited + reversible. Formalized as a phase per Malkio; EXECUTION BACK-BURNERED until Phases 1–5 complete. docs/plans/plan-045-agent-control-layer.md · Asana 1216454646338939. | draft (back burner — post-Cortex gate) |
| 039      | tabby_sidecar_mobile        | 2026-07-17 | Tabby Sidecar — Mobile Web Companion (v0.0.1). Expo React Native + RN-Web app reproducing the extension sidebar for phones, synced to the user's Supabase account. Auth (Google + magic link), full queue/focus/tasks/clock read + off-device intent creation, mobile context, in-app settings, Web Push modal parity (migration 022 push_subscriptions + send-focus-push edge fn + pg_cron). Deploys to tabatha.pondocean.co/sidecar via a Cloudflare Worker route. docs/superpowers/specs/2026-07-17-tabby-sidecar-mobile-design.md | partial (v0.0.1 LIVE) — Expo RN-Web app deployed to https://tabatha.pondocean.co/sidecar (Cloudflare Worker `tabby-sidecar`, route /sidecar*, root Pages site intact). Auth (Google+magic-link, redirect allowlist patched), full queue/focus/tasks/clock read + off-device intent create, in-app settings, Web Push all wired. Supabase migrations 030 (push_subscriptions+push_dedup) + 031 (pg_cron every-min) applied to live Flux; send-focus-push edge fn deployed + smoke-tested 200; VAPID secrets set. **Verified autonomously:** minted a real user session (admin generateLink+verifyOtp) → app's RLS-scoped queries 14/14 pass; caught+fixed a real bug (browser_profiles upsert used partial index (profile_id,browser) ON CONFLICT can't target → switched to full (profile_id,local_id) index) + redeployed; push pipeline delivered to a real registered device. **PR #23 → staging (merged).** **v0.1.0 shipped + deployed:** near 1:1 sidebar parity (edit panel, checkpoint notes+timeline via new focus_checkpoints table [migration 032], sub-intents, backburner dock, on/off-computer toggle), pause pins current focus (was demoting to queue), clock reframed "Your shift" + other-device surfacing, off-device→off-computer rename, PWA install (manifest+icons+Apple meta), Phone Focus Mode (Page Visibility), expanded push (timer+drift+checkpoint-stale). Re-verified 4/4 new data paths under RLS; type-check clean. **v0.2.0 shipped + deployed:** landscape view-only **Context View** (TV/3rd-screen; brand BL, day-countdown TR tied to new dayResetHour setting, time BM, giant focus+timer+up-next; auto-switch on large landscape, toggle) + **realtime** (migration 033 adds focus_items+browser_profile_status to supabase_realtime; useFocus subscribes — verified query OK + SUBSCRIBED via minted session) + **timer-restart fix** (continues across pause/resume). Also authored skill `.claude/skills/showcase-site-update`. Pending: native iOS/Android builds; Pomodoro as a real controllable feature; desktop-side adoption of checkpoints/sub-intent/backburner sync. |
| 040      | sidecar_voice_timeline_tasks | 2026-07-18 | Tabby Sidecar — Voice Capture, Context View timeline, Tasks↔Asana(PAT)/Anasa + subtasks-as-sub-intents, Tasks-view fixes, phone-away red. Shared foundation: focus start/stop event log (`focus_events`). Decisions: Asana REST via PAT not MCP; timeline nodes = checkpoints+starts; portfolio audit parked (docs/portfolio-track.md). docs/superpowers/specs/2026-07-18-sidecar-timeline-voice-tasks-design.md | partial (9/12) — Epics 0,B1,B2,1,2,4,5,6,7,8,9-sidecar + Addenda 6-7 (extend-tracking, voice check-ins) SHIPPED through Sidecar 0.7.0 + ext 6.7.34; remaining: Epic 3 v1.1 (due_on, workspace name), Epic 10 chaperone audio expansion, extension-side voice parity — sequence: Epic0+B1 phone-away/pause-on-leave → B2 current-focus fix + empty-state cards → Epic1 Voice (#165) → Epic7 feedback → Epic5 notes-simple+install → focus_events+Epic4 tasks → Epic2 timeline+Epic6 layout → Epic8 nudges (#194) → Epic3 Asana(PAT) → Epic9 CV customization (extension-side, MUST branch from 6.7.24+/6.8.2 line, NOT this 6.5.0-based branch); addendum 3 adds Epic10 personality-interrupts v0 (#182 pre-recorded slice) + #215 Body Doubling created+parked + Progressive Simplicity principle. Repo-reconciliation chore flagged: GitHub (staging 6.6.0/main 6.5.0) behind local 6.7.x-6.8.2 line; Chrome dist = 6.8.2 |
| 041      | tabby_watch                 | 2026-07-18 | Tabby Watch — Wear OS 4 companion for Samsung Galaxy Watch 6 (Kotlin + Jetpack Compose for Wear OS). New repo `tabatha-watch` (github.com/MrMalkio/tabatha-watch). Glanceable current-focus + countdown ring, checkpoint quick-add (canned progress levels), extend +5, pause/resume, clock glance, phone-away awareness, Tile + complication. Direct PostgREST/Realtime against schema `tabatha` mirroring Sidecar timer semantics. Password-free pairing: phone-minted 6-digit code → `pair-watch` edge fn returns a refresh token (SPECed — CeeCee to deploy; needs `watch_pairing_codes` migration). docs/superpowers/specs/2026-07-18-tabby-watch-design.md | draft → building (Soren, Opus) — target v0.1.0. Design doc + self-review complete. Build gate: `gradlew assembleDebug` green + TimerEngine/CurrentFocus unit tests. CeeCee to apply migration + deploy `pair-watch` edge fn + Sidecar "Pair a watch" button; Malkio to sideload + pair on-device. |

---

> **Next available number:** 046

> **Note:** Plans 026 (auto_focus) and 029 (auto_pause_overhaul) are **absorbed by Plan 036** — credit their scope there; do not execute them independently.

> **🚀 Production milestone — Tabatha v6.4.0 shipped to `main` 2026-06-30.**
> Extension: 123 tests, Koda(Codex)-reviewed ×2 + Claude backstop. Fixes: org-attribution (`redeem_invite_token` sets `default_org_id`/`team_id`, migration 018 — Plan 028 follow-up), pinned manifest key, cloud rehydrate, sidebar sync indicator, intent backdating, in-app feedback→Asana (BD-12 first slice; edge-function deploy pending Asana creds).
> Companion v0.1.0 packaged (.msi + setup.exe) — Plan 019, see row above. Migrations 018 + 019 applied + verified to live Flux; OAuth redirect allowlisted (sign-in works).
> `MrMalkio/tabatha` is source of truth at 6.4.0; PS == OD == GitHub. Open: `flux_time_entries` RLS disabled (P0.5), feedback edge-fn deploy (P0.6), DB pre-create Reggie & Po (P0.7), physical rollout (P0.8).

---

## Execution Roadmap

> **Purpose:** Dependency-aware ordering of all active/draft plans. Updated at each checkpoint.
> **Legend:** 🔴 blocker, 🟡 draft (needs scoping), ⭐ ready to execute, ✅ completed, 🔒 reserved (dependency-gated)

### Wave 0 — Pre-Production Gate (before any new feature work)

| Priority | Item                                         | Effort | Blocker For                           | Status                                                         |
| -------- | -------------------------------------------- | ------ | ------------------------------------- | -------------------------------------------------------------- |
| 🟡 P0.1  | Rotate Supabase DB password                  | 30min  | Best practice                         | ⏸️ Deferred by user decision                                 |
| ✅ P0.2  | Apply migrations 008–019 to remote Supabase | 1hr    | Sync Batch 1, multi-profile, calendar, org attribution | ✅ Complete — 001–019 all applied + verified to live Flux (2026-06-30) |
| 🔴 P0.3  | Full v5.8.0 regression test                  | 2-3hr  | Production release                    | ✅ Complete — user confirmed                                  |
| 🟡 P0.4  | Delete stale `origin/main` branch          | 5min   | Nothing                               | ⬜ Optional                                                    |
| 🔴 P0.5  | `public.flux_time_entries` RLS is DISABLED   | —      | Team-live / public release            | ⚠️ OPEN — security risk flagged pre-team-live (see db-rls-audit-2026-06-02.md finding A) |
| 🟡 P0.6  | Feedback edge-function deploy (Asana)        | —      | In-app feedback→Asana live pipeline   | ⏳ Pending Asana creds                                        |
| 🟡 P0.7  | DB pre-create Reggie & Po (po@/reggie@duckandshark.com) | — | First team testers            | ⏳ Pending                                                    |
| 🟡 P0.8  | Physical rollout to testers                  | —      | Team testing                          | ⏳ Pending                                                    |

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
| 🟡**019** partial | Chrome Web Store listing, auto-update, self-hosted CRX | All Waves 0-4 ideally, but can start after Wave 1 | ✅ Mostly config/admin, no code zone conflicts | ~1 week     |

> **019 progress (v6.4.0, 2026-06-30):** Companion side done — v0.1.0 packaged (.msi + setup.exe) with dummy-proof guided install + Supabase-Storage auto-update (key-guard + atomic swap), 23 Rust tests, Rust + VS Build Tools installed on OD. Remaining: the extension's CWS listing / auto-update path.

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

> **Last verified:** 2026-07-10 — **All migrations 001–024 applied to the live Flux project (CLI push).** ⚠️ Correction: on 2026-07-10 the remote was found at 017 — the 2026-06-30 "018/019 applied + verified" record was inaccurate for the live project. 018–024 were applied together 2026-07-10 (all additive; 021 priority column pre-existed, IF NOT EXISTS skipped cleanly).
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
| 015      | `015_fix_rls_recursion.sql`               | ✅ Applied (2026-06-02)     | RLS recursion fix (SECURITY DEFINER helpers) — see db-rls-audit-2026-06-02.md |
| 016      | `016_restore_browser_profiles_write_rls.sql` | ✅ Applied (2026-06-02)  | Restore browser_profiles INSERT/UPDATE/DELETE (regressed by 012) |
| 017      | `017_browser_profile_identity.sql`        | ✅ Applied                  | Browser-profile identity                                     |
| 018      | `018_redeem_sets_profile_defaults.sql`    | ✅ Applied 2026-07-10 (was NOT live despite 06-30 record) | v6.4.0 org attribution — `redeem_invite_token` sets `default_org_id`/`team_id` |
| 019      | `019_owner_read_views.sql`                | ✅ Applied 2026-07-10 (was NOT live despite 06-30 record) | v6.4.0 owner read views (service-role only)                  |
| 020      | `020_create_organization_rpc.sql`         | ✅ Applied 2026-07-10 | create_organization RPC + widened org_members role check |
| 021      | `021_add_focus_item_priority.sql`         | ✅ Applied 2026-07-10 | focus_items.priority (FIX-10) — was the live sync-drift failure |
| 022      | `022_cortex_ledger.sql`                   | ✅ Applied 2026-07-10 | Cortex observations ledger + capture refs (Plan 040) |
| 023      | `023_cortex_org_capture_policy.sql`       | ✅ Applied 2026-07-10 | Org capture mandate policy (Plan 043 T4) |
| 024      | `024_cortex_controller_attribution.sql`   | ✅ Applied 2026-07-10 | controller/confidence/provenance columns (C11a) |

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
