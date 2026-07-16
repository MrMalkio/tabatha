# Feature #216 — Session Manager (Tablerone-Inspired Parity)

> **Status:** 📋 Planned · **Version:** v0.5.0
> **Depends On:** Tab tracking (`tabService.js`, `tabTrackingService.js`), Groups (`groupService.js`), `chrome.sessions` API
> **Created:** 2026-07-16
> **Source:** User, 2026-07-16 (feature checklist adapted from a competing product, "Tablerone")
> **Category:** Session Management / Recovery

## User Context (Quotes)

> "Add these features as well to the list, they have some features I want." — User pasted a "Table.rone Feature Checklist" covering session save/restore, thumbnails, favorites, selective/bulk save, sleep-mode loading, and archive-based crash recovery.
> — User, 2026-07-16

## What It Does

Tabatha currently organizes tabs around **intents/focuses** (context-driven), not around **windows-as-sessions** (the Tablerone model: a "session" = a saved snapshot of a window's tabs, browsable/restorable from a timeline). This spec adds a session-snapshot layer that coexists with (not replaces) the focus/intent model — a session can be saved independent of whether its tabs are linked to any intent.

## Checklist → Mapped Requirements

| Tablerone concept | Tabatha requirement |
|---|---|
| Start a session by opening a new window | A "session" = a saved snapshot keyed to a Chrome window; auto-created draft per open window, explicitly saved on demand |
| Rename session via timeline title click | Session Timeline UI (new) with inline-editable title |
| Thumbnail = reordered tabs | Session thumbnail derived from first N tab favicons/screenshots in current tab order; reordering tabs updates it |
| "Always remember to save" | Explicit **Save** action + dirty-state indicator (unsaved changes badge) rather than silent auto-save, matching the source product's manual-save model |
| Favorites | Pin/star a session so it sorts to the top of the timeline regardless of recency |
| Save all tabs in window | Toolbar button + Sidebar/timeline option + dedicated hotkey (ties to #215) |
| Save selective tabs (Ctrl+click) | Multi-select tabs in the tab list/sidebar, save only the selection as a new session |
| Save a single tab | Single-tab save via right-click / tab-row action, isolates it into its own session |
| Bulk save ("clean-up button") | One action that snapshots **every currently open window** as sessions in one pass |
| Quick save/close toggle (Shift+action) | Modifier-held variant of Save that also closes the source tabs/window immediately after snapshotting |
| Restore lost sessions / crash recovery | **Archive** — a durable log of saved + auto-captured sessions (including pre-crash state) separate from the active timeline, so accidental closes are always recoverable |
| Open in sleep mode (Shift+open) | Restoring a session loads tab shells only (title/favicon/URL) without hydrating content until the user clicks a tab — avoids restoring 20 tabs all firing network requests at once |
| Settings/customization | New Settings section for default save behavior (manual vs. auto-save on window close), sleep-mode default, and archive retention |

## Relationship to Existing Concepts

- **Not a replacement for Focus/Intent.** A session is window-tab-shape state; a focus is attention/priority state. A saved session's tabs *may* also carry `intent`/`focusId` linkage (from Feature B — Tab Groups ↔ Focus Linkage) — the two systems compose rather than compete.
- **Overlaps with `chrome.sessions.getRecentlyClosed()`** already referenced in #176 (Quick Tab List's "recently closed" panel) — the Archive here is the durable, named, browsable superset of that transient Chrome API data.
- Groups (`groupService.js`) already persist `groupId`/`groupTitle`/`groupColor` per tab — session snapshots should capture group membership too, so a restored session re-creates its Chrome tab groups, not just flat tabs.

## Open Questions
1. Does "sleep mode" restore need real tab discarding (`chrome.tabs.discard`) or literal deferred-load placeholder tabs (custom NTP-style page that loads the real URL on click)?
2. Auto-save on window close (crash-safety) vs. purely manual save — the source product is manual-only; does Tabatha want a safety-net auto-capture in addition, given the existing ghost-stint/crash-recovery work already done for focus tracking?
3. Where does the Session Timeline live — new top-level page, a Sidebar tab, or folded into Work Shifts?

## Related Features
- #176 Quick Tab List Hotkey (recently-closed overlap)
- #215 Comprehensive Hotkey Coverage (save/close/bulk-save hotkeys)
- Tab Groups ↔ Focus Linkage (in-progress design, unnumbered as of 2026-07-16) — session snapshots should preserve this linkage
