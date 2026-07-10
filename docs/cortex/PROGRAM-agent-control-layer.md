# Program Scope — Tabatha Agent Control Layer (CLI / MCP)

- **Status:** scoped (Fable, 2026-07-10). **BACK BURNER — do NOT start until the Cortex program is complete.** Captured now so it isn't lost.
- **Relationship to Cortex:** Cortex is the *afferent* half (senses, digests, supports context — screenshots, ledger, patterns, recommendations). This program is the *efferent* half: it lets an **agent read, write, and coordinate through Tabatha**. Cortex watches; the Agent Control Layer acts. They meet at **C11/C11a attribution** — every write this layer makes must be tagged as agent-originated so efficiency analytics stay honest.
- **Asana:** its own task under the Flux Development program (created 2026-07-10); this doc is the linked scope.

## The line the user asked about
> "Cortex is all things digesting and supporting context. I don't know where the line is for an agent to contribute context details, and even use Tabatha for its own coordination during computer/browser use."

The line this doc draws:
| | Cortex (observe) | Agent Control Layer (act) |
|---|---|---|
| Direction | reads the world → ledger | reads/writes Tabatha state |
| Examples | capture frames, detect patterns, recommend | set an intent, start a focus, clock in, add a context note, park tabs |
| Trust | passive, opt-in | authenticated, attributed, rate-limited, reversible |
| Attribution | records who was in control (C11) | **declares** it is the controller (C11a `ANNOUNCE_AGENT_SESSION`) before writing |

An agent *contributing context* (e.g. "I researched X for 20 min, here's the summary") is an **efferent write** — it belongs here, not in Cortex — but it *lands in* the Cortex ledger, tagged `controller: 'ai-agent'`. That's the seam.

## Capabilities (to scope into phases later)
1. **Read surface** — an agent can query current focus/intent, clock state, open tabs + their intents, today's ledger/observations, recommendations, tasks. (Most of these message types already exist for the UI: `GET_FOCUS_ENGINE`, `GET_ALL_TABS`, `LIST_OBSERVATIONS`, `LIST_RECOMMENDATIONS`, etc.)
2. **Write surface** — set/change intent, start/pause/resume/complete a focus, clock in/out, create tasks, park/link tabs, add a **context note / contribution** to the active focus (extends the C9 voice-note / checkpoint path). Every write auto-opens (or requires) an active `agentSessions` span (C11a) so it's attributed.
3. **Self-coordination during computer/browser use** — an agent driving the machine (computer-use / browser automation) uses Tabatha as its **own scratch + coordination store**: declare an agent session, set the intent it is working on, checkpoint progress, hand off between sub-agents, and read back "what was I doing" after an interruption. This is the "Tabatha as an agent's working memory" idea.
4. **Two transports:**
   - **MCP server** — a `tabatha` MCP exposing the read/write tools above, so any MCP-capable harness (Claude Code, Codex, etc.) can drive Tabatha. Backed by the same message router (via native messaging or a localhost bridge — the desktop companion is the natural host; it already runs a WS server on :9147).
   - **CLI** — a thin `tabatha` command wrapping the MCP/bridge for scripting and cron.
5. **Governance** — auth (only the user's own agents), scopes (read-only vs write), rate limits, an audit trail (reuse `activityAuditService`), and a kill switch. All agent writes reversible.

## Dependencies / reuse
- **C11a** (`agentSessionService`, `agentSessionStore`, the 🤖 surfaces) — the attribution substrate this layer requires. Ship C11a first (done: v1).
- **Desktop companion** WS server (`ws://localhost:9147`) — the natural host for the local bridge/MCP endpoint (it already brokers extension↔OS).
- **Existing message router** (`src/background/background.js` `services[]`) — the write/read surface is mostly *already there*; this program exposes it, gated + attributed.
- **Headbox** — governs which harnesses are installed (ties to C8 cron-in-harness); the CLI/MCP registers alongside.

## Phasing (all POST-Cortex)
- **P0 (prereq):** Cortex program complete; C11a attribution shipped.
- **P1:** read-only MCP + CLI (agent can *see* Tabatha state) — low risk, no writes.
- **P2:** attributed write surface (intent/focus/clock/context-note), every write inside an agent session, fully reversible + audited.
- **P3:** self-coordination primitives (checkpoint/handoff/working-memory) + companion-hosted bridge.
- **P4:** governance hardening (scopes, rate limits, kill switch), multi-agent coordination.

## Open questions for Malkio
1. Transport priority: MCP-first (harness-native) or CLI-first (scripting)?
2. Host: extension native-messaging vs companion WS bridge vs a small localhost server — which owns the endpoint?
3. Should an agent be *required* to declare an agent session before any write (hard gate), or default-attribute writes made without one?
4. How much can an agent change autonomously vs propose-for-approval (ties to the C8 proactivity dial)?
5. Does "contribute context" write into the focus checkpoint stream, a dedicated agent-notes store, or both?
