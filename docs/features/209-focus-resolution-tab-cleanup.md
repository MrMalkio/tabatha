# Feature #209: Focus Resolution Tab Cleanup ("Close the Chapter")

> **Status:** Draft  
> **Phase:** 4 (Polish & Intelligence)  
> **Priority:** Medium  
> **Depends on:** Focus Engine (`focusService.js`), Tab Service (`tabService.js`), `associatedTabIds[]` tracking, Sub-Focus/parentFocusId hierarchy  
> **Related features:** #185 (Focus Auto-Resume Queue), #202 (Session Resurrection), #207 (Backburner), #177 (Sugarbox Stash/Delete)

---

## Problem Statement

When a user resolves a focus, nothing happens to the browser tabs that were opened and used during that work session. The user is left with 10-30 open tabs from a completed task cluttering their browser — defeating the entire purpose of an "Attention Operating System." The cognitive load of manually identifying and closing stale tabs undermines the flow state Tabatha is designed to protect.

Currently, `completeFocus()` in `focusService.js` (line 413) resolves the focus item, archives it to `engine.history`, and optionally auto-resumes the next queued focus — but **never touches the physical browser tabs** stored in `associatedTabIds[]`.

---

## Core Capability

Upon marking a focus as **resolved** (via `COMPLETE_FOCUS`, funnel stage → `resolved`, or sidebar checkmark), Tabatha offers to close the browser tabs that were associated with that focus — respecting user preferences, locked tabs, and sub-focus hierarchies.

---

## Configuration Options (Settings → Focus Lifecycle)

### `onResolveTabBehavior` — Three modes:

| Mode | Key | Behavior |
|------|-----|----------|
| **Ask Before Closing** | `ask_all` | Show a modal listing all associated tabs with checkboxes. User selects which to close. Pre-checked by default. **This is the default.** |
| **Close All Automatically** | `auto_close` | Silently close all associated tabs (except locked/pinned). No prompt. |
| **Show Selective Picker** | `ask_selective` | Same modal as `ask_all`, but tabs are pre-sorted by relevance (active time, recency) and **none are pre-checked** — user must opt-in per tab. |

### Additional toggles:

| Setting | Default | Description |
|---------|---------|-------------|
| `preserveLockedTabs` | `true` | Never close tabs marked as locked, regardless of mode. |
| `preservePinnedTabs` | `true` | Never close pinned Chrome tabs, regardless of mode. |
| `includeSubFocusTabs` | `true` | When resolving a parent focus, also sweep tabs from all child sub-focuses. |
| `parkInsteadOfClose` | `false` | Instead of closing, move tabs to the Parked Tabs stash (Feature #177) so they can be recovered. |
| `showUndoToast` | `true` | Show a 10-second "Undo" toast after tabs are closed, allowing instant restoration via `chrome.sessions.restore()`. |
| `excludeDomains` | `[]` | Domains that should never be auto-closed (e.g., `mail.google.com`, `docs.google.com`). |

---

## Sub-Focus / Parent-Focus Hierarchy

Each focus item tracks `parentFocusId`. When a **parent focus** is resolved:

1. Check if any child sub-focuses are still active or paused.
2. If children exist and `includeSubFocusTabs` is enabled:
   - Collect `associatedTabIds` from all descendant sub-focuses.
   - If any child is still **active**, warn the user: *"This focus has X active sub-focuses. Resolve them first, or close all tabs including sub-focus tabs?"*
3. If resolving a **sub-focus only**, only sweep that sub-focus's own `associatedTabIds`.

---

## Tab Cleanup Modal UX

When `ask_all` or `ask_selective` mode is active, display a modal with:

- **Header:** "🧹 Close tabs from '[Focus Label]'?"
- **Tab list:** Each row shows: favicon, title (truncated), domain, active time badge, checkbox.
- **Locked/Pinned indicators:** 🔒 badge on locked tabs, 📌 on pinned — these are greyed out and unchecked.
- **"Select All" / "Deselect All"** toggle.
- **"Park Instead"** button — moves checked tabs to Parked Tabs instead of closing.
- **Actions:** `Close Selected` (primary), `Skip` (dismiss without closing), `Park Selected`.
- **Sub-focus expansion:** If sub-focus tabs are included, show them in a collapsible group under the sub-focus label.

---

## Implementation Anchor Points

### `focusService.js` — `completeFocus()`

After archiving the focus to `engine.history` and before broadcasting `FOCUS_ENGINE_UPDATED`:

1. Read `settings.onResolveTabBehavior`.
2. If `auto_close`: immediately call `tabService.bulkCloseTabs()` with the collected tab IDs (filtering out locked/pinned per settings).
3. If `ask_all` or `ask_selective`: broadcast a `RESOLVE_TAB_CLEANUP` message to extension pages with the tab list and mode. The homepage/sidebar renders the modal.
4. Record closed tab URLs + titles in `engine.history[0].closedTabs[]` for session resurrection.

### `tabService.js` — Tab filtering

- New helper: `getResolvableTabIds(focusId, includeSubFocuses)` — collects all `associatedTabIds` from the focus and optionally its descendants, cross-references against live `chrome.tabs` to filter out already-closed tabs, and applies locked/pinned/domain exclusions.

### New message types:

| Type | Direction | Payload |
|------|-----------|---------|
| `RESOLVE_TAB_CLEANUP` | background → UI | `{ focusId, focusLabel, tabs: [{ tabId, title, url, domain, activeTime, locked, pinned }], mode, includeSubFocusTabs }` |
| `CONFIRM_TAB_CLEANUP` | UI → background | `{ focusId, closeTabIds: [...], parkTabIds: [...] }` |
| `UNDO_TAB_CLEANUP` | UI → background | `{ focusId, sessionIds: [...] }` |

---

## Design Challenges & Open Questions

### 1. Tab ID Staleness
`associatedTabIds` stores Chrome tab IDs, which become invalid when tabs are closed or the browser restarts. The cleanup must gracefully handle stale IDs — `chrome.tabs.get()` will throw for missing tabs.

**Challenge:** Should we maintain a parallel `associatedTabUrls[]` array as a fallback for matching tabs by URL when IDs are stale? This would survive browser restarts but introduces URL matching ambiguity (multiple tabs with the same URL).

### 2. Shared Tabs Across Focuses
A single tab (e.g., a docs page or Slack thread) can be `associatedTabIds` for multiple active focuses. Closing it when one focus resolves would break the other.

**Challenge:** Implement a **reference count** — only close a tab when it's no longer associated with any active/paused focus. This requires a cross-focus tab membership query before every cleanup.

### 3. Undo Reliability
`chrome.sessions.restore()` can only restore recently closed tabs (Chrome limits this to ~25 most recent). If the user closes 30 tabs from a focus, some may not be restorable.

**Challenge:** Should we snapshot tab URLs + positions *before* closing, and re-open them from URLs if `sessions.restore()` fails? This loses tab state (scroll position, form data) but guarantees URL recovery.

### 4. Auto-Close Feels Destructive
Even with an undo toast, silently closing tabs is a high-stakes action. Users may not even notice tabs disappeared until minutes later.

**Challenge:** Consider a "soft close" — instead of `chrome.tabs.remove()`, move tabs to a new window that auto-minimizes, giving the user a 5-minute grace period before actual deletion. This is heavier but safer.

### 5. Background Track Tabs (#163)
When Background Tracks are implemented, music/podcast tabs associated with a focus should **never** be auto-closed — they serve a cross-focus ambient purpose.

**Challenge:** Check each tab's `category` field. If `category === 'music'` or `category === 'media'` or the tab is tagged as a background track, exclude it from cleanup. This needs the Background Tracks feature (#163) to land first, or at minimum needs a `backgroundTrack` boolean on tab data.

### 6. Timing with Auto-Resume (#185)
When a focus resolves, `completeFocus()` auto-resumes the next queued focus. If that next focus has its *own* associated tabs, should those tabs be foregrounded? There's a choreography problem: close old tabs → open/focus new tabs → all within milliseconds.

**Challenge:** The tab cleanup should execute *after* the next focus is activated, so the user sees a clean transition: old tabs vanish, new focus's tabs come to the front.

---

## Better Implementation Ideas

### A. Tab Groups Integration
Instead of closing tabs, **collapse the Chrome Tab Group** associated with the resolved focus. This hides the tabs visually without destroying them. The user can expand the group later if needed. Only truly close the group after a configurable grace period (e.g., 24 hours).

### B. "Focus Workspace" Snapshots
Before closing, take a full snapshot of the tab set: URLs, positions, scroll states (via content script), form data hashes. Store this in `focusEngine.history[].workspace`. This enables **Session Resurrection (#202)** to perfectly restore the working environment weeks later.

### C. Stale Tab Garbage Collection
Run a periodic background alarm (e.g., every 6 hours) that cross-references all `associatedTabIds` across all active focuses against live `chrome.tabs.query()`. Remove IDs for tabs that no longer exist. This keeps the association arrays clean and prevents phantom tab references from accumulating.

### D. Domain Affinity Learning
Over time, learn which domains are "always keep" (Gmail, Slack, Docs) vs. "safe to close" (Stack Overflow answers, one-off docs). Use the user's historical close/keep decisions in the modal to build per-domain affinity scores. After enough data, pre-check the modal intelligently.

### E. Integration with Backburner (#207)
When a backburner focus expires and the user clicks "Resume Focus," automatically restore/foreground the tabs that were open when it was backburnered. This requires saving a `tabSnapshot` at backburner time and replaying it on resume.

### F. Integration with Smart Deferral (#208)
When a focus is deferred to a future stint, park all its tabs with a "deferred until" marker. When the stint begins (via calendar alarm), restore the tabs and activate the focus — creating a seamless "pick up where you left off" experience.

---

## Prerequisites — What Should Be Addressed First

> [!IMPORTANT]
> This feature should **not** be built until the following foundations are stable:

1. **`associatedTabIds` Reliability** — Currently, tab IDs accumulate but are never pruned when tabs close naturally. Implement the stale-ID garbage collector (Idea C above) first, or every focus will carry phantom IDs that cause `chrome.tabs.get()` errors during cleanup.

2. **Sub-Focus Hierarchy** — The `parentFocusId` field exists but the full parent→child traversal logic isn't battle-tested. Verify that resolving a parent correctly identifies all descendants before building the cascade cleanup.

3. **Locked/Pinned Tab Awareness** — The `locked` field exists in `tabService`, but `pinned` status is only available via `chrome.tabs.get()` at query time. The cleanup flow must query live Chrome state, not just Tabatha's `tabData` cache.

4. **Session Resurrection (#202)** — The undo/restore mechanism depends on recording enough state to recover closed tabs. If #202 isn't built yet, the "Undo" toast becomes unreliable beyond Chrome's built-in session limit.

5. **Background Tracks (#163)** — Without category-based exclusion, auto-close risks killing the user's music/podcast tab. At minimum, hardcode a `media` category exclusion even before #163 lands.

6. **Settings Infrastructure** — The Settings page needs a "Focus Lifecycle" section to house the new configuration toggles. Verify the settings schema (`DEFAULT_SETTINGS` in `constants.js`) can accommodate the new keys.

---

## Data Schema Additions

```js
// In DEFAULT_SETTINGS (constants.js)
focusLifecycle: {
  onResolveTabBehavior: 'ask_all',  // 'ask_all' | 'auto_close' | 'ask_selective'
  preserveLockedTabs: true,
  preservePinnedTabs: true,
  includeSubFocusTabs: true,
  parkInsteadOfClose: false,
  showUndoToast: true,
  excludeDomains: [],
  tabCleanupGracePeriodMinutes: 0   // 0 = immediate, >0 = soft close
}

// In focusEngine.history[] items
closedTabs: [{ tabId, url, title, closedAt, restorable: true }]
tabWorkspaceSnapshot: { urls: [...], savedAt, focusId }
```

---

## Success Metrics

- **Tab clutter reduction:** Average open tab count drops by 30%+ within 1 week of activation.
- **Undo rate:** If >15% of cleanups are undone, the default mode is too aggressive — reconsider `ask_selective` as default.
- **Focus transition speed:** Time between resolving one focus and beginning the next decreases (tabs no longer need manual cleanup).
