# Feature #218 — Agent Browsing Detection (Who Created This Group/Tab?)

> **Status:** 📋 Planned · **Version:** v0.5.0
> **Depends On:** #180 InPop Variants, C11a Agent Interaction Surfaces (`agentSessionService.js` — now merged to `staging`), `groupService.js` tab-group listeners, #217 Intent Tab Grouping Suite (docs/features/217-intent-tab-grouping-suite.md)
> **Created:** 2026-07-16
> **Source:** User, 2026-07-16
> **Category:** Attribution / Overlays

## User Context (Quotes)

> "Browser-using agents — Claude in Chrome and the like — always create a tab group first when they start driving the browser. Use ALL the identifiable signals available when a group or tab is created in Chrome to discern WHO created it and HOW: agent or human."
>
> "Once we know a group is agent-driven, predefine the behaviors: InPop should not show for agent tabs, or should show an agent-specific variant instead. And that variant never offers Sugar Box or Side Quest — agents don't have side quests and sugar boxes or treats they want to leave for themselves later."
>
> "The user should still be able to assign an agent-created group to an intent."
> — User, 2026-07-16

## What It Does

Classifies every newly created tab group (and its tabs) as **agent-created** or **human-created** at creation time, using a scored heuristic stack plus the C11a agent-session service as the authoritative signal. Classified-agent tabs get distinct InPop behavior (suppressed or an `InPop-Agent` variant), never receive Sugar Box / Side Quest affordances, and their groups remain assignable to intents by the human (#217).

**Builds on C11a, does not duplicate it.** C11a (commit `8100859`, now merged to `staging`) already ships the *declared* half: `agentSessionService.js` (`START_AGENT_SESSION` / `ANNOUNCE_AGENT_SESSION` / `END_AGENT_SESSION` / `LIST_AGENT_SESSIONS`), pure span store `agentSessionStore.js` (tab/window/machine scopes), the InBar 🤖 toggle + violet `AGENT` badge (`agentActive` / `agent-mode`), the InPop "Who's working?" control, and ledger `controller: 'ai-agent'` stamping. #218 adds the *inferred* half — per-group/per-tab classification from creation-time signals — and feeds its verdicts back through the same span model (`source: 'inferred'`).

## Signal Inventory (Honest Assessment)

`chrome.tabGroups.onCreated` carries **no creator field** — Chrome does not tell us who made a group. Everything below is inference; reliability varies sharply:

| # | Signal | Mechanism | Reliability |
|---|--------|-----------|-------------|
| S1 | **Active C11a agent session span** | `LIST_AGENT_SESSIONS` → open machine/window span covers the creation moment | **High** — authoritative when the agent announced itself; the anchor signal |
| S2 | **No preceding user gesture** | No `chrome.tabs.onActivated` / input-driven event within ~2s before group creation; MV3 has no direct gesture API, so this is absence-of-evidence | Medium — guessy alone; strong combined with S3/S4 |
| S3 | **Burst tab creation** | ≥2 `chrome.tabs.onCreated` events within ~1.5s, immediately grouped | Medium — humans do "open all bookmarks" too |
| S4 | **Programmatic opener profile** | `chrome.tabs.onCreated` tab has no `openerTabId` + navigates to a full URL within ~500ms (humans open blank tabs then type) | Medium-High for tab-level; agents drive via CDP/debugger or extension APIs |
| S5 | **Known agent group naming/color** | Group title/color matches known patterns (e.g. Claude in Chrome's group titles) | Low-Medium — pattern list rots as vendors change; treat as tiebreaker only |
| S6 | **Known agent extension installed** | `chrome.management.getAll()` for known agent extension IDs (Claude in Chrome, etc.) | Medium as a *prior* only (installed ≠ driving). **Permission implication:** requires adding `management` to the manifest — gate behind an opt-in setting; ship v1 without it |
| S7 | **Debugger/automation banner** | `navigator.webdriver` in content script; "is being controlled by automated software" state is not exposed to extensions | Low — CDP-driven agents rarely set webdriver; mostly catches Selenium-style automation |

**Classification rule (v1):** S1 alone ⇒ `agent (declared)`. Otherwise weighted score of S2+S3+S4 (+S5 tiebreak) over a threshold ⇒ `agent (inferred)`, below ⇒ `human`. Every inferred verdict is displayed with its confidence and is one click to override.

## Predefined Behaviors Once Classified

| Behavior | Agent-classified group/tab | Setting |
|----------|---------------------------|---------|
| **B1 — InPop suppression** | InPop does not fire on tab creation/navigation inside the group | `agentInpop: 'suppress'` (default) |
| **B2 — InPop-Agent variant** | Alternative: a minimal variant showing "🤖 Agent-driven — [session name]" + classification confidence + "Not an agent?" override. Register as a new row in #180's variant table: **InPop-Agent** · Triggers on: agent-classified tabs · Special: read-only attribution card, override control | `agentInpop: 'variant'` |
| **B3 — No treats** | Neither mode ever renders Sugar Box or Side Quest buttons — "agents don't have side quests and sugar boxes or treats they want to leave for themselves later" | Not configurable |
| **B4 — Intent assignment** | Group header (sidebar/home groups panel) offers "Assign to intent…" exactly like foreign groups in #217; agent time then rolls into that intent's tracking with `controller: 'ai-agent'` | Always on |
| **B5 — Ledger stamping** | Verdict opens an inferred C11a span so captureService stamps downstream observations, unifying declared + inferred attribution | Follows auto-classification toggle |

## Settings

| Setting | Options | Default |
|---------|---------|---------|
| Auto-classification | on / off | on |
| Agent InPop behavior | suppress / show InPop-Agent variant | suppress |
| Use extension-presence signal (S6) | on / off (adds `management` permission on enable) | off |
| Manual override | Per-group context action: "Mark as agent" / "Mark as human" — overrides win permanently for that group and log a correction | — |

## Implementation Notes

- New `src/background/services/agentDetectionService.js`: subscribes to `chrome.tabs.onCreated` + `chrome.tabGroups.onCreated`/`onUpdated` (note `groupService.js` comment: `onCreated` fires before tabs are in the group — final scoring should wait for the first `onUpdated`/tab-membership settle, ~2s debounce).
- Pure scorer in `src/utils/agentDetectionStore.js` (mirrors `agentSessionStore.js` pattern: pure + unit-tested; service is the thin chrome shell).
- Verdicts persist per group id in storage (`agentGroupVerdicts`), FIFO-capped; consumed by `GET_INBAR_DATA` / InPop gating in `tabService`, and surfaced in the groups panel.
- Inferred verdict → `openSession({ scope: 'group', source: 'inferred', confidence })` via agentSessionService (requires adding a `group` scope + `inferred` source to the C11a store — small, additive).
- Manual override ends/opens the span with `source: 'manual'` and pins the verdict.
- InPop-Agent variant slots into #180's `InPopVariantRouter` selection (agent classification checked before site-category rules).

## Open Questions

1. Should an S1-declared session auto-claim *all* groups created while the span is open, or only groups whose tabs the agent actually touched (window-scope vs machine-scope spans differ here)?
2. S6 extension-ID list maintenance — hardcode vs remote-updatable list vs ask user to tag their agent extensions once?
3. When a human takes over inside an agent-created group (clicks around after the agent finishes), should the group demote to human after N minutes of human-gesture activity, or stay agent-attributed until overridden?
4. Do agent tabs still count toward attention/time analytics, and under which bucket — separate "agent time" lane (aligns with C11a controller attribution) or excluded entirely?

## Related Features

- **C11a Agent Interaction Surfaces** — declared agent sessions, InBar badge, ledger stamping (this spec's foundation)
- **#180 InPop Variants** — InPop-Agent registers as a new variant
- **#178 Agent Context Tracking** — different concern: attributing *AI assistance* to intents, not detecting agent-driven browsing; cross-ref only
- **#217 Foreign-Group Assignment** (planned) — assign non-Tabatha-created groups to intents; B4 reuses its flow
