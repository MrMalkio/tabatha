// NB-09 — offline-gap detector helper tests (src/utils/gapDetection.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectGap } from '../src/utils/gapDetection.js';

const MIN = 60000;
const NOW = 1_800_000_000_000; // fixed epoch for determinism
const THRESHOLD = 10 * MIN;

test('detectGap: no heartbeat yet (first run) → no gap, no prompt', () => {
  const v = detectGap(null, NOW, THRESHOLD, 'active');
  assert.deepEqual(v, { gapMs: 0, shouldPrompt: false, pauseAt: null });
});

test('detectGap: small gap under threshold → no prompt', () => {
  const v = detectGap(NOW - 3 * MIN, NOW, THRESHOLD, 'active');
  assert.equal(v.gapMs, 3 * MIN);
  assert.equal(v.shouldPrompt, false);
});

test('detectGap: gap exactly AT threshold is not a prompt (strictly greater)', () => {
  const v = detectGap(NOW - THRESHOLD, NOW, THRESHOLD, 'active');
  assert.equal(v.shouldPrompt, false);
});

test('detectGap: large gap with an ACTIVE focus → prompt, pauseAt = gap start', () => {
  const lastAlive = NOW - 45 * MIN;
  const v = detectGap(lastAlive, NOW, THRESHOLD, 'active');
  assert.equal(v.gapMs, 45 * MIN);
  assert.equal(v.shouldPrompt, true);
  assert.equal(v.pauseAt, lastAlive);
});

test('detectGap: large gap but focus was paused → no prompt', () => {
  const v = detectGap(NOW - 45 * MIN, NOW, THRESHOLD, 'paused');
  assert.equal(v.gapMs, 45 * MIN);
  assert.equal(v.shouldPrompt, false);
});

test('detectGap: large gap with NO focus at all → no prompt', () => {
  const v = detectGap(NOW - 45 * MIN, NOW, THRESHOLD, null);
  assert.equal(v.shouldPrompt, false);
});

test('detectGap: accepts an ISO-string heartbeat', () => {
  const lastAliveIso = new Date(NOW - 30 * MIN).toISOString();
  const v = detectGap(lastAliveIso, NOW, THRESHOLD, 'active');
  assert.equal(v.gapMs, 30 * MIN);
  assert.equal(v.shouldPrompt, true);
  assert.equal(v.pauseAt, NOW - 30 * MIN);
});

test('detectGap: clock skew (heartbeat in the future) clamps gap to 0', () => {
  const v = detectGap(NOW + 5 * MIN, NOW, THRESHOLD, 'active');
  assert.equal(v.gapMs, 0);
  assert.equal(v.shouldPrompt, false);
});

test('detectGap: unparseable heartbeat behaves like no heartbeat', () => {
  const v = detectGap('not-a-date', NOW, THRESHOLD, 'active');
  assert.deepEqual(v, { gapMs: 0, shouldPrompt: false, pauseAt: null });
});
