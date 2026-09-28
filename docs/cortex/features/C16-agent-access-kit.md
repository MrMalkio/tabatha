# C16 — Agent Access Kit

> 🔗 Program: [`00-cortex-program-spec.md`](../00-cortex-program-spec.md) · Data catalog: [`DATA-MAP.md`](../DATA-MAP.md) (C14)
> **Status (2026-09-28):** spec drafted from a three-agent current-state survey. Nothing built.
> **Version:** current 6.7.89 → target 6.8.0 (Settings redesign + agent kit; contract v1).
> **Read-side only.** Attributed *writes* are ACL T2 ([Plan 045](../../plans/plan-045-agent-control-layer.md)).

## 1. Why this exists (owner's ask, 2026-09-28)

Cortex is where Tabatha aggregates the context an AI agent on the user's machine should be able to
use. Today an agent cannot really use it. The owner wants:

1. **A bigger, far more intuitive Cortex Settings UI** that uses the screen and tells a person exactly
   how to hook an agent up.
2. **Copy-paste skills and preset prompts** that teach an agent how to reach *all* Tabatha data — the
   extension and the desktop companion, separately and together — including checkpoint notes and
   literally every other piece of information.
3. **An easy way for an agent to see what is going on right now**, and to search *any* time window.

## 2. Current state (survey 2026-09-28)

### 2.1 Cortex Settings UI (`src/settings/CortexPanel.jsx`, 451 lines)
- Mounted inside **Privacy & Capture** (`index.jsx:1985`), not its own section. The whole settings
  content column is capped at **480 px** (`index.jsx:961`) beside a 220 px nav, so Cortex is a
  ~416 px column on a full-width page.
- Type is 10–12 px throughout. Results of every action land in one easy-to-miss one-line notice.
- **No connect step**: no "copy prompt", "copy skill", "test connection", or path display. The only
  agent hooks are two *download* buttons for cron bundles.
- **Misleading copy**: says "to Downloads" and reports "Nothing to export" when the companion is
  offline and the export was *buffered* (`captureService.js:291-317`). The bundle hard-codes
  `%USERPROFILE%\Downloads\…` while the companion decides where exports really land.
- **Settings with no UI**: `cortexIntradayEnabled`, `cortexIntradayEveryMins`, `cortexEodHour`,
  `selfCorrectionEnabled`, `selfCorrectionConfidence`, `captureStoragePath`. `LIST_CORRECTIONS` /
  `RUN_SELF_CORRECTION` and `buildExecuteBundle` exist with no button.

### 2.2 What an agent can read today
| Surface | Format | Reality |
|---|---|---|
| `context.md` (`sessionService.js:141`) | Markdown | Active tabs, last 20 closed contexts, time summary. **Omits focus, checkpoints, clock, tasks, observations.** |
| Nightly ledger `cortex-ledger-<day>.json` | JSON `cortex-ledger-export.v1` | Fixed UTC day. **Has never landed on the dev box**: neither `%APPDATA%\Tabatha Desktop\exports` nor `Downloads\Tabatha\Cortex\exports` exists (verified 2026-09-28). |
| Intraday slice | JSON `cortex-ledger-intraday.v1` | Opt-in, no UI. |
| Approved actions | JSON `cortex-actions.v1` | Panel button. |
| Harness cron bundles | `SKILL.md` / Codex `.md` | Reads the newest nightly ledger only. |
| JSON backup | raw `chrome.storage.local` | Manual, all-or-nothing. |
| Companion SQLite | `%APPDATA%\com.flux.tabatha-desktop\tabatha_activity.db` | Readable by any local process, **unredacted window titles**. |
| Companion WS `:9147` | JSON | Token in plaintext `pairing_token.json`; `REQUEST_SUMMARY` ignores its `date`; no history query; no "current window" pull. |
| MCP / CLI | — | **Not built** (ACL T1). No `externally_connectable`, no native messaging. |

### 2.3 Data an agent cannot see at all
Focus items and history, **checkpoint notes** (`focusEngine.items[].checkpoint[]`, and the cloud
`focus_checkpoints` table), focus events, intent history, clock and abandoned stints, tasks,
backburner, sessions, InBar notes, logs, audit trail, settings. Full inventory table: see the
Asana task notes and DATA-MAP (C14 will absorb it).

## 3. Design

**Principle: files first, MCP later, one contract.** The extension has no external interface, so the
desktop companion is the natural host. Everything below is defined against one versioned contract so
the file kit, the CLI and the eventual MCP server (ACL T1) are three transports over the same data
— nothing here waits on the T1 decision.

### 3.1 Contract `tabatha-agent-context.v1`
Every response carries `schema`, `generatedAt`, `window`, `sources[]` (with per-source freshness),
`redactions` (what was withheld and why) and `partition` (`personal` | `org` | `both`).

| Query | Answers | Notes |
|---|---|---|
| `now` | Current intent + elapsed, last N checkpoint notes, clock/break state, focused tab & window, active desktop app/title, idle state, last 30 min of observations, open agent sessions | Refreshed on change (focus, clock, checkpoint, tab activation) and at least every 60 s; carries `staleAfter`. |
| `window(since, until, sources?, detail?)` | Everything in an arbitrary time window, merged and time-ordered | `detail`: `digest` \| `events` \| `full`. Sources: `focus`, `checkpoints`, `clock`, `tabs`, `desktop`, `observations`, `tasks`, `intents`, `voice`. |
| `checkpoints(focusId? \| window)` | Checkpoint notes with progress level, elapsed-at, author (human/agent/system) | Includes system auto-entries flagged. |
| `focus(id)` | One intent's full story: events, checkpoints, tabs, time, links | |
| `digest(day)` | The morning digest (already built: `buildMorningDigest`) | |

### 3.2 Transports (build order)
1. **Agent Kit folder** — the extension pushes a snapshot to the companion (`SNAPSHOT_PUSH`, new WS
   message; the companion is the only process both surfaces can reach) and the companion writes
   `…/agent-kit/now.json`, `now.md`, `window-index.json` plus per-day rollups
   (`days/YYYY-MM-DD.json`) beside the existing exports. Works with *any* agent that can read files.
2. **CLI** `tabatha now | window --since --until | checkpoints | focus <id>` — a thin reader over the
   same folder + a read-only companion endpoint. Fixes `REQUEST_SUMMARY`'s ignored `date`.
3. **MCP** — the T1 server exposes the same five queries as tools. The kit and skills already teach
   these names, so registering the MCP later changes the transport, not the instructions.

Read auth: a **separate read-only agent token** (never the pairing token), revocable in Settings,
with every agent read written to an **audit log** shown in the UI (feeds ACL T4 governance).

### 3.3 The kit an agent is given
```
agent-kit/
  README.md                  # 10-line orientation + where everything is
  SKILL.md                   # Claude Code skill (frontmatter + how to query, when, privacy rules)
  codex-instructions.md      # Codex / ChatGPT desktop (~/.codex/config.toml) variant
  generic-agent-prompt.md    # paste into any other agent
  data-catalog.md            # generated from DATA-MAP: every source, field, cadence, caveat
  prompts/
    whats-happening-now.md
    summarize-window.md          # "last N hours" / "this week"
    checkpoint-review.md         # progress notes across intents
    where-did-my-time-go.md
    resume-where-i-left-off.md
    end-of-day-handoff.md
  now.json / now.md          # live snapshot
  days/                      # per-day rollups for window queries
```
Each skill states: *what Tabatha is, the query names, how to combine extension + desktop data, the
freshness rules ("if `staleAfter` passed, say so"), and the privacy rules (respect `redactions`; never
quote raw window titles from SQLite; personal vs org).*

### 3.4 Settings redesign — "Agent Access" as its own section
- **Own nav entry** (not buried in Privacy & Capture); drop the 480 px cap for this section; two-column
  layout on wide screens; body text ≥ 14 px; results as a persistent activity feed, not one line.
- **Connect** (the default tab): numbered 1-2-3 — *Choose your agent* (Claude Code · Codex/ChatGPT ·
  Cursor/other) → *Copy skill / copy prompt* (one click each, with the real file path shown and an
  "Open folder" button) → **Test connection** (writes `now.json`, shows the agent's-eye preview and a
  green "an agent read this at 14:02" line once one does).
- **What agents can see**: per-source toggles (focus, checkpoints, clock, tabs, desktop app titles,
  observations, tasks, voice), personal/org partition, a live **preview of `now`** exactly as an agent
  receives it, and the redaction rules in force.
- **Prompt library**: the presets from §3.3, each with a description, a copy button and an "expected
  answer looks like" sample.
- **Activity**: recommendations, ledger export, agent read audit log, self-correction (currently
  unreachable), morning digest.
- **Advanced**: routing tier, proactivity, intraday cadence, EOD hour, capture path, execute bundle.
- Coordinate with **C15** (owns the single Cortex config surface) and the **Settings design refresh**
  (restyle); reuse `settingsSearch.js` so the new rows are searchable.

## 4. Privacy and safety (binding)
- Capture is opt-in; incognito is excluded fail-closed (`captureService.js:326`); the sensitive-data
  guard applies to anything an agent reads.
- **Known hole to close first:** the companion SQLite stores window titles verbatim, so a local
  process reading it bypasses the guard. The kit must be the *sanctioned* path and apply redaction; the
  unredacted DB stays out of every skill and prompt.
- Personal vs org: `desktop_activity`, `clock_sessions`, `intent_history` have no partition today.
  The contract carries `partition`; org data never flows into a personal agent context by default.
- Agents get read-only in this feature. Anything that writes is ACL T2 and requires an open C11a
  agent session.

## 5. Decisions needed from Malkio
1. **Files-first, MCP-later** (recommended) vs waiting on ACL T1 — the pending "pull T1 forward?" brief
   (PRD-1, 2026-09-25) is unanswered. This spec does not depend on the answer.
2. **Redaction of companion SQLite titles** — redact at write, or only when read through the kit?
3. **Consent model** — one master "let agents read my Tabatha data" switch plus per-source toggles,
   default OFF?
4. **Export root** — one canonical directory the UI displays (recommend the companion's
   `%APPDATA%\Tabatha Desktop\agent-kit`), replacing the hard-coded Downloads paths.

## 6. Work breakdown (mirrors the Asana subtasks)
1. Contract + DATA-MAP as access contract (C14).
2. `now` snapshot: extension→companion push + `now.json/md` writer.
3. Time-window query: companion range API, per-day rollups, CLI; fix `REQUEST_SUMMARY`.
4. Read exposure of checkpoints, focus history, clock, tasks, intent history.
5. Agent skills pack (Claude Code / Codex / generic) + data catalog.
6. Preset prompt library.
7. Settings redesign: "Agent Access" section.
8. Privacy & consent for agent reads (toggles, SQLite title redaction, audit log, partition).
9. Fix the export pipeline and doc drift (no export has ever landed; "Nothing to export"; stale
   DATA-MAP and prompts README).
10. Verification: a fresh agent given only the pasted skill answers now/window questions correctly.

## 7. Related
- Parent program: Cortex PROGRAM · Depends on C4 (ledger), C14 (data map), Phase 1.
- Coordinates with C15, Settings design refresh, ACL T1 (transport) / T3 (agent checkpoints) / T4
  (governance) / T5 (harness registration, depends on this kit), #220 (checkpoint→agent hook), #222
  (notes).
