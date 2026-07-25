// ============================================================
// Tabby Sidecar — Elapsed-time clamping (sync forensics S4 / bug #4)
//
// Mirror of the extension's `src/utils/elapsedClamp.js`. Both surfaces accrue
// focus time independently (there is no shared arbiter for elapsed — see the
// audit's §1.1 table), so both need the identical ceiling or they will simply
// disagree in a new way.
//
// THE INCIDENT THIS EXISTS TO PREVENT
//
// `pauseOtherActives` and `pause` both froze elapsed as a raw wall-clock
// difference:
//
//     _elapsedMs: Math.max(0, Date.now() - startedAtOf(f))
//
// with no ceiling. That is correct only if the focus was genuinely running
// for the whole span — and a focus left `active` in the cloud while the
// browser is closed or the phone is in a pocket keeps accruing. On
// 2026-07-23 creating an intent on the phone ran `pauseOtherActives` and
// silently attributed **37 h 14 m** to "Tabby work", an intent that had
// merely been left active overnight. The audit matched the value to its
// causing event to within 80 ms.
//
// THE CEILING, AND WHY 12 HOURS
//
// Picked from the actual distribution of `tags._elapsedMs` across all 310
// rows carrying one (read-only Mgmt API snapshot, 2026-07-25):
//
//     < 1 h    279 rows (90.0%)      4–8 h     4 rows   <- longest credible
//     1–4 h     23 rows ( 7.4%)      8–12 h    2 rows
//    12–24 h     1 row  (20.69 h — not credible as one unbroken run)
//     > 24 h     1 row  (37.24 h — PROVEN corrupt, §S4)
//
// A 12 h ceiling therefore touches 2 rows in 310, and both imply a full day
// and night at the desk with no pause and no sleep. The nearest legitimate
// values (8.23 h and 8.05 h — plausible as a workday left running) keep 46%
// headroom. A clamp that is too low silently deletes real work, which is
// worse than the bug, so the number is deliberately generous.
//
// NOTHING IS DESTROYED: when a clamp fires the caller stamps
// `tags._elapsedClamp` with the value the old code would have written, so it
// stays auditable and restorable.
// ============================================================

/** Longest single continuous run we will believe. See the defence above. */
export const MAX_CONTINUOUS_RUN_MS = 12 * 60 * 60 * 1000; // 12 h

export const CLAMP_REASON = {
  NONE: null,
  CEILING: 'continuous_run_ceiling',
  WALL_CLOCK: 'wall_clock_life',
} as const;

export type ClampReason = (typeof CLAMP_REASON)[keyof typeof CLAMP_REASON];

export type ClampResult = {
  ms: number;
  clamped: boolean;
  requestedMs: number;
  reason: ClampReason;
};

export type ClampStamp = {
  at: string;
  requestedMs: number;
  appliedMs: number;
  reason: ClampReason;
  ceilingMs: number;
};

/**
 * Clamp ONE continuous run span (now − _startedAt).
 *
 * A negative span means clock skew or a future-dated anchor; it yields 0
 * rather than being allowed to subtract previously-earned time.
 */
export function clampRunDelta(deltaMs: number, ceilingMs: number = MAX_CONTINUOUS_RUN_MS): ClampResult {
  const raw = Number(deltaMs);
  const requested = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  if (requested > ceilingMs) {
    return { ms: ceilingMs, clamped: true, requestedMs: requested, reason: CLAMP_REASON.CEILING };
  }
  return { ms: requested, clamped: false, requestedMs: requested, reason: CLAMP_REASON.NONE };
}

/**
 * The elapsed value to freeze into `tags._elapsedMs` when pausing.
 *
 * @param startedAtMs the (pause-shifted) run anchor, i.e. `startedAtOf(f)`
 * @param createdAtMs the row's `created_at`, for the structural clamp —
 *        elapsed can never exceed the focus's own wall-clock life. Pass null
 *        when unavailable; the ceiling still applies.
 */
export function clampFrozenElapsed(
  startedAtMs: number,
  now: number = Date.now(),
  createdAtMs: number | null = null,
  ceilingMs: number = MAX_CONTINUOUS_RUN_MS
): ClampResult {
  const run = clampRunDelta(now - startedAtMs, ceilingMs);
  let { ms, clamped, requestedMs, reason } = run;

  if (createdAtMs != null && Number.isFinite(createdAtMs)) {
    const life = Math.max(0, now - createdAtMs);
    if (ms > life) {
      ms = life;
      clamped = true;
      reason = reason === CLAMP_REASON.CEILING ? CLAMP_REASON.CEILING : CLAMP_REASON.WALL_CLOCK;
    }
  }

  return { ms, clamped, requestedMs, reason };
}

/** Audit stamp for `tags._elapsedClamp`. Identical shape to the extension's. */
export function clampStamp(
  requestedMs: number,
  appliedMs: number,
  reason: ClampReason,
  now: number = Date.now()
): ClampStamp {
  return {
    at: new Date(now).toISOString(),
    requestedMs,
    appliedMs,
    reason,
    ceilingMs: MAX_CONTINUOUS_RUN_MS,
  };
}
