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
 * @param {Array<{startMs:number,endMs:number,label?:string}>} [args.otherIntervals]
 *        active intervals of *other* focuses to avoid double-counting against.
 *        Optional `label` is echoed back as `clampedBy` when that interval
 *        forces the start forward, so the UI can explain the clamp.
 * @returns {{ok:boolean, startMs?:number, clamped?:boolean, clampedBy?:?string, error?:string}}
 */
export function validateStartTime({ proposedStartMs, currentStartMs, now, clockInMs, otherIntervals = [] }) {
  const nowMs = Number.isFinite(now) ? now : Date.now();

  if (!Number.isFinite(proposedStartMs)) {
    return { ok: false, error: 'Invalid start time' };
  }

  let start = proposedStartMs;
  let clamped = false;
  let clampedBy = null; // label of the last overlapping focus that pushed the start forward

  // (1) lower bound: clock-in time, if clocked in. (2) upper bound: now.
  const lo = Number.isFinite(clockInMs) ? clockInMs : null;
  const bounded = clampMs(start, lo, nowMs);
  if (bounded !== start) clamped = true;
  start = bounded;

  // (3) overlap: the credited span is the WHOLE window [start, now], not just
  // the start instant. Any other focus interval that overlaps that span would
  // double-count the shared wall-clock time. Push `start` forward past every
  // overlapping interval's end so the credited span no longer overlaps ANY of
  // them. An interval [s,e] overlaps [start, now] iff e > start && s < now.
  // We iterate to a fixed point because clamping forward past one interval can
  // still leave (or expose) overlap with a later-ending one.
  if (Array.isArray(otherIntervals) && otherIntervals.length) {
    const intervals = otherIntervals.filter(
      (iv) => iv && Number.isFinite(iv.startMs) && Number.isFinite(iv.endMs) && iv.endMs > iv.startMs,
    );
    let moved = true;
    while (moved) {
      moved = false;
      for (const iv of intervals) {
        // Overlap of the credited span [start, now] with [iv.startMs, iv.endMs].
        if (iv.endMs > start && iv.startMs < nowMs && start < iv.endMs) {
          start = iv.endMs;
          clamped = true;
          clampedBy = iv.label || null;
          moved = true;
        }
      }
    }
    // Re-apply the now ceiling after any forward push.
    if (start > nowMs) {
      start = nowMs;
      clamped = true;
    }
  }

  return { ok: true, startMs: start, clamped, clampedBy };
}

export default { validateStartTime };
