# Implementation Plan 040: Tabby Sidecar — Voice, Timeline, Tasks/Asana, Phone-Away (v0.3.x)

**Extension version:** 6.5.0 · **Sidecar at start:** v0.2.0 · **Target on completion:** Sidecar v0.3.x
**Date:** 2026-07-18 · **Owner:** Claude (Opus 4.8), worktree `claude/tabby-sidecar-mobile-46c612`

> Status: **DESIGN — not yet approved to build.** This is the "clean it up before
> taking action" pass. Build order + decisions below; each epic becomes its own
> implementation plan via writing-plans once approved.

---

## 1. Framing

Five features requested for the Sidecar (+ its Context View). They look sprawling
but map onto primitives that already exist (sub-intents, checkpoints, tasks_registry,
browser_profile_status realtime). The unifying insight: **most of this needs one
small shared foundation — a per-focus start/stop event log — which then unlocks the
timeline's start-nodes AND accurate per-task time.** Build that once, early.

## 2. Decisions locked (from the 2026-07-18 brainstorm)

- **Task source:** Asana via **REST API using the user's PAT** — *not* the Asana
  MCP (MCP is only for LLM-driven use; this sync is deterministic code). Scope:
  pull tasks in + sync task mutations (complete/reopen/edit) + time tracking.
  **Anasa gets a review pass** (both have APIs) to confirm it isn't the better
  source, since Anasa already mirrors Asana and is built for agent/human collab.
- **Timeline nodes:** checkpoints/progress notes **+ every start** of the intent
  (each with hover date/time); start-nodes convey cumulative time worked → requires
  the start/stop event log.
- **Portfolio audit:** parked as its own track (see `docs/portfolio-track.md`).
- **Phone-away red:** already coded in the working tree — treat as verify + ship.

## 3. Shared foundation — focus start/stop event log

**New table `tabatha.focus_events`** (owner-RLS, in realtime publication):
`(id, profile_id, focus_client_id TEXT, kind TEXT CHECK in
('start','pause','resume','resolve'), at TIMESTAMPTZ, source TEXT, meta JSONB)`.

- Written whenever a focus is started / resumed / paused / resolved (Sidecar now;
  extension later for full parity).
- **Time worked** = sum of (resume/start → next pause/resolve) intervals. Feeds
  Epic 2 (start-nodes + "time spent") and Epic 4 (per-task time).
- Why not reuse `intent_history`: that's an action log (rolling, capped); pairing
  intervals for accurate time needs a dedicated, uncapped event stream.

## 4. Epics

### Epic 0 — Phone-away red on Context View (verify + ship)
- **State:** implemented in working tree. `PhoneFocusMode` writes
  `browser_profile_status.metadata.focusAway`; `ContextView` reads it over realtime
  and fades a red "put the phone down" overlay — **slow fade by default, immediate
  via `settings.sidecar.focusAwayImmediate`**.
- **To do:** live-test the away→signal→red round-trip across two devices; add the
  immediate toggle to Settings; commit + deploy.

### Epic 1 — Voice Capture ⭐ (first build)
- **What:** a mic button that turns speech into (a) a new intent, or (b) a
  checkpoint/progress note on the current focus.
- **How:** Android/desktop Chrome → Web Speech API (`webkitSpeechRecognition`),
  live transcript into the intent/checkpoint field. iOS (no SpeechRecognition) →
  fallback: record via MediaRecorder → server STT (deferred; show "hold to record"
  only where supported). Permission-gated; graceful "not supported" state.
- **Surfaces:** Focus screen new-intent input + checkpoint panel note field.
- **Independent** of the event log — ships first.

### Epic 2 — Context View timeline
- **What:** a thin horizontal line across the bottom that fills as the focus timer
  counts down; **line end = intended end time**. Nodes along it:
  - checkpoint/progress notes (from `focus_checkpoints`),
  - **each start** of the intent (from `focus_events`), hover → date/time; start
    nodes show cumulative time worked.
- **Overtime:** the line can't leave the screen, so past 100% it feeds a **solid
  circle at the end that pulses (slow), grows very slowly, with trails**; the rest
  of the screen compacts slightly. Keep the existing circular countdown ring too.
- **Depends on:** `focus_events` (start-nodes) + `focus_checkpoints` (existing).
- **Subtask layer (with Epic 3):** when the focus is a task with subtasks, a second
  timeline lane shows the subtasks.

### Epic 3 — Tasks ↔ Asana (PAT) / Anasa + subtasks
- **What:** pull tasks (with subtasks) into the task list; "Start task" makes the
  task an **intent**, and its subtasks become selectable **sub-intents** (existing
  `tags._parent`). Connected; shown on Context View + the timeline subtask lane.
- **Sync engine (deterministic, PAT-based, NOT MCP):** a background/edge sync that
  (a) pulls Asana tasks+subtasks → `tasks_registry` (+ `task_links` for external
  ids/urls), (b) pushes mutations (complete/reopen/edit) back, (c) reconciles time
  tracking (`focus_events`/`tasks_registry.total_time_ms`) to Asana. **Open
  sub-decision:** where it runs (extension background — which already has Asana
  infra from Plan 018 — vs a Supabase edge function) and where the PAT is stored
  (encrypted, server-side).
- **Anasa review (pre-req):** confirm whether to source from Anasa's API (it already
  ingests Asana + is agent-friendly) instead of/along with direct Asana. Output: a
  short recommendation before finalizing this epic.
- **Mapping:** parent task = intent, subtask = sub-intent (already exists).

### Epic 4 — Fix Sidecar Tasks view (foundational for Epic 3)
- **What:** open a task → detail (description, **time attributed** from
  `focus_events`, linked intents, subtasks); **hide/collapse completed** (toggle) +
  a dedicated done list; start-task / start-subtask entry points.
- **Shared data (`tasks_registry`)** → the extension Tasks UI gets the same fixes;
  Sidecar first, extension follow-up (separate UI, same data layer).

## 5. Build sequence (small, compounding)

1. **Epic 0** — verify + ship phone-away red (already coded).
2. **Epic 1** — Voice Capture (independent, high-leverage).
3. **`focus_events`** foundation → **Epic 4** Tasks view (real per-task time).
4. **Epic 2** — Context View timeline (checkpoints + start-nodes + overtime circle).
5. **Anasa review** → **Epic 3** — Asana(PAT)/Anasa task pull + subtasks-as-sub-intents.

## 6. Open sub-decisions (resolve as we reach each epic)
- Epic 3: sync location (extension background vs edge fn) + PAT storage; Asana vs
  Anasa source (pending the Anasa review).
- Epic 1: iOS voice — ship Android/desktop now, defer iOS record+STT.

## 7. Parked
- **Portfolio audit** (Headbox / Caspera+subsystems / SteadyStars / Flux / Tabatha /
  Anasa / Heimdall): captured in `docs/portfolio-track.md`; its own effort, needs
  Heimdall + old-machine access. Not in this plan.

## Parallelability Review
- Zones: `sidecar/` app; one additive Supabase migration (`focus_events` +
  realtime); one new Asana-sync unit (Epic 3). No edits to extension `src/` except
  the eventual Tasks-view parity (separate follow-up). Parallel-safe with other
  worktrees. Max branch lifetime: per-epic; each epic is its own short-lived branch.

---

## Addendum — 2026-07-18 (corrected live-testing notes)

### Live bugs to fold in early
- **B1 — Phone Focus Mode on leave.** Leaving the screen while Focus Mode is on
  must (a) **pause the active focus** — NOT clear it — and (b) actually **notify**.
  Client-side `showNotification` fired at `visibilitychange` is unreliable on mobile
  (the page is backgrounding). Fix: the `focusAway` signal already lands in
  `browser_profile_status`; drive the "you left" alert from a **server push**
  (edge fn reacting to the signal) so it's reliable, and pause the focus on leave.
- **B2 — "No active focus" is wrong after pause.** The current-focus pin is
  **device-local** (AsyncStorage), so the Context View on another screen falls back
  to "most-recent-active" → shows nothing when paused. Make current-focus
  **data-driven**: active focus → else **most-recent paused (non-resolved)** focus →
  else empty. Only show "no active focus" when the last one was **resolved**. Keep
  the local pin only as a same-device tiebreaker.
- **B2b — Empty state = choose-from cards.** When there's genuinely no active/paused
  focus, the large Context View shows the **pending focuses as priority-ordered
  cards across the screen** (glanceable menu; still view-only — user selects from
  phone/extension).

### New epics
- **Epic 5 — "Notes-simple" capture mode + instant install.** A dead-simple default
  surface (positioned like a **Notes app**): type or **speak** (ties to Epic 1) →
  it becomes an intent; minimal chrome. A toggle flips to the current full view
  (all buttons/features). Marketing site gets an **"Install" button** that fires the
  PWA install prompt. *Constraint:* `beforeinstallprompt` only fires on the app's
  own origin, so the install button lives on `/sidecar` (the promo site deep-links
  to it, or shows an inline install CTA once on-origin). Product framing: "a Notes
  app that's secretly an attention OS," full extension = the deep version.
- **Epic 6 — Context View layout v2 (mockup first).** Bigger title that **overlaps
  the circular timer**: title **top-left (huge)**, timer **bottom-right (huge)**,
  existing options **bottom-left**, top-right absorbed by the title (some negative
  space, intentionally). Reconcile with day-countdown / current-time / brand from
  v0.2 (likely: brand BL with options, day-countdown small, time BM). Explore in the
  mockup before wiring.

### Answers captured (not tasks)
- **PWA auto-update:** yes — installed PWAs re-fetch from the origin and update on
  next launch/reload; our Worker serves fresh assets so updates are immediate on
  reload. Add a proper update UX (SW `skipWaiting` + "new version — tap to refresh")
  and decide the offline-cache tradeoff (we currently don't cache the shell, so
  updates are instant but there's no offline yet).
- **Permissions/capability list:** delivered previously (Notifications, Geolocation
  [the "maps"/location context], Camera/Mic, Motion sensors, Wake Lock, Share
  Target, Badging, etc.). Captured; can become a permissions roadmap when we build
  the leverage features.

### Updated sequence
0. Phone-away red **+ B1 (pause-on-leave + reliable server-push notify)** — verify + ship.
1. **B2/B2b** — data-driven current-focus + Context View choose-from cards (quick, high-value).
2. **Voice Capture** (Epic 1) — also unlocks Epic 5's "speak a note".
3. **Epic 5** — Notes-simple mode + install button.
4. `focus_events` → **Epic 4** Tasks view.
5. **Epic 2** timeline; **Epic 6** layout v2 (mockup → wire).
6. Anasa review → **Epic 3** Asana/Anasa tasks + subtasks.

---

## Addendum 2 — 2026-07-18 (state-of-the-world correction + expansion)

### A. Version correction & repo state map (surveyed 2026-07-18)

The header's "extension 6.5.0" is **this worktree's stale base**, not reality:

| Where | Version | Notes |
|---|---|---|
| **Chrome-loaded dist** (`Le Dev\Tabatha\dist`) | **6.8.2** | matches `Koda/asana-widget-pre-rebase` line |
| Team/production release (user-stated, site) | **6.7.22** | = `feat/companion-update-manifest` / `feat/companion-release` |
| Site staging | 6.7.23 | `feat/site-sidecar-promo` (deployed to Pages prod) |
| Highest fix branches | 6.7.24 / 6.7.23 | `fix/updater-swap`, `fix/backdate-overlap-clamp` |
| local `staging` | 6.7.8 | behind the feature branches |
| `origin/staging` | 6.6.0 | **GitHub has drifted behind the local line** |
| `origin/main` | 6.5.0 | last promoted release |
| this worktree's base | 6.5.0 | fine for `sidecar/` (isolated) — NOT for extension work |

**Rules derived:**
1. **Sidecar-only work continues here** — `sidecar/` + additive migrations don't touch extension `src/`, so the stale base is harmless.
2. **Any extension-side epic (Epic 9 below, Tasks-view parity, checkpoint/sub-intent sync) must branch from the current line (6.7.24+/6.8.2 lineage), never from this branch.**
3. **Repo reconciliation is a needed, separate chore:** promote the 6.7.x/6.8.x line through staging→GitHub so "GitHub is source of truth" is true again. Parked as its own task — not blocking Sidecar epics.

### B. Sidecar-only users are a first-class persona
Some users will have **only Sidecar access** (no extension, no companion). Implications, folded into all epics: Sidecar must be self-sufficient (feedback/bug reporting on-device — Epic 7; defaults for everything the extension would otherwise configure — Epic 9's "defaulted without extension"; Notes-simple onboarding — Epic 5; no assumption a desktop pull will ever run).

### C. Rolled in from the mobile feature docs (docs/features)
- **#165 Voice Notes (v0.3.0)** — *is* Epic 1; adopt its spec: Web Speech on-device first, Whisper opt-in later, notes linkable to focus/task, offline-record→sync as an open question. Epic 1 now cites #165.
- **#194 Mobile Schedule Nudges (v0.4.0)** — **rolls in now as Epic 8**: we already have the delivery rail (push_subscriptions + send-focus-push + pg_cron). Add schedule-aware passes ("9:15 — are you working yet?" when no clock-in; block-starts-soon) reading Work Shifts data. Configurable frequency/DND.
- **#164 Mobile Triggers / #183 Device Proximity (v0.4.0)** — phone-pickup/call-state/geofence/BLE need **native**; the web PWA already covers the visibility-based subset (Phone Focus Mode). Parked for the native build; webhook subsystem noted for later.

### D. New epics (from sidenotes)
- **Epic 7 — Feedback & bug reporting in Sidecar.** A "Send feedback / report a bug" item (Settings + long-press/shake later) → reuses the **existing `feedback-to-asana` edge function** (deploy-state to verify) with device/app context attached (version, surface, ua). Quick win; important for sidecar-only users.
- **Epic 8 — Schedule nudges (#194).** As above, on the existing push cron.
- **Epic 9 — Context View customization (extension-side).** Extension Settings section to customize the Context View (which elements show: day countdown, up-next, timeline; colors/intensity; phone-away fade speed incl. `focusAwayImmediate`; day-reset hour) persisted to `settings.sidecar`/`settings.contextView` on the profile so the view reads it anywhere. **Without the extension, sensible defaults apply** (sidecar-only users get the default view; Sidecar Settings keeps its minimal subset). *Must be built from the current extension line (rule A2).*

### E. Asana PAT
The user's Asana PAT is already available on this machine (asana-cli credential store). Epic 3's sync uses it via **REST** (per the locked decision); storage/scoping design still to come in that epic's plan.

### F. Answers (asked in the notes)
- **Do PWAs auto-update?** Yes — the installed PWA is a wrapper over the origin; each launch/reload re-fetches, and our Worker serves fresh assets (no shell cache yet), so updates apply on next open. We'll add a "new version — tap to refresh" UX when we introduce offline caching.
- **Capability list (notifications, maps, etc.):** delivered in full earlier this session (notifications/badging/media, motion/idle sensors, geolocation, mic/camera/speech, share-target, wake-lock, passkeys, background sync; native-only: geofencing, live activities, widgets, call/app state). #164/#183 map onto the native-only tier.

### G. Updated build sequence (supersedes Addendum 1's)
0. **Epic 0 + B1** — phone-away red verify+ship; leave ⇒ **pause (not clear)** + reliable **server-push** notify.
1. **B2/B2b** — data-driven current focus (paused ≠ gone; resolved ⇒ empty) + choose-from priority cards when truly empty.
2. **Epic 1 (#165)** — Voice Capture.
3. **Epic 7** — Feedback/bug reporting (small, unblocks sidecar-only users).
4. **Epic 5** — Notes-simple mode + on-origin install CTA.
5. **`focus_events`** → **Epic 4** Tasks view.
6. **Epic 2** timeline + **Epic 6** layout v2 (mockup first).
7. **Epic 8 (#194)** — schedule nudges on the push cron.
8. **Anasa review** → **Epic 3** — Asana(PAT) tasks + subtasks-as-sub-intents.
9. **Epic 9** — Context View customization (extension-side, from current line) — alongside the repo-reconciliation chore.

---

## Addendum 3 — 2026-07-18 (personality/audio + body doubling intake)

- **Epic 10 — Personality Interrupts v0 (#182 slice).** Pre-recorded audio lines
  played by the **Context View / extension** when the phone-side trigger fires on
  the existing `focusAway` realtime rail (pickup/navigate-away now; call/SMS/
  caller-ID = native-tier, parked with #164/#183). Personality packs, intensity,
  quiet hours in `settings.chaperone`; empty threats are theater, config-gated,
  never real actions. **No AI required** — this is audio assets + the Epic 0
  channel. Sequence: after Epic 1 (Voice Capture) — same audio domain, tiny lift.
  Full agentic Chaperone (TTS, context interpolation, "click to engage" with
  Hermes-first/OpenClaw engine + Flux context) stays Flux-track; enrichment
  recorded in `docs/features/182-chaperone-mode.md`.
- **#215 Body Doubling** — created and **parked by owner's call** ("own thing,
  down the timeline"): queue + one-click pairing of live-working users, BYO
  Meet/Twitch/Kick/YouTube link, Tabatha provides pairing/presence/frame. First
  step when picked up: research the science of body doubling.
- **Principle recorded** in `Tabatha_Concept.md`: **Progressive Simplicity** —
  capability grows while upfront surface shrinks ("just do and just say").

---

## Addendum 4 — 2026-07-18 (Epic 3 contract + operating model)

- **Epic 3 mapping is 1:1:** Tabatha tasks ↔ Asana tasks on **name, description,
  subtasks, dependencies, AND blockers** (both directions on mutation sync).
  `tasks_registry` gains `dependencies`/`blockers` (JSONB of task ids) or a
  relation table — decided in Epic 3's implementation plan. Blocker/dependency
  state should surface in the Tasks view (Epic 4) and queue ordering.
- **Surface versioning decision (proposed, System Map will codify):** each
  surface gets its **own version line** — Extension `6.x` (prod 6.7.22 in Google
  Workspace), **Sidecar `0.x`** (already separate, 0.2.x), **Asana widget → own
  `0.x`** (currently tangled in the extension 6.8.2 branch — untangle), site
  deploys tracked by date+deploy id. The repo-wide `version:sync` stays the
  extension's; other surfaces version independently.
- **Operating model (while orchestrator is Fable 5):** orchestrator stays in
  orchestrate/review/delegate/tastemake lanes; execution goes to **named Anasa
  players** (vetted personas: Cirra/CeeCee/Cindra, Koda/Dex/Rook, Argus/Aegis)
  with bounded Asana-tasked scopes, player credentials, progress updates on
  their tasks, and persona continuity. Koda co-deliberates on plans.
