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

  const res = clampFrozenElapsed(startedAt, pausedAt, createdAt, 0);
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
    const res = clampFrozenElapsed(now - span, now, now - span - 1000, 0);
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
  const res = clampFrozenElapsed(now - 5 * H, now, now - 30 * M, 0);
  assert.equal(res.clamped, true);
  assert.equal(res.reason, CLAMP_REASON.WALL_CLOCK);
  assert.equal(res.ms, 30 * M);
});

test('structural clamp alone would NOT catch the 37h case — the ceiling is load-bearing', () => {
  const now = 2_000_000_000_000;
  const res = clampFrozenElapsed(now - 37.24 * H, now, now - 76.22 * H, 0, Number.MAX_SAFE_INTEGER);
  assert.equal(res.clamped, false, 'a 76h-old row lets a 37h span through the life check');
});

test('a null created_at leaves the ceiling in force', () => {
  const now = 2_000_000_000_000;
  const res = clampFrozenElapsed(now - 30 * H, now, null, 0);
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

// ══════════════════════════════════════════════════════════════════
// K2 — found reviewing this file's OWN first cut (0.13.12)
//
// The first version applied the 12h continuous-run ceiling straight to
// `now - startedAtOf(f)`. But `_startedAt` is BACK-DATED by accumulated
// elapsed (`switchTo`/`resume` write `Date.now() - el`), so that quantity is
// the LIFETIME TOTAL, not a run — capping it truncated every focus with more
// than 12h accumulated across sessions. Same defect Koda reproduced on the
// extension, on the surface where the original 37h incident actually fired.
// ══════════════════════════════════════════════════════════════════

test('K2: a focus with 14h banked and 5 min running keeps 14h05m', () => {
  const now = 2_000_000_000_000;
  const banked = Math.round(14 * H);
  const run = 5 * M;
  // resume() back-dated the anchor by the banked total.
  const startedAt = now - banked - run;

  const res = clampFrozenElapsed(startedAt, now, now - 7 * 24 * H, banked);
  assert.equal(res.clamped, false, '14h accumulated across a week is real work');
  assert.equal(res.ms, banked + run);
  assert.ok(res.ms > MAX_CONTINUOUS_RUN_MS,
    'and it must exceed the ceiling — capping it here was the data loss');
});

test('K2: the ceiling still catches a stuck anchor with nothing banked', () => {
  const now = 2_000_000_000_000;
  const res = clampFrozenElapsed(now - Math.round(37.24 * H), now, now - Math.round(76.22 * H), 0);
  assert.equal(res.clamped, true);
  assert.equal(res.ms, MAX_CONTINUOUS_RUN_MS);
});

test('K2: the ceiling still catches a stuck anchor even WITH banked time', () => {
  // 2h legitimately banked, then the anchor got stuck 30h ago. The run is
  // clamped to 12h; the banked 2h is added back untouched.
  const now = 2_000_000_000_000;
  const banked = 2 * H;
  const res = clampFrozenElapsed(now - 32 * H, now, now - 90 * H, banked);
  assert.equal(res.clamped, true);
  assert.equal(res.ms, banked + MAX_CONTINUOUS_RUN_MS, 'banked time is never confiscated');
});

test('K2: an anchor implying LESS than what is banked yields a zero run, never a giveback', () => {
  const now = 2_000_000_000_000;
  const banked = 6 * H;
  const res = clampFrozenElapsed(now - 1 * H, now, now - 40 * H, banked);
  assert.equal(res.ms, banked, 'a stale anchor must not reduce banked time');
  assert.equal(res.clamped, false);
});

test('K1: a zero-length life disables the structural clamp rather than zeroing elapsed', () => {
  const now = 2_000_000_000_000;
  const res = clampFrozenElapsed(now - 40 * M, now, now, 0);
  assert.equal(res.ms, 40 * M, 'missing data is not evidence that no time was spent');
});

// ── N3c: updateFocus must keep _startedAt and _elapsedMs consistent ──
//
// `updateFocus` is the one Sidecar writer that can move `_startedAt` without
// its banked partner, which is exactly the invariant clampFrozenElapsed rests
// on. Mirrors the logic in focus.ts so the contract is asserted somewhere.

test('N3c: a user-supplied _startedAt implies a matching _elapsedMs', () => {
  const now = 2_000_000_000_000;
  const userStart = now - 3 * H;

  // What focus.ts updateFocus now writes:
  const nextElapsed = Math.max(0, now - userStart);
  assert.equal(nextElapsed, 3 * H);

  // The pair must satisfy the invariant: run = total - banked = 0 right after
  // the edit, so the ceiling cannot fire on a fresh user edit.
  const res = clampFrozenElapsed(userStart, now, now - 40 * H, nextElapsed);
  assert.equal(res.clamped, false, 'a 3h user-asserted start must not be clamped');
  assert.equal(res.ms, 3 * H);
});

test('N3c: a stale _elapsedMs beside a moved _startedAt would have mis-derived the run', () => {
  // Documents WHY the pairing matters: same anchor, stale banked value.
  const now = 2_000_000_000_000;
  const userStart = now - 3 * H;
  const staleBanked = 30 * H;   // left over from before the edit
  const res = clampFrozenElapsed(userStart, now, now - 40 * H, staleBanked);
  assert.ok(res.ms >= staleBanked,
    'an un-updated banked value inflates the total — hence N3c pairs them');
});
