# Feature #220 — Session Aggregation & Automatic Progress Updates (Agent-Answered Checkpoints)

> **Status:** 📋 Planned · **Version:** v0.5.0
> **Depends On:** Plan 045 Agent Control Layer (`docs/plans/plan-045-agent-control-layer.md`, T1–T5) and its scope doc (`docs/cortex/PROGRAM-agent-control-layer.md`); C11a Agent Interaction Surfaces (`agentSessionService.js` / `agentSessionStore.js` — **merged to `staging`** at commit `8100859`); #219 Actor-Attributed History; #218 Agent Browsing Detection; desktop companion `window_monitor.rs` + `activity_log.rs` (`window_intent_map`) + `ws_server.rs` (`:9147`); checkpoint prompt path (`focusService.handleCheckpointPrompt` → `alarmService` `checkpoint-prompt-{focusId}` → InBar `_showCPNOverlay`)
> **Created:** 2026-07-19
> **Source:** User, 2026-07-19
> **Category:** Agent Control Layer / Attribution / Automation

## User Context (Quotes)

> "I think we need a CLI / API / MCP for Tabatha meant for an agent to use so it can properly fully manage Tabatha on behalf of the user, in background. And so that we can have a skill/plugin in harnesses like Codex or Claude Code that can easily and quickly commit to it and read it."
>
> "When we have this available I would want the same trigger that would otherwise ask a user for progress to be able to fire a hook or something that gets a background agent in a harness to leave an update automatically. Which means we would have to have the ability to designate a window or known session to be part of a focus or sub-focus."
>
> "Which means either the Tabatha desktop companion should be able to track sessions, or it has a plugin to Headbox that tracks sessions, so it can treat sessions, tabs and app windows all the same — aggregating information for all three to alleviate the user from having to type updates from activity happening in an agent session. And also agents can do the same when they are working autonomously."
> — User, 2026-07-19

## What It Does

Makes **harness agent sessions a first-class work surface** alongside browser tabs and OS app windows, attachable to a focus or sub-focus; and turns the existing checkpoint-progress prompt into an **event a background agent can answer** — so time spent inside an agent session produces written progress updates without the human typing them. The human is only prompted when no agent answers.

This is the **delta on top of Plan 045**, which already scopes the transports (MCP + CLI), the attributed write surface, and harness registration. #220 adds the surface model, the session-tracking source, and the checkpoint→agent hook.

## 1. Unified Work-Surface Model

One addressable kind of thing, three identifier flavours. Stored per focus (`workSurfaces` on the focus item) and mirrored in a flat index for reverse lookup.

```js
workSurfaces: [
  { kind: 'tab'|'window'|'session', ref, focusId, subFocusId?, attachedAt, attachedBy, actor, source }
]
```

| `kind` | `ref` identifies | Resolved by | Already exists today |
|---|---|---|---|
| `tab` | `chrome.tabs` tab id (+ URL fallback after restart) | `tabService` tab↔focus linking | ✅ tab linking + `#218` group verdicts |
| `window` | OS window: `{ appName, titleSubstring }` (companion normalizes `appName` lowercase) | companion `window_monitor.rs` → `activity_log.window_intent_map` | ✅ **partially** — `assign_window_intent()` / `list_window_intent_assignments()` exist; time rollup is explicitly a follow-up in that module |
| `session` | harness session id: `{ harness, sessionId, cwd?, pid?, windowRef? }` | **new** — see §2 | ❌ nothing today |

- `source`: `'manual'` (user attached), `'declared'` (agent announced), `'inferred'` (#218-style scoring).
- `actor` follows #219's `resolveActor()` — a `session` surface is always `agent:{c11aSessionId}`.
- A `session` surface **binds to a C11a span** (`agentSessionStore` scope, extended with `'session'` alongside `tab|window|machine`) so every downstream write is attributed without a second identity system.
- Sub-focus attach is the same shape with `subFocusId` set; a surface may attach to at most one focus at a time (re-attach moves it and logs a move event).

## 2. Session Tracking Source — Recommendation

| Option | Sees session identity? | Sees headless/background agents? | Cost |
|---|---|---|---|
| **(a) Companion tracks harness sessions** | ❌ — `window_monitor` sees a *terminal window* (app name + title), not which conversation/session is inside it. Multiple sessions per window (tmux, tabs, splits) collapse to one ref | ❌ — a cloud/background agent has no window at all | Rust work in an already-shipping module |
| **(b) Headbox plugin reports sessions** | ✅ — only the harness knows its own session id, cwd, model, and lifecycle | ✅ | New plugin per harness, but Headbox already governs harness install (program doc, "Dependencies / reuse") |

**Recommendation: (b) for identity, (a) for hosting — not either/or.**
- A **Headbox session plugin** emits `session.start` / `session.checkpoint-due` / `session.end` with `{ harness, sessionId, cwd, windowRef? }`. Headbox is already the layer that installs and configures harnesses, and it is the *only* place the session id is knowable. This also covers headless agents, which the companion structurally cannot see.
- The **companion hosts the registry and the bridge** — it already runs the authenticated WS server on `:9147` that Plan 045 T1 picks as the endpoint host, and it already owns `window_intent_map`. Sessions land in a sibling `session_surface_map` table so all three surface kinds resolve through one place.
- The companion **correlates** session → window opportunistically: when a session reports a `windowRef` (or its pid matches the foreground window), OS-window time for that terminal is credited to the same focus, closing the "sessions, tabs and app windows all the same" loop.

## 3. Checkpoint-to-Agent Hook (the core mechanism)

**Trigger point (exists today):** `alarmService` fires `checkpoint-prompt-{focusId}` → `focusService.handleCheckpointPrompt(focusId)` → after its gates (settings, snooze, `offDevice`, linked-task completion) it calls `broadcastAll({ type: 'CHECKPOINT_PROMPT', ... })`, which the InBar renders via `_showCPNOverlay({ triggeredBy: 'auto_prompt' })`.

**Change:** before broadcasting to humans, resolve the focus's `workSurfaces`. If any is `kind: 'session'` with a live C11a span, emit an **agent checkpoint request** instead of (or, per setting, in addition to) the human overlay.

```js
// CHECKPOINT_REQUEST — companion :9147 → Headbox plugin → harness agent
{
  type: 'CHECKPOINT_REQUEST',
  requestId,                 // idempotency key; one answer wins
  focusId, subFocusId,
  focusLabel, elapsedMs, checkpointCount, lastCheckpointAt,
  surface: { kind: 'session', ref: { harness, sessionId } },
  agentSessionId,            // C11a span
  expiresAt                  // now + agentCheckpointTimeoutSec
}
```

The agent answers by calling the Plan 045 write tool `tabatha checkpoint --focus <id> --text "…" --progress <level>` (MCP: `write_checkpoint`), which routes to the existing `SAVE_CHECKPOINT_NOTE` handler — no new checkpoint storage.

| Rule | Behaviour |
|---|---|
| **Timeout / no answer** | `expiresAt` passes with no matching `requestId` → fall through to the normal `CHECKPOINT_PROMPT` broadcast. Default timeout 45s. The human path is never *removed*, only deferred. |
| **Agent answers** | Checkpoint written with `triggeredBy: 'agent_auto'`, `actor: 'agent:{c11aSessionId}'` (#219), `agentName` denormalized (C11a spans are 200-FIFO-capped). Renders in the CPN timeline with the 🤖 violet badge. |
| **Both** | Setting `agentCheckpointMode: 'replace' \| 'augment' \| 'off'` — `augment` pre-fills the human overlay with the agent's draft instead of suppressing it. Default `replace`. |
| **Duplicate answers** | First write for a `requestId` wins; later ones return a no-op with the winning checkpoint id. |
| **Snooze/off-device gates** | Unchanged and evaluated *first* — an agent hook never bypasses a gate that would have suppressed the human prompt. |

## 4. Autonomous Self-Reporting

Same write path, agent-initiated rather than request-initiated: an agent working on its own declares a C11a session (`ANNOUNCE_AGENT_SESSION`), attaches its session surface to a focus (creating an ad-hoc focus if none matches), and posts checkpoints at its own milestones with `triggeredBy: 'agent_self'`. Identical attribution, identical storage, identical reversibility — the only difference is the absence of a `requestId`. This is Plan 045 T3's "working memory" primitive used proactively; the proactivity dial (C8) governs whether an unrequested self-report is written silently or queued for confirmation in the C10a reconciliation panel.

## 5. Harness Skill / Plugin

Ships as one Headbox-installable bundle per harness (Claude Code, Codex), wrapping the Plan 045 MCP tools:

| Capability | Backed by |
|---|---|
| `what_am_i_working_on` — current focus, intent, elapsed, last checkpoint | 045 T1 read tools (`GET_FOCUS_ENGINE`, `GET_CLOCK_STATUS`) |
| `attach_session` / `detach_session` — bind this session to a focus or sub-focus | **new** (§1) |
| `write_checkpoint` — answer a request or self-report | 045 T2 + `SAVE_CHECKPOINT_NOTE` |
| `set_intent` / `start_focus` | 045 T2 |
| checkpoint-due hook subscription | **new** (§3) — the plugin's session hook, not an MCP tool |

## Relationship to Plan 045

| Piece | Status |
|---|---|
| MCP server + CLI transports, loopback auth, companion-hosted endpoint | **Plan 045 T1** — already scoped |
| Attributed write surface (intent/focus/clock/context-note), hard C11a gate, audit + reversibility | **Plan 045 T2** — already scoped |
| Checkpoint / handoff / "what was I doing" primitives | **Plan 045 T3** — already scoped |
| Governance: scopes, rate limits, kill switch | **Plan 045 T4** — already scoped |
| Harness registration via Headbox conventions | **Plan 045 T5** — already scoped |
| **Unified work-surface model** (`session` as a peer of tab/window; `'session'` C11a scope) | **NEW** |
| **Headbox session plugin + companion session registry / window correlation** | **NEW** |
| **Checkpoint→agent hook** (`CHECKPOINT_REQUEST`, timeout fallback, `agentCheckpointMode`) | **NEW** |
| **Autonomous self-reporting semantics** | **NEW** (T3 supplies the primitive; the policy is new) |

**Proposal:** these four NEW items are a **sibling plan — 047** (next free number per `.headbox/plan-registry.md`; 046 is UI/UX Overhaul), gated behind Plan 045 T1–T2, rather than an expansion of 045. Rationale: 045 is a transport/permission plan whose parallelability review assumes `background.js` stays untouched, while #220 changes focus-item shape, the checkpoint alarm path, and the companion schema. Keeping them separate preserves 045's clean, independently shippable slices.

## Open Questions

1. Does a session surface **auto-attach** to the currently active focus on `session.start`, or always require an explicit `attach_session`? Auto-attach is frictionless but mis-attributes a session started during unrelated work.
2. `window_intent_map` keys on `(app_name, title_substring)`, not a live window handle — good for durable rules, wrong for "this specific window". Does the `window` surface need a second, ephemeral handle-keyed table?
3. Should an agent-written checkpoint be allowed to set the **progress level** (which feeds follow-through scoring, #201), or only free text — with progress left human-only?
4. `agentCheckpointMode: 'replace'` means a focus with an attached session may go a whole day with zero human prompts. Is a daily "here's what your agents said" digest required, or does the C10a reconciliation panel cover it?
5. Trust boundary: Headbox plugins run inside harnesses the user installs but does not author. Does the plugin get its own token/scope distinct from the user's CLI token (045 T4)?
6. If a session and a tab attached to the *same* focus disagree (agent says "done", human still browsing), which wins for focus state transitions?

## Related Features

- **Plan 045 / Agent Control Layer program** — the CLI/MCP substrate this rides on
- **C11a Agent Interaction Surfaces** — spans, `'session'` scope extension, 🤖 badges (on `staging`)
- **#219 Agent vs Human History** — `resolveActor()` and the analytics-exclusion predicate for agent-written checkpoints
- **#218 Agent Browsing Detection** — inferred-verdict pattern reused for `source: 'inferred'` surfaces
- **C10a Context Reconciliation Panel** — human review of agent-made context writes
- **#184 Persistent Focuses / CPN** — the checkpoint stream these updates land in
