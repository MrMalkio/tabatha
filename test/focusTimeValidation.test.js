// Workstream B1 — focus start-time validation (backdating guard).
// Pure unit tests for clamp-to-clock-in, clamp-to-now, and overlap handling
// against other focuses' active intervals (anti-double-count, DEPLOYMENT §8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStartTime } from '../src/utils/focusTimeValidation.js';

const MIN = 60000;
const t = (offsetMin) => Date.now() + offsetMin * MIN;

test('proposed start in the past within bounds is accepted unchanged', () => {
  const now = t(0);
  const r = validateStartTime({
    proposedStartMs: now - 30 * MIN,
    currentStartMs: now - 10 * MIN,
    now,
    clockInMs: now - 120 * MIN,
    otherIntervals: [],
  });
  assert.equal(r.ok, true);
  assert.equal(r.startMs, now - 30 * MIN);
  assert.equal(r.clamped, false);
});

test('proposed start before clock-in clamps up to clock-in', () => {
  const now = t(0);
  const clockInMs = now - 60 * MIN;
  const r = validateStartTime({
    proposedStartMs: now - 90 * MIN,
    currentStartMs: now - 10 * MIN,
    now,
    clockInMs,
    otherIntervals: [],
  });
  assert.equal(r.ok, true);
  assert.equal(r.startMs, clockInMs);
  assert.equal(r.clamped, true);
});

test('proposed start in the future clamps down to now', () => {
  const now = t(0);
  const r = validateStartTime({
    proposedStartMs: now + 30 * MIN,
    currentStartMs: now - 10 * MIN,
    now,
    clockInMs: now - 120 * MIN,
    otherIntervals: [],
  });
  assert.equal(r.ok, true);
  assert.equal(r.startMs, now);
  assert.equal(r.clamped, true);
});

test('no clock-in session: lower bound is unbounded (only clamps to now)', () => {
  const now = t(0);
  const r = validateStartTime({
    proposedStartMs: now - 300 * MIN,
    currentStartMs: now - 10 * MIN,
    now,
    clockInMs: null,
    otherIntervals: [],
  });
  assert.equal(r.ok, true);
  assert.equal(r.startMs, now - 300 * MIN);
});

test('overlapping another active interval keeps the chosen start and REPORTS the overlap', () => {
  const now = t(0);
  // Another focus was active from -60m to -20m. We backdate into it. The start
  // the user picked (-40m) stands; the overlap is reported, not applied.
  const r = validateStartTime({
    proposedStartMs: now - 40 * MIN,
    currentStartMs: now - 10 * MIN,
    now,
    clockInMs: now - 120 * MIN,
    otherIntervals: [{ startMs: now - 60 * MIN, endMs: now - 20 * MIN }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.clamped, false); // clock-in/now bounds did not move it
  assert.equal(r.startMs, now - 40 * MIN); // chosen start is preserved
  assert.equal(r.overlaps.length, 1);
  // credited span [-40m, now] overlaps [-60m, -20m] by 20m (from -40m to -20m).
  assert.equal(r.overlaps[0].overlapMs, 20 * MIN);
});

test('credited span [proposedStart, now] overlapping another interval is preserved and reported', () => {
  const now = t(0);
  // Proposed start (-90m) is EARLIER than another focus's active interval, so the
  // credited span [-90m, now] swallows the overlapped 40m. The start is NOT moved
  // anymore — the full 40m overlap is reported for the caller to resolve.
  const r = validateStartTime({
    proposedStartMs: now - 90 * MIN,
    currentStartMs: now - 10 * MIN,
    now,
    clockInMs: now - 120 * MIN,
    otherIntervals: [{ startMs: now - 60 * MIN, endMs: now - 20 * MIN }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.clamped, false);
  assert.equal(r.startMs, now - 90 * MIN); // backdate takes full effect
  assert.equal(r.overlaps.length, 1);
  assert.equal(r.overlaps[0].overlapMs, 40 * MIN);
});

test('span overlapping MULTIPLE intervals preserves the start and reports each overlap', () => {
  const now = t(0);
  const r = validateStartTime({
    proposedStartMs: now - 200 * MIN,
    currentStartMs: now - 5 * MIN,
    now,
    clockInMs: now - 300 * MIN,
    otherIntervals: [
      { startMs: now - 60 * MIN, endMs: now - 20 * MIN },
      { startMs: now - 150 * MIN, endMs: now - 100 * MIN },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.clamped, false);
  assert.equal(r.startMs, now - 200 * MIN); // full backdate stands
  assert.equal(r.overlaps.length, 2);
  const totalOverlap = r.overlaps.reduce((s, o) => s + o.overlapMs, 0);
  assert.equal(totalOverlap, (40 + 50) * MIN); // 40m + 50m overlapped
});

test('proposed start fully clear of other intervals reports no overlap', () => {
  const now = t(0);
  const r = validateStartTime({
    proposedStartMs: now - 15 * MIN,
    currentStartMs: now - 10 * MIN,
    now,
    clockInMs: now - 120 * MIN,
    otherIntervals: [{ startMs: now - 60 * MIN, endMs: now - 20 * MIN }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.startMs, now - 15 * MIN);
  assert.equal(r.clamped, false);
  assert.equal(r.overlaps.length, 0);
});

test('invalid (non-finite) proposed start is rejected', () => {
  const now = t(0);
  const r = validateStartTime({
    proposedStartMs: NaN,
    currentStartMs: now - 10 * MIN,
    now,
    clockInMs: now - 120 * MIN,
    otherIntervals: [],
  });
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('reported overlap never extends past now', () => {
  const now = t(0);
  // Overlapping interval ends in the "future" relative to now (degenerate).
  // The start stands and the reported overlap is capped at now.
  const r = validateStartTime({
    proposedStartMs: now - 5 * MIN,
    currentStartMs: now - 2 * MIN,
    now,
    clockInMs: now - 120 * MIN,
    otherIntervals: [{ startMs: now - 10 * MIN, endMs: now + 30 * MIN }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.startMs, now - 5 * MIN);
  assert.ok(r.startMs <= now);
  // credited span [-5m, now] overlaps the interval by 5m (from -5m to now).
  assert.equal(r.overlaps[0].overlapMs, 5 * MIN);
});
