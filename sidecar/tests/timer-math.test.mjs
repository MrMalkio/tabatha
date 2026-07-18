// Sidecar v0.3.0 QA blitz — timer-math unit tests (node:test, no new deps).
//
// The pure formulas exercised here live inline in TSX/TS modules that import
// react-native / expo / supabase / AsyncStorage at module scope (`focus.ts`,
// `screens/ContextView.tsx`), so `import`-ing them directly under plain
// `node --test` isn't viable without a TS/RN-web loader this project doesn't
// carry (no tsx/ts-node in node_modules). Per the QA task's guidance, the
// formulas are mirrored here verbatim instead, with the source line each one
// is copied from noted so drift is easy to catch on re-review:
//
//   startedAtOf / elapsedMsOf  <- sidecar/src/data/focus.ts (lines ~37-48)
//   dayLeft                   <- sidecar/src/screens/ContextView.tsx (lines ~38-44)
//     (parameterized on `now` here for determinism; the real component always
//     calls `new Date()` with no override)
//   computeIntervals / totalTrackedMs / cumulativeTrackedAt
//                              <- sidecar/src/data/events.ts (verbatim copy —
//                                 these three are already pure exports with
//                                 no RN/supabase dependency of their own; the
//                                 module just can't be imported standalone
//                                 because the file's TOP-LEVEL import of
//                                 `../lib/supabase` pulls in AsyncStorage /
//                                 react-native at module-load time)
//
// If any source function changes, update the mirror + re-run this file.
// NOTE: `computeIntervals`/`events.ts` landed in a v0.4.0 merge (focus_events
// / CV timeline, Lane A chunk 2) that arrived in this shared worktree mid-QA
// -- see the QA report's "scope note" for what that does and doesn't affect.

import test from 'node:test';
import assert from 'node:assert/strict';

// ── mirror: sidecar/src/data/focus.ts ──────────────────────────────────
function startedAtOf(f) {
  const iso = f.tags?._startedAt || f.created_at;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function elapsedMsOf(f, now) {
  if (f.focus_state === 'active') return Math.max(0, now - startedAtOf(f));
  const frozen = f.tags?._elapsedMs;
  return Number.isFinite(frozen) ? Math.max(0, frozen) : Math.max(0, now - startedAtOf(f));
}

// ── mirror: sidecar/src/screens/ContextView.tsx dayLeft(), parameterized
// on `now` (source always uses `new Date()` with no injection point) ──
function dayLeft(resetHour, now = new Date()) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let left = resetHour * 60 - nowMin;
  if (left <= 0) left += 1440;
  return { text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, mins: left };
}

// ── mirror: the app's switchTo/pause/resume _startedAt-shift algebra
// (sidecar/src/data/focus.ts actions.switchTo/pause/resume) ──
function pauseAt(f, now) {
  const elapsed = Math.max(0, now - startedAtOf(f));
  return { ...f, focus_state: 'paused', tags: { ...f.tags, _elapsedMs: elapsed } };
}
function resumeAt(f, now) {
  const el = Number(f.tags?._elapsedMs) || 0;
  return { ...f, focus_state: 'active', tags: { ...f.tags, _startedAt: new Date(now - el).toISOString() } };
}

const HOUR = 3600000;
const MIN = 60000;

test('elapsedMsOf: active focus derives elapsed from (now - startedAt)', () => {
  const startedAt = new Date(Date.now() - 5 * MIN).toISOString();
  const f = { focus_state: 'active', tags: { _startedAt: startedAt }, created_at: startedAt };
  const now = Date.now();
  const elapsed = elapsedMsOf(f, now);
  assert.ok(Math.abs(elapsed - 5 * MIN) < 1000, `expected ~5min, got ${elapsed}ms`);
});

test('elapsedMsOf: paused focus with finite _elapsedMs stays frozen regardless of `now`', () => {
  const f = { focus_state: 'paused', tags: { _elapsedMs: 42000, _startedAt: new Date().toISOString() }, created_at: new Date().toISOString() };
  const now1 = Date.now();
  const now2 = now1 + 10 * MIN; // "10 minutes later" — must NOT advance
  assert.equal(elapsedMsOf(f, now1), 42000);
  assert.equal(elapsedMsOf(f, now2), 42000);
});

test('elapsedMsOf: paused focus with MISSING/non-finite _elapsedMs falls back to (now - startedAt)', () => {
  const startedAt = new Date(Date.now() - 2 * MIN).toISOString();
  const f = { focus_state: 'paused', tags: { _startedAt: startedAt }, created_at: startedAt }; // no _elapsedMs
  const elapsed = elapsedMsOf(f, Date.now());
  assert.ok(Math.abs(elapsed - 2 * MIN) < 1000, `expected fallback ~2min, got ${elapsed}ms`);

  const fNaN = { focus_state: 'paused', tags: { _elapsedMs: 'not-a-number', _startedAt: startedAt }, created_at: startedAt };
  const elapsedNaN = elapsedMsOf(fNaN, Date.now());
  assert.ok(Math.abs(elapsedNaN - 2 * MIN) < 1000, `expected fallback for non-finite _elapsedMs, got ${elapsedNaN}ms`);
});

test('elapsedMsOf: active focus with a future startedAt (clock skew) clamps to 0, never negative', () => {
  const futureStart = new Date(Date.now() + 5 * MIN).toISOString();
  const f = { focus_state: 'active', tags: { _startedAt: futureStart }, created_at: futureStart };
  assert.equal(elapsedMsOf(f, Date.now()), 0);
});

test('elapsedMsOf: paused focus with a negative frozen _elapsedMs still clamps to 0', () => {
  const f = { focus_state: 'paused', tags: { _elapsedMs: -500 }, created_at: new Date().toISOString() };
  assert.equal(elapsedMsOf(f, Date.now()), 0);
});

test('pause -> resume continuity: elapsed continues rather than restarting at 0 (single cycle)', () => {
  const now0 = Date.now() - 60 * MIN; // focus started 60 minutes ago (in "real" wall time terms)
  let f = { focus_state: 'active', tags: { _startedAt: new Date(now0).toISOString() }, created_at: new Date(now0).toISOString() };

  const pauseTime = now0 + 20 * MIN; // active for 20 min, then paused
  f = pauseAt(f, pauseTime);
  assert.equal(f.tags._elapsedMs, 20 * MIN);
  // while paused, "time passes" (30 min) — elapsed must NOT move.
  assert.equal(elapsedMsOf(f, pauseTime + 30 * MIN), 20 * MIN);

  const resumeTime = pauseTime + 30 * MIN; // resumed 30 min after pausing
  f = resumeAt(f, resumeTime);
  // Immediately after resume, elapsed should read ~20min (the frozen value), not 0.
  const elapsedRightAfterResume = elapsedMsOf(f, resumeTime);
  assert.ok(Math.abs(elapsedRightAfterResume - 20 * MIN) < 1000, `expected ~20min right after resume, got ${elapsedRightAfterResume}ms`);

  // 10 more minutes of active running -> elapsed should be 30min total (20 pre-pause + 10 post-resume).
  const laterTime = resumeTime + 10 * MIN;
  const elapsedLater = elapsedMsOf(f, laterTime);
  assert.ok(Math.abs(elapsedLater - 30 * MIN) < 1000, `expected ~30min after 10 more active minutes, got ${elapsedLater}ms`);
});

test('multiple pause/resume cycles accumulate correctly (dangling-interval-safe)', () => {
  const start = Date.now() - 2 * HOUR;
  let f = { focus_state: 'active', tags: { _startedAt: new Date(start).toISOString() }, created_at: new Date(start).toISOString() };
  let t = start;

  // Cycle 1: run 10 min, pause, sit idle 15 min.
  t += 10 * MIN;
  f = pauseAt(f, t);
  assert.equal(f.tags._elapsedMs, 10 * MIN);
  t += 15 * MIN;

  // Cycle 2: resume, run 5 min, pause again.
  f = resumeAt(f, t);
  t += 5 * MIN;
  f = pauseAt(f, t);
  assert.equal(f.tags._elapsedMs, 15 * MIN, `expected 10+5=15min accumulated, got ${f.tags._elapsedMs / MIN}min`);

  // Cycle 3: resume, run 20 more min (still active, no third pause) -> total should be 35min.
  t += 8 * MIN; // idle gap before resuming again
  f = resumeAt(f, t);
  t += 20 * MIN;
  const finalElapsed = elapsedMsOf(f, t);
  assert.ok(Math.abs(finalElapsed - 35 * MIN) < 1000, `expected 10+5+20=35min, got ${finalElapsed / MIN}min`);
});

test('dangling open interval: an "active" focus with no _elapsedMs ever set still measures correctly from its original _startedAt', () => {
  const startedAt = new Date(Date.now() - 90 * MIN).toISOString();
  const f = { focus_state: 'active', tags: { _startedAt: startedAt }, created_at: startedAt };
  const elapsed = elapsedMsOf(f, Date.now());
  assert.ok(Math.abs(elapsed - 90 * MIN) < 1000, `expected ~90min, got ${elapsed / MIN}min`);
});

// ── dayLeft() — day-countdown boundary tests ──────────────────────────

test('dayLeft: resetHour=0 (midnight), well before midnight -> counts down to next midnight', () => {
  const now = new Date(2026, 0, 15, 20, 30); // 8:30pm
  const { mins, text } = dayLeft(0, now);
  // 24:00 - 20:30 = 3:30 = 210 min
  assert.equal(mins, 210);
  assert.equal(text, '3:30');
});

test('dayLeft: resetHour=0, exactly at midnight -> wraps to a full 1440 (not 0)', () => {
  const now = new Date(2026, 0, 15, 0, 0);
  const { mins } = dayLeft(0, now);
  assert.equal(mins, 1440, 'left<=0 must wrap to +1440, never show 0 or negative');
});

test('dayLeft: resetHour=0, one minute after midnight -> 1439 (not a huge wrapped number)', () => {
  const now = new Date(2026, 0, 15, 0, 1);
  const { mins } = dayLeft(0, now);
  assert.equal(mins, 1439);
});

test('dayLeft: resetHour mid-day (e.g. 6am), before the reset hour today -> counts down to today', () => {
  const now = new Date(2026, 0, 15, 2, 0); // 2am, resets at 6am
  const { mins } = dayLeft(6, now);
  assert.equal(mins, 240); // 4 hours
});

test('dayLeft: resetHour mid-day (6am), AFTER it already passed today -> wraps to tomorrow (not negative)', () => {
  const now = new Date(2026, 0, 15, 14, 0); // 2pm, reset was at 6am (8 hours ago)
  const { mins } = dayLeft(6, now);
  // left = 6*60 - 14*60 = -480 <= 0 -> +1440 = 960 (16 hours until 6am tomorrow)
  assert.equal(mins, 960);
});

test('dayLeft: resetHour exactly equal to current hour:minute -> wraps to a full day, not 0', () => {
  const now = new Date(2026, 0, 15, 9, 0);
  const { mins } = dayLeft(9, now);
  assert.equal(mins, 1440);
});

test('dayLeft: resetHour=23 (near end of day), just after reset -> nearly a full day left', () => {
  const now = new Date(2026, 0, 15, 23, 1); // 1 min after 11pm reset
  const { mins } = dayLeft(23, now);
  assert.equal(mins, 1439);
});

test('dayLeft: text formatting pads minutes to 2 digits', () => {
  const now = new Date(2026, 0, 15, 23, 55); // resetHour=0 -> 5 min left
  const { text, mins } = dayLeft(0, now);
  assert.equal(mins, 5);
  assert.equal(text, '0:05');
});

// ── computeIntervals / totalTrackedMs / cumulativeTrackedAt ───────────
// mirror: sidecar/src/data/events.ts (verbatim)

function computeIntervals(events, isActive, now) {
  const intervals = [];
  let openAt = null;
  for (const e of events) {
    const t = new Date(e.at).getTime();
    if (!Number.isFinite(t)) continue;
    if (e.kind === 'start' || e.kind === 'resume') {
      if (openAt == null) openAt = t;
    } else if (e.kind === 'pause' || e.kind === 'resolve') {
      if (openAt != null) {
        intervals.push({ start: openAt, end: Math.max(openAt, t) });
        openAt = null;
      }
    }
  }
  if (openAt != null && isActive) {
    intervals.push({ start: openAt, end: Math.max(openAt, now) });
  }
  return intervals;
}

function totalTrackedMs(intervals) {
  return intervals.reduce((sum, iv) => sum + Math.max(0, iv.end - iv.start), 0);
}

function cumulativeTrackedAt(intervals, t) {
  let sum = 0;
  for (const iv of intervals) {
    if (iv.start >= t) continue;
    sum += Math.max(0, Math.min(iv.end, t) - iv.start);
  }
  return sum;
}

function ev(kind, atMs) {
  return { kind, at: new Date(atMs).toISOString() };
}

test('computeIntervals: single start->pause pair produces one closed interval', () => {
  const t0 = Date.now() - HOUR;
  const events = [ev('start', t0), ev('pause', t0 + 10 * MIN)];
  const ivs = computeIntervals(events, false, Date.now());
  assert.equal(ivs.length, 1);
  assert.equal(ivs[0].start, t0);
  assert.equal(ivs[0].end, t0 + 10 * MIN);
});

test('computeIntervals: resume->resolve also pairs as a closing event', () => {
  const t0 = Date.now() - HOUR;
  const events = [ev('resume', t0), ev('resolve', t0 + 5 * MIN)];
  const ivs = computeIntervals(events, false, Date.now());
  assert.equal(ivs.length, 1);
  assert.equal(ivs[0].end - ivs[0].start, 5 * MIN);
});

test('computeIntervals: multiple start/pause/resume/resolve cycles pair correctly in order', () => {
  const t0 = Date.now() - 2 * HOUR;
  const events = [
    ev('start', t0),
    ev('pause', t0 + 10 * MIN),
    ev('resume', t0 + 20 * MIN),
    ev('pause', t0 + 25 * MIN),
    ev('resume', t0 + 40 * MIN),
    ev('resolve', t0 + 50 * MIN),
  ];
  const ivs = computeIntervals(events, false, Date.now());
  assert.equal(ivs.length, 3);
  assert.equal(totalTrackedMs(ivs), 10 * MIN + 5 * MIN + 10 * MIN);
});

test('computeIntervals: dangling open interval (start with no closing event) is DISCARDED when not active', () => {
  const t0 = Date.now() - HOUR;
  // A stale/lost close: 'start' fired but nothing ever paused/resolved it,
  // and the focus is not currently active (e.g. app crashed mid-session).
  const events = [ev('start', t0)];
  const ivs = computeIntervals(events, /* isActive */ false, Date.now());
  assert.equal(ivs.length, 0, 'a dangling open interval on a non-active focus must not count');
});

test('computeIntervals: dangling open interval counts "to now" ONLY when the focus IS currently active', () => {
  const t0 = Date.now() - HOUR;
  const events = [ev('start', t0)];
  const now = Date.now();
  const ivs = computeIntervals(events, /* isActive */ true, now);
  assert.equal(ivs.length, 1);
  assert.equal(ivs[0].start, t0);
  assert.equal(ivs[0].end, now);
});

test('computeIntervals: a closing event with no preceding open event is ignored (no negative/garbage interval)', () => {
  const t0 = Date.now() - HOUR;
  const events = [ev('pause', t0), ev('start', t0 + 5 * MIN), ev('pause', t0 + 15 * MIN)];
  const ivs = computeIntervals(events, false, Date.now());
  assert.equal(ivs.length, 1, 'the orphan leading pause must not produce a spurious interval');
  assert.equal(ivs[0].start, t0 + 5 * MIN);
  assert.equal(ivs[0].end, t0 + 15 * MIN);
});

test('computeIntervals: out-of-order timestamp within a pair still clamps end >= start (no negative interval)', () => {
  const t0 = Date.now();
  // Pathological: a 'pause' event timestamped BEFORE its 'start' (clock skew
  // across a resync). end must clamp to >= start via Math.max, never negative.
  const events = [ev('start', t0), ev('pause', t0 - 5000)];
  const ivs = computeIntervals(events, false, Date.now());
  assert.equal(ivs.length, 1);
  assert.equal(ivs[0].end, ivs[0].start, 'end should clamp to start, not go negative');
});

test('totalTrackedMs: sums all closed intervals', () => {
  const ivs = [
    { start: 0, end: 10 * MIN },
    { start: 20 * MIN, end: 25 * MIN },
  ];
  assert.equal(totalTrackedMs(ivs), 15 * MIN);
});

test('cumulativeTrackedAt: truncates a partial (still-open-at-cutoff) interval at the cutoff time', () => {
  const ivs = [{ start: 0, end: 100 * MIN }];
  assert.equal(cumulativeTrackedAt(ivs, 30 * MIN), 30 * MIN);
});

test('cumulativeTrackedAt: fully excludes intervals that start at/after the cutoff', () => {
  const ivs = [
    { start: 0, end: 10 * MIN },
    { start: 50 * MIN, end: 60 * MIN }, // entirely after the cutoff
  ];
  assert.equal(cumulativeTrackedAt(ivs, 30 * MIN), 10 * MIN);
});

test('cumulativeTrackedAt: fully includes intervals that end before the cutoff', () => {
  const ivs = [
    { start: 0, end: 10 * MIN },
    { start: 15 * MIN, end: 20 * MIN },
  ];
  assert.equal(cumulativeTrackedAt(ivs, 30 * MIN), 15 * MIN);
});

test('computeIntervals: context kinds (extend/snooze, migration 039) never open or close intervals', () => {
  const evs = [
    ev('start', 0),
    { ...ev('pause', 5 * MIN), kind: 'extend' }, // extend mid-run: must NOT close
    ev('pause', 10 * MIN),
    { ...ev('start', 12 * MIN), kind: 'snooze' }, // snooze while paused: must NOT open
    ev('resume', 20 * MIN),
    ev('resolve', 30 * MIN),
  ];
  const ivs = computeIntervals(evs, false, 40 * MIN);
  assert.deepEqual(ivs, [
    { start: 0, end: 10 * MIN },
    { start: 20 * MIN, end: 30 * MIN },
  ]);
});
