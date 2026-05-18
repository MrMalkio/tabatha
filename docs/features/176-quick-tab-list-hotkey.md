# Feature #176 — Quick Tab List Hotkey (Extension Icon Popup)

> **Status:** 📋 Planned · **Version:** v0.2.0  
> **Depends On:** #112 Hotkeys, #43 Fuzzy Search, #58 Popup  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Hot key to open simple open tab's list from the extension icon, with fuzzy search, recently closed tabs, and groups."
> — User, 2026-05-14

## What It Does

A **hotkey-triggered quick tab list** that opens as a lightweight popup from the extension icon. Shows all open tabs with fuzzy search, recently closed tabs, and tab groups. Fast, keyboard-driven tab switching without opening the full sidebar.

## Features

| Feature | Description |
|---------|-------------|
| **All open tabs** | Scrollable list with favicons, titles, domains |
| **Fuzzy search** | Type to filter — matches title, URL, intent label |
| **Recently closed** | Last 10 closed tabs with "Reopen" button |
| **Tab groups** | Grouped by Chrome tab groups or Tabatha contexts |
| **Keyboard navigation** | Arrow keys to navigate, Enter to switch, Ctrl+W to close |
| **Intent labels** | Show intent/focus label next to each tab |

## Implementation Notes

- Extends existing Popup (#58) with enhanced tab list view
- Hotkey registered via Chrome Commands API (#112)
- Fuzzy search: use lightweight library (fuse.js) for matching
- Recently closed: `chrome.sessions.getRecentlyClosed()`
- Fast rendering: virtualized list for 100+ tabs
- Keyboard-first: entire flow usable without mouse

## Open Questions

- Should this replace the existing popup or be a separate mode?
- Include bookmarks in search results?
- Show tab thumbnails or just text?
