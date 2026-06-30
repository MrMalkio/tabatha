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

test('proposed start that overlaps another active interval clamps to that interval end', () => {
  const now = t(0);
  // Another focus was active from -60m to -20m. We try to backdate into it.
  const r = validateStartTime({
    proposedStartMs: now - 40 * MIN,
    currentStartMs: now - 10 * MIN,
    now,
    clockInMs: now - 120 * MIN,
    otherIntervals: [{ startMs: now - 60 * MIN, endMs: now - 20 * MIN }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.clamped, true);
  // clamps forward to the end of the overlapping interval
  assert.equal(r.startMs, now - 20 * MIN);
});

test('proposed start fully clear of other intervals is unchanged', () => {
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

test('clamp to interval end never pushes past now', () => {
  const now = t(0);
  // Overlapping interval ends in the "future" relative to now (degenerate);
  // result must still be <= now.
  const r = validateStartTime({
    proposedStartMs: now - 5 * MIN,
    currentStartMs: now - 2 * MIN,
    now,
    clockInMs: now - 120 * MIN,
    otherIntervals: [{ startMs: now - 10 * MIN, endMs: now + 30 * MIN }],
  });
  assert.equal(r.ok, true);
  assert.ok(r.startMs <= now);
});
