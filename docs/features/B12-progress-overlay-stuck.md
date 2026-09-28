# Bug B12 — Checkpoint progress overlay gets stuck on screen

> **Status:** 🔍 Defect identified from source (high confidence), **not yet reproduced live**.
> Reported by Malkio 2026-09-28 on 6.7.83.

## Symptoms

The checkpoint prompt — the InBar overlay that asks for a progress note and a progress level
("Submit with progress level") — stays on screen and won't go away.

## Defect (from source, `src/content/inbar.js`, checkpoint overlay handlers ~L1297–1310)

```js
btn.addEventListener('click', async () => {
  …
  await chrome.runtime.sendMessage({ type: 'SAVE_CHECKPOINT_NOTE', … }); // no try/catch
  try { await chrome.runtime.sendMessage({ type: 'DISMISS_POPUP' }); } catch {}
  overlay.remove();
});
card.querySelector('#cpn-snooze')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SNOOZE_CHECKPOINT', … });     // no try/catch
  overlay.remove();
});
```

The overlay is removed only AFTER the first message resolves. If `SAVE_CHECKPOINT_NOTE` or
`SNOOZE_CHECKPOINT` rejects — the service worker is restarting, the reply port closes, or the
extension context was invalidated by an update — the handler throws before `overlay.remove()` and
the overlay stays. If the message never resolves, it stays forever. Only **Skip** (`#cpn-skip`)
removes the overlay unconditionally.

This is the same fragile-messaging class as B11 (BlockGate fail-closed) and the InPop hang fixed in
6.7.68. Two aggravating factors observed in the same week:

- 2026-09-23/24: `chrome.storage.local` was poisoned by a full disk, so every save failed (fixed
  at the source in 6.7.84; see `docs/OPERATIONS.md` §2.2b).
- The InBar's text inputs likely share the InPop keystroke bug on shortcut-heavy sites (parked
  2026-09-26): if the note can't be typed, the user can't submit and the overlay feels stuck.

## Fix direction

1. Remove the overlay first (or in `finally`), then send the message with a timeout and a
   try/catch — mirror the 6.7.68 `withTimeout` pattern in `gatekeeper.js`.
2. If the save fails, keep the note: show a small "couldn't save — retry" toast, or queue it
   (`cloudOutbox` pattern) instead of trapping the user in the overlay.
3. Add an Escape-to-dismiss and a visible close control that never depend on messaging.
4. Reconcile the popup singleton (`_activePopup` in `focusService.js`) when the overlay is removed
   locally without the background's acknowledgement, so it isn't re-shown on the next tab.

## Verification

Unit-test the handler logic with a rejecting and a never-resolving `sendMessage` (overlay must be
gone in both). In a real browser, stop the service worker (CDP `ServiceWorker.stopWorker`) with
the overlay open, click a progress level and Snooze — the overlay must close either way.

## Related

- B11 — same messaging failure class (BlockGate).
- `.headbox/parking_lot.md` 2026-09-26 — InBar inputs and the shortcut-site keystroke bug.
