# Tabatha Family — Master Feature × Surface Matrix

**Last updated:** 2026-07-18 · **By:** Cirra (CC2) · **Asana task:** [1216678675876448](https://app.asana.com/1/9526911872029/project/1214031898449333/task/1216678675876448)

Surface versions at time of writing:

| Surface | Column key | Version | Notes |
|---|---|---|---|
| Chrome Extension (MV3) | **Ext** | **6.7.22** (team/prod) | This repo's changelog documents through 6.5.0; 6.6–6.8.x live on `feat/companion-*` / `Koda/asana-widget-pre-rebase` branches (see Plan 040 Addendum 2). Rows sourced from those lines are flagged `(?)`. |
| Tabby Sidecar (mobile PWA) | **Sidecar** | **0.2.1** | https://tabatha.pondocean.co/sidecar . The commissioning task said 0.2.0; v0.2.1 (phone-away red) shipped 2026-07-18 and is reflected here. |
| Context View (large-landscape Sidecar mode) | **CtxView** | ships with Sidecar 0.2.x | View-only ambient screen (TV / 3rd monitor). Controls stay on phone/extension. |
| Desktop Companion ("Tabby Desk", Tauri/Rust) | **Comp** | — (own line) | Window monitor, categorizer, WS server :9147, tray. |
| Marketing / showcase site (`/show`) | **Site** | date-tracked deploys | Promo homepage + component showcase + public roadmap; not a product runtime. |
| Asana widget (Flux Time Tracker) | **Widget** | — (own 0.x line pending, per Plan 040 Addendum 4) | `flux-asana-widget/` — Asana App Component: per-task start/stop timer + widget display over `flux_time_entries`. |

**Legend:** ✅ live · 🚧 partial · 📋 planned (linked to feature spec / Plan 040 epic) · — n/a (not applicable to that surface) · `(?)` = could not fully verify from this worktree (see Open Questions).

Planned-column anchors: `docs/features/NNN-*.md` specs and [Plan 040](superpowers/specs/2026-07-18-sidecar-timeline-voice-tasks-design.md) epics (E0–E10, B1/B2).

---

## 1. Focus / Intents

| Feature | Ext | Sidecar | CtxView | Comp | Site | Widget | Notes / spec |
|---|---|---|---|---|---|---|---|
| Intent / focus creation (label, timer, tags) | ✅ | ✅ | — | — | — | — | CtxView is view-only by design |
| Focus queue (priority-ordered) | ✅ | ✅ | 🚧 | — | — | — | CtxView shows "up next" only; empty-state choose-from cards 📋 [Plan 040 B2b](superpowers/specs/2026-07-18-sidecar-timeline-voice-tasks-design.md) |
| Focus timer + countdown display | ✅ | ✅ | ✅ | — | — | — | Sidecar pause→resume continuity fixed v0.2.0 |
| Pause / resume (elapsed preserved) | ✅ | ✅ | — | — | — | — | Sidecar pins paused focus at top (v0.1.0) |
| Focus edit (label, timer, stage, client/project, backdate) | ✅ | ✅ | — | — | — | — | Sidecar edit panel v0.1.0 |
| Checkpoint notes + timeline ([#184](features/184-checkpoint-progress-notes.md)) | ✅ | ✅ | 📋 | — | — | — | Ext: full edit mode (v6.3.0). Sidecar: `focus_checkpoints` (mig 032). CtxView nodes = [Plan 040 E2]. **No cross-surface round-trip yet** — extension doesn't sync `focus_checkpoints` |
| Checkpoint auto-prompts (CPN cadence, snooze, suppression) | ✅ | 🚧 | — | — | — | — | Sidecar gets staleness *push* only, no in-app prompt |
| Sub-intents / sub-focus (`tags._parent`) | ✅ | ✅ | ✅ | — | — | — | Ext v5.8.0; Sidecar+CtxView v0.1.0+ |
| Backburner dock ([#207](features/207-backburner.md)) | ✅ | ✅ | — | — | — | — | Resume / snooze / dismiss on both |
| Off-computer (off-device) intents ([#166](features/166-off-device-tracking.md)) | ✅ | ✅ | — | — | — | — | Idle-exempt (v6.1.0); renamed off-computer in Sidecar v0.1.0 |
| Funnel stages (unsorted→…→resolved) | ✅ | ✅ | — | — | — | — | State machine since v3.20.0 |
| Priority P1–P5 on focus items | ✅ | ✅ | — | — | — | — | Synced via `focus_items.priority` (mig 021, v6.5.0) |
| Auto-Focus heuristic engine (rules/domain/companion confidence) | ✅ | — | — | 🚧 | — | — | Companion supplies app-category signal (v6.0.0) |
| Context drift detection + drift prompt | ✅ | 🚧 | — | — | — | — | Sidecar receives drift *push* (v0.1.0); no on-phone drift engine |
| Intent-to-Focus bridge (`intentBridgeMode`) | ✅ | — | — | — | — | — | v3.34.5 |
| Voice capture ([#165](features/165-voice-notes.md) / [#211](features/211-audio-input-voice-control.md)) | 🚧 | 📋 | — | — | — | — | Ext has a basic `VoiceInput` (v3.12.4-α); Sidecar = [Plan 040 E1] (first build; iOS STT deferred). No voice in `sidecar/src` today |
| Phone Focus Mode (page-visibility nudge) | — | ✅ | — | — | — | — | v0.1.0 |
| Phone-away red alert on big screen | — | ✅ | ✅ | — | — | — | v0.2.1: `focusAway` signal over realtime; slow-fade default, immediate toggle |
| Pause-on-leave + server-push "you left" | — | 📋 | 📋 | — | — | — | [Plan 040 B1] — current leave behavior unreliable on mobile |
| Data-driven current focus (paused ≠ gone) | — | 📋 | 📋 | — | — | — | [Plan 040 B2] — pin is device-local today |
| Focus start/stop event log (`focus_events`) | 📋 | 📋 | 📋 | — | — | — | [Plan 040 §3] shared foundation (time-worked, timeline start-nodes) |
| Personality interrupts / Chaperone slice ([#182](features/182-chaperone-mode.md)) | 📋 | 📋 | 📋 | — | — | — | [Plan 040 E10] audio-pack v0 on the `focusAway` rail |
| Body doubling ([#215](features/215-body-doubling.md)) | 📋 | 📋 | — | — | — | — | Parked by owner's call |
| Timer-expired / welcome-back popups, popup harmony ([#185](features/185-popup-harmony.md)) | ✅ | 🚧 | — | — | — | — | Sidecar: timer-expiry push only |
| Persistent / recurring focuses ([#184b](features/184-persistent-focuses.md), [#174](features/174-recurring-focuses-tasks.md)) | 📋 | 📋 | — | — | — | — | Spec'd, not built |
| Backdate-overlap clamp fix | 🚧 `(?)` | — | — | — | — | — | On `fix/backdate-overlap-clamp` (6.7.23), merge state unverified |

## 2. Clock / Shifts

| Feature | Ext | Sidecar | CtxView | Comp | Site | Widget | Notes / spec |
|---|---|---|---|---|---|---|---|
| Clock in / out / break | ✅ | ✅ | — | ✅ | — | — | Companion tray + Desk panel; ext↔companion sync fixed v6.5.0 (FIX-02/05) |
| Unified account shift ("Also on the clock" / awareness chips) | ✅ | ✅ | — | ✅ | — | — | One shift, many devices (Sidecar v0.1.0; ext `browser_profile_status`) |
| Shift history | ✅ | ✅ | — | 🚧 | — | — | Ext Work Shifts page (3 views); Sidecar recent-shifts list; companion sessions sync via ext |
| Live Stints panel + ghost-stint cleanup | ✅ | — | — | — | — | — | v6.4.0 (mig 017, `LIST_LIVE_STINTS` etc.) |
| Remote clock-out of another install | ✅ | — | — | — | — | — | v6.4.0 self-command listener |
| Clock-stacking warning (concurrent shifts) | ✅ | — | — | — | — | — | v5.3.0; false-positive fix v6.4.0 |
| Auto clock-in on startup/unlock ([#187](features/187-auto-clock-startup.md)) | ✅ | — | — | ✅ | — | — | v6.0.0; unlock trigger via companion idle→active |
| Idle detection → prompt / auto-break | ✅ | — | — | 🚧 | — | — | Smart Idle Engine v6.0.0; companion feeds cross-app activity suppressor |
| Meeting detection (idle suppression) | ✅ | — | — | 🚧 | — | — | 3-layer scan incl. companion app (v6.0.0, bounded v6.3.1) |
| Work schedule view | ✅ | — | — | — | — | — | |
| Tracked-time editing (adjust / set-exact / remove-last-pause) | ✅ | — | — | — | — | — | v6.1.0; deep retroactive editing = [#195](features/195-retroactive-log-editing.md) 📋 |
| Per-task time tracking | 🚧 | 📋 | — | — | — | ✅ | Widget: start/stop per Asana task (`flux_time_entries`). Sidecar: [Plan 040 E4] via `focus_events`. Ext: focus-level only today |
| Time-block compliance ([#206](features/206-time-block-compliance-tracker.md)) / smart deferral ([#208](features/208-smart-deferral-stint-scheduling.md)) | 📋 | — | — | — | — | — | Spec'd |
| Calendar view / scheduling (Plan 035, [#192](features/192-calendar-auto-backfill.md)) | 📋 | — | — | — | — | — | Plan drafted, not shipped |

## 3. Tasks

| Feature | Ext | Sidecar | CtxView | Comp | Site | Widget | Notes / spec |
|---|---|---|---|---|---|---|---|
| Task create / complete / reopen | ✅ | ✅ | — | — | — | — | Sidecar `TasksScreen` is a flat list |
| Task edit (name/desc), delete-with-confirm | ✅ | 📋 | — | — | — | — | [Plan 040 E4] |
| Task detail view (description, attributed time, linked intents, subtasks) | 🚧 | 📋 | — | — | — | — | [Plan 040 E4]; ext shows tasks in org tree but no per-task time |
| Hide/collapse completed + done list | 🚧 | 🚧 | — | — | — | — | Sidecar shows Done section (cap 20), no toggle; E4 adds toggle |
| Start intent from task | ✅ | 📋 | — | — | — | — | [Plan 040 E3/E4] |
| Task ↔ intent linking (LinkMergeModal) | ✅ | — | — | — | — | — | |
| Funnel-stage editing on tasks | ✅ | — | — | — | — | — | |
| Org hierarchy (clients / projects / initiatives / operations) | ✅ | — | — | — | — | — | `tabathaOrg`, synced (mig 008) |
| Asana task pull + mutation sync ([#186](features/186-asana-focus-linking.md)) | 🚧 `(?)` | 📋 | — | — | — | 🚧 | Sidecar = [Plan 040 E3] (PAT/REST, Anasa review pending). Widget reads/writes time entries only. Ext Asana infra from Plan 018 — extent unverified on prod line |
| Subtasks as sub-intents (1:1 name/desc/deps/blockers) | 📋 | 📋 | 📋 | — | — | — | [Plan 040 E3 + Addendum 4 contract] |
| Recurring tasks ([#174](features/174-recurring-focuses-tasks.md)) | 📋 | 📋 | — | — | — | — | |
| Priority matrix / lazy priority ([#214](features/214-priority-matrix-lazy-priority.md)) | 📋 | 📋 | — | — | — | — | |
| Data-architecture normalization ([#213](features/213-focus-task-data-architecture.md)) | 📋 | 📋 | — | — | — | — | |

## 4. Notifications / Nudges

| Feature | Ext | Sidecar | CtxView | Comp | Site | Widget | Notes / spec |
|---|---|---|---|---|---|---|---|
| Chrome notifications (timer, idle, welcome-back…) | ✅ | — | — | — | — | — | |
| Web Push: timer expiry | — | ✅ | — | — | — | — | mig 030 `push_subscriptions`, `send-focus-push` edge fn, pg_cron (mig 031) |
| Web Push: drift + checkpoint-staleness | — | ✅ | — | — | — | — | v0.1.0 expanded push |
| Checkpoint staleness signal (in-UI amber) | ✅ | — | — | — | — | — | InBar + sidebar (v4.3.0) |
| Schedule-aware nudges ([#194](features/194-mobile-schedule-nudges.md)) | — | 📋 | — | — | — | — | [Plan 040 E8] on existing push cron |
| Phone-away server-push notify | — | 📋 | — | — | — | — | [Plan 040 B1] |
| "What's New" update popup + changelog view | ✅ | — | — | — | — | — | v6.5.0 (FIX-11) |
| Tray notifications / check-for-updates feedback | — | — | — | ✅ | — | — | v6.5.0 (FIX-04/06) |
| Mobile triggers / device proximity ([#164](features/164-mobile-triggers.md), [#183](features/183-device-proximity.md)) | — | 📋 | — | — | — | — | Native-tier (pickup, call state, geofence); web covers visibility subset only |

## 5. Views / Surfaces

| Feature | Ext | Sidecar | CtxView | Comp | Site | Widget | Notes / spec |
|---|---|---|---|---|---|---|---|
| Sidebar (Chrome side panel) | ✅ | — | — | — | — | — | Near-parity with home |
| Home dashboard (new-tab "Mission Control") | ✅ | — | — | — | — | — | |
| Tab-list popup + configurable toolbar click + hotkey ([#176](features/176-quick-tab-list-hotkey.md)) | ✅ | — | — | — | — | — | v6.5.0 (FIX-12) |
| Settings hub | ✅ | ✅ | — | 🚧 | — | — | Sidecar: account, notifications, intent defaults, Context View block. Companion: Desk panel settings |
| Context View (ambient landscape screen) | — | ✅ | ✅ | — | — | — | v0.2.0: brand BL, 1440-min day countdown (dayResetHour), current time, giant focus+timer+up-next, auto-switch |
| Context View timeline (checkpoints + start-nodes + overtime pulse) | — | — | 📋 | — | — | — | [Plan 040 E2] |
| Context View layout v2 | — | — | 📋 | — | — | — | [Plan 040 E6] (mockup first) |
| Context View customization (extension-side settings) | 📋 | — | 📋 | — | — | — | [Plan 040 E9] — must branch from current ext line |
| Notes-simple capture mode | — | 📋 | — | — | — | — | [Plan 040 E5] |
| PWA install (manifest, icons, Home-Screen) | — | ✅ | — | — | — | — | v0.1.0; unlocks iOS push |
| On-origin install CTA / site Install button | — | 📋 | — | — | 📋 | — | [Plan 040 E5] — `beforeinstallprompt` is origin-bound |
| Analytics dashboard (stat cards, charts) | ✅ | — | — | — | — | — | |
| Activity heatmaps ×3 (Browser / Overall / Follow-Through) | ✅ | — | — | — | — | — | |
| Logs panel (8 types, filters, pagination) | ✅ | — | — | — | — | — | |
| Unified timeline (browser + desktop activity) | ✅ | — | — | 🚧 | — | — | Companion is the desktop data source |
| Recent activity (all devices) | 🚧 | ✅ | — | — | — | — | Sidecar `RecentScreen`; ext has logs/intent history rather than a cross-device recent feed |
| Work Shifts page (3 views + Live Stints) | ✅ | — | — | — | — | — | |
| Desk Panel (companion debug/status UI) | — | — | — | ✅ | — | — | |
| Themes (multi-theme, high-contrast) | ✅ | — | — | — | — | — | Sidecar has its own fixed dark theme |
| Showcase / component gallery + public roadmap | — | — | — | — | ✅ | — | `/show`; maintained via `showcase-site-update` skill `(?)` (skill lives on the main line, not this worktree) |
| Homepage sign-in → Sidecar entry | — | — | — | — | ✅ | — | Added with Sidecar v0.2.0 promo pass |
| Help & docs page ([#168](features/168-help-docs-page.md)) | — | — | — | — | 📋 | — | |
| Per-task time widget UI in Asana (entry-point form + widget) | — | — | — | — | — | 🚧 `(?)` | Server + e2e verified (2026-04-29); Asana Dev Console registration / production deploy state unverified |

## 6. Capture / Browser Control

| Feature | Ext | Sidecar | CtxView | Comp | Site | Widget | Notes / spec |
|---|---|---|---|---|---|---|---|
| Per-tab intent (InBar content bar, edit dropdown, pause + sticky note) | ✅ | — | — | — | — | — | |
| InPop (new-tab intent prompt, inherited contexts) | ✅ | — | — | — | — | — | Variants [#180](features/180-inpop-variants.md) 📋; dropdown header [#212](features/212-inpop-intent-dropdown-header.md) 📋 |
| Gatekeeper empty-tab overlay (Continue / Side Quest / Sugar Box / Park) | ✅ | — | — | — | — | — | |
| BlockGate (site blocking) | ✅ | — | — | — | — | — | |
| Tab groups bidirectional sync (Chrome groups) | ✅ | — | — | — | — | — | |
| URL rules (auto-apply, auto-create focus) + intent changelog | ✅ | — | — | — | — | — | |
| Persistent domain history + Domain Groups (target/dismiss) | ✅ | — | — | — | — | — | v6.2.0 |
| Tab locking / URL lock | ✅ | — | — | — | — | — | |
| Sugar Box + parked tabs (auto-park with note) | ✅ | — | — | — | — | — | Stash delete [#177](features/177-sugarbox-stash-delete.md) 📋 |
| Tab rename + link tab to intent | ✅ | — | — | — | — | — | |
| Session restore ("Return to Flow") | ✅ | — | — | — | — | — | Full resurrection [#202](features/202-session-resurrection.md) 📋 |
| Markdown export for AI agents (auto + manual) | ✅ | — | — | — | — | — | Manual button v4.0.0 |
| Window/app monitoring (Win32) + activity log (SQLite) | — | — | — | ✅ | — | — | |
| App categorization (50+ apps) | — | — | — | ✅ | — | — | |
| Focus-resolution tab cleanup ([#209](features/209-focus-resolution-tab-cleanup.md)) | 📋 | — | — | — | — | — | |

## 7. Sync / Account

| Feature | Ext | Sidecar | CtxView | Comp | Site | Widget | Notes / spec |
|---|---|---|---|---|---|---|---|
| Auth: Google OAuth + magic link | ✅ | ✅ | — | — | — | — | Sidecar allowlist via Mgmt API |
| Cloud sync push (focus, intent history, clock, org, desktop activity) | ✅ | — | — | 🚧 | — | — | Companion data flows through the extension's `syncService` |
| Direct-Supabase data layer (read/write, RLS) | — | ✅ | ✅ | — | — | ✅ | Sidecar & widget talk to Supabase directly (no extension needed) |
| Realtime subscriptions | ✅ | ✅ | ✅ | — | — | — | Ext: profiles + status. Sidecar/CtxView: `focus_items` + `browser_profile_status` (mig 033) |
| Install identity (`browser_profiles` + durable `local_id`) | ✅ | ✅ | — | ✅ | — | — | v6.4.0 mig 017; companion proxy-registers (v5.3.0); Sidecar upserts on `(profile_id, local_id)` |
| Cross-device intent queue (read-only view of other installs) | ✅ | — | — | — | — | — | v6.5.0 (FIX-10) |
| Bootstrap org-registry pull + re-pull | ✅ | — | — | — | — | — | v5.0.0 |
| Sync Status panel + diagnostics | ✅ | — | — | — | — | — | |
| Data retention (configurable prune) | ✅ | — | — | — | — | — | |
| Sidecar-only self-sufficiency (defaults w/o extension) | — | 🚧 | 🚧 | — | — | — | First-class persona per [Plan 040 Addendum 2B]; gaps = feedback (E7), defaults (E9) |
| In-app feedback / bug report | — | 📋 | — | — | — | — | [Plan 040 E7] reusing `feedback-to-asana` edge fn `(?)` (deploy state to verify) |
| Auto-update distribution | 🚧 `(?)` | ✅ | — | 🚧 `(?)` | — | — | Sidecar: PWA re-fetch on launch. Ext/companion updater work lives on 6.7.x branches (`fix/updater-swap`, `feat/companion-update-manifest`) — unverified here |
| Privacy modes ([#198](features/198-privacy-modes.md)) | 📋 | 📋 | — | 📋 | — | — | Sticky-note parked |

## 8. Team / Org

| Feature | Ext | Sidecar | CtxView | Comp | Site | Widget | Notes / spec |
|---|---|---|---|---|---|---|---|
| Self-serve org creation | ✅ | — | — | — | — | — | v6.5.0 RPC (mig 020) |
| Invite tokens: mint / redeem / revoke | ✅ | — | — | — | — | — | v5.2.0–v6.5.0 |
| Team Activity panel (members, installs, live chips) | ✅ | — | — | — | — | — | v5.2.0 |
| Manager/owner RLS scoping | ✅ | ✅ | — | — | — | — | Backend policies apply to any client reading the tables |
| Per-install classification (Business/Professional/Work/Personal) | ✅ | — | — | — | — | — | Personal hides clock controls |
| Multi-user per-task time rollup | — | — | — | — | — | ✅ | Widget aggregates `flux_time_entries` by user |
| Team mutual dashboard ([#191](features/191-team-mutual-dashboard.md)) / team page ([#170](features/170-team-page.md)) / cowork activity ([#169](features/169-cowork-activity.md)) | 📋 | — | — | — | 📋 | — | |
| Blocker banner ([#181](features/181-blocker-banner.md)) | 📋 | — | — | — | — | — | |
| Client/project time attribution ([#188](features/188-client-time-attribution.md)) | 🚧 | — | — | — | — | — | Tags + org sync exist; reporting layer 📋 |
| Profitability ([#189](features/189-service-profitability.md)), QBO export ([#205](features/205-qbo-payroll-export.md)), review/approval ([#204](features/204-activity-review-approval-flow.md)), taxonomy ([#203](features/203-business-taxonomy-mapping.md)) | 📋 | — | — | — | — | — | Ops/reporting cluster, all spec-only |
| User-to-user requests ([#162](features/162-user-requests.md)) | 📋 | — | — | — | — | — | |

---

## Update Protocol

**Rule: when a feature ships or a plan lands, the matrix row changes in the SAME commit.**

Concretely:

1. Any commit that ships, partially ships, or newly plans a user-facing capability on any surface (extension, sidecar, context view, companion, site, widget) must also update the corresponding row(s) in `docs/FEATURE-MATRIX.md` — status glyph, version note, and spec link — **in that same commit**.
2. New feature specs (`docs/features/NNN-*.md`) get a 📋 row (or a cell on an existing row) when the spec is registered.
3. When a surface's version bumps, refresh the version in the surface table at the top.
4. Every edit updates the **"Last updated / by"** header line at the top of this file — that header is how staleness is detected at a glance.
5. Unverifiable statuses are marked 🚧 `(?)` and listed under Open Questions — never guessed as ✅.

**Proposed one-line addition to Headbox Local Rules (`AGENTS.md` / `CLAUDE.md` → Local Rules):**

> - **Update `docs/FEATURE-MATRIX.md` in the same commit** whenever a feature ships, partially ships, or a plan/spec lands — change the affected row(s) + the "Last updated / by" header; never let the matrix lag the changelog.

---

## Open Questions

1. **Extension 6.6.0–6.7.22 delta:** this worktree's base is 6.5.0 and `Tabatha_Changelog.md` documents through 6.5.0, but prod is 6.7.22 (per Plan 040 Addendum 2). What shipped in 6.6.x–6.7.x (companion updater/release work, backdate-overlap clamp, anything else) needs a changelog backfill and matrix pass from the `feat/companion-*` / `fix/*` branches.
2. **Asana widget deploy state:** `flux-asana-widget/` passed e2e locally (2026-04-29) but Asana Developer Console registration and production hosting were "next steps" — is the widget actually usable inside Asana today? Also: Addendum 4 says it's tangled in the 6.8.2 branch and needs its own version line.
3. **Extension Asana infra (Plan 018):** how much Asana linking ([#186](features/186-asana-focus-linking.md)) is live on the prod extension line vs. spec-only? Marked 🚧 `(?)`.
4. **`feedback-to-asana` edge function:** referenced by Plan 040 E7 as existing — deploy state unverified from this worktree.
5. **Site `/show` exact contents:** the showcase skill and site source live on the main line/site repo, not this worktree; the Site column is sourced from session-log summaries (homepage sign-in button, `/show` tiles + roadmap). A quick pass against the live site would firm those cells up.
6. **Sidecar version header:** task brief said 0.2.0; repo shows v0.2.1 shipped 2026-07-18 (phone-away red). Matrix uses 0.2.1 — confirm that's the intended baseline.
7. **Ext VoiceInput:** listed in the v3.12.4-α changelog; current wiring/health on the 6.x line unverified (kept 🚧).
