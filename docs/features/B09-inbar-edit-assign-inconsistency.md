# Bug B09 — InBar Edit Dropdown: Intent Save vs Focus Assignment Fight Each Other

> **Status:** 📋 Specced · **Version:** v6.7.76
> **Affects:** src/content/inbar.js, src/background/services/tabService.js, src/background/services/focusService.js
> **Created:** 2026-07-25 · **Reported:** 2026-07-19

## User Context

Reported from live use of the InBar ✏️ Edit dropdown (edit intent fields + "Assign to Focus" list), 2026-07-19.

## Symptoms

1. Typed a new intent name + description in the edit fields, then clicked a focus in the "Assign to Focus" list (the currently-active focus) → **nothing appeared to happen**. Expectation: clicking a focus should BOTH save the typed name/description AND link the tab to that focus, in one action.
2. Reopening the edit dropdown showed the typed text still sitting in the fields — it had not been saved anywhere.
3. Clicking the focus option again still didn't update the bar text, and the InBar 🔄 refresh didn't help — but the tab **did** get linked to the focus, just under the old/wrong intent name.
4. Only after clicking "Save" did the new name reach the InBar — but that Save **disconnected** the tab from the focus it had just been linked to and created/queued the typed intent as a **separate focus** (sidebar shows it as a sub-focus with a bent arrow; InBar shows the ⚡ not-linked icon instead of 🔗).

## Root Cause

The edit dropdown contains **two independent actions that each do half the job and actively undo the other half**. There is no combined "save fields + assign" path.

### Path A — Focus-item click: links, but never reads the fields

`src/content/inbar.js:1061-1075` — the `#focus-list` click handler:

```js
focusList.onclick = async (e) => {
  const item = e.target.closest('.focus-item');
  ...
  await chrome.runtime.sendMessage({ type: 'SWITCH_FOCUS', focusId });
  editDropdown.classList.remove('open');
};
```

- It **never reads** `#edit-intent-input` / `#edit-intent-desc`. The typed name and description are simply ignored (→ Symptom 2: they linger in the un-rebuilt dropdown DOM).
- It sends only `SWITCH_FOCUS`, handled by `switchFocus()` at `src/background/services/focusService.js:520-576`. That handler:
  - Attaches the currently-active browser tab to the target focus's `associatedTabIds` (`focusService.js:566-572`) — this is why the tab *does* end up linked (Symptom 3, second half).
  - **Never touches the tab's `intent`/`context` record** (contrast with `linkTabToFocus()` at `focusService.js:1372-1394`, which does set `tabs[tabId].intent = focus.label` — that function is not on this path).
- Because the clicked focus was **already the active focus**, `switchFocus` is a visual no-op: it pauses the current item (`focusService.js:524-531`, where `current === target`) and immediately re-activates it. The `FOCUS_ENGINE_UPDATED` broadcast does trigger the InBar hot-reload (`inbar.js:1313-1357`), but the bar label is `intentLabel = tabIntent || focusLabel` (`inbar.js:1325-1327`) and `tabIntent` comes from the tab record — which Path A never changed. So the bar re-renders with the **same old text** → "nothing appeared to happen" (Symptom 1). The 🔄 refresh (`inbar.js:970-1013`) re-fetches the same untouched tab record, so it can't help either (Symptom 3, first half).
- Side effect worth noting: clicking the already-active focus still increments `contextSwitchCount` and churns pause/resume bookkeeping (`focusService.js:527, 553`) for what the user perceives as a no-op.

### Path B — Save button: saves the name, then the label-matcher re-routes the linkage

`src/content/inbar.js:1015-1039` — the `#edit-intent-save` handler sends `SET_INTENT { intent, description }`. Handled by `setIntent()` at `src/background/services/tabService.js:584-623`, which writes the tab's `context`/`intent`/`intentDescription`, then at `tabService.js:615-617` calls:

```js
await injectedDeps.autoQueueFromIntent?.(payload.intent, tabId);
```

`autoQueueFromIntent()` (`src/background/services/focusService.js:1396-1451`) is the "tab-to-intent association" label matcher (Intent Bridge, `smart_dedup` default):

- `focusService.js:1406-1413` — it compares the typed label (lowercased/trimmed) against the **active focus's label** and against all non-completed item labels. The user typed a *new* name, so `newLabel !== activeLabel` and there is no `existingMatch` → `shouldAutoQueue = true`.
- `focusService.js:1415-1436` — it calls `addFocus(intent, 15, …)` which creates a **brand-new queued item** with `parentFocusId: engine.activeFocusId` (`focusService.js:506`) — that parent pointer is exactly why the sidebar renders it as a **sub-focus with a bent arrow**. The tab is associated to this new item…
- …and then the "side-quest semantics" block (`focusService.js:1428-1433`, Plan 036 QA) **removes the tab from the active focus's `associatedTabIds`** — deliberately, on the theory that a tab declaring a new intent has drifted off the primary focus.
- `isTabLinked` is computed as *"active focus contains this tab"* (`src/background/services/notificationService.js:139`). After the removal, that's false → the InBar flips from 🔗 to ⚡ (Symptom 4).

### Why the two paths fight

Path A sets linkage (tab → focus) without the name; Path B sets the name without knowing about the linkage the user just made — and its label-matcher, seeing a label that matches nothing, concludes the user started a *side quest*, spins up a new queued sub-focus, and severs the very link Path A created. Each action is individually "working as coded"; the combination is the bug. The dropdown UI presents them as one workflow ("edit intent, assign to focus") but the code has no single action that does both.

## Expected Behavior

- Clicking a focus in the "Assign to Focus" list while text sits in the edit fields performs **one combined action**: save the typed intent name + description to the tab, link the tab to the clicked focus, and re-render the bar showing the new name and 🔗.
- The Save button saves the fields **without disturbing an existing tab↔focus link**. It must not auto-queue a new sub-focus for a tab that is (or was just) explicitly assigned to a focus.

## Proposed Fix

**1. Focus-item click = save fields + link + re-render** (`src/content/inbar.js:1061-1075`):
- Read `#edit-intent-input` and `#edit-intent-desc` before sending anything.
- Send one message carrying everything — either a new combined handler (e.g. `SET_INTENT_AND_ASSIGN { intent, description, focusId }`) or a sequenced pair where the intent write is flagged to **skip the auto-queue bridge** (see 3) followed by an explicit link (`ASSOCIATE_TAB_WITH_FOCUS` → `linkTabToFocus`, which already updates the tab record and broadcasts).
- On the background side, the explicit assignment must land in `linkTabToFocus()` semantics (`focusService.js:1372`) — but write the **typed** intent to the tab, not the focus label, when the user provided one.
- After the round-trip, update local state (`tabIntent`, `intentLabel`, `isTabLinked`) and re-render the bar (`bar.innerHTML = buildBarHTML(); … bindBarEvents()`) exactly as the Save handler already does at `inbar.js:1026-1036` — do not rely solely on the broadcast.
- If the clicked focus is already active, skip the `SWITCH_FOCUS` pause/re-activate churn; just link.

**2. Save button = save fields WITHOUT touching linkage unless it changed** (`src/content/inbar.js:1015-1039`, `src/background/services/tabService.js:584-623`):
- `setIntent()` should treat an explicit tab↔focus assignment as authoritative. Concretely: before calling `autoQueueFromIntent`, check whether the tab is already in some focus's `associatedTabIds`; if so, **rename in place is not the bridge's business** — either skip the bridge entirely or pass the linked focus id so the bridge treats it as the "active label" for matching purposes.
- Alternatively/additionally, accept a `skipBridge` (or `linkedFocusId`) flag on the `SET_INTENT` payload that InBar's edit-dropdown Save sets whenever `isTabLinked` is true.

**3. Guard the side-quest removal** (`src/background/services/focusService.js:1428-1433`): the removal of the tab from the active focus must not fire for intent edits originating from an explicit-assignment context. Keep it for the organic InPop/new-intent flow it was designed for (Plan 036).

## Acceptance Criteria

Replaying the exact reported scenario on a tab linked-or-unlinked to the currently-active focus:

1. Open InBar ✏️ Edit, type a new intent name + description, click the **currently-active focus** in the "Assign to Focus" list →
   - the dropdown closes, the bar immediately shows the **typed name**, and the 🔗 linked icon is shown;
   - the tab appears in that focus's `associatedTabIds`;
   - **no new focus item** appears in the queue/sidebar;
   - the tab record carries the typed description.
2. Reopening the edit dropdown shows the saved (typed) name pre-filled — not stale unsaved text.
3. Clicking a **different** (non-active) focus in the list with typed text: saves the text, links the tab to that focus, switches to it, bar re-renders with new name + 🔗.
4. With the tab already linked to a focus, editing only the intent text and pressing **Save**: the name updates on the bar, the tab **stays linked** to the same focus (🔗 remains, no ⚡), and no queued sub-focus (bent arrow) is created.
5. 🔄 refresh after any of the above reflects the same state (no divergence between refresh-fetched and locally-rendered state).

## Regression Risks

- **Intent Bridge / auto-queue elsewhere** (`autoQueueFromIntent`, `focusService.js:1396`): the same function serves the InPop first-intent flow, URL-rule intent application, and any `SET_INTENT` sender. The `smart_dedup` behavior — new label ≠ active label → queue a side-quest focus — is *intentional* there (Plan 036 QA). The fix must scope the skip to explicit-assignment/edit contexts, not disable auto-queue globally, or organic side quests will stop being captured and drift detection (which depends on the tab being removed from the active focus) will regress.
- **`intentBridgeMode` settings** (`always` / `smart_dedup` / `manual`, `focusService.js:1401-1413`): verify all three modes still behave per spec after adding a skip flag.
- **Side-quest tab removal** (`focusService.js:1428-1433`): drift detection relies on off-intent tabs leaving the active focus's `associatedTabIds`. Guard it narrowly.
- **`switchFocus` active-tab attach** (`focusService.js:566-572`): other callers (popup, sidebar switch) rely on switching attaching the current tab; changing self-switch behavior must not break normal switches or the backburner-clear path (`focusService.js:534-547`).
- **`linkTabToFocus` overwrites tab intent with the focus label** (`focusService.js:1386`): when reusing it for the combined action with a typed name, ensure the typed name wins — and that other callers (`LINK_TAB_TO_INTENT`, `ASSOCIATE_TAB_WITH_FOCUS`) keep the existing label-copy behavior.
- **InBar hot-reload rebind** (`inbar.js:1313-1357`): the re-render path replaces `#focus-list` innerHTML and re-runs `bindBarEvents()`; any new handler must be idempotent under repeated binds, like the existing `onclick =` assignments.
