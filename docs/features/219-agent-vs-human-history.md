# Feature #219 — Agent History vs Human History (Actor-Attributed Records)

> **Status:** 📋 Planned · **Version:** v0.5.0
> **Depends On:** C11a Agent Interaction Surfaces (agent sessions — shipped on `claude/tabatha-ai-integration-layer-91903b`, commit `8100859`), #218 Agent-Tab Classification, #171 Log Interaction Tracking, #172 History Queue Recovery
> **Created:** 2026-07-16
> **Source:** User, 2026-07-16
> **Category:** Attribution / History / Analytics

## User Context (Quotes)

> "Agent history versus human history — if agents are using the browser on behalf of the user, then we probably want to know their history as well and separate it from the main user."
> — User, 2026-07-16

## What C11a Already Provides (baseline)

C11a shipped the *session* half of attribution: `agentSessionStore.js` (pure spans: `{ id, agentName, scope:'tab'|'window'|'machine', tabId?, windowId?, supervising, source:'manual'|'announced', startedAt, endedAt, autoExpiresAt }`) + `agentSessionService.js` (`START/ANNOUNCE/END/LIST_AGENT_SESSIONS`, `agentSessions` storage key, 200-cap), the InBar 🤖 toggle, InPop "Who's working?" control, home AgentSessionChip, and `captureService` stamping `controller:'ai-agent'` / `controllerSource` / `agentSessionId` onto Cortex *observations* when a span covers the target. **What it does NOT do:** stamp any of Tabatha's own history records (logs, focus/clock history, domain history, group events), offer any filtered history view, or keep agent time out of analytics. That is this feature.

## What It Does

Every history-bearing record Tabatha writes carries an **`actor` attribution** — `'human'` or `'agent:{sessionId}'` — derived at write time from the C11a agent-session service (does an open span cover this tab/window/machine?) plus per-tab agent classification (#218). History surfaces gain actor filters, agent activity gets its own reviewable audit trail per session, and agent time is excluded from the user's focus/productivity metrics by default.

## Records to Attribute

| Record | Where written today | Attribution attaches to |
|---|---|---|
| Activity logs (`tabathaLogs`, 500-cap) | `tabService`, `focusService`, `clockService`, `autoFocusService`, etc. — direct `logs.push(...)` + `setStorage` | each log entry: `actor`, `agentSessionId?`, `agentName?` |
| Visited pages / domain history | `domainHistoryService` (`domainHistory` key, per-domain entries) | per-visit increments split into `humanMs`/`agentMs` counters per domain entry |
| Time entries / tab time | `tabTrackingService` per-tab time accrual | each accrual segment stamped with the actor active at accrual time |
| Intents set / edited | `focusService` intent mutations + intent changelog | mutation record: `actor` (who set/changed the intent) |
| Focus & clock history | `focusHistory` / `clockHistory` entries | entries opened/closed by an agent get `actor` on the entry |
| Group events | `groupService` create/rename/sync events | event record: `actor` |
| Interaction logs (#171, future) | prompt/response audit trail | responses given by an agent (e.g. via API) marked `agent:{id}` |

**Derivation rule (single helper, e.g. `src/utils/actorAttribution.js`):** `resolveActor({ tabId, windowId, at })` → checks open C11a spans (tab scope beats window beats machine), then #218 tab classification as fallback; returns `{ actor:'human' }` or `{ actor:'agent', agentSessionId, agentName, source }`. Absent both signals → `'human'` (never guess agent). Records written before this feature have no `actor` field and are treated as `'human'` in all views.

## Separate History Views

| Surface | Change |
|---|---|
| **LogsPanel** (home) | New filter chip row alongside existing `LOG_TYPES` chips: **All / 👤 Human / 🤖 Agents**, expanding to per-agent chips (by `agentName`) when >1 agent has history. Agent-attributed rows get a subtle violet tint + 🤖 badge (matching C11a's AGENT badge language). |
| **Work Shifts / analytics** | Agent-attributed time **excluded by default** from focus totals, productivity metrics, work-shift analytics, and follow-through scoring. Setting: `includeAgentTimeInAnalytics` (default `false`); when off, agent time shows as its own separate series/row ("Agent activity: 42m"), never blended in. |
| **Domain history views** | Per-domain human vs agent time split visible on hover/detail. |
| **Agent Session Audit view** | New drill-in (from AgentSessionChip / LogsPanel agent chip): pick an agent session → chronological "what did the agent do on my behalf": pages visited, groups created/modified, intents set or touched, tasks changed, total duration, span scope + `source` (manual vs announced). This is the trust surface — reviewable after the fact, per session. |

## Implementation Notes

- **Stamp at write time, not query time.** Log writes are scattered (`logs.push` + `tabathaLogs: logs.slice(-500)` in at least 6 services); route them through one `appendLog(entry)` helper in `storageService` that calls `resolveActor` — fixes the duplication and gives one attribution point. Same pattern for domain-history increments and tab-time accrual.
- **Time accrual must split on actor transitions.** If an agent span opens mid-accrual on a tab, close the human segment and open an agent segment (mirrors how clock/focus segments already split on state changes). Do not retroactively repaint whole segments.
- **`agentSessions` is 200-FIFO-capped** — history rows must denormalize `agentName` (and `source`) onto the record itself, since the span may be evicted long before the log entry ages out. `agentSessionId` remains for joining while the span still exists.
- **Analytics exclusion is a read-side filter**, not a separate store: every aggregator (work shifts, follow-through, home stats) filters `actor !== 'human'` unless `includeAgentTimeInAnalytics` is on. One shared predicate, not per-view logic.
- **Supervised sessions** (`supervising: true` in C11a spans) are still `agent:{id}` for history purposes — the human watching doesn't make it human activity — but the audit view labels them "supervised."
- **Sync (migration 024+):** the staged `024_cortex_controller_attribution.sql` covers observation-side controller columns; extending `actor` to synced focus/clock/log rows needs a follow-up migration adding `actor` / `agent_session_id` / `agent_name` columns to the relevant tables in `syncService`'s push paths.
- **Boundary with #171/#172:** #171 logs *interactions and responses* (this feature only adds the actor stamp to those rows); #172 re-queues *history items* (re-queueing an agent-created focus is a human action — the re-queue event is `human`, the original entry keeps its agent actor).

## Open Questions

1. **Retention per actor class** — should agent history get its own (likely shorter) retention window vs the 90-day default, or share it? A busy agent could flood the 500-entry `tabathaLogs` cap and evict human history — separate caps per actor class?
2. **Cloud sync of agent history** — sync agent-attributed rows to Supabase like human history (full fleet-wide audit), keep them local-only (privacy/noise), or sync behind a setting? Interacts with org-visible awareness surfaces (Live Stints).
3. **Agent incognito-equivalent** — should an agent session be able to open as "ephemeral" (history recorded for the live audit view but purged when the span closes), for throwaway agent browsing the user never wants retained?
4. Per-agent identity: is `agentName` (free-text from ANNOUNCE) stable enough for per-agent filter chips, or do we need a registered-agent identity (ties into the back-burnered Agent Control Layer program)?

## Related Features

- C11a Agent Interaction Surfaces (`docs/cortex/features/C11a-agent-interaction-surfaces.md`) — the session/span substrate this builds on
- #218 Agent-Tab Classification — per-tab agent signal used as the span fallback
- #171 Log Interaction Tracking — interaction rows gain the same actor stamp
- #172 History Queue Recovery — re-queue flows operate over attributed history
- C10a Context Reconciliation Panel — human confirmation of agent-made context changes
