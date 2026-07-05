// NB-09 — typed-duration parser tests (src/utils/duration.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, formatDurationMs } from '../src/utils/duration.js';

const MIN = 60000;

test('parseDuration: plain minutes ("90" → 90m)', () => {
  assert.equal(parseDuration('90'), 90 * MIN);
});

test('parseDuration: "500m" → 500 minutes', () => {
  assert.equal(parseDuration('500m'), 500 * MIN);
});

test('parseDuration: "8h20m" → 500 minutes', () => {
  assert.equal(parseDuration('8h20m'), 500 * MIN);
});

test('parseDuration: "2h" → 120 minutes', () => {
  assert.equal(parseDuration('2h'), 120 * MIN);
});

test('parseDuration: internal/leading whitespace and case are tolerated', () => {
  assert.equal(parseDuration('  1H 20M '), 80 * MIN);
});

test('parseDuration: decimals on either unit ("1.5h", "2.5m")', () => {
  assert.equal(parseDuration('1.5h'), 90 * MIN);
  assert.equal(parseDuration('2.5m'), 2.5 * MIN);
});

test('parseDuration: zero is valid ("0" → 0ms)', () => {
  assert.equal(parseDuration('0'), 0);
  assert.equal(parseDuration('0m'), 0);
});

test('parseDuration: rejects garbage, negatives, and empty input', () => {
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration('   '), null);
  assert.equal(parseDuration(null), null);
  assert.equal(parseDuration(undefined), null);
  assert.equal(parseDuration('abc'), null);
  assert.equal(parseDuration('-5m'), null);
  assert.equal(parseDuration('5x'), null);
  assert.equal(parseDuration('h'), null);
  assert.equal(parseDuration('m5'), null);
  assert.equal(parseDuration('20m8h'), null); // minutes-before-hours is not a form we accept
});

test('formatDurationMs: compact h/m rendering', () => {
  assert.equal(formatDurationMs(500 * MIN), '8h 20m');
  assert.equal(formatDurationMs(120 * MIN), '2h');
  assert.equal(formatDurationMs(45 * MIN), '45m');
  assert.equal(formatDurationMs(0), '0m');
  assert.equal(formatDurationMs(-5 * MIN), '0m'); // never renders negative
});
