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

test('accrueElapsed: with no lastResumedAt nothing accrues and nothing is clamped', () => {
  const res = accrueElapsed({ storedMs: 42 * M, lastResumedAt: null, createdAt: null, now: 2_000_000_000_000 });
  assert.deepEqual(res, {
    elapsedMs: 42 * M, deltaMs: 0, clamped: false, requestedMs: 0, reason: CLAMP_REASON.NONE
  });
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
