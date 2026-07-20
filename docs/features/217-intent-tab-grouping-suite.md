# Feature #217 — Intent Tab Grouping Suite (Counts, Grouping, Multi-Window, Consolidate)

> **Status:** 📋 Planned · **Version:** v0.5.0
> **Depends On:** `associatedTabIds[]` tracking (`tabService.js`, `focusService.js`), Groups (`groupService.js`), #186 Context Link Indicator (counts groundwork), #209 Focus Resolution Tab Cleanup (close flow), #218 Agent-Created Group Detection
> **Created:** 2026-07-16
> **Source:** User, 2026-07-16
> **Category:** Tab Organization / Context

## User Context (Quotes)

> "Sidebar and home page should show, very simply, how many tabs are related to an intent — how many open, how many closed."
> "The linkage exists today, but there's no way to actually move all the tabs of an intent into a Chrome tab group. I want a 'group this intent's tabs' action."
> "An intent can own multiple tab groups — one per window. I run 2-3 monitors with three windows all serving the same intent; some tabs live in one window, others in another. Tabatha's job is to organize and assign those groups to the same intent."
> "Three ways to create them: manually per window; Tabatha offering (not silently creating) a second group when I open a new window during an active focus; and multi-selecting tabs with ctrl/shift-click then clicking the Tabatha icon — a contextual menu should appear because multiple tabs are selected, letting me group the selection or split it into multiple groups in one sitting."
> "When an intent's tabs are scattered across windows, give me a one-click gather: pick 1, 2, or 3+ windows and Tabatha moves and groups everything."
> "I should be able to assign ANY existing tab group to an intent — including groups created by other tools or agents."
> — User, 2026-07-16 (paraphrased from spec conversation)

---

## What It Does

Turns the existing passive tab↔focus linkage (`focus.associatedTabIds[]`) into an active organizational layer: per-intent tab counts everywhere, first-class "group this intent's tabs" actions, multiple Chrome tab groups per intent spanning windows, a consolidate-into-N-windows gather action, and adoption of foreign groups. Chrome tab groups become the *physical* expression of an intent's *logical* tab membership.

## Capability Matrix

| # | Capability | Surface | Phase |
|---|---|---|---|
| 1 | Per-intent counts: total related / open / closed | Sidebar + Home focus cards | 1 |
| 2 | "Group this focus's tabs" (current window) | Sidebar, Home, InPop | 1 |
| 3 | Multi-select tabs → toolbar icon → contextual group/split menu | Toolbar popup | 1 |
| 4 | Multiple groups per intent, one per window (manual attach) | Sidebar, Home, InPop | 2 |
| 5 | Auto-offer a second group when a new window opens mid-focus | Toast / InPop prompt | 2 |
| 6 | Consolidate: gather scattered tabs into 1/2/3+ windows | Focus card "gather" button | 2 |
| 7 | Assign any existing (foreign/agent-created) group to an intent | Groups panel, group context action | 2 |
| 8 | Multi-intent tabs, ownership fallback, live cross-window reparenting | Background | 3 |
| 9 | Resolution: groups participate in the #209 close flow | `completeFocus()` | 2 |

## Creation Mechanisms (all three ship)

| Mechanism | Trigger | Behavior |
|---|---|---|
| **Manual per-window** | "Create/attach group for this focus in this window" action on Sidebar/Home/InPop | Groups the focus's tabs *in that window* into a new (or chosen existing) Chrome group titled from the focus label |
| **Auto-detect offer** | `chrome.windows.onCreated` while a focus is active | Tabatha **offers** — never silently creates — a second group for the new window ("Start a [Focus Label] group here?"). Decline is remembered per window |
| **Multi-select contextual** | User ctrl/shift-selects tabs, clicks toolbar icon | Popup detects `chrome.tabs.query({highlighted: true, currentWindow: true}).length > 1` and swaps to a contextual menu: *Group selection into one group* (pick/create intent) or *Split into multiple groups* (assign subsets to intents in one sitting) |

## Consolidate ("Gather")

On a focus whose tabs span ≥2 windows, the focus card shows a gather button. Click → picker: **1 window / 2 windows / N windows**. Tabatha `chrome.tabs.move()`s the focus's tabs into the target window(s), then groups them (one group per destination window, all attached to the intent). Pinned tabs and tabs shared with other active intents are excluded and reported ("3 tabs left in place — shared/pinned").

## Data Model

Extend focus items (backward compatible — absent field = no groups):

```js
// focusEngine.items[id]
tabGroups: [{
  groupId,               // chrome.tabGroups id (volatile across restarts)
  windowId,              // window the group lives in
  createdBy,             // 'user' | 'auto' | 'agent' | 'foreign'
  attachedAt             // epoch ms
}]
```

- `createdBy: 'foreign'` = pre-existing group adopted via capability 7; `'agent'` = detected per #218 (detection heuristics live there — this spec only stores the attribution).
- Group IDs are session-scoped: on startup, reconcile `tabGroups[]` against `chrome.tabGroups.query({})`, matching by title + window survivor heuristics; drop dead entries.
- Counts (capability 1): `open` = `associatedTabIds` still alive in `chrome.tabs`; `closed` = historical associations pruned or recorded in `engine.history` — display as `{related} · {open} open · {closed} closed`. Reuses #186's stat-line slot (this supersedes #186's `{N} tabs · {M} windows` format; #186's InBar 🔗/⚡ indicator is untouched).

### What `groupService.js` does today (baseline to preserve)

- Bidirectional sync at the **tab** level only: `tabs[tabId].groupId/groupTitle/groupColor` maintained via `tabGroups.onCreated/onUpdated/onRemoved` + `tabs.onUpdated` listeners.
- `CREATE_GROUP` (tabIds + name + priority→color), `GET_SAVED_GROUPS`, `CREATE_SUB_GROUP`/`GET_SUB_GROUPS` (Tabatha "sub-groups" hold `chromeGroupIds[]` keyed to *projects*, not focuses).
- **No focus↔group linkage exists anywhere** — the new `tabGroups[]` array is net-new and must not disturb the tab-level sync. `handleGroupRemoved` (which nulls tab fields) additionally detaches the matching `tabGroups[]` entry from any focus.

## New Message Types

| Type | Direction | Payload |
|---|---|---|
| `GROUP_FOCUS_TABS` | UI → bg | `{ focusId, windowId, existingGroupId? }` |
| `ATTACH_GROUP_TO_FOCUS` | UI → bg | `{ focusId, groupId, createdBy }` |
| `DETACH_GROUP_FROM_FOCUS` | UI → bg | `{ focusId, groupId }` |
| `CONSOLIDATE_FOCUS_TABS` | UI → bg | `{ focusId, targetWindowCount, targetWindowIds? }` |
| `GROUP_SELECTION` | popup → bg | `{ assignments: [{ tabIds, focusId, groupName? }] }` (1 entry = group-all; N = split) |
| `GET_FOCUS_TAB_COUNTS` | UI → bg | `{ focusIds? }` → `{ [focusId]: { related, open, closed, windows } }` |
| `OFFER_WINDOW_GROUP` | bg → UI | `{ focusId, focusLabel, windowId }` (auto-detect offer) |

## Phasing

| Phase | Scope | Explicitly out |
|---|---|---|
| **1 — Foundation** | Single group per focus. Counts (cap 1), manual "group this focus's tabs" (cap 2), multi-select→icon contextual grouping (cap 3). `tabGroups[]` capped at length 1 | Multi-group, auto-offer, consolidate, foreign adoption, live-follow |
| **2 — Multi-group** | Lift the cap: manual per-window attach (cap 4), auto-offer on new window (cap 5), consolidate-into-N (cap 6), foreign/agent group assignment (cap 7), #209 resolution tie-in (cap 9) | Multi-intent tabs, reparenting |
| **3 — Multi-intent + live reparenting** | A tab may belong to multiple intents; group ownership resolves by priority, falling back to FIFO (first intent to claim). Live cross-window movement when the active focus switches — must handle `chrome.tabs.move()` race conditions and grouping flicker (Chrome ungroups on move; regroup must be atomic-feeling) | — |

## Resolution Tie-In (#209)

When an intent resolves, its `tabGroups[]` enter #209's close flow as first-class units: the cleanup modal lists groups (collapsible) alongside loose tabs, and #209's settings (`onResolveTabBehavior`, park-instead-of-close, locked/pinned preservation, collapse-instead-of-close Idea A) govern behavior. **This spec adds no resolution settings** — it only guarantees groups are enumerated and detached/removed by that flow.

## Implementation Notes

- `groupService.js` gains the new handlers; focus-side mutations (attach/detach on `tabGroups[]`) route through `focusService` accessors to keep single-writer discipline over `focusEngine`.
- `createOrUpdateGroup()` is reused by `GROUP_FOCUS_TABS`; group color should derive from the focus's context/priority color rather than the current `PRIORITY_LEVELS` mapping alone.
- Multi-select detection runs in the toolbar popup's mount: query `{highlighted: true, currentWindow: true}`; >1 result switches the popup root to the contextual menu.
- Auto-offer must debounce: ignore windows created by session restore, by Tabatha itself (consolidate), or containing 0 normal tabs.
- Consolidate ordering: move first, group second, per destination window; serialize moves to avoid Chrome's concurrent-move errors.
- Counts must tolerate stale `associatedTabIds` (see #209 Prerequisite 1 — stale-ID GC helps both features; build it in Phase 1).

## Open Questions

1. **Live reparenting (Phase 3, user has NOT decided):** when the active focus switches to an intent whose group lives in a *different window*, should a shared tab physically move across windows to join it? Options: never move (highlight only), move with animation/undo, per-intent setting.
2. Should Phase 1's single group auto-extend (new associated tabs get added to the group live), or is the group action a one-shot snapshot until Phase 3's live-follow?
3. Group title format: focus label verbatim, or prefixed (e.g. `⚡ Label`) so Tabatha-owned groups are visually distinguishable from foreign ones?
4. Do legacy sub-groups (`chromeGroupIds` keyed to projects) migrate into `tabGroups[]`, or remain a parallel project-level concept?

## Related Features

- #186 Context Link Indicator & Focus Counts (counts stat-line predecessor — superseded format noted above)
- #209 Focus Resolution Tab Cleanup (owns all close-flow settings)
- #216 Session Manager (session snapshots must capture group membership incl. `tabGroups[]` attribution)
- #218 Agent-Created Group Detection (owns detection; this spec only stores `createdBy: 'agent'`)
- #215 Comprehensive Hotkey Coverage (group/gather actions should receive bindings)
