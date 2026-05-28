# Bug B07 — Cannot Resolve Paused Active Focus from Sidebar Top Spot

> **Status:** 🔧 Fixing · **Version:** v0.2.0  
> **Affects:** sidebar/index.jsx, focusService.js  
> **Created:** 2026-05-26 · **Updated:** 2026-05-26

## User Context (Quotes)

> "User should be able to mark a main focus resolved, while it is paused"
> — User, 2026-05-26
>
> "user is able to resolve a paused focus but just not able to resolve it from side bar when it is the main focus in the top spot. Other items that are in the queue, are able to be paused/resolved with the available checkmark."
> — User, 2026-05-26

## What's Broken

The user *can* resolve paused focuses in general (for example, items sitting in the queue can be resolved using their checkmarks). However, when a focus is currently active (in the "main focus in the top spot" of the sidebar) and is **paused**, the UI or action handlers prevent the user from marking it as resolved.

The "Resolve" button or interaction for this active top-spot focus either disappears, gets disabled, or fails to emit/trigger the resolution handler when the active focus transitions into a paused state.

## Expected Behavior

- When the main focus (active in the top spot) is paused, the "Resolve" checkmark/button remains fully interactive.
- Clicking the "Resolve" button for the paused active focus successfully triggers the resolution flow.
- The focus is marked complete, its elapsed active work time is saved (excluding the paused duration), and the next queue behaviors (such as auto-resume prompts or triggers) initiate normally.

## Fix Approach

1. **Verify UI Render Conditions:** Check the active focus card renderer in `src/sidebar/index.jsx` (or the relevant sidebar active focus component). Ensure the "Resolve" action/button is not conditionally hidden or disabled when `focus.status === 'paused'`.
2. **Action Dispatch:** Ensure that clicking "Resolve" on the active paused item correctly sends the resolution message to the background router/focusService without throwing state mismatch errors.
3. **Parity Check:** Align the top-spot active focus card action logic with the standard queue item row action logic (which already allows resolution when paused).
