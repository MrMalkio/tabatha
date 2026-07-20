// Pomodoro timer mode (Job B, Plan 040 roadmap "gusto" pick) — unit tests
// (node:test, no new deps). Same mirror convention as timer-math.test.mjs /
// invite-code.test.mjs: sidecar/src/lib/pomodoro.ts has no RN/supabase
// imports of its own, but this repo's plain `node --test` has no TS loader,
// so the pure function is mirrored here verbatim with its source noted:
//
//   computePomodoroState (+ clampMinutes/clampCycles helpers)
//     <- sidecar/src/lib/pomodoro.ts (verbatim copies)
//
// If the source function changes, update the mirror + re-run this file.

import test from 'node:test';
import assert from 'node:assert/strict';

// ── mirror: sidecar/src/lib/pomodoro.ts ────────────────────────────────
const DEFAULT_POMODORO_CONFIG = {
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesToLongBreak: 4,
};

function clampMinutes(mins, fallback) {
  const n = Number(mins);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clampCycles(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
}

function computePomodoroState(elapsedMs, config) {
  const focusMs = clampMinutes(config?.focusMin, DEFAULT_POMODORO_CONFIG.focusMin) * 60000;
  const shortBreakMs = clampMinutes(config?.breakMin, DEFAULT_POMODORO_CONFIG.breakMin) * 60000;
  const longBreakMs = clampMinutes(config?.longBreakMin, DEFAULT_POMODORO_CONFIG.longBreakMin) * 60000;
  const cyclesToLongBreak = clampCycles(
    config?.cyclesToLongBreak,
    DEFAULT_POMODORO_CONFIG.cyclesToLongBreak
  );

  let remaining = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  let cycle = 0;

  for (let guard = 0; guard < 100000; guard++) {
    if (remaining < focusMs) {
      return { phase: 'focus', phaseElapsedMs: remaining, phaseRemainingMs: focusMs - remaining, cycleIndex: cycle };
    }
    remaining -= focusMs;

    const isLongBreak = (cycle + 1) % cyclesToLongBreak === 0;
    const breakMs = isLongBreak ? longBreakMs : shortBreakMs;
    const breakPhase = isLongBreak ? 'longBreak' : 'break';

    if (remaining < breakMs) {
      return { phase: breakPhase, phaseElapsedMs: remaining, phaseRemainingMs: breakMs - remaining, cycleIndex: cycle };
    }
    remaining -= breakMs;
    cycle += 1;
  }

  return { phase: 'focus', phaseElapsedMs: 0, phaseRemainingMs: focusMs, cycleIndex: cycle };
}
// ── end mirror ──────────────────────────────────────────────────────────

const MIN = 60000;
const CFG = DEFAULT_POMODORO_CONFIG; // 25/5/15/4

test('elapsedMs=0 starts in focus phase, cycle 0, full phase remaining', () => {
  const s = computePomodoroState(0, CFG);
  assert.deepEqual(s, { phase: 'focus', phaseElapsedMs: 0, phaseRemainingMs: 25 * MIN, cycleIndex: 0 });
});

test('mid-focus: elapsed within the focus window stays in focus phase', () => {
  const s = computePomodoroState(10 * MIN, CFG);
  assert.equal(s.phase, 'focus');
  assert.equal(s.phaseElapsedMs, 10 * MIN);
  assert.equal(s.phaseRemainingMs, 15 * MIN);
  assert.equal(s.cycleIndex, 0);
});

test('boundary: elapsed exactly at focusMin flips into break (< comparison, not <=)', () => {
  const s = computePomodoroState(25 * MIN, CFG);
  assert.equal(s.phase, 'break');
  assert.equal(s.phaseElapsedMs, 0);
  assert.equal(s.phaseRemainingMs, 5 * MIN);
  assert.equal(s.cycleIndex, 0);
});

test('one ms before the focus boundary is still focus, with 1ms remaining', () => {
  const s = computePomodoroState(25 * MIN - 1, CFG);
  assert.equal(s.phase, 'focus');
  assert.equal(s.phaseRemainingMs, 1);
});

test('mid-break: elapsed into the short break window', () => {
  const s = computePomodoroState(25 * MIN + 2 * MIN, CFG);
  assert.equal(s.phase, 'break');
  assert.equal(s.phaseElapsedMs, 2 * MIN);
  assert.equal(s.phaseRemainingMs, 3 * MIN);
  assert.equal(s.cycleIndex, 0);
});

test('boundary: break ends exactly at breakMin, rolls into cycle 1 focus', () => {
  const s = computePomodoroState(25 * MIN + 5 * MIN, CFG);
  assert.equal(s.phase, 'focus');
  assert.equal(s.phaseElapsedMs, 0);
  assert.equal(s.cycleIndex, 1);
});

test('second cycle focus + short break behave the same as the first', () => {
  const cycle1Start = (25 + 5) * MIN;
  const sFocus = computePomodoroState(cycle1Start + 12 * MIN, CFG);
  assert.equal(sFocus.phase, 'focus');
  assert.equal(sFocus.phaseElapsedMs, 12 * MIN);
  assert.equal(sFocus.cycleIndex, 1);

  const sBreak = computePomodoroState(cycle1Start + 25 * MIN + 1 * MIN, CFG);
  assert.equal(sBreak.phase, 'break');
  assert.equal(sBreak.cycleIndex, 1);
});

test('long break every Nth cycle (cyclesToLongBreak=4): cycles 0-2 get short breaks', () => {
  const oneCycle = (25 + 5) * MIN;
  for (let cycle = 0; cycle < 3; cycle++) {
    const s = computePomodoroState(cycle * oneCycle + 25 * MIN + 1000, CFG);
    assert.equal(s.phase, 'break', `cycle ${cycle} should be a short break`);
    assert.equal(s.cycleIndex, cycle);
  }
});

test('long break every Nth cycle: the 4th focus phase (cycle 3) is followed by a LONG break', () => {
  const oneCycle = (25 + 5) * MIN; // only true for cycles 0-2, which all use the short break
  const cycle3FocusStart = 3 * oneCycle; // after 3 full short-break cycles
  const s = computePomodoroState(cycle3FocusStart + 25 * MIN + 1000, CFG);
  assert.equal(s.phase, 'longBreak');
  assert.equal(s.cycleIndex, 3);
  assert.equal(s.phaseRemainingMs, 15 * MIN - 1000);
});

test('long break duration is honored (15 min), then cycle 4 starts fresh at cycleIndex 4', () => {
  const cycle3FocusStart = 3 * (25 + 5) * MIN;
  const longBreakStart = cycle3FocusStart + 25 * MIN;
  // still in the long break just before it ends
  const sStillLong = computePomodoroState(longBreakStart + 15 * MIN - 1, CFG);
  assert.equal(sStillLong.phase, 'longBreak');
  // exactly at the long break boundary -> next focus cycle
  const sNext = computePomodoroState(longBreakStart + 15 * MIN, CFG);
  assert.equal(sNext.phase, 'focus');
  assert.equal(sNext.phaseElapsedMs, 0);
  assert.equal(sNext.cycleIndex, 4);
});

test('config edge case: zero focusMin falls back to the default (25 min), no divide-by-zero/infinite loop', () => {
  const s = computePomodoroState(10 * MIN, { focusMin: 0, breakMin: 5, longBreakMin: 15, cyclesToLongBreak: 4 });
  assert.equal(s.phase, 'focus');
  assert.equal(s.phaseRemainingMs, 15 * MIN);
});

test('config edge case: negative breakMin falls back to the default (5 min)', () => {
  const s = computePomodoroState(25 * MIN + 1 * MIN, { focusMin: 25, breakMin: -5, longBreakMin: 15, cyclesToLongBreak: 4 });
  assert.equal(s.phase, 'break');
  assert.equal(s.phaseRemainingMs, 4 * MIN);
});

test('config edge case: non-finite / NaN / missing fields all fall back to defaults', () => {
  const s1 = computePomodoroState(0, { focusMin: NaN, breakMin: undefined, longBreakMin: Infinity, cyclesToLongBreak: null });
  assert.equal(s1.phase, 'focus');
  assert.equal(s1.phaseRemainingMs, 25 * MIN);

  const s2 = computePomodoroState(0, {});
  assert.deepEqual(s2, { phase: 'focus', phaseElapsedMs: 0, phaseRemainingMs: 25 * MIN, cycleIndex: 0 });
});

test('config edge case: cyclesToLongBreak=1 makes EVERY break a long break', () => {
  const cfg = { focusMin: 10, breakMin: 2, longBreakMin: 20, cyclesToLongBreak: 1 };
  const s0 = computePomodoroState(10 * MIN + 1000, cfg);
  assert.equal(s0.phase, 'longBreak');
  assert.equal(s0.cycleIndex, 0);

  const oneCycle = (10 + 20) * MIN;
  const s1 = computePomodoroState(oneCycle + 10 * MIN + 1000, cfg);
  assert.equal(s1.phase, 'longBreak');
  assert.equal(s1.cycleIndex, 1);
});

test('config edge case: fractional minutes are honored (not floored to 0)', () => {
  const cfg = { focusMin: 0.5, breakMin: 0.5, longBreakMin: 1, cyclesToLongBreak: 4 };
  const s = computePomodoroState(20000, cfg); // 20s into a 30s focus phase
  assert.equal(s.phase, 'focus');
  assert.equal(s.phaseRemainingMs, 10000);
});

test('negative or non-finite elapsedMs clamps to 0 (mirrors elapsedMsOf clamping)', () => {
  assert.deepEqual(computePomodoroState(-500, CFG), { phase: 'focus', phaseElapsedMs: 0, phaseRemainingMs: 25 * MIN, cycleIndex: 0 });
  assert.deepEqual(computePomodoroState(NaN, CFG), { phase: 'focus', phaseElapsedMs: 0, phaseRemainingMs: 25 * MIN, cycleIndex: 0 });
});
