// ============================================================
// Tabatha — Elapsed-time clamping (sync forensics S4 / bug #4)
//
// WHY THIS FILE EXISTS
//
// Both surfaces accrued focus time as a raw wall-clock difference with no
// ceiling: the extension's `addElapsedSinceResume` does
// `elapsedMs += Date.now() - lastResumedAt`, and the Sidecar's pause paths do
// `_elapsedMs = Date.now() - _startedAt`. That is only correct if the focus
// was genuinely running for the whole span. It is not — a focus left `active`
// in the cloud while the browser is closed, the machine asleep, or the phone
// in a pocket keeps accruing.
//
// The measured consequence (docs/audits/2026-07-24-sync-forensics.md §S4):
// focus `f_1784676002315_yo37y` ("Tabby work") was billed **37 h 14 m** in one
// go, matching its causing event — `pauseOtherActives` inside the Sidecar's
// `createIntent` — to within 80 ms. Nobody worked 37 hours.
//
// This module is the single place both surfaces get their ceilings from, so
// the two can't drift apart the way `last_clock_event_at` did (S5).
//
// ── TWO CLAMPS, DELIBERATELY DIFFERENT IN KIND ──────────────────────────
//
// 1. STRUCTURAL (no magic number, always correct): a focus can never have
//    accrued more running time than has passed since it was created. This is
//    arithmetic, not judgement. It is free and it is never wrong.
//    NB: it does NOT catch the 37 h case on its own — that row was 76 h old,
//    so 37 h passed the structural test. Hence clamp 2.
//
// 2. CONTINUOUS-RUN CEILING (the judgement call): a single uninterrupted run
//    longer than MAX_CONTINUOUS_RUN_MS is not a human working, it is a stuck
//    timestamp.
//
// ── DEFENDING THE 12-HOUR CEILING ───────────────────────────────────────
//
// A clamp that is too low silently deletes real work, which is worse than the
// bug it fixes. So the number was picked from the actual distribution of
// `tags._elapsedMs` across all 310 rows carrying one on Malkio's profile
// (read-only Mgmt API snapshot, 2026-07-25):
//
//     < 1 h    279 rows   (90.0%)
//     1–4 h     23 rows   ( 7.4%)
//     4–8 h      4 rows   ( 1.3%)   <- longest credible real sessions
//     8–12 h     2 rows   ( 0.6%)
//    12–24 h     1 row    ( 0.3%)   <- 20.69 h, not credible as one run
//     > 24 h     1 row    ( 0.3%)   <- 37.24 h, PROVEN corrupt (§S4)
//
// So a 12 h ceiling touches exactly 2 rows out of 310, and both of them are
// longer than any unbroken human work session: 20.7 h and 37.2 h each imply
// a full day and night at the desk with no pause, no switch and no sleep.
// Meanwhile the nearest *legitimate-looking* values — 8.23 h ("Daily SUV")
// and 8.05 h ("Asana inbox"), both plausible as a full workday left running —
// sit 46% below the ceiling and are untouched.
//
// Corroborating reasons the ceiling belongs above ~8 h and below ~20 h:
//   - Tabatha's own idle auto-break fires after 5 minutes of inactivity, so a
//     genuinely-attended session is interrupted long before 12 h.
//   - 12 h is already more than a double shift. Time beyond it is not being
//     lost, it is being *disbelieved*.
//
// ── THE CLAMP IS NEVER SILENT ───────────────────────────────────────────
//
// Every clamp returns `{ clamped: true, requestedMs, reason }` and callers
// stamp `tags._elapsedClamp` with the original value. Nothing is destroyed:
// the number the buggy path wanted to write is preserved next to the number
// actually written, so a human can audit or restore it. If the ceiling ever
// turns out to be wrong, the evidence to fix it is in the row.
// ============================================================

/**
 * Longest single continuous run we will believe. See the defence above.
 * Exported so tests assert against the constant rather than a literal.
 */
export const MAX_CONTINUOUS_RUN_MS = 12 * 60 * 60 * 1000; // 12 h

/** Reason codes, so callers/tests can distinguish which ceiling bit. */
export const CLAMP_REASON = {
  NONE: null,
  CEILING: 'continuous_run_ceiling',
  WALL_CLOCK: 'wall_clock_life'
};

function finiteOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerce an ISO string / epoch ms / Date to epoch ms, or null. */
export function toMs(value) {
  if (value == null) return null;
  if (value instanceof Date) return finiteOrNull(value.getTime());
  if (typeof value === 'number') return finiteOrNull(value);
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Clamp ONE continuous run delta (now − lastResumedAt / now − _startedAt).
 *
 * @param {number} deltaMs raw wall-clock delta for this run
 * @param {number} [ceilingMs=MAX_CONTINUOUS_RUN_MS]
 * @returns {{ ms: number, clamped: boolean, requestedMs: number, reason: string|null }}
 */
export function clampRunDelta(deltaMs, ceilingMs = MAX_CONTINUOUS_RUN_MS) {
  const raw = finiteOrNull(deltaMs) ?? 0;
  // Negative deltas mean a clock skew or a future-dated anchor. Treat as zero
  // rather than letting them *subtract* previously-earned time.
  const requested = Math.max(0, raw);
  if (requested > ceilingMs) {
    return { ms: ceilingMs, clamped: true, requestedMs: requested, reason: CLAMP_REASON.CEILING };
  }
  return { ms: requested, clamped: false, requestedMs: requested, reason: CLAMP_REASON.NONE };
}

/**
 * Accrue a run delta onto a stored elapsed total, applying BOTH clamps.
 *
 * @param {object} args
 * @param {number} args.storedMs         previously banked elapsed
 * @param {*}      args.lastResumedAt    when this run started (ISO/ms/Date/null)
 * @param {*}      [args.createdAt]      focus creation instant, for the structural clamp
 * @param {number} [args.now=Date.now()]
 * @param {number} [args.ceilingMs=MAX_CONTINUOUS_RUN_MS]
 * @returns {{ elapsedMs: number, deltaMs: number, clamped: boolean, requestedMs: number, reason: string|null }}
 */
export function accrueElapsed({ storedMs, lastResumedAt, createdAt, now = Date.now(), ceilingMs = MAX_CONTINUOUS_RUN_MS }) {
  const stored = Math.max(0, finiteOrNull(storedMs) ?? 0);
  const resumedMs = toMs(lastResumedAt);
  if (resumedMs == null) {
    return { elapsedMs: stored, deltaMs: 0, clamped: false, requestedMs: 0, reason: CLAMP_REASON.NONE };
  }

  const run = clampRunDelta(now - resumedMs, ceilingMs);
  let total = stored + run.ms;
  let { clamped, requestedMs, reason } = run;
  // Track the raw total we'd have written, so provenance survives both clamps.
  let requestedTotal = stored + run.requestedMs;

  // Structural clamp: total running time can never exceed the focus's own
  // wall-clock life. Applied second so it can also catch an already-inflated
  // `storedMs` inherited from a pre-fix row.
  const createdMs = toMs(createdAt);
  if (createdMs != null) {
    const life = Math.max(0, now - createdMs);
    if (total > life) {
      total = life;
      clamped = true;
      reason = reason === CLAMP_REASON.CEILING ? CLAMP_REASON.CEILING : CLAMP_REASON.WALL_CLOCK;
    }
  }

  return {
    elapsedMs: total,
    deltaMs: run.ms,
    clamped,
    requestedMs: clamped ? requestedTotal : total,
    reason: clamped ? reason : CLAMP_REASON.NONE
  };
}

/**
 * Live elapsed for display/publish: banked + the in-flight run, clamped the
 * same way `accrueElapsed` will clamp it when the run is finally banked.
 * Used by S9 (`browser_profile_status.focus_elapsed_ms`) so the published
 * number matches what the extension itself renders — and matches what the
 * pause path will eventually store.
 */
export function liveElapsedClamped({ storedMs, lastResumedAt, createdAt, now = Date.now(), ceilingMs = MAX_CONTINUOUS_RUN_MS }) {
  return accrueElapsed({ storedMs, lastResumedAt, createdAt, now, ceilingMs }).elapsedMs;
}

/**
 * Build the audit stamp written into `tags._elapsedClamp` when a clamp fires.
 * Kept here so both surfaces write an identical shape.
 */
export function clampStamp({ requestedMs, appliedMs, reason, now = Date.now() }) {
  return {
    at: new Date(now).toISOString(),
    requestedMs,
    appliedMs,
    reason,
    ceilingMs: MAX_CONTINUOUS_RUN_MS
  };
}
