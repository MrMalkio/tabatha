# Task 04d — clockService + clockTickService

| Property | Value |
|---|---|
| **Branch** | `refactor/decomp-v2-clock-service` |
| **Branched from** | `refactor/decomp-v2` (after Task 02 merged) |
| **Merge target** | `refactor/decomp-v2` |
| **Depends on** | Task 02 (notification + settings) |
| **Parallel with** | 04a, 04b, 04c |
| **Effort** | ~1.5 hours |
| **Risk** | Medium |

## Files created
- `src/background/services/clockService.js` — wraps existing `createClockService()` factory + adds `handleMessage`.
- `src/background/services/clockTickService.js` — central 1-second tick broadcaster (see feedback §9).

## Handlers owned
`CLOCK_IN`, `CLOCK_OUT`, `TOGGLE_BREAK`, `GET_CLOCK_STATUS`, `GET_CLOCK_HISTORY`, `GET_LAST_SESSION`.

## clockTickService contract

```js
// services/clockTickService.js
let subscribers = 0;
let interval = null;

export function subscribe() {
  subscribers++;
  if (!interval) interval = setInterval(broadcastTick, 1000);
}
export function unsubscribe() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0 && interval) {
    clearInterval(interval); interval = null;
  }
}
function broadcastTick() {
  broadcastToExtension({ type: 'TICK', t: Date.now() });
}
```

The service starts a single 1Hz interval only when there's at least one consumer. UI components subscribe in `useEffect` and unsubscribe on unmount or when `document.visibilityState === 'hidden'`.

Replace inline 1-second timers throughout the popup/sidebar/InBar to listen for `TICK` messages instead.

## Internal exports for cross-service callers
- `endBreakIfActive()` — called by `focusService.RESUME_FOCUS`.
- `sendClockEventToCompanion(event)` — called by `companionService` (Phase 5).

## Efficiency fixes bundled
- Drop redundant per-component intervals once `TICK` is wired.

## Router registration
```js
const services = [..., clockService, clockTickService];
```

## Verification
- [ ] Clock in → break → resume → clock out — all work
- [ ] Popup shows live elapsed time (driven by TICK)
- [ ] Hide popup → TICK subscriber count drops; show popup → resumes
- [ ] When nothing is subscribed, no `setInterval` is active (verify via DevTools timers panel)
- [ ] message-contracts.md updated
