# Implementation Plan 025: FTE/WBP Popup Fixes + Off-Device Tag

> **Current version:** 4.0.0 → **Target version:** 4.3.0 _(3 minor features:
> enhanced FTE CTAs, configurable popup thresholds, off-device tag; 0 breaking)_

## Context

The Focus Timer Expired (FTE) popup and Welcome Back Popup (WBP) have several UX
issues reported by the user:

1. FTE popup lacks meaningful CTAs (only "Extend 5 min" and "Complete")
2. Both popups stack across tabs — multiple overlays for the same event
3. WBP triggers too frequently (even after brief idle)
4. No cross-tab state awareness — actions taken in homepage/sidebar don't
   dismiss live popups
5. No "off-device" tagging to suppress desktop popups for non-computer tasks

---

## User Review Required

> [!IMPORTANT]
> **Branch strategy:** This plan creates a `fix/popup-harmony` branch from the
> current `fix/v4.0.0-auth-lock-contention` branch. If you'd prefer it based off
> `staging` or another branch, let me know.

> [!IMPORTANT]
> **Off-device scope:** The "off-device" tag is proposed as a boolean on focus
> items, intents, and tasks. When set, all in-browser popups (FTE, WBP, nudges)
> and Chrome notifications are suppressed for that item. Should this also
> suppress InBar display entirely, or just popups?

---

## Open Questions

1. **WBP idle minimum**: You mentioned configurable thresholds. I'm proposing
   two settings:

   - `welcomeBackMinIdleMinutes` (default: 5) — minimum idle before WBP shows
   - `welcomeBackShowAfterBreak` (default: true) — show WBP when returning from
     a break

   Are these the right two knobs, or do you want more granularity?
2. **FTE "Add Note" CTA**: Should the note be attached to the focus item's
   existing notes system (via `inbarNotes`), or should it be a dedicated
   `focusNotes` array on the focus item itself?
3. **FTE re-trigger**: After a user extends time via FTE, should the FTE popup
   fire again when the _extension_ timer expires, or should there be a cooldown
   / max-fires setting?

---

## Proposed Changes

### Component 1: FTE Popup CTAs Enhancement

#### [MODIFY] [inbar.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/content/inbar.js)

**Lines ~907–941 — `FOCUS_TIMER_EXPIRED` handler**

Replace the minimal 2-button overlay with a richer card containing:

| CTA                   | Action             | Message to background           |
| --------------------- | ------------------ | ------------------------------- |
| ⏱️ Extend 5 min       | Extends timer      | `EXTEND_FOCUS_TIMER`            |
| 🔄 Switch Focus       | Opens focus picker | Shows inline focus list         |
| ⏸ Pause               | Pauses the focus   | `PAUSE_FOCUS`                   |
| ☕ Step Away (Break)  | Toggles break      | `TOGGLE_BREAK`                  |
| ✅ Complete & Move On | Completes focus    | `COMPLETE_FOCUS`                |
| 📝 Add Note           | Inline textarea    | `SAVE_FOCUS_NOTE` (new message) |

The card will include the focus list from `allFocusItems` (already available in
InBar state) for the "Switch Focus" CTA — clicking an item sends `SWITCH_FOCUS`.

---

### Component 2: Singleton Popup Coordination (anti-stacking)

This is the highest-impact fix. Currently `broadcastAll()` sends
`FOCUS_TIMER_EXPIRED` and `WELCOME_BACK` to _every_ tab, and each tab
independently creates an overlay.

#### [MODIFY] [clockService.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/services/clockService.js)

- Before broadcasting `WELCOME_BACK`, write a coordination key to
  `chrome.storage.local`:
  ```js
  await chrome.storage.local.set({
      _activePopup: {
          type: "WELCOME_BACK",
          id: `wb_${Date.now()}`,
          ts: Date.now(),
      },
  });
  ```
- Add listener cleanup: when `WELCOME_BACK` is dismissed or resolved anywhere,
  clear `_activePopup` and broadcast `POPUP_DISMISSED`.

#### [MODIFY] [focusService.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/services/focusService.js)

- `handleFocusTimerExpired()` — write coordination key before broadcast:
  ```js
  await chrome.storage.local.set({
      _activePopup: {
          type: "FOCUS_TIMER_EXPIRED",
          id: `fte_${focusId}`,
          focusId,
          ts: Date.now(),
      },
  });
  ```
- `completeFocus()`, `switchFocus()`, `extendFocusTimer()`, `pauseFocus()` —
  clear `_activePopup` if it references the affected `focusId`, then broadcast
  `POPUP_DISMISSED`.

#### [MODIFY] [inbar.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/content/inbar.js)

- On receiving `FOCUS_TIMER_EXPIRED` or `WELCOME_BACK`:
  1. Check `chrome.storage.local._activePopup` — only show if the popup ID
     matches (prevents stale re-renders)
  2. Before creating overlay, check if one already exists in the DOM → skip if
     so
- Listen for `POPUP_DISMISSED` broadcast → remove any existing FTE/WBP overlay
  in this tab
- Listen for `FOCUS_ENGINE_UPDATED` → if the focus referenced by a live FTE
  popup has been completed/switched/paused externally, auto-dismiss the overlay
- On user CTA action → send `DISMISS_POPUP` to background → background clears
  `_activePopup` and broadcasts `POPUP_DISMISSED`

#### [NEW] handler in [notificationService.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/services/notificationService.js)

Add `DISMISS_POPUP` message handler:

```js
case 'DISMISS_POPUP':
  await chrome.storage.local.remove('_activePopup');
  broadcastAll({ type: 'POPUP_DISMISSED', popupId: message.popupId });
  return { success: true };
```

---

### Component 3: Configurable WBP Thresholds

#### [MODIFY] [constants.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/constants.js)

Add to `DEFAULT_SETTINGS`:

```js
welcomeBackMinIdleMinutes: 5,    // minimum idle before WBP shows
welcomeBackShowAfterBreak: true, // show WBP when returning from break
```

#### [MODIFY] [clockService.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/services/clockService.js)

In `handleIdleStateChanged` (line ~190–213), gate the `WELCOME_BACK` broadcast
and Chrome notification:

```js
const settings = await getSettings();
const minIdleMs = (settings.welcomeBackMinIdleMinutes ?? 5) * 60000;
const showAfterBreak = settings.welcomeBackShowAfterBreak !== false;

// Gate: don't show WBP if idle was too short
if (idleDuration < minIdleMs) {
    userIdleSince = null;
    return;
}

// Gate: don't show WBP on break return unless configured
if (wasAutoBreakApplied && !showAfterBreak) {
    userIdleSince = null;
    return;
}
```

#### [MODIFY] [settings/index.jsx](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/settings/index.jsx)

Add settings under the **Work Clock** section (after Break reminder):

```
⏰ Welcome Back popup
  - Minimum idle time before showing (min): [input, 1–60, default 5]
  - Show after break return: [toggle, default on]
```

---

### Component 4: Cross-Tab Focus State Sync for Popups

Already partially handled by Component 2. The additional piece:

#### [MODIFY] [inbar.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/content/inbar.js)

In the existing `FOCUS_ENGINE_UPDATED` listener (lines ~873–904):

- After re-fetching InBar data, check if there's a live FTE overlay referencing
  a `focusId` that is no longer `drifted` (e.g. it was completed, paused, or
  switched from another tab/homepage/sidebar)
- If so, auto-dismiss the overlay with a brief "Resolved elsewhere" toast
  animation

This means: if a user marks a focus as resolved from the homepage while an FTE
popup is live on another tab, the popup silently dismisses.

---

### Component 5: Off-Device Tag

#### [MODIFY] [focusService.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/services/focusService.js)

- Add `offDevice: false` to the default focus item shape in `startFocus()` and
  `addFocus()`
- In `handleFocusTimerExpired()`: check `item.offDevice` — if true, skip the
  Chrome notification and the `FOCUS_TIMER_EXPIRED` broadcast entirely

#### [MODIFY] [clockService.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/services/clockService.js)

- In `handleIdleStateChanged` active branch: before broadcasting `WELCOME_BACK`,
  check if the paused focus is `offDevice` — if so, skip WBP

#### [MODIFY] [focusService.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/services/focusService.js) — `handleUnfocusedNudge()`

- If `activeFocusId` points to an `offDevice` focus, suppress the nudge
  notification

#### [MODIFY] [home/index.jsx](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/home/index.jsx) — IntentsPanel

- Add a toggle/badge in the intent card expanded view: "📴 Off Device" — calls
  `UPDATE_FOCUS` with `{ offDevice: true/false }`

#### [MODIFY] [settings/index.jsx](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/settings/index.jsx) — Focus Engine section

- Brief explanation under Focus settings: "Off-device focuses suppress all
  browser popups and notifications. Useful for tasks you're doing away from the
  computer."

---

### Component 6: New Background Message Handler

#### [MODIFY] [focusService.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/services/focusService.js)

Add to `handleMessage`:

```js
case 'SAVE_FOCUS_NOTE': {
  const engine = await getFocusEngine();
  const item = engine.items[message.focusId];
  if (!item) return { error: 'Focus not found' };
  if (!item.notes) item.notes = [];
  item.notes.push({
    text: message.note,
    createdAt: new Date().toISOString()
  });
  await setFocusEngine(engine);
  broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  return { success: true };
}
```

---

## File Summary

| File                                                                                                             | Changes                                                                                            |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [inbar.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/content/inbar.js)                                         | Enhanced FTE card, singleton popup guard, auto-dismiss on external state changes                   |
| [clockService.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/services/clockService.js)               | WBP threshold gating, popup coordination key, off-device check                                     |
| [focusService.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/services/focusService.js)               | FTE popup coordination, off-device tag, SAVE_FOCUS_NOTE handler, auto-clear popup on state changes |
| [notificationService.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/services/notificationService.js) | DISMISS_POPUP handler                                                                              |
| [constants.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/background/constants.js)                              | New default settings keys                                                                          |
| [settings/index.jsx](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/settings/index.jsx)                             | WBP threshold settings UI, off-device explanation                                                  |
| [home/index.jsx](file:///c:/Users/mrmal/Le%20Dev/Tabatha/src/home/index.jsx)                                     | Off-device toggle in IntentsPanel                                                                  |

---

## Verification Plan

### Build Verification

```bash
npm run build
```

### Manual Regression Checklist

1. **FTE popup CTAs**: Start a focus with 1-minute timer → wait for expiry →
   verify all 6 CTAs work (Extend, Switch, Pause, Break, Complete, Note)
2. **Singleton FTE**: Open 3+ tabs → trigger FTE → only ONE overlay appears
   across all tabs
3. **Cross-tab dismiss**: With FTE overlay live on Tab A, go to homepage Tab B →
   complete the focus → verify Tab A's overlay auto-dismisses
4. **WBP threshold**: Set minimum idle to 2 minutes in Settings → idle for 1
   minute → return → verify NO WBP. Idle for 3 minutes → return → verify WBP
   shows
5. **WBP after break**: Toggle "Show after break return" OFF → let
   idle-auto-break fire → resume → verify NO WBP
6. **Off-device**: Toggle a focus to "off-device" → let its timer expire →
   verify NO FTE popup, NO Chrome notification
7. **Focus notes**: Use FTE "Add Note" CTA → verify note appears in focus item
   data (check via homepage expand)
8. **No regression**: Standard focus lifecycle (start → pause → resume →
   complete) still works without popup interference
