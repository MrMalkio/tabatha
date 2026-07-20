# Feature #215 — Comprehensive Hotkey Coverage (Sidebar & InBar)

> **Status:** 📋 Planned · **Version:** v0.5.0
> **Depends On:** #176 Quick Tab List Hotkey, existing `chrome.commands` registration (`toolbarActionService.js`), Sidebar, InBar
> **Created:** 2026-07-16
> **Source:** User, 2026-07-16
> **Category:** Input / Accessibility

## User Context (Quotes)

> "I need confirmation that the ability to program a hotkey for opening the tab list dropdown from the icon is available. This should be associated with clicking of the icon opening tab list or sidebar. And in fact we should have hotkey for every input option we have in sidebar or inbar too."
> — User, 2026-07-16

## Status Check (resolved during intake)

The icon-click hotkey already exists and works today — no gap here:
- `public/manifest.json` registers `_execute_side_panel` (`Ctrl+Shift+S` — opens Sidebar) and `open_tab_list` (`Ctrl+Shift+E` — opens the Tab List popup).
- `open_tab_list` is wired via `chrome.commands.onCommand` in `src/background/services/toolbarActionService.js`.
- Both are user-rebindable at `chrome://extensions/shortcuts` (standard Chrome commands UI — Tabatha does not need its own rebind UI for these two).

**What's actually missing** is the broader ask: every *other* interactive action inside the Sidebar and InBar (pause, checkpoint, note, backburner, edit intent, resolve/complete, switch focus, etc.) has no keyboard shortcut at all today — only mouse clicks.

---

## What It Does

Extends keyboard-first control beyond the two existing global `chrome.commands` entries to **every actionable control surfaced in the Sidebar and InBar**, with user-configurable bindings (chrome.commands is capped at ~4 global shortcuts by Chrome itself, so most of these must be **in-context key handlers**, scoped to when the Sidebar or InBar has focus/is open — not global OS-level shortcuts).

## Scope

| Surface | Actions needing a hotkey |
|---|---|
| **InBar** | Pause/resume, checkpoint, note toggle, edit intent, backburner, collapse/expand, set intent, refresh |
| **Sidebar** | Switch active focus, resolve/complete focus, new focus, new task, tasks panel toggle, groups panel toggle, search/filter focus |

## Implementation Notes

- Chrome's `commands` API is limited to ~4 suggested global shortcuts total across the extension — cannot register one global binding per action. In-context listeners (keydown on the Sidebar/InBar shadow root or React root, similar to the existing InBar `keydown`/`keyup`/`keypress` capture-phase interceptor in `inbar.js`) are the correct mechanism for the long tail of actions.
- Needs a **single source of truth keymap** (e.g. `src/constants/hotkeys.js`) so Settings, Sidebar, and InBar all read the same bindings instead of hardcoding keys in three places.
- Settings panel needs a rebind UI (list of action → current binding → "press a key to change"), since these aren't OS-level `chrome://extensions/shortcuts` entries.
- Conflict detection: an in-context binding must not collide with the host page's own shortcuts (InBar already `stopPropagation()`s keydown/keyup/keypress in its capture-phase listener — new bindings should route through that same interceptor).
- Discoverability: hotkey hints should show in tooltips on hover (e.g. `title="Pause (P)"`).

## Open Questions
1. Default keymap — single-letter mnemonics (P for pause, C for checkpoint) vs. modifier-based to avoid colliding with page content editable fields?
2. Should hotkeys be active only when the Sidebar/InBar has explicit focus, or globally whenever they're visible on the page (risk: intercepting keys meant for the host page)?
3. Should the rebind UI live in Settings only, or also inline (right-click a button → "change shortcut")?

## Related Features
- #176 Quick Tab List Hotkey (the two hotkeys that already exist)
- #211 Audio Input & Voice Control (voice as an alternative input tier — hotkey to start/stop capture is part of that spec already)
