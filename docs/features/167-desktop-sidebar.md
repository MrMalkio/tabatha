# Feature #167 — Desktop Sidebar (Native OS Side Panel)

> **Status:** 📋 Planned · **Version:** v0.4.0  
> **Depends On:** #117 Desktop Companion, #56 Sidebar  
> **Created:** 2026-05-14

## User Context (Quotes)

> "I want to duplicate the sidebar to being a desktop sidebar as well."
> — User, 2026-05-14

## What It Does

A **native desktop sidebar** that mirrors the browser extension's Sidebar (#56) but runs as a standalone OS window via the Desktop Companion (#117). Always accessible regardless of which app is in focus — VS Code, Figma, Terminal, etc. Shows focus state, timer, tasks, and all sidebar panels.

## Implementation Notes

- Built into the Tauri Desktop Companion (#117) as a side-panel WebView window
- Reuses the same React components from `src/sidebar/`
- Positioned as an always-on-top panel docked to screen edge (left or right)
- Communicates with extension via WebSocket bridge (existing CompanionBridge)
- Toggle visibility via system tray or global hotkey

## Open Questions

- Should it be resizable/collapsible or fixed width?
- Auto-hide when a fullscreen app is detected?
- Does it need its own notification system separate from browser extension?
