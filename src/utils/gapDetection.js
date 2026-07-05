// ════════════════════════════════════════════
// Tabatha — gapDetection.js (NB-09)
// Pure offline-gap verdict for the alive-heartbeat detector.
// The service worker persists `_lastAliveAt` every minute; when it wakes
// after a sleep / browser-closed span, the distance between the last
// heartbeat and now is the offline gap. No chrome.* usage — unit-testable.
// ════════════════════════════════════════════

/**
 * Decide whether an offline gap warrants a retro-pause + prompt.
 *
 * @param {number|string|null} lastAliveAt  Last persisted heartbeat (ms epoch or ISO). Null/undefined on first run.
 * @param {number} now                      Current time (ms epoch).
 * @param {number} thresholdMs              Minimum gap that counts as "offline" (e.g. 10 min).
 * @param {string|null} focusState          The active focus's focusState ('active', 'paused', …) or null.
 * @returns {{ gapMs: number, shouldPrompt: boolean, pauseAt: number|null }}
 *   gapMs        — the detected offline span (0 when no heartbeat exists yet)
 *   shouldPrompt — gap exceeds threshold AND a focus was actively accruing time
 *   pauseAt      — the gap START (the last heartbeat): retro-pause credits time only up to here
 */
export function detectGap(lastAliveAt, now, thresholdMs, focusState) {
  const nowMs = Number(now);
  const aliveMs = lastAliveAt == null ? NaN : new Date(lastAliveAt).getTime();

  if (!Number.isFinite(aliveMs) || !Number.isFinite(nowMs)) {
    return { gapMs: 0, shouldPrompt: false, pauseAt: null };
  }

  const gapMs = Math.max(0, nowMs - aliveMs);
  const threshold = Math.max(0, Number(thresholdMs) || 0);
  const shouldPrompt = gapMs > threshold && focusState === 'active';

  return { gapMs, shouldPrompt, pauseAt: aliveMs };
}
