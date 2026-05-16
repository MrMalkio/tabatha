# Feature #161 — Freeform Mode (Silent Tracking)

> **Status:** 📋 Planned · **Version:** v0.2.0  
> **Depends On:** #118 Settings, #123 Intent v2  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Freeform mode — Tracking but no alerts or popups. User can set this mode for a certain period or indefinitely until they change it."
> — User, 2026-05-14

## What It Does

A global mode toggle that keeps all time/intent/focus tracking active but **suppresses all alerts, popups, overlays, and prompts** — InPop, Gatekeeper, BlockGate, focus reminders, idle prompts, tab cap warnings. User can activate for a set duration (e.g., 2 hours) or indefinitely until manually toggled off.

## Use Cases

- Deep creative flow — user doesn't want interruptions but still wants tracking
- Browsing for leisure — tracking for personal awareness without friction
- Presentations/screen sharing — no embarrassing overlays

## Settings

| Setting | Options |
|---------|---------|
| Duration | 30m / 1h / 2h / 4h / Until I turn it off |
| What's suppressed | All (default) / Custom (pick which alerts survive) |
| Visual indicator | Subtle status bar color change (e.g., blue → teal) |
| Auto-revert | Timer expires → normal mode, with a gentle "Welcome back" toast |

## Implementation Notes

- Global flag in `chrome.storage.local`: `{ freeformMode: { active: true, expiresAt: ISO|null } }`
- All overlay/popup injection points check this flag before rendering
- Background alarm for auto-revert when duration expires
- Entry points: Settings toggle, Command Palette (#45), Hotkey (#112), InBar quick-action

## Open Questions

- Should Freeform Mode still log intent data passively (tab URL → inferred intent)?
- Should the Attention Polygraph show Freeform periods distinctly?
