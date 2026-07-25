// Regression tests for the elapsed-time clamp (sync forensics S4 / bug #4).
//
// The headline test below replays the ACTUAL incident from
// docs/audits/2026-07-24-sync-forensics.md §S4 with its real timestamps:
// focus `f_1784676002315_yo37y` ("Tabby work") was billed 37 h 14 m 08 s in a
// single accrual when `pauseOtherActives` ran inside the Sidecar's
// `createIntent`. Against the pre-fix code this test fails; against the clamp
// it passes.
//
// Run: node --test test/elapsedClamp.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CONTINUOUS_RUN_MS,
  CLAMP_REASON,
  clampRunDelta,
  accrueElapsed,
  liveElapsedClamped,
  clampStamp,
  clampStoredElapsed,
  lifeAnchorMs,
  toMs
} from '../src/utils/elapsedClamp.js';

const H = 60 * 60 * 1000;
const M = 60 * 1000;

// ── The incident ──────────────────────────────────────────────────

test('S4 incident replay: 37h14m accrual is refused (real timestamps)', () => {
  // Verbatim from the audit.
  const startedAt = '2026-07-22T01:17:41.274Z';
  const pausedAt = '2026-07-23T14:31:49.390Z'; // when createIntent fired
  const buggyElapsed = 134_048_116; // what the old code wrote: 37h 14m 08.1s

  // Sanity: this test really is reproducing the reported arithmetic.
  const rawDelta = toMs(pausedAt) - toMs(startedAt);
  assert.ok(Math.abs(rawDelta - buggyElapsed) < 200,
    `expected the raw wall-clock delta to reproduce the buggy value, got ${rawDelta}`);

  const res = accrueElapsed({
    storedMs: 0,
    lastResumedAt: startedAt,
    createdAt: startedAt,
    now: toMs(pausedAt)
  });

  assert.equal(res.clamped, true, 'the 37h accrual must be clamped');
  assert.equal(res.reason, CLAMP_REASON.CEILING);
  assert.equal(res.elapsedMs, MAX_CONTINUOUS_RUN_MS, 'clamped to the 12h ceiling');
  // Provenance survives: the number the bug wanted is still recoverable.
  assert.ok(res.requestedMs >= buggyElapsed - 200 && res.requestedMs <= buggyElapsed + 200,
    'the original implausible value must be preserved for audit');
});

// ── The ceiling must not eat real work ────────────────────────────
//
// These are the closest LEGITIMATE values observed in prod (audit §S4 /
// probe of 310 rows carrying tags._elapsedMs). If a future change to
// MAX_CONTINUOUS_RUN_MS would start clamping these, this test fails —
// which is the whole point: the ceiling is only defensible while the real
// data stays below it.

test('does not clamp the longest credible real sessions observed in prod', () => {
  const realWorld = [
    { label: 'Daily SUV', ms: Math.round(8.23 * H) },
    { label: 'Asana inbox', ms: Math.round(8.05 * H) },
    { label: 'Tabatha walkthrough with Po', ms: Math.round(4.93 * H) },
    { label: 'BvB support', ms: Math.round(4.85 * H) }
  ];
  for (const { label, ms } of realWorld) {
    const now = 2_000_000_000_000;
    const res = accrueElapsed({
      storedMs: 0,
      lastResumedAt: now - ms,
      createdAt: now - ms - 1000,
      now
    });
    assert.equal(res.clamped, false, `"${label}" (${(ms / H).toFixed(2)}h) must NOT be clamped`);
    assert.equal(res.elapsedMs, ms);
  }
});

test('the ceiling sits above every credible session and below the corrupt ones', () => {
  // Guards the choice itself, not just its application.
  assert.ok(MAX_CONTINUOUS_RUN_MS > 8.23 * H, 'ceiling must clear the longest real session (8.23h)');
  assert.ok(MAX_CONTINUOUS_RUN_MS < 20.69 * H, 'ceiling must catch the 20.69h outlier');
});

// ── clampRunDelta ─────────────────────────────────────────────────

test('clampRunDelta: passes a normal run through untouched', () => {
  const r = clampRunDelta(45 * M);
  assert.deepEqual(r, { ms: 45 * M, clamped: false, requestedMs: 45 * M, reason: CLAMP_REASON.NONE });
});

test('clampRunDelta: exactly at the ceiling is allowed (boundary is inclusive)', () => {
  const r = clampRunDelta(MAX_CONTINUOUS_RUN_MS);
  assert.equal(r.clamped, false);
  assert.equal(r.ms, MAX_CONTINUOUS_RUN_MS);
});

test('clampRunDelta: one millisecond over the ceiling clamps', () => {
  const r = clampRunDelta(MAX_CONTINUOUS_RUN_MS + 1);
  assert.equal(r.clamped, true);
  assert.equal(r.ms, MAX_CONTINUOUS_RUN_MS);
  assert.equal(r.reason, CLAMP_REASON.CEILING);
});

test('clampRunDelta: a negative delta (clock skew / future anchor) yields 0, never a subtraction', () => {
  // Pre-fix this would have SUBTRACTED already-earned time from elapsedMs.
  const r = clampRunDelta(-5 * H);
  assert.equal(r.ms, 0);
  assert.equal(r.clamped, false);
});

test('clampRunDelta: non-numeric input degrades to 0 rather than NaN-poisoning elapsed', () => {
  assert.equal(clampRunDelta(undefined).ms, 0);
  assert.equal(clampRunDelta(NaN).ms, 0);
  assert.equal(clampRunDelta('nonsense').ms, 0);
});

// ── accrueElapsed: the structural (wall-clock life) clamp ─────────

test('structural clamp: elapsed can never exceed the focus wall-clock life', () => {
  const now = 2_000_000_000_000;
  // Focus created 30 min ago, but storedMs claims 5h already banked.
  const res = accrueElapsed({
    storedMs: 5 * H,
    lastResumedAt: now - 10 * M,
    createdAt: now - 30 * M,
    now
  });
  assert.equal(res.clamped, true);
  assert.equal(res.reason, CLAMP_REASON.WALL_CLOCK);
  assert.equal(res.elapsedMs, 30 * M, 'capped at the life of the focus');
});

test('structural clamp alone would NOT have caught the 37h case — proving the ceiling is needed', () => {
  // The audit's row was 76h old, so 37h passed the wall-clock test. This test
  // exists so nobody "simplifies" the fix down to the structural clamp only.
  const now = 2_000_000_000_000;
  const res = accrueElapsed({
    storedMs: 0,
    lastResumedAt: now - 37.24 * H,
    createdAt: now - 76.22 * H,
    now,
    ceilingMs: Number.MAX_SAFE_INTEGER // ceiling disabled
  });
  assert.equal(res.clamped, false, 'wall-clock life alone lets 37h through');
  assert.ok(res.elapsedMs > 37 * H);
});

test('accrueElapsed: banks onto an existing stored total', () => {
  const now = 2_000_000_000_000;
  const res = accrueElapsed({ storedMs: 20 * M, lastResumedAt: now - 10 * M, createdAt: now - 2 * H, now });
  assert.equal(res.clamped, false);
  assert.equal(res.elapsedMs, 30 * M);
  assert.equal(res.deltaMs, 10 * M);
});

test('accrueElapsed: with no lastResumedAt nothing accrues', () => {
  const res = accrueElapsed({ storedMs: 42 * M, lastResumedAt: null, createdAt: null, now: 2_000_000_000_000 });
  assert.equal(res.elapsedMs, 42 * M);
  assert.equal(res.deltaMs, 0);
  assert.equal(res.clamped, false);
});

test('accrueElapsed: a PAUSED item with an impossible banked total is still clamped', () => {
  // Regression on my own first cut, caught by the K1 guard test: the no-run
  // case used to early-return BEFORE the structural clamp, so a total
  // inherited from a pre-fix install sailed through untouched on every read.
  const now = 2_000_000_000_000;
  const res = accrueElapsed({ storedMs: 40 * H, lastResumedAt: null, createdAt: now - 2 * H, startedAt: now - 2 * H, now });
  assert.equal(res.clamped, true);
  assert.equal(res.elapsedMs, 2 * H);
});

test('accrueElapsed: missing createdAt disables only the structural clamp, ceiling still applies', () => {
  const now = 2_000_000_000_000;
  const res = accrueElapsed({ storedMs: 0, lastResumedAt: now - 30 * H, createdAt: null, now });
  assert.equal(res.clamped, true);
  assert.equal(res.elapsedMs, MAX_CONTINUOUS_RUN_MS);
});

// ── liveElapsedClamped (backs S9 / bug #9) ────────────────────────

test('liveElapsedClamped: includes the in-flight run, not just the stored value', () => {
  const now = 2_000_000_000_000;
  const live = liveElapsedClamped({ storedMs: 15 * M, lastResumedAt: now - 5 * M, createdAt: now - H, now });
  assert.equal(live, 20 * M, 'stored 15m + live 5m');
});

test('liveElapsedClamped: agrees with what accrueElapsed will bank at pause', () => {
  // The S9 defect was two different formulas for one quantity. Lock them together.
  const now = 2_000_000_000_000;
  const args = { storedMs: 90 * M, lastResumedAt: now - 37 * M, createdAt: now - 10 * H, now };
  assert.equal(liveElapsedClamped(args), accrueElapsed(args).elapsedMs);
});

// ── audit stamp ───────────────────────────────────────────────────

test('clampStamp: records requested, applied, reason and the ceiling in force', () => {
  const stamp = clampStamp({ requestedMs: 134_048_116, appliedMs: MAX_CONTINUOUS_RUN_MS, reason: CLAMP_REASON.CEILING, now: 0 });
  assert.equal(stamp.requestedMs, 134_048_116);
  assert.equal(stamp.appliedMs, MAX_CONTINUOUS_RUN_MS);
  assert.equal(stamp.reason, 'continuous_run_ceiling');
  assert.equal(stamp.ceilingMs, MAX_CONTINUOUS_RUN_MS);
  assert.equal(stamp.at, new Date(0).toISOString());
});

// ══════════════════════════════════════════════════════════════════
// Koda review of 6.7.74 — reproduced data-loss defects
// ══════════════════════════════════════════════════════════════════

// ── K1: the structural clamp must not destroy BACKDATED work ──────
//
// `setFocusStartTime` ("I was working before I created this focus") is a
// shipped button. `validateStartTime` bounds the chosen start to
// [clock-in, now] and deliberately does NOT bound it by createdAt — being
// earlier IS the feature. The clamp used `createdAt || startedAt`, i.e. the
// LATER anchor, so it measured a life shorter than the edit was validated
// against and silently ate the difference.

test('K1: a backdated focus keeps its credited time (Koda\'s exact repro)', () => {
  // Focus created 14:00, backdated to 09:00, 5h credited. At 14:05 the old
  // code returned 5.0 MINUTES and the next pause banked that — losing 295 min.
  const createdAt = new Date('2026-07-24T14:00:00Z').getTime();
  const startedAt = new Date('2026-07-24T09:00:00Z').getTime();
  const now = new Date('2026-07-24T14:05:00Z').getTime();

  const live = liveElapsedClamped({
    storedMs: 5 * H,
    lastResumedAt: null,
    createdAt,
    startedAt,
    now
  });
  assert.equal(live, 5 * H, 'the 5h of backdated work must survive');
  assert.notEqual(live, 5 * M, '5.0 minutes is the pre-fix answer — 295 min destroyed');
});

test('K1: banking a backdated focus at pause preserves the full total', () => {
  const createdAt = new Date('2026-07-24T14:00:00Z').getTime();
  const startedAt = new Date('2026-07-24T09:00:00Z').getTime();
  const now = new Date('2026-07-24T14:05:00Z').getTime();

  const res = accrueElapsed({
    storedMs: 5 * H,
    lastResumedAt: now - 5 * M,
    createdAt,
    startedAt,
    now
  });
  assert.equal(res.clamped, false, 'nothing implausible here — do not clamp');
  assert.equal(res.elapsedMs, 5 * H + 5 * M);
});

test('K1: lifeAnchorMs takes the EARLIEST anchor, never the later one', () => {
  const early = new Date('2026-07-24T09:00:00Z').getTime();
  const late = new Date('2026-07-24T14:00:00Z').getTime();
  assert.equal(lifeAnchorMs(late, early), early, 'createdAt later, startedAt earlier');
  assert.equal(lifeAnchorMs(early, late), early, 'createdAt earlier, startedAt later');
  assert.equal(lifeAnchorMs(null, early), early, 'one missing');
  assert.equal(lifeAnchorMs(early, null), early);
  assert.equal(lifeAnchorMs(null, null), null, 'both missing disables the structural clamp');
});

test('K1: a zero-length life disables the structural clamp instead of zeroing elapsed', () => {
  // buildFocusRows stamps created_at = now on an item with both anchors null.
  // Reading that back must not wipe the elapsed it already banked.
  const now = 2_000_000_000_000;
  const res = accrueElapsed({ storedMs: 90 * M, lastResumedAt: null, createdAt: now, startedAt: now, now });
  assert.equal(res.elapsedMs, 90 * M, 'missing data is not evidence that no time was spent');
  assert.equal(res.clamped, false);
});

test('K1: the structural clamp still fires on a genuinely impossible total', () => {
  // Guard the guard — K1 must not have disabled the clamp wholesale.
  const now = 2_000_000_000_000;
  const res = accrueElapsed({
    storedMs: 5 * H, lastResumedAt: null,
    createdAt: now - 30 * M, startedAt: now - 30 * M, now
  });
  assert.equal(res.clamped, true);
  assert.equal(res.elapsedMs, 30 * M);
});

// ── K2: the ceiling must not see a lifetime dressed up as a run ───
//
// adoptRemoteActive used to set lastResumedAt = the remote's back-dated
// tags._startedAt and elapsedMs = 0, so `now - lastResumedAt` was TOTAL
// accumulated time, not a run. A 14h cross-surface focus adopted and paused
// five minutes later got clamped to 12h — destroying 2h05m of real work.

test('K2: clampStoredElapsed leaves a large but legitimate banked total alone', () => {
  // 14h accumulated across a week on the phone; the row is a week old, so the
  // structural clamp has ample life and the ceiling must not touch a BANKED
  // total (the ceiling governs one continuous run, not a lifetime).
  const now = 2_000_000_000_000;
  const banked = Math.round(14 * H);
  const out = clampStoredElapsed({
    storedMs: banked,
    createdAt: now - 7 * 24 * H,
    startedAt: now - 7 * 24 * H,
    now
  });
  assert.equal(out, banked, '14h accumulated over a week is real work, not corruption');
});

test('K2: clampStoredElapsed is a pure function of frozen fields (no ping-pong)', () => {
  // Called twice with different `now`, an unchanged item must yield the same
  // number — otherwise a pushed anchor would drift every sync cycle.
  const base = { storedMs: 2 * H, createdAt: 1_900_000_000_000, startedAt: 1_900_000_000_000 };
  const a = clampStoredElapsed({ ...base, now: 2_000_000_000_000 });
  const b = clampStoredElapsed({ ...base, now: 2_000_000_000_000 + 37 * M });
  assert.equal(a, b, 'the pushed value must not move just because time passed');
});

test('K2: clampStoredElapsed still trims a total that exceeds the row life', () => {
  const now = 2_000_000_000_000;
  const out = clampStoredElapsed({ storedMs: 40 * H, createdAt: now - 3 * H, startedAt: now - 3 * H, now });
  assert.equal(out, 3 * H);
});
