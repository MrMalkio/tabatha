# Feature #185 — Popup Harmony (FTE/WBP Singleton + Combo)

> **Status:** 📋 Planned · **Version:** v4.5.3 · **Scoped at:** v4.0.0
> **Depends On:** Focus Engine (core), Clock Service (core)
> **Created:** 2026-05-16
> **Implementation Brief:** [Plan 025](../../.gemini/antigravity/brain/0919dcff-3bdc-4a0f-91ce-4971d8335c43/implementation_plan.md)

## User Context (Quotes)

> "The Focus Timer Expired popup — It pops up too frequently and more importantly it stacks. There needs to only ever be one FTE popup across the board on all tabs at a time. If one is cleared all previous are cleared."
>
> "There needs to be a configurable option in settings that allows a user to decide how much idle time warrants the FTE popup modal with CTAs."
>
> "If a user were to interact with a focus via sidebar or homepage in another tab while it has a live triggered popup elsewhere, the actions taken should affect that popup, such as if user marked a focus resolved, or added minutes from anywhere not on the window where the FTE popup. It should deactivate the popup."
>
> "Additionally let's introduce a new popup that is a combo of the two that is used when it's warranted. Such as if the timer is up and the user just came back to the machine."
> — User, 2026-05-16

## What It Does

Fixes FTE/WBP popup stacking, adds rich CTAs to FTE, introduces a merged combo popup for timer-expired-while-away scenarios, and adds configurable WBP thresholds.

## Key Behaviors

| Behavior | Detail |
|----------|--------|
| **Singleton constraint** | Only ONE popup (FTE, WBP, or Combo) active across all tabs at any time |
| **Cross-tab dismiss** | Focus resolved/switched/paused in any tab auto-dismisses live popups everywhere |
| **Enhanced FTE CTAs** | 6 actions: Extend, Switch Focus, Pause, Break, Complete, Add Note |
| **Combo popup** | Merged FTE+WBP when timer expired during idle — single card, all CTAs |
| **Configurable WBP** | Minimum idle time before WBP shows; toggle for show-after-break |
| **Off-device tag** | Focus items flagged `offDevice` suppress all popups and notifications |

## Implementation Files

| File | Purpose |
|------|---------|
| [focusService.js](../../src/background/services/focusService.js) | Popup coordination key, off-device checks |
| [clockService.js](../../src/background/services/clockService.js) | WBP threshold gating, combo detection |
| [notificationService.js](../../src/background/services/notificationService.js) | DISMISS_POPUP handler |
| [inbar.js](../../src/content/inbar.js) | All popup UIs, singleton guard, auto-dismiss |
| [constants.js](../../src/background/constants.js) | WBP default settings |
| [settings/index.jsx](../../src/settings/index.jsx) | Follow-through Support settings |
| [home/index.jsx](../../src/home/index.jsx) | Off-device toggle |
