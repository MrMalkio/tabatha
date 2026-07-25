// Regression tests for the Sidecar's elapsed clamp (sync forensics S4 / #4).
//
// UNLIKE tests/arbitration.test.mjs and tests/timer-math.test.mjs, this file
// imports the REAL module rather than hand-mirroring it. `elapsedClamp.ts` was
// written with no react-native / supabase imports precisely so it could be
// loaded under plain `node --test` (Node >= 22.6 strips the types). A mirrored
// copy would not have caught this bug class anyway — the mirror is written by
// hand from the same wrong assumption as the source.
//
// Run: node --test tests/elapsed-clamp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CONTINUOUS_RUN_MS,
  CLAMP_REASON,
  clampRunDelta,
  clampFrozenElapsed,
  clampStamp,
} from '../src/data/elapsedClamp.ts';

const H = 60 * 60 * 1000;
const M = 60 * 1000;

// ── The incident ──────────────────────────────────────────────────

test('S4 incident replay: pauseOtherActives no longer freezes 37h14m (real timestamps)', () => {
  // From docs/audits/2026-07-24-sync-forensics.md §S4. `createIntent` on the
  // phone ran `pauseOtherActives(null)` at pausedAt, freezing the raw span
  // since startedAt into tags._elapsedMs on an extension-authored focus.
  const startedAt = new Date('2026-07-22T01:17:41.274Z').getTime();
  const pausedAt = new Date('2026-07-23T14:31:49.390Z').getTime();
  const createdAt = pausedAt - Math.round(76.22 * H);
  const buggyElapsed = 134_048_116; // 37h 14m 08.1s

  assert.ok(Math.abs((pausedAt - startedAt) - buggyElapsed) < 200,
    'the raw span must reproduce the value the audit measured');

  const res = clampFrozenElapsed(startedAt, pausedAt, createdAt);
  assert.equal(res.clamped, true);
  assert.equal(res.reason, CLAMP_REASON.CEILING);
  assert.equal(res.ms, MAX_CONTINUOUS_RUN_MS);
  assert.ok(Math.abs(res.requestedMs - buggyElapsed) < 200,
    'the rejected value must survive for audit');
});

// ── The ceiling must not eat real work ────────────────────────────

test('does not clamp the longest credible real sessions observed in prod', () => {
  const now = 2_000_000_000_000;
  for (const [label, hours] of [
    ['Daily SUV', 8.23], ['Asana inbox', 8.05],
    ['Tabatha walkthrough with Po', 4.93], ['BvB support', 4.85],
  ]) {
    const span = Math.round(hours * H);
    const res = clampFrozenElapsed(now - span, now, now - span - 1000);
    assert.equal(res.clamped, false, `"${label}" (${hours}h) must NOT be clamped`);
    assert.equal(res.ms, span);
  }
});

test('the ceiling matches the extension byte for byte', () => {
  // Both surfaces accrue elapsed independently with no shared arbiter, so a
  // divergent ceiling would just be a new way to disagree.
  assert.equal(MAX_CONTINUOUS_RUN_MS, 12 * 60 * 60 * 1000);
  assert.ok(MAX_CONTINUOUS_RUN_MS > 8.23 * H, 'must clear the longest real session');
  assert.ok(MAX_CONTINUOUS_RUN_MS < 20.69 * H, 'must catch the 20.69h outlier');
});

// ── clampRunDelta ─────────────────────────────────────────────────

test('clampRunDelta: normal spans pass through', () => {
  assert.deepEqual(clampRunDelta(45 * M),
    { ms: 45 * M, clamped: false, requestedMs: 45 * M, reason: CLAMP_REASON.NONE });
});

test('clampRunDelta: the boundary is inclusive, one ms over clamps', () => {
  assert.equal(clampRunDelta(MAX_CONTINUOUS_RUN_MS).clamped, false);
  assert.equal(clampRunDelta(MAX_CONTINUOUS_RUN_MS + 1).clamped, true);
  assert.equal(clampRunDelta(MAX_CONTINUOUS_RUN_MS + 1).ms, MAX_CONTINUOUS_RUN_MS);
});

test('clampRunDelta: a future-dated _startedAt yields 0, never a negative freeze', () => {
  // startedAtOf() reads tags._startedAt, which another surface can write; a
  // clock-skewed anchor must not produce a negative _elapsedMs.
  assert.equal(clampRunDelta(-3 * H).ms, 0);
  assert.equal(clampRunDelta(-3 * H).clamped, false);
});

test('clampRunDelta: non-numeric input degrades to 0, never NaN', () => {
  // A NaN written into tags._elapsedMs would serialise as null and silently
  // wipe the focus's accumulated time on the next resume.
  for (const bad of [undefined, NaN, 'x', null]) {
    assert.equal(clampRunDelta(bad).ms, 0);
    assert.ok(Number.isFinite(clampRunDelta(bad).ms));
  }
});

// ── structural clamp ──────────────────────────────────────────────

test('structural clamp: elapsed can never exceed the row wall-clock life', () => {
  const now = 2_000_000_000_000;
  // Anchor claims a 5h run but the row was only created 30 min ago.
  const res = clampFrozenElapsed(now - 5 * H, now, now - 30 * M);
  assert.equal(res.clamped, true);
  assert.equal(res.reason, CLAMP_REASON.WALL_CLOCK);
  assert.equal(res.ms, 30 * M);
});

test('structural clamp alone would NOT catch the 37h case — the ceiling is load-bearing', () => {
  const now = 2_000_000_000_000;
  const res = clampFrozenElapsed(now - 37.24 * H, now, now - 76.22 * H, Number.MAX_SAFE_INTEGER);
  assert.equal(res.clamped, false, 'a 76h-old row lets a 37h span through the life check');
});

test('a null created_at leaves the ceiling in force', () => {
  const now = 2_000_000_000_000;
  const res = clampFrozenElapsed(now - 30 * H, now, null);
  assert.equal(res.clamped, true);
  assert.equal(res.ms, MAX_CONTINUOUS_RUN_MS);
});

// ── audit stamp ───────────────────────────────────────────────────

test('clampStamp: shape matches the extension so both surfaces write one format', () => {
  const s = clampStamp(134_048_116, MAX_CONTINUOUS_RUN_MS, CLAMP_REASON.CEILING, 0);
  assert.deepEqual(Object.keys(s).sort(), ['appliedMs', 'at', 'ceilingMs', 'reason', 'requestedMs']);
  assert.equal(s.reason, 'continuous_run_ceiling');
  assert.equal(s.ceilingMs, MAX_CONTINUOUS_RUN_MS);
});
