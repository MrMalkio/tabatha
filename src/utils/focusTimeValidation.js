// Workstream B1 — Focus start-time (backdating) validation.
//
// Pure, dependency-free. Validates a user-proposed new `startedAt` for a focus
// when backdating ("I was working before I created this focus").
//
// The start the user picked ALWAYS takes effect, bounded only by two hard,
// non-negotiable limits:
//   1. start >= clock-in time (you can't have been working before you clocked in)
//   2. start <= now (no future starts)
//
// Anti-double-count (DEPLOYMENT.md §8) is NOT enforced by silently moving the
// timestamp anymore. Earlier this pushed the start *forward* past every other
// focus's interval — which, with a full queue of paused focuses, shoved the
// start all the way back to "now" and made backdating a silent no-op. Instead we
// now *report* any other-focus intervals the credited span [start, now] overlaps
// (`overlaps`, each carrying the sibling's `label` and the shared `overlapMs`),
// so the caller can surface it to the user (and a future UI can offer to trim
// that time from the other focus, or move it to backburner time) rather than
// the edit quietly doing nothing. Parallel/overlapping focuses are an accepted
// concept in this product. See parking-lot: backdate overlap conflict chooser.
//
// `clampMs` spirit is borrowed from stintReconciliation.js (clock-install
// reconciliation).

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
 *        active intervals of *other* focuses, reported (not applied) for overlap.
 *        Optional `label` is echoed back on each `overlaps` entry so the UI can
 *        name the overlapping focus.
 * @returns {{ok:boolean, startMs?:number, clamped?:boolean, clampedBy?:?('clock-in'|'now'), error?:string,
 *            overlaps?:Array<{startMs:number,endMs:number,overlapMs:number,label:?string}>}}
 *   `clamped` is true only when the [clock-in, now] bounds moved the value;
 *   `clampedBy` names which bound did it ('clock-in' | 'now'), else null.
 *   `overlaps` lists other-focus intervals that intersect the credited span.
 */
export function validateStartTime({ proposedStartMs, currentStartMs, now, clockInMs, otherIntervals = [] }) {
  const nowMs = Number.isFinite(now) ? now : Date.now();

  if (!Number.isFinite(proposedStartMs)) {
    return { ok: false, error: 'Invalid start time' };
  }

  // Bound the chosen start to [clock-in, now] — the only hard limits. The start
  // the user picked always stands within these bounds; we never move it to dodge
  // another focus's time.
  const lo = Number.isFinite(clockInMs) ? clockInMs : null;
  const start = clampMs(proposedStartMs, lo, nowMs);
  const clamped = start !== proposedStartMs;
  const clampedBy = !clamped ? null : (lo != null && proposedStartMs < lo ? 'clock-in' : 'now');

  // Report (do NOT apply) any other-focus intervals the credited span
  // [start, now] overlaps. An interval [s,e] overlaps [start, now] iff
  // e > start && s < now. This is informational — the caller decides what to do.
  let overlaps = [];
  if (Array.isArray(otherIntervals) && otherIntervals.length) {
    overlaps = otherIntervals
      .filter((iv) => iv && Number.isFinite(iv.startMs) && Number.isFinite(iv.endMs) && iv.endMs > iv.startMs)
      .filter((iv) => iv.endMs > start && iv.startMs < nowMs)
      .map((iv) => {
        const s = Math.max(iv.startMs, start);
        const e = Math.min(iv.endMs, nowMs);
        return { startMs: iv.startMs, endMs: iv.endMs, overlapMs: Math.max(0, e - s), label: iv.label || null };
      });
  }

  return { ok: true, startMs: start, clamped, clampedBy, overlaps };
}

export default { validateStartTime };
