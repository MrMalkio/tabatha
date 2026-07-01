# Tabatha — Exhaustive Feature Reference

> **Generated:** 2026-07-01, against `staging` branch (production baseline v6.4.0, shipped to `main` 2026-06-30).
> **Purpose:** Ground truth for AI agents and the team on what actually exists in Tabatha (Chrome extension + Tauri desktop companion), classified by real implementation state rather than aspiration. Docs (`docs/features/*.md`, `ROADMAP.md`, backlog braindumps) describe a lot of *planned* work — this document cross-checks every claim against the source code.
> **Repos:** Extension `C:\Users\mrmal\le dev\Tabatha` (this repo). Companion `C:\Users\mrmal\le dev\tabatha-desktop` (Tauri/Rust + React).
> **Method:** Two-phase pass. Phase 1 enumerated every feature mentioned across `docs/features/` (61 files), `.headbox/plan-registry.md` (38 implementation plans + Feature↔Plan cross-reference), `ROADMAP.md`, `Tabatha_Changelog.md`, `Tabatha_Concept.md`, `.headbox/backlog-braindump-2026-05-29.md` (24 BD-ideas), `RELEASE-6.4.0.md`, `DEPLOYMENT.md`, `TEAM-ONBOARDING.md`. Phase 2 dispatched five parallel deep-dive passes over the actual source tree (background services, content scripts, UI surfaces, Supabase schema/edge functions, and the Rust companion) to classify every feature by what the code actually does, with `file:line` citations.

## What is Tabatha? (plain-language primer)

Tabatha bills itself as an **Attention & Context Operating System** for the browser, not just a tab manager (`Tabatha_Concept.md`). Every new tab is met with a friction popup ("the Gatekeeper") that asks what you're doing and why, binding the tab to an **Intent** and a **Focus**. Time is tracked automatically in the background rather than via a separate timer app. A companion desktop app (Tauri, Windows-only in practice today) extends tracking to non-browser apps and can auto-update the extension outside the Chrome Web Store. All data syncs to a shared Supabase backend so a small team (currently Duck & Shark, first deployed 2026-06-30) can see aggregate time/capacity without micromanaging.

## Classification legend

- **WORKING** — implemented, wired up (UI ↔ message handler ↔ storage/DB), no known bugs.
- **WORKING BUT FINICKY** — implemented but has real rough edges: cited TODOs, partial coverage, an external dependency that silently degrades the feature, or a UI label that overstates what the code does.
- **STUBBED / PARTIAL** — scaffolding exists (UI shell, disabled buttons, a "Coming soon" placeholder) but the core mechanism is missing.
- **PLANNED / COMING SOON** — documented in roadmap/plan-registry/backlog, no real implementation found in source.
- **NOT FOUND** — mentioned somewhere in docs but zero code evidence turned up; flagged for double-checking rather than asserted as definitely absent.

---

## 1. Gatekeeper / New-Tab Intent Friction (InPop)

The full-screen "why are you here?" overlay shown on new tabs/navigations, injected at `document_start` via a Shadow DOM host. Formal internal name: **Intent-Popup (InPop)**.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Core Gatekeeper overlay | **WORKING** | `src/content/gatekeeper.js:1-438`; gated by `CHECK_CONTEXT_NEEDED` → `src/background/services/tabService.js:473-545` | A blurred full-screen popup appears on new tabs until you type what you're doing. |
| Strict vs Relaxed mode | **WORKING** | `gatekeeper.js:38,86-89,272-278` reads `settings.inpopStrictMode`; relaxed adds a dismiss escape hatch | Choose a "must answer" mode or a softer "you can skip" mode. |
| Continue / Side Quest / Sugar Box / Park / Later / Nevermind actions | **WORKING** | `gatekeeper.js:346-399` → `blockgateService.js:32-208` (`startSideQuest`, `ADD_TO_SUGAR_BOX`, `PARK_TAB`, `CLOSE_TAB`) | Six ways to resolve the popup: commit, take a timed detour, save for later as a reward, park it, note it, or just close the tab. |
| Skip-domain ("stop asking here") | **WORKING** | `gatekeeper.js:420-424` → `tabService.js:625-633` (`skipDomain`), consulted at `tabService.js:531-533` | Per-domain opt-out from ever being asked again. |
| Intent inheritance (parent tab → child tab) | **WORKING** | `tabService.js:130-142` copies context/intent from opener tab; surfaced via `contextSource==='inherited'` | Open a link from an already-labeled tab and the new tab inherits that label, just needing confirmation. |
| Focus / Recent / Persistent preset quick-picks | **WORKING** | `gatekeeper.js:26-65,243-270,320-344` | Quick-pick buttons reuse an active focus or a recent/pinned intent instead of retyping. |
| Nested "child of a preset" context | **WORKING BUT FINICKY** | `gatekeeper.js:320-341` sets a `parentContext` but no consumer of it was found beyond logging metadata (`gatekeeper.js:342`) | You can nest a new intent under an existing one, but it's unclear the relationship is used anywhere downstream — needs verification. |
| Asana-title auto-intent | **WORKING** | `tabService.js:250-267,491-510` regexes Asana task titles into an auto-filled context/intent, skipping the popup | Landing on an Asana task page auto-labels the tab so you're not interrupted. |
| URL Rules auto-apply (Plan 038 Phase 1) | **WORKING** (Phase 1 only) | `tabService.js:168-188` applies `autoApply` URL rules on tab creation; `domainHistoryService.js:37-113` implements the permanent domain-visit store with LRU cap, dismiss/target/restore | Certain sites can be pre-configured to auto-set your intent without asking. |
| URL rule *suggestions*, training mode, visual field-picker (Plan 038 Phases 2-4) | **PLANNED / COMING SOON** | Plan registry: "partial (1/4)... Phases 2-4 pending"; no suggestion-generation or training-mode code found in `domainHistoryService.js` | Tabatha doesn't yet proactively suggest new auto-rules based on your browsing patterns. |
| #212 InPop Intent Dropdown Header | **PLANNED / COMING SOON** | No dropdown-header component found; only a plain `<h1>` with a mode badge (`gatekeeper.js:281`) | The popup's header isn't yet an interactive intent-switcher dropdown. |
| #180 InPop Variants (profile/site-aware, incl. InPop-Social) | **PLANNED / COMING SOON** | No per-profile/per-site variant logic; only global strict/relaxed toggle | There's one popup style for everyone — no special "social media" variant yet. |
| #182 Chaperone Mode (voice AI companion) | **NOT FOUND** | No conversational/voice companion tied to Gatekeeper found | An ambient talking AI coworker isn't built — only generic dictation (see §7) exists. |
| BD-9 Passive/Random InPop modes | **PLANNED / COMING SOON** | Only boolean strict/relaxed exists; no third/fourth mode | Idea-stage only. |

---

## 2. InBar (in-page toolbar)

A slim always-on strip (Shadow DOM) showing current intent/focus and timers while browsing, injected at `document_idle`.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Core InBar bar | **WORKING** | `src/content/inbar.js:1-508`; gated by `GET_INBAR_DATA` | A thin strip pinned to the page shows your current intent and a live timer. |
| Collapse-to-nub | **WORKING** | `inbar.js:1092-1115` | Shrink the bar to a small dot; click to restore. |
| Intent + task timers | **WORKING** | `inbar.js:668-696`, ticks every second | Live stopwatch for this tab and cumulative time on the task. |
| Inline Quick Note panel | **WORKING** | `inbar.js:510-523,1117-1144`, debounced autosave | Pop open a small notepad from the bar without leaving the page. |
| Pause + sticky-note "where I left off" | **WORKING** | `inbar.js:698-777,619-645`; cross-tab URL matching at `inbar.js:64-76` | Pause and leave yourself a note; reopening the same URL later shows it again. |
| Edit dropdown (rename / reassign / create focus) | **WORKING** | `inbar.js:525-562,849-998` | Edit the intent, move the tab to a different focus, or spin up a new focus from the bar. |
| Checkpoint / CPN progress-note overlay | **WORKING** | `inbar.js:865-877,1171-1221`; 5 progress levels + snooze/skip | Periodic "what have you gotten done?" prompts with quick tags. |
| Backburner controls | **WORKING** | `inbar.js:584-617,1000-1048`, round-trips to `focusService.js` handlers | "I'm blocked waiting" button — pauses focus, optionally switches you elsewhere, pings you back later. |
| Stale-checkpoint indicator | **WORKING BUT FINICKY** | `inbar.js:152-153,483` — 30-min threshold is hardcoded, not a setting | A small dot warns when you haven't logged progress in a while; the timing isn't user-tunable. |
| FTE/WBP/Combo/Idle/Drift popups | **WORKING** | `inbar.js:1367-1510`, all wired to real background messages | A family of "still working on this?" nudges covering expired timers, returning from idle, and drifting off-task. |
| Auto-focus suggestion chip | **WORKING** | `inbar.js:1295-1313`, fades after 20s (comment says 8s — stale comment, minor mismatch) | A small "Set a focus?" bubble that fades on its own if ignored. |
| Let Me Cook indicator | **WORKING** | `inbar.js:494` | A "don't interrupt me" badge shows when this mode is on. |
| Context Link Indicator (#186) | **WORKING** | `inbar.js:489` (🔗/⚡ icon) — code looks complete despite doc saying "In Progress" | Shows whether the current tab is linked to your active focus. |
| Focus counts (other half of #186) | **NOT FOUND** | No aggregate "focus counts" UI located anywhere | The "how many tabs are on this focus" counter mentioned in the doc wasn't found in code — needs verification. |
| #181 Blocker Banner (team dependency marquee) | **NOT FOUND** | No marquee/banner UI; Backburner's reason field is personal only, not team-shared | No shared "I'm blocked on you" banner across teammates yet. |
| #211 Audio Input in InBar ("Talk to Tabatha") | **NOT FOUND** | No mic/voice trigger inside `inbar.js`; VoiceInput.jsx only lives on Home (see §7) | You can't voice-control the InBar overlay itself yet. |

---

## 3. BlockGate / Site Blocking

Full-page red block overlay for user-defined blocked sites.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Blocked-site overlay | **WORKING** | `src/content/blockgate.js:1-192`; `blockgateService.js:57-81` matches exact/wildcard/subdomain, respects an active temp-unblock window | Visiting a self-blocked site shows a red wall instead of the page. |
| 50-character justification requirement | **WORKING** | `blockgate.js:110-153`, live counter, Proceed disabled below threshold | You must type ≥50 characters explaining why before you can proceed — deliberate friction. |
| Timer-bound temporary unblock | **WORKING** | `blockgate.js:114-166` → `blockgateService.js:108-121`, alarm re-locks on expiry | Pick 5–60 minutes; the block automatically re-engages after. |
| "Associate with" intent/task field | **WORKING BUT FINICKY** | `blockgate.js:125-126,158` stores a plain string, not a true `focusId` link (`blockgateService.js:108-121`) | The field looks like it links to a task, but it's really just a free-text label. |
| "Leave (focus win!)" | **WORKING** | `blockgate.js:180-191`, logs `blocked_leave` and closes tab | Closing instead of justifying access is tracked as a small win. |
| Manage blocked sites (add/remove/list) | **WORKING** | `blockgateService.js:83-106` | CRUD over your blocked-sites list (UI location not independently verified — see Needs Verification). |
| Sugar Box (deferred reward reading list) | **WORKING** (add/view only) | `blockgateService.js:123-149`, FIFO-capped at 500 | "Save this for later as a treat" list — sites you defer instead of visiting now. |
| Sugar Box deletion (#177) | **STUBBED / PARTIAL** | No delete/remove handler exists anywhere for Sugar Box entries; confirmed from both service and all three UI surfaces (sidebar, home, settings) | You can add and open Sugar Box items but can't delete one — it just silently archives at 500 items. |
| Parked tabs | **WORKING** (add/view), **STUBBED** (delete) | `blockgateService.js:151-183` dedupes/warns; but sidebar's "restore"/delete button sends `REMOVE_PARKED_TAB`, which **has no matching handler anywhere in `src/background`** — a dead message (confirmed by grep across all services) | Parking works, but the "remove from parked list" button in the sidebar currently does nothing. |
| Side Quest (timed, tracked detour) | **WORKING** | `blockgateService.js:185-208`, cross-calls `focusService.pauseActiveFocus('side-quest')` | A tracked, timed detour that auto-pauses your current focus. |

---

## 4. Voice Input, Keyboard Shortcuts & Webhooks

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Voice Input (Web Speech API) | **WORKING BUT FINICKY** | `src/components/ui/VoiceInput.jsx:1-125` — continuous recognition, 3s silence auto-stop, graceful `return null` fallback; but wired into exactly **one** place, `src/home/index.jsx:27,802` (the intent input box) — not in Gatekeeper, InBar, Settings, or BlockGate | Tap the mic next to the main "what are you working on" box on the home screen to dictate — not available yet from the in-page overlays. |
| Keyboard Shortcuts (Ctrl+K palette, Ctrl+/ help, Ctrl+Shift+F/B/T, Ctrl+1-8, Escape) | **WORKING** | `src/components/ui/KeyboardShortcuts.jsx`, wired only in `src/home/index.jsx:26,1588-1593` — not found wired in Sidebar or Settings | Shortcuts work on the Home/new-tab screen; not active in the separate Settings window or the sidebar panel. |
| Webhooks (outbound event triggers) | **WORKING** | `src/background/webhooks.js:10-24` (13 triggerable events, HMAC-lite signature, fire-and-forget); UI at `src/settings/index.jsx:61,1751-1752,1983-2106` (enable toggle, URL, secret, per-event checkboxes) | In Settings → Webhooks you can point Tabatha at any URL and choose which events (focus started, clock in/out, task completed, etc.) get POSTed — fully built end-to-end, not a stub. |

---

## 5. Focus Lifecycle Core

The central state machine: `src/background/services/focusService.js` (1558 lines, ~30 message handlers).

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Start / Add / Switch Focus | **WORKING** | `focusService.js:318-457` | Starting a new focus auto-pauses whatever you were doing and starts a fresh timer. |
| Pause / Resume | **WORKING** | `focusService.js:790-827`; resume auto-clears any active break | Pausing stops the clock; resuming picks it back up and ends any break automatically. |
| Complete/Resolve Focus | **WORKING** | `focusService.js:459-505`; auto-promotes the next most-recently-paused item | Marking a focus done automatically starts your next queued one. |
| Extend Timer / Drift transition | **WORKING** | `focusService.js:507-539,1230-1277` | Extend a running timer, or get flagged as "drifted" when it silently expires. |
| Let Me Cook (silence interruptions) | **WORKING** | `focusService.js:541-565` clears timer + checkpoint alarms entirely | Permanently silences timer/checkpoint nudges for that session. |
| Sub-intent tick / Merge Intents / Link Intent to Task | **WORKING** | `focusService.js:284-291,1098-1117,1076-1096` | Sub-tasks feed elapsed time up to their parent focus; intents can be merged or linked to a task. |
| B07 "Cannot resolve paused focus from sidebar top spot" | **WORKING (appears fixed)** | `src/sidebar/index.jsx:443` renders "Resolved" unconditionally regardless of `focusState` — contradicts doc's "🔧 Fixing" status | The bug report describing this as broken looks stale — a live click-test is recommended to fully confirm. |

---

## 6. Backburner & Persistent Focuses

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Back Burner Focuses (#207) | **WORKING** — plan-registry ("completed via 031") is correct; doc marking it "Planned" is stale | Full handler set: `BACKBURNER_FOCUS/DISMISS/SNOOZE/RESUME` (`focusService.js:64-140,567-681`), expiry alarm routed from `alarmService.js:51-53` | Shelve a focus for N minutes with an optional reason, optionally start a stand-in focus, and get alerted when time's up. |
| Persistent Focuses / Checkpoint Progress Notes (#184) | **WORKING** — plan-registry correct; both `184-*.md` docs saying "Planned" are stale | `SAVE_CHECKPOINT_NOTE`/`GET_CHECKPOINT_STATUS` fully implemented and UI-wired (`focusService.js:1377-1482`) | Tabatha periodically nudges you to log a progress note; it can auto-post to a linked Asana task. |
| Focus Auto-Resume & Queue (#185) | **WORKING** — plan-registry correct; doc stale | Two real mechanisms: auto-promote on complete (`focusService.js:481-498`) and alarm-recalculated resume (`RESUME_BACKBURNER`) | Finishing your current focus pulls up whichever other focus you paused most recently. |
| Recurring Focuses & Tasks (#174) | **NOT FOUND** | No `recurring` logic in `focusService.js`/`taskService.js`; `src/workshifts/index.jsx:483` shows a disabled "🔄 Recurring Patterns · SOON" button | No way to make a focus/task repeat automatically yet. |
| Session Resurrection (#202) | **NOT FOUND** | Zero matches for the concept anywhere in `src/` | The "Ghost Snapshot" selective session-recovery idea isn't built. |
| Background Parallels/Tracks (#163) | **NOT FOUND** | Zero matches | No secondary "parallel activity" tracking (music/podcasts/calls) exists. |
| Parallel Focuses (Plan 033, `activeFocusId` → `activeFocusIds`) | **PLANNED / COMING SOON** (confirmed "reserved") | `grep` for `activeFocusIds` (plural) across `src/` returns zero hits; `DEFAULT_FOCUS_ENGINE.activeFocusId` (singular) is the only shape (`src/background/constants.js:80`) | Only one focus can be actively tracked at a time; running two in parallel is a future architectural change. |

---

## 7. Checkpoint Progress Notes & Timeline Editing

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Checkpoint note save/snooze/status | **WORKING** | `focusService.js:1377-1482`; alarm-driven cadence (fraction of `timerMinutes`), gated on settings/snooze/off-device/linked-task-complete | Nudges you at a fraction of your timer to log a quick progress note. |
| Auto-post checkpoint to Asana | **WORKING BUT OFF BY DEFAULT** | Gated behind `settings.checkpointAutoPostAsana` (default `false`, `src/background/constants.js:19`) | Opt-in toggle; when on, progress notes for Asana-linked tasks post automatically. |
| Checkpoint Timeline component + edit mode | **WORKING** | `src/components/CheckpointTimeline.jsx` — nudge buttons, exact-value input, "remove last pause," per-entry edit/delete, copy-as-text | A full editable timeline view of your focus session, not just a read-only log. |
| Time-editing backend (Plan 037: ADJUST_FOCUS_TIME, SET_FOCUS_ELAPSED, REMOVE_LAST_PAUSE, backdating) | **WORKING, well-tested** | `focusService.js:877-1060`; wall-clock-clamped, cross-validated against other focuses' intervals via `src/utils/focusTimeValidation.js:32-79`; `test/focusTimeEdit.test.js` (17 cases) + `test/focusTimeValidation.test.js` (10 cases) | You can manually correct tracked time (nudge, exact value, undo-last-pause, or backdate a start time), and the system prevents impossible overlaps. |

---

## 8. Auto-Focus & Context Drift Detection

Plan 036 Phases 2 & 3 — `src/background/services/autoFocusService.js` (407 lines).

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Auto-Focus suggestion engine | **WORKING BUT FINICKY** | `autoFocusService.js:96-167`; confidence ladder low/medium/high/explicit with per-domain decay/cooldown (30→60→120→240→480 min). **Finicky because:** the "medium" confidence tier depends entirely on the desktop companion being connected (`deps.companionBridge`) — without it, medium-confidence suggestions silently never fire | Tabatha can suggest (or silently auto-create, for pre-configured rules) a focus based on what tab you switch to — but it gets quieter every time you dismiss a suggestion for a site, and one confidence tier only works if the desktop companion app is running. |
| Context Drift Detection | **WORKING, tested** | `autoFocusService.js:184-390`; 5-layer relatedness check (direct association → companion override → URL-rule match → category/domain grouping → whitelist); `test/autoFocusService.test.js` covers drift-armed/suppressed/companion-override cases | If you wander to an unrelated tab for too long, Tabatha flags you as drifted from your focus — unless the new tab is related by category or your companion says you're still working. |

---

## 9. Clock In/Out, Idle & Break Handling

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Clock In/Out/Break toggle | **WORKING** | `clockService.js:505-568`; break toggle auto-pauses the active focus | Standard clock controls, integrated with your active focus. |
| Auto clock-in on Chrome startup / OS-unlock (#187) | **WORKING** | `clockService.js:60-83`, gated on settings + trigger match, double-clock-in guarded | Optionally auto-clock-in when Chrome (re)starts or your OS unlocks (via companion). |
| Configurable idle-detection threshold | **WORKING** | `clockService.js:50-58`; explicitly documented prior-bug fix ("was hardcoded to 60s, making the setting inert") | The idle-threshold setting now actually takes effect. |
| B05 "Idle ignores non-browser activity" | **WORKING (fixed)** | `clockService.js:180-264` — three suppressors: other live browser profile, desktop companion recent activity, active meeting (multi-tab scan, catches muted/backgrounded calls); `test/clockService.test.js` covers 9 cases | Going idle in-browser won't pause you if you're in a meeting (even muted), active in another app via companion, or active on another profile. |
| B08 "Auto-pause false triggers" / Smart Idle prompt-first | **WORKING** | `clockService.js:335-349`, `focusService.js:833-856` (`IDLE_PROMPT_RESPONSE`) — prompts "still on this?" before pausing; hard-pause only after 5 min unanswered | Idle no longer silently pauses your work — it asks first. |
| Welcome Back Prompt / FTE+WBP combo | **WORKING** | `clockService.js:360-489` | Handles both "timer expired" and "you were away" nudges together when they coincide. |
| Cross-profile stint reconciliation | **WORKING, well-tested** | `src/utils/stintReconciliation.js` — 26 test cases in `test/stintReconciliation.test.js`; consumed by `OtherProfilesStrip.jsx` and Live Stints view | If one of your installs crashes while clocked in, Tabatha can reconstruct a reasonable closing time instead of losing that stint. |
| Follow-Through Score (#201) | **NOT FOUND** — contradicts plan-registry's "completed via 031" claim | `grep -ri "followThrough"` across `src/` returns zero matches | Despite being marked done in the plan registry, no scoring/metric code exists under this name anywhere — needs verification (may be renamed). |
| Intent Countdown Timer (#196) | **WORKING** (core); **STUBBED** for simultaneous timers | Core countdown solid (`focusService.js:366-368,441-445,507-539`); only one `focus-timer-*` alarm can exist at a time (architecture ties to single `activeFocusId`) | Every focus gets a real countdown that survives pause/switch/backburner — but there's no such thing as two independent timers running at once yet. |

---

## 10. Sidebar

`src/sidebar/index.jsx` (756 lines) — the side-panel command center.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Focus panel (start/pause/resume/complete/extend, inline edit, backdating, checkpoints) | **WORKING** | Lines 27-42, 213-263, 508-519 | Manage your whole active focus lifecycle from one panel. |
| Now Bar / Queue with priority (P1-P5) | **WORKING** | Lines 299-411, 574-624 | See your top-priority item and reorder/switch/complete queued focuses. |
| Backburner Dock | **WORKING** | Lines 627-645 | Resume, snooze, or dismiss shelved focuses. |
| Tasks panel | **WORKING** | Lines 76-132; real `CREATE_TASK`/`UPDATE_TASK` messages | Create/complete/reopen tasks directly from the sidebar. |
| Tabs panel (search + sort by time) | **WORKING** | — | Find and jump to any open tab, sorted by time spent. |
| Groups panel | **WORKING (read-only)** | Lines 47-71; lists real Chrome tab groups | View your Chrome tab groups; creation/deletion happens via Chrome itself. |
| Stash panel (Parked/Sugar Box) | **WORKING BUT FINICKY** | Restore button sends the dead `REMOVE_PARKED_TAB` message (line 726); Sugar Box has no delete | See §3 for the underlying gap — the sidebar surfaces it. |
| Clock controls with concurrent-install guard | **WORKING** | Lines 147-162, 270-286 | Clock in/out with a warning if another install is already clocked in. |
| Sync status chip | **WORKING** | Lines 332-339, clickable to force sync | Shows and lets you force a cloud sync. |

---

## 11. Home / New-Tab Dashboard

`src/home/index.jsx` (2243 lines) + 6 sub-components.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Collapsible section headers (D01) | **WORKING** — contradicts doc's "Planned" status | `CollapsibleSection`/`SectionNav` fully implemented with persisted state and scroll-spy (lines 480,539,1474-1487,2208-2216) | Home page sections collapse/expand and remember your preference — already built, not just planned. |
| "Active today" stat (BD-13-adjacent bug) | **WORKING BUT FINICKY (confirmed real bug)** | `src/home/index.jsx:1536,1690` sums `timeTracking.byTab`, a **lifetime accumulator never reset daily** — only zeroed on fresh install (`background/bootstrap.js:250-260`) | The "active today" number is actually a running lifetime total for still-open tabs, not a true daily figure — a real, confirmed mislabeling. |
| Org Registry — Projects/Clients panel | **WORKING** | Real CRUD via `useOrgData` hook | Manage clients, projects, and tasks in a drill-down view. |
| Org Registry — Initiatives panel | **WORKING** | Full Operations→Initiatives→Clients→Projects→Tasks tree with inline create/archive | A full hierarchical business structure, not a stub. |
| Logs panel | **WORKING** | Merges 6 real data sources (tab activity, intents, focus sessions, clock stints, context changes, audit trail) with filters/pagination | One searchable, filterable activity log. |
| Analytics Dashboard | **WORKING** | Real computed metrics: focuses today, 7-day completion rate, streaks, category breakdown | Genuine derived analytics, not placeholder numbers. |
| Activity Heatmap | **WORKING BUT FINICKY** | 365-day GitHub-style heatmap; "Browser" series is accurate for today only — no day-bucketed historical browser-time data exists | Past days show sparse "browser" activity because there's no historical per-day breakdown, only today's live total. |
| Command Palette (Ctrl+K) | **WORKING** | Fuzzy search across focuses/intents/tasks/projects/clients/tabs/settings | Jump to anything from one search box. |
| Morning Kickstart (#199) | **NOT FOUND** | Only a plain `getGreeting()` text function exists; no planning flow | No "start your day" planning view exists yet — just a greeting message. |
| Team/Cowork/mutual-visibility pages (#169/#170/#191) | **NOT FOUND on Home** | No team-page keywords found in `home/index.jsx` (narrower version exists in Settings — see §14) | The ambitious peer-to-peer team dashboard isn't on the home page. |

---

## 12. Work Shifts

`src/workshifts/index.jsx` (683 lines) — explicit `STUB_STYLE`/`STUB_BADGE` "COMING SOON" convention used throughout.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| List / Weekly / Live Stints views | **WORKING** | Weekly hours correctly computed (`weekStart` filter, lines 56-80); Live Stints has real reconcile/dismiss/bulk-cleanup (lines 513-667) | Real shift history, a correctly-computed weekly total, and a tool to clean up abandoned clock-ins across multiple installs. |
| Schedule view (set/toggle planned daily hours) | **WORKING** (core), **STUBBED** (add-ons) | Core schedule persists to `workSchedule`; Clock-in Reminders/Adherence Tracking/Recurring Patterns are disabled "SOON" buttons (lines 480-484) | You can plan your hours per day; reminders and compliance tracking on top of that aren't built yet. |
| Shift Notes, Focus-items-during-shift, Edit/Delete Shift, Export Week | **STUBBED / PARTIAL** | Explicit `COMING SOON`/`SOON` badges at lines 244,254,259-260,296 | These are visibly marked not-yet-functional in the UI itself. |
| Work Analytics / Focus Integration / Reporting sections | **STUBBED / PARTIAL** | Explicit `COMING SOON` badges, lines 309-347 | Charts, focus-time-per-shift breakdowns, and CSV/PDF export are all placeholders. |
| Break notes | **WORKING BUT FINICKY** | Comment explicitly states: `// In production this would persist via sendMessage` — notes are local component state only, lost on reload | You can jot a note on a break, but it doesn't actually save yet. |

---

## 13. Activity Editor / Deep Editing

`src/activity/index.jsx` (407 lines). Plan 032 "Deep Editing" is marked `draft` (not built) in the plan registry; this page is the Plan 031 slice that did ship.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Range Trim (bulk delete-by-window) | **WORKING BUT FINICKY** | `handleTrim` (lines 38-68) bulk-deletes companion session entries in a time window — destructive delete, not precision trim/resize of one block; name oversells the function | "Range Trim" actually deletes everything in a time range rather than editing a single entry. |
| Interactive timeline visualizer | **WORKING (read-only)** | Embeds `UnifiedTimeline` (line 323) | See your day's activity as a visual timeline. |
| Drag-drop handles, split/merge blocks, System/Human error classification | **STUBBED / PARTIAL** | Verbatim "Coming soon" placeholder, line 345 | Precision editing of individual activity blocks isn't built yet. |
| Activity Review & Approval Flow (#204) | **PLANNED / COMING SOON** | Verbatim "Coming soon" placeholder, line 382; zero approval-queue code found anywhere | There's no admin approval pipeline for retroactive time-log edits. |

---

## 14. Settings

`src/settings/index.jsx` (2114 lines, 22 sections) + `TeamActivityPanel.jsx` + `UrlRulesSection.jsx`.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Core settings sections (Appearance, Clock, Focus Engine, Lifecycle, InPop, Time Tracking, Tags, Privacy, Webhooks, Desktop Activity, Developer, About, etc.) | **WORKING** | No stray "Coming soon" markers found in `index.jsx` itself | 22 fully working configuration sections. |
| Team Activity panel | **WORKING, narrower than doc #191 implies** | Manager/owner-only, one-directional roster view; gated by `canSeeTeamActivity` (lines 47-49); real Supabase Realtime subscription (lines 168-175), real invite mint/revoke via RPC | Owners/managers can see their reports' live status; peer-to-peer mutual visibility (everyone sees everyone) is not built — that's the still-"Planned" part of #191. |
| URL Rules section (CRUD, Domain Groups, Intent-Changes audit log) | **WORKING** | Fully wired to storage/background messages | Manage per-domain auto-intent rules and see a change history. |
| "+Create Rule"/"Block Domain" quick-actions inside domain cards | **STUBBED / PARTIAL** | Disabled "SOON" badges (lines 475-480) — underlying features exist elsewhere, just not as one-click shortcuts here | The full features exist elsewhere in the app; this specific shortcut UI isn't wired yet. |
| Asana Integration config | **WORKING BUT FINICKY** | Manual URL pointing at a self-hosted "Flux Asana Widget Server" (lines 1779-1814) — not OAuth; real functionality delegated to that external server | Asana integration requires manually configuring a URL to a separate server component, not a one-click OAuth connect. |
| Asana connection status indicator | **NOT FOUND** — confirmed gap matching Plan 018's stated remaining item | Zero matches in `settings/index.jsx` | No visual confirmation in Settings of whether Asana is actually connected. |
| Slack / Calendar-provider integrations | **NOT FOUND** | No code for either | Not built. |
| Billing/subscription UI | **NOT FOUND** | No billing tab anywhere | Not applicable at this internal-tool stage. |

---

## 15. Popup / Quick Switch

`src/popup/index.jsx` (197 lines) — toolbar icon popup.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Quick tab search & switch | **WORKING** | Search-filtered, recency-sorted, capped at 15 tabs, click-to-focus | Fast fuzzy search across your open tabs from the toolbar icon — effectively satisfies Feature #176's "quick tab list" intent already. |
| In-app feedback (bug/idea) form | **WORKING** | Routes through `SUBMIT_FEEDBACK` → Asana edge function | Submit a bug report or idea directly from the popup. |
| Dedicated global hotkey for quick-tab popup | **NOT FOUND / needs verification** | UI hints at "Ctrl+Space" (line 126) but no confirmed `chrome.commands` manifest binding for that exact combo | The popup opens via the toolbar icon; whether a keyboard shortcut also opens it wasn't confirmed. |

---

## 16. Groups & Tab Management

`src/background/services/groupService.js` (189 lines, 4 handlers).

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Chrome tab groups CRUD + live sync | **WORKING** | Real `chrome.tabGroups`/`chrome.tabs` API calls, listeners keep metadata in sync | Grouping tabs (in Chrome or via Tabatha) keeps Tabatha's records in sync automatically. |
| Tabatha sub-groups (project/settings layer on top of Chrome groups) | **WORKING BUT FINICKY** | `CREATE_SUB_GROUP` handler (lines 122-125) only forwards `name` — silently drops `chromeGroupIds`/`projectId`/`settings` even though the underlying function accepts them | Sub-groups can currently only be created empty via the message API; some intended fields are dropped. |
| Group/sub-group deletion | **NOT FOUND** | No delete handler exists for either | No way to delete a sub-group once created. |

---

## 17. Calendar Sync

Plan 035 "unified_calendar" — plan-registry: "partial (1/3) — Phase 1 backend complete, Phases 2-3 pending."

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Local calendar/event CRUD + RRULE recurrence | **WORKING** | `src/background/services/calendarService.js:1-330`, hand-rolled RFC5545-ish recurrence expansion (lines 214-302) | You can create native calendars/events with recurring rules, entirely local. |
| Supabase cloud sync for calendars/events | **WORKING** | `syncService.js:454-620`, real bidirectional merge; schema at `supabase/migrations/014_add_calendar_sync_tables.sql` | Your calendar data syncs to the cloud and across devices. |
| Google/Outlook OAuth calendar sync | **NOT FOUND** | No OAuth flow or Graph/Calendar API client anywhere; `provider`/`syncToken` columns are schema-ready plumbing only | You cannot connect Google or Outlook Calendar yet — the database is ready for it, the integration code is not. |
| Calendar UI (Month/Week/Day view) | **NOT FOUND** | `react-big-calendar` not in `package.json`; zero calendar JSX components exist anywhere | There is no visual calendar grid anywhere in the extension yet — calendar is pure backend today. |
| Calendar Auto-Backfill (#192) | **PLANNED / COMING SOON** | No code found | Not built. |
| Meeting Block Detection (#193) | **NOT FOUND** | Zero "meeting" references in `autoFocusService.js`/`clockService.js` (note: meeting *suppression* for idle purposes exists — see §9 — but not calendar-triggered focus auto-transition) | Tabatha doesn't yet auto-switch your focus into "Meeting" mode from calendar events. |

---

## 18. Sync & Durability (Supabase)

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Core sync push (`syncToSupabase`) | **WORKING** | `src/background/services/syncService.js` — upserts focus/clock/org/calendar/desktop-activity rows with conflict handling, diagnostics logged to `chrome.storage.local._syncDiagnostics` | Your data pushes to the cloud on a 5-minute cadence or on-demand. |
| Bootstrap org-registry pull (dedup on first sync) | **WORKING** | `bootstrapPull.js:118-192` — case-insensitive re-keying of local entries to server IDs, FK rewriting, idempotent via watermark | New installs merge cleanly with existing team data instead of duplicating clients/projects. |
| Data rehydrate-on-signin | **WORKING** | `dataRehydrate.js:119-209` — pulls clock/intent/focus history, merges newest-wins, advances watermarks to avoid re-push churn | Signing in on a fresh install (or after an extension-ID change) restores your history from the cloud. |
| Sync diagnostics UI | **WORKING** | Consumed by settings sync-status chip | If sync silently fails, a diagnostic log explains why without needing DevTools. |
| Test coverage | **WORKING** | `test/dataRehydrate.test.js`, `test/syncAttribution.test.js`, `test/syncStatus.test.js` all substantive, not stubs | Regression-tested. |

---

## 19. Auth

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Google OAuth (via `chrome.identity`) | **WORKING** | `src/services/supabaseClient.js:74-135`, handles both PKCE and implicit-grant redirect shapes | Sign in with Google. |
| Magic link (email OTP) | **WORKING** | `supabaseClient.js:202-211` | Sign in via an emailed link. |
| Password sign-in | **WORKING** | `src/hooks/useAuth.js:255-262` | Standard email+password also works. |
| Session storage across MV3 service worker | **WORKING BUT FINICKY** | Custom `chromeStorageAdapter` + Web Locks shim exists specifically because MV3 doesn't share `localStorage` between the service worker and extension pages — code comments describe this as a real bug hit and fixed | Sign-in works reliably, but the underlying plumbing needed unusually defensive workarounds for Chrome's extension architecture. |
| Auto-provision profile on first login | **WORKING** | `useAuth.js:125-151`, 3-tier column fallback for un-applied migrations | Your account/profile row is created automatically on first sign-in. |

---

## 20. Org/Team Registry Backend (Clients/Projects/Tasks)

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Task CRUD + funnel-stage state machine | **WORKING** | `src/background/services/taskService.js:1-208` — real guardrails (`canTransitionStage`, lines 106-138): can't roll back to `unsorted`, `focus` stage requires name+description, backward transitions need confirmation | Task stage changes are validated server-side, not just cosmetically in the UI. |
| Category service | **WORKING** | `categoryService.js` — GET/CREATE/CLONE over built-in categories | Categories can be created or cloned with overrides. |
| Cold-storage archival of old tasks | **WORKING** | `taskService.js:140-176`, configurable `archivedTasksColdAfterDays` | Old completed/archived tasks are automatically moved to cold storage. |
| UI-to-backend wiring consistency | **WORKING BUT FINICKY** | `home/index.jsx`'s task board uses real `sendMessage` calls to `taskService.js`; but `ProjectsClientsPanel.jsx`/`InitiativesPanel.jsx` bypass the service entirely, writing directly to the same `tabathaOrg` storage key via `useOrgData.js` | Two different code paths edit the same data — one enforces stage-transition rules, the other doesn't. A task completed via the Projects/Clients panel skips validation that the main task board enforces. |

---

## 21. Multi-Profile Awareness & Team Visibility

Plans 027/028 — both marked `completed` in the plan registry.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Cross-profile awareness engine (heartbeat, Realtime, reconciliation) | **WORKING** | `src/background/services/awarenessService.js:1-540` — 60s heartbeat, 500ms-debounced storage-change push, Supabase Realtime subscription per profile, orphaned-install reconciliation | If you (or teammates) use Tabatha in multiple profiles, each shows up to the others as a live status chip. |
| Team Activity strip UI | **WORKING** | `src/components/OtherProfilesStrip.jsx` — live chips, stale-collapse into "+N offline" | See teammates' live clock/focus status as small chips. |
| Personal classification hides clock UI | **WORKING** | `src/services/installIdentity.js:15`, `settings/index.jsx:805,862,956` | Mark a profile "Personal" and the work clock-in UI disappears from it. |
| Manager RLS scoping + invite mint/revoke | **WORKING** | `supabase/migrations/012_manager_scoping_and_invite_mint.sql` (SECURITY DEFINER RPCs); consumed by `TeamActivityPanel.jsx` | Managers can generate/revoke team invite links and see their reports' status. |
| Org-attribution fix (v6.4.0) | **WORKING, verified present** | `supabase/migrations/018_redeem_sets_profile_defaults.sql:84-91` fixes `redeem_invite_token` never setting `default_org_id`/`team_id`, which previously caused synced team data to have `org_id=NULL` and never appear in owner views | A real, previously-shipped bug (invited teammates' data not showing up for the owner) is confirmed fixed. |
| Ghost-stint fix (durable install identity) | **WORKING** | `supabase/migrations/017_browser_profile_identity.sql:24-40` adds `local_id`/`machine_id` with a unique index to prevent duplicate/orphaned install rows after reinstall | Reinstalling the extension no longer creates a confusing duplicate "always clocked in" ghost entry. |

---

## 22. Notifications

`src/background/services/notificationService.js` (5 handlers) + call sites across services.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Pomodoro completion | **WORKING** | `notificationService.js:38-47`, `requireInteraction: true` | A notification when a Pomodoro session ends. |
| Focus drift / focus-expired (with action buttons) | **WORKING** | `focusService.js:1254`, button-wired to extend/complete actions | Click "Extend 5 min" or "Complete" directly from the notification. |
| Idle/context-drift nudges | **WORKING** | `tabTrackingService.js:153`, `focusService.js:1292` | A notification if you rapidly bounce between 4+ contexts in 5 minutes. |
| Welcome-back (idle resume) | **WORKING** | `clockService.js:481`, opens side panel on click | Prompted when you return from being idle. |
| Ambiguous-tab context prompt | **WORKING** | `tabService.js:689` | Notification nudging you to label a tab Tabatha couldn't auto-categorize. |

All `chrome.notifications.create()` call sites in the codebase were traced — none are stubs.

---

## 23. Feedback → Asana Pipeline

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| In-app feedback form (bug/idea) | **WORKING** | `src/background/services/feedbackService.js:97-149` — validates kind/length, requires real signed-in session token | Submit a bug or idea from the popup; it's authenticated, not anonymous. |
| `feedback-to-asana` edge function | **CODE COMPLETE, DEPLOY BLOCKED** | `supabase/functions/feedback-to-asana/index.ts:1-173` — fully implemented (token verification, server-side re-validation, pinned CORS), but hard-fails with 500 if `ASANA_PAT`/`ASANA_PROJECT_GID` secrets aren't set; plan-registry P0.6 confirms these are still pending | The code that would post feedback into Asana is finished and correct, but isn't live yet because the Asana credentials haven't been deployed to Supabase. |
| Attachments / voting / agent-triage loop (BD-12 full vision) | **PLANNED / COMING SOON** | Only plain-text bug/idea exists; explicitly "BD-12 first slice" per plan registry | The richer feedback system (screenshots, voting, agent-drafted triage) described in the backlog isn't built — only basic text submission is. |

---

## 24. Asana Task Integration (separate from feedback)

Plan 018 — plan-registry: "partial (3/5) — backend code exists... Gaps: frontend usage guide, e2e verification, Settings status indicator."

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Task URL resolver (Asana + ClickUp) | **WORKING** | `src/utils/taskUrlResolver.js:1-167` — parses both legacy and modern Asana URL schemes plus ClickUp | Recognizes Asana/ClickUp task URLs and extracts structured IDs. |
| Tab auto-intent from Asana URL | **WORKING** | `tabService.js:255-263,491-510` | Landing on an Asana task auto-labels the tab. |
| Manual "attach task to focus" UI / URL-triggered "create a focus?" prompt | **PLANNED / COMING SOON** — doc's "Planned" status is accurate for this specific UI | Neither flow found in code | You can't yet manually link an Asana task to a focus from a UI control, or get auto-prompted to create one from an Asana URL. |
| Widget server (`flux-asana-widget`) | **WORKING, standalone** | Separate Node service outside the extension bundle, real Supabase client + routes | A separate backend service handles some Asana logic outside the browser extension itself. |
| Settings status indicator for Asana connection | **NOT FOUND** — confirmed matching Plan 018's stated gap | Zero matches in `settings/index.jsx` | No visible "Asana: Connected/Disconnected" indicator in Settings yet. |

---

## 25. Companion Desktop — Tracking & Categorization

Tauri/Rust app at `C:\Users\mrmal\le dev\tabatha-desktop`.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| OS-level active-window tracking (Windows) | **WORKING** | `src-tauri/src/window_monitor.rs:56-198` — real Win32 API calls (`GetForegroundWindow`, `GetLastInputInfo`, etc.), 30+ exe-to-display-name map | On Windows, the companion genuinely watches which app/window has focus second-by-second. |
| macOS / Linux tracking | **STUBBED / PARTIAL** | `window_monitor.rs:202-232` — explicit `TODO` + `log::warn!("not yet implemented")`; returns `None`/`0` | The companion is effectively Windows-only today; other OSes silently do nothing. |
| App categorization | **WORKING** | `src-tauri/src/categorizer.rs:1-204` — 9 category rules, ~80 known executables, user override map (exact-match only, not fuzzy) | Apps and windows are automatically bucketed into categories like Development, Communication, Design. |
| Activity logging & persistence | **WORKING** | `src-tauri/src/activity_log.rs:1-556` — real SQLite (rusqlite), orphaned-session recovery on crash/restart, daily summary rollups | Activity survives a crash and reconciles orphaned sessions automatically. |
| Main tracking loop / tray / auto-start / URL protocol handler | **WORKING** | `src-tauri/src/main.rs:26-193,744-852` | Runs quietly in the system tray, can auto-start with Windows, and matches active windows against your current focus by keyword. |

---

## 26. Companion Desktop — WebSocket Bridge

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| WS server (`localhost:9147`) | **WORKING** | `src-tauri/src/ws_server.rs:1-479` — typed message enums, broadcasts app-switch/clock/idle/summary events, tracks connection state incl. "never installed" vs "was here, now gone" | The extension and companion talk to each other over a local WebSocket, and the companion can tell the difference between "never set up" and "was working, now disconnected." |
| `CATEGORY_RULES` sync from extension to companion | **STUBBED / PARTIAL** | `ws_server.rs:390-393` — explicit `// TODO: Merge with local categorizer`, currently just logs and discards | The extension can send its category rules to the companion, but the companion doesn't actually use them yet. |

---

## 27. Companion Install & Auto-Update

Plan 019 "distribution" — plan-registry: companion side is done, extension's own Chrome Web Store distribution is not.

| Feature | Classification | Justification | FAQ |
|---|---|---|---|
| Guided install / atomic extension deploy | **WORKING** | `src-tauri/src/installer.rs:1-345` — atomic copy-swap-rollback into `%APPDATA%\Tabatha Desktop\extension\`, 6 unit tests | The companion can install the extension for you into a well-known folder, safely. |
| Silent auto-update | **WORKING, rigorously built** | `src-tauri/src/updater.rs:1-582` — SHA-256 verification, manifest-key identity guard (won't swap if extension ID would change), path-guard against ever touching the SQLite DB, atomic swap, 12 unit tests including a byte-identical-DB-after-swap test | Updates apply automatically and are engineered to never corrupt your local data or orphan your settings. |
| Rust test coverage | **WORKING** | Exactly 23 `#[test]` functions confirmed across `installer.rs`(6)/`main.rs`(4)/`updater.rs`(12)/`ws_server.rs`(1) — matches plan-registry's claim precisely | Well-tested for a small companion app. |
| Extension's own Chrome Web Store listing/auto-update | **PLANNED / COMING SOON** | `docs/CHROME-WEB-STORE-LISTING.md` exists per commit history ("not yet submitted"); no CWS listing ID or `update_url` found | The extension itself is still installed via "Load unpacked," not the Chrome Web Store. |

---

## 28. Known Security Issue — RLS (flag prominently)

| Item | Classification | Justification |
|---|---|---|
| `public.flux_time_entries` RLS is **disabled** | **OPEN SECURITY ISSUE, confirmed still unresolved as of the latest plan-registry entry (2026-06-30)** | `.headbox/db-rls-audit-2026-06-02.md` finding A: table lives in the `public` schema (PostgREST-exposed by default) with `ENABLE ROW LEVEL SECURITY` commented out, originally deferred because "the widget server uses the anon key." Risk: if `anon`/`authenticated` roles have table grants, **anyone holding the publishable key (shipped inside the extension and the widget) could potentially read/write all workspaces' Asana time entries.** Plan-registry P0.5 lists this as "⚠️ OPEN — security risk flagged pre-team-live." No migration after 016 touches this table's RLS. The audit itself could not verify live DB state (no service-role key available to the auditor) — **someone with Supabase dashboard access should verify current grants today.** |

Three related RLS *recursion* bugs (introduced by migration 012, affecting `profiles`/`org_members`/`organizations`/`browser_profiles` writes) **are confirmed fixed** by migrations 015 and 016.

---

## 29. Companion Feature Parity / Distribution Ideas (Backlog — not built)

These are `.headbox/backlog-braindump-2026-05-29.md` items. All are **PLANNED / COMING SOON at best** — captured here for completeness, not because any code exists:

- **BD-1** Companion-managed distribution/updates for testers outside CWS review.
- **BD-2** Whether a CWS-installed extension can be capability-extended via the companion bridge (analysis only, no code).
- **BD-3** Zip-of-dist or public dist-only repo for non-GitHub testers.
- **BD-4** Pre-team-live sync/team-management audit + a personal/non-synced mode.
- **BD-5** Chrome Web Store eligibility analysis.
- **BD-6** Formal onboarding flow + help docs (role-based, progressive disclosure).
- **BD-7** "Just track everything passively" day-1 mode.
- **BD-8** Auto-break → auto-clock-out recovery after prolonged zero-activity.
- **BD-14** Deduped "wall-clock worked" vs "aggregate tracked" time metric.
- **BD-15** Auto-pause inattentive tabs + memory-jog note prompt.
- **BD-10** Master Notification Matrix (single registry of every popup/toast across surfaces).
- **BD-11** Headbox/Agency Vault cross-agent-harness context ingestion.
- **BD-16/17** Agent-directed or user-to-user focus/task injection ("baton passing").
- **BD-18** Formal focus/sub-focus/task/subtask data-model reconciliation doc.
- **BD-19** Sidebar inline focus description/steps, auto-collapsed.
- **BD-20/21** Path-pattern dedup and "target domain" intent clarification for the URL rules store (Plan 038 Phases 2+).

None of these have corresponding code — this section exists purely so an agent searching for "BD-#" doesn't waste time hunting for an implementation that isn't there.

---

## Needs Verification

Prioritized list for a follow-up pass — each line is something a human or another agent should confirm rather than something asserted as fact above:

1. **[HIGH — security]** Confirm live state of `public.flux_time_entries` RLS in the actual Supabase project (`mtdgoahskcibjbhfvofx`). The static audit could not check live grants; someone with dashboard/service-role access should verify today whether `anon`/`authenticated` can read/write this table, before any wider tester rollout. (§28)
2. **[HIGH]** `REMOVE_PARKED_TAB` message sent by the sidebar (`src/sidebar/index.jsx:726`) has no matching handler anywhere in `src/background` — confirmed dead via grep across all service files. Verify this is a real bug (not registered under an unexpected module name) and fix or remove the button. (§3, §10)
3. **[HIGH]** Feature #201 "Follow-Through Score" — plan-registry claims this was completed via Plan 031, but zero code exists under that name (`grep -ri "followThrough"` returns nothing). Either the feature was renamed to something else (check Plan 031's P1-P5 priority system and category/audit-logging work) or the plan-registry entry is simply wrong. (§9)
4. **[MEDIUM]** BD-13 as literally worded ("Homepage top-left 'this week' hours are mislabeled") doesn't match any label actually on the Home page — but a closely-related, definitely-real bug was found: Home's "active today" figure (`src/home/index.jsx:1690`) is actually a lifetime accumulator (`timeTracking.byTab`), never reset daily. Confirm with whoever filed BD-13 whether this is the same complaint from an older build, or whether there's a separate "this week" stat that has since been removed/renamed.
5. **[MEDIUM]** `feedback-to-asana` edge function deploy state — confirm whether `ASANA_PAT`/`ASANA_PROJECT_GID` Supabase secrets have been set since the last plan-registry update (P0.6 said "pending" as of 2026-06-30). The code is ready; only the ops step is unconfirmed. (§23)
6. **[MEDIUM]** `ProjectsClientsPanel.jsx`/`InitiativesPanel.jsx` write directly to the `tabathaOrg` storage key via `useOrgData.js`, bypassing `taskService.js`'s stage-transition guardrails and cold-storage archival entirely. Confirm whether this dual-path architecture is intentional or an oversight — a task marked complete via the Projects/Clients panel skips validation the main task board enforces. (§20)
7. **[MEDIUM]** B07 ("Cannot resolve paused focus from sidebar top spot") — code inspection (`src/sidebar/index.jsx:443`) suggests this is already fixed (the Resolve button has no `focusState` gate), but `docs/features/B07-*.md` still says "🔧 Fixing." Do a live click-test in the running extension to be certain no other blocking layer exists.
8. **[LOW]** Feature #186 "Context Link Indicator & Focus Counts" — the link-indicator half is confirmed WORKING (`inbar.js:489`), but no "focus counts" (tab/window count badges on focus cards) were located anywhere. Confirm whether this half exists under different naming or was never built.
9. **[LOW]** Gatekeeper's `parentContext` (nested "child of a preset" intent) is set (`gatekeeper.js:333-341`) but no consumer of that field was found beyond logging. Confirm whether this is dead/unused data or feeds something not yet located.
10. **[LOW]** `autoFocusService`'s "medium confidence" tier silently requires the desktop companion to be connected — confirm with product whether this is intended scoping (companion-only feature) or an unaddressed gap that quietly narrows Auto-Focus for anyone without the companion installed. (§8)
11. **[LOW]** Whether a `chrome.commands` keyboard shortcut (hinted "Ctrl+Space" in `src/popup/index.jsx:126`) actually opens the popup, versus that being stale placeholder text. (§15)
12. **[LOW]** BlockGate's "Manage blocked sites" UI location wasn't independently confirmed — the service handler (`blockgateService.js:83-106`) is solid, but which Settings section renders the add/remove UI wasn't traced in this pass. (§3)
13. **[LOW]** Migrations 002-013 and 015-019 (team time tracking, invite RPCs, Asana time entries, RLS fixes, owner read-views) were read individually by different sub-agents but not cross-verified end-to-end as one connected schema story — worth a single consolidated schema read if a future migration touches org/team tables.
14. **[LOW]** Companion's `src-tauri/src/lib.rs` (0 tests, only referenced as a library re-export) wasn't read in full — quick sanity check that it's not hiding untested logic.
