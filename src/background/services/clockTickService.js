// ════════════════════════════════════════════
// Tabatha — clockTickService (Plan 023 Task 04d)
// Central 1Hz tick broadcaster.
//
// The service starts a single 1-second interval only when at least one
// consumer is subscribed. UI components subscribe in useEffect and
// unsubscribe on unmount or when document.visibilityState === 'hidden'.
//
// This replaces inline per-component setInterval(1000) timers throughout
// the popup / sidebar / InBar, reducing the number of active intervals
// from N (one per component) to 0-or-1.
// ════════════════════════════════════════════

import { broadcastToExtension } from './notificationService.js';

let subscribers = 0;
let interval = null;

/**
 * Increment subscriber count. Starts the 1Hz tick if this is the first.
 */
export function subscribe() {
  subscribers++;
  if (!interval) {
    interval = setInterval(broadcastTick, 1000);
  }
}

/**
 * Decrement subscriber count. Stops the interval when count reaches 0.
 */
export function unsubscribe() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0 && interval) {
    clearInterval(interval);
    interval = null;
  }
}

/**
 * Broadcast a TICK message to all extension pages.
 * Intentionally does NOT broadcastAll (content scripts don't need ticks).
 */
function broadcastTick() {
  broadcastToExtension({ type: 'TICK', t: Date.now() });
}

// ── Router entry point ──

export async function handleMessage(type, _message, _sender) {
  switch (type) {
    case 'TICK_SUBSCRIBE':
      subscribe();
      return { subscribed: true, subscribers };

    case 'TICK_UNSUBSCRIBE':
      unsubscribe();
      return { subscribed: false, subscribers };

    case 'GET_TICK_STATUS':
      return { active: interval !== null, subscribers };

    default:
      return undefined;
  }
}
