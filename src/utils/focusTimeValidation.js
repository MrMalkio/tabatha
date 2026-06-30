// Workstream B1 — Focus start-time (backdating) validation.
//
// Pure, dependency-free. Validates a user-proposed new `startedAt` for a focus
// when backdating ("I was working before I created this focus"). Enforces three
// invariants:
//   1. start >= clock-in time (you can't have been working before you clocked in)
//   2. start <= now (no future starts)
//   3. start must not overlap another focus's active interval — anti-double-count
//      per DEPLOYMENT.md §8. On overlap we clamp the start *forward* to the end of
//      the overlapping interval rather than rejecting outright, so a small mistake
//      is corrected instead of blocking the edit.
//
// `clampMs` spirit is borrowed from stintReconciliation.js (clock-install
// reconciliation), but the overlap logic here is focus-specific and net-new.

function clampMs(value, lo, hi) {
  if (lo != null && value < lo) return lo;
  if (hi != null && value > hi) return hi;
  return value;
}

/**
 * @param {object} args
 * @param {number} args.proposedStartMs  epoch ms the user wants as the new start
 * @param {number} args.currentStartMs   the focus's current startedAt (epoch ms)
 * @param {number} args.now              epoch ms "now"
 * @param {?number} args.clockInMs        clock-in epoch ms, or null/undefined if not clocked in
 * @param {Array<{startMs:number,endMs:number}>} [args.otherIntervals]
 *        active intervals of *other* focuses to avoid double-counting against
 * @returns {{ok:boolean, startMs?:number, clamped?:boolean, error?:string}}
 */
export function validateStartTime({ proposedStartMs, currentStartMs, now, clockInMs, otherIntervals = [] }) {
  const nowMs = Number.isFinite(now) ? now : Date.now();

  if (!Number.isFinite(proposedStartMs)) {
    return { ok: false, error: 'Invalid start time' };
  }

  let start = proposedStartMs;
  let clamped = false;

  // (1) lower bound: clock-in time, if clocked in. (2) upper bound: now.
  const lo = Number.isFinite(clockInMs) ? clockInMs : null;
  const bounded = clampMs(start, lo, nowMs);
  if (bounded !== start) clamped = true;
  start = bounded;

  // (3) overlap: if the proposed start lands inside another focus's active
  // interval, push it forward to that interval's end (then re-clamp to now).
  if (Array.isArray(otherIntervals) && otherIntervals.length) {
    for (const iv of otherIntervals) {
      if (!iv || !Number.isFinite(iv.startMs) || !Number.isFinite(iv.endMs)) continue;
      if (start >= iv.startMs && start < iv.endMs) {
        start = iv.endMs;
        clamped = true;
      }
    }
    // Re-apply the now ceiling after any forward push.
    if (start > nowMs) {
      start = nowMs;
      clamped = true;
    }
  }

  return { ok: true, startMs: start, clamped };
}

export default { validateStartTime };
