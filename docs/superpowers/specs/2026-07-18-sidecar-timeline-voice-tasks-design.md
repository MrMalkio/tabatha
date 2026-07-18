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
