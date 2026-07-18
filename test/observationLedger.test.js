// Tests for the pure Observations Ledger normalization helpers (Cortex C4).
// Run: node --test test/observationLedger.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeObservation,
  dedupeKey,
  partitionOf
} from '../src/utils/observationLedger.js';

// ── normalizeObservation ─────────────────────────────────────────
test('normalizeObservation: fills nulls for all missing optional fields', () => {
  const rec = normalizeObservation({ at: 0 });
  assert.deepEqual(rec, {
    ts: '1970-01-01T00:00:00.000Z',
    kind: 'signal',
    surface: null,
    app: null,
    host: null,
    title: null,
    category: null,
    focusId: null,
    intentId: null,
    captureRef: null
  });
});

test('normalizeObservation: produces ISO ts from epoch ms', () => {
  const at = Date.UTC(2026, 6, 9, 12, 0, 0);
  const rec = normalizeObservation({ at });
  assert.equal(rec.ts, new Date(at).toISOString());
});

test('normalizeObservation: throws TypeError when at is missing', () => {
  assert.throws(() => normalizeObservation({}), TypeError);
  assert.throws(() => normalizeObservation({ host: 'x.com' }), TypeError);
});

test('normalizeObservation: throws TypeError when at is not a finite number', () => {
  assert.throws(() => normalizeObservation({ at: NaN }), TypeError);
  assert.throws(() => normalizeObservation({ at: Infinity }), TypeError);
  assert.throws(() => normalizeObservation({ at: '123' }), TypeError);
  assert.throws(() => normalizeObservation({ at: null }), TypeError);
});

test('normalizeObservation: derives kind=capture when captureRef present', () => {
  const rec = normalizeObservation({ at: 1000, captureRef: 'cap-1' });
  assert.equal(rec.kind, 'capture');
  assert.equal(rec.captureRef, 'cap-1');
});

test('normalizeObservation: derives kind=context when host present', () => {
  const rec = normalizeObservation({ at: 1000, host: 'github.com' });
  assert.equal(rec.kind, 'context');
});

test('normalizeObservation: derives kind=context when appName present', () => {
  const rec = normalizeObservation({ at: 1000, appName: 'Slack' });
  assert.equal(rec.kind, 'context');
  assert.equal(rec.app, 'Slack');
});

test('normalizeObservation: derives kind=signal when no host/app/capture', () => {
  const rec = normalizeObservation({ at: 1000, focusId: 'f1' });
  assert.equal(rec.kind, 'signal');
});

test('normalizeObservation: explicit kind overrides derivation', () => {
  const rec = normalizeObservation({ at: 1000, host: 'github.com', kind: 'signal' });
  assert.equal(rec.kind, 'signal');
});

test('normalizeObservation: captureRef takes precedence over host for derived kind', () => {
  const rec = normalizeObservation({ at: 1000, host: 'github.com', captureRef: 'cap-9' });
  assert.equal(rec.kind, 'capture');
});

test('normalizeObservation: lowercases host', () => {
  const rec = normalizeObservation({ at: 1000, host: 'GitHub.COM' });
  assert.equal(rec.host, 'github.com');
});

test('normalizeObservation: trims title, empty trim → null', () => {
  assert.equal(normalizeObservation({ at: 1000, title: '  Hello  ' }).title, 'Hello');
  assert.equal(normalizeObservation({ at: 1000, title: '   ' }).title, null);
});

test('normalizeObservation: passes through surface/category/focusId/intentId', () => {
  const rec = normalizeObservation({
    at: 1000,
    surface: 'browser',
    category: 'work',
    focusId: 'f1',
    intentId: 'i1'
  });
  assert.equal(rec.surface, 'browser');
  assert.equal(rec.category, 'work');
  assert.equal(rec.focusId, 'f1');
  assert.equal(rec.intentId, 'i1');
});

test('normalizeObservation: app is null when appName absent', () => {
  const rec = normalizeObservation({ at: 1000, host: 'a.com' });
  assert.equal(rec.app, null);
});

// ── dedupeKey ────────────────────────────────────────────────────
test('dedupeKey: stable for the same context', () => {
  const a = normalizeObservation({ at: 1000, surface: 'browser', host: 'github.com', focusId: 'f1', intentId: 'i1' });
  const b = normalizeObservation({ at: 5000, surface: 'browser', host: 'github.com', focusId: 'f1', intentId: 'i1' });
  assert.equal(dedupeKey(a), dedupeKey(b));
});

test('dedupeKey: differs for different host', () => {
  const a = normalizeObservation({ at: 1000, surface: 'browser', host: 'github.com', focusId: 'f1' });
  const b = normalizeObservation({ at: 1000, surface: 'browser', host: 'gitlab.com', focusId: 'f1' });
  assert.notEqual(dedupeKey(a), dedupeKey(b));
});

test('dedupeKey: differs for different focusId', () => {
  const a = normalizeObservation({ at: 1000, surface: 'browser', host: 'github.com', focusId: 'f1' });
  const b = normalizeObservation({ at: 1000, surface: 'browser', host: 'github.com', focusId: 'f2' });
  assert.notEqual(dedupeKey(a), dedupeKey(b));
});

test('dedupeKey: differs for different intentId', () => {
  const a = normalizeObservation({ at: 1000, surface: 'browser', host: 'github.com', intentId: 'i1' });
  const b = normalizeObservation({ at: 1000, surface: 'browser', host: 'github.com', intentId: 'i2' });
  assert.notEqual(dedupeKey(a), dedupeKey(b));
});

test('dedupeKey: falls back to app when host absent', () => {
  const a = normalizeObservation({ at: 1000, surface: 'desktop', appName: 'Slack', focusId: 'f1' });
  const b = normalizeObservation({ at: 9000, surface: 'desktop', appName: 'Slack', focusId: 'f1' });
  assert.equal(dedupeKey(a), dedupeKey(b));
});

test('dedupeKey: all-null context yields a stable empty-ish key', () => {
  const a = normalizeObservation({ at: 1000 });
  const b = normalizeObservation({ at: 2000 });
  assert.equal(dedupeKey(a), dedupeKey(b));
  assert.equal(dedupeKey(a), '|||');
});

// ── partitionOf ──────────────────────────────────────────────────
test('partitionOf: clocked_in → org', () => {
  assert.equal(partitionOf({}, 'clocked_in'), 'org');
});

test('partitionOf: on_break → org', () => {
  assert.equal(partitionOf({}, 'on_break'), 'org');
});

test('partitionOf: clocked_out → personal', () => {
  assert.equal(partitionOf({}, 'clocked_out'), 'personal');
});

test('partitionOf: undefined clock state → personal', () => {
  assert.equal(partitionOf({}, undefined), 'personal');
  assert.equal(partitionOf({}, null), 'personal');
});
