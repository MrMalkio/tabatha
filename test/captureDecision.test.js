// Tests for the pure capture-decision helpers (Cortex C1 — Adaptive Capture).
// Decide WHEN a screenshot is worth taking (context-driven, not blind interval)
// and WHICH surface captures (browser vs desktop companion).
// Run: node --test test/captureDecision.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideCapture, captureSurface } from '../src/utils/captureDecision.js';

const CFG = { dwellIntervalMs: 10000, minGapMs: 2000, captureOnContextChange: true };
const S = 1000;

// ── decideCapture: enable gate ──────────────────────────────────
test('decideCapture: disabled never captures', () => {
  const r = decideCapture(
    { type: 'tab-activated', at: 100 * S, contextKey: 'tab:2' },
    { enabled: false, lastCaptureAt: null, lastContextKey: null },
    CFG
  );
  assert.deepEqual(r, { capture: false, reason: 'disabled' });
});

// ── decideCapture: context change ───────────────────────────────
test('decideCapture: first context change with no prior capture fires', () => {
  const r = decideCapture(
    { type: 'tab-activated', at: 100 * S, contextKey: 'tab:2' },
    { enabled: true, lastCaptureAt: null, lastContextKey: 'tab:1' },
    CFG
  );
  assert.equal(r.capture, true);
  assert.equal(r.reason, 'context-change');
});

test('decideCapture: context change within min-gap is suppressed', () => {
  const r = decideCapture(
    { type: 'tab-activated', at: 100 * S + 500, contextKey: 'tab:3' },
    { enabled: true, lastCaptureAt: 100 * S, lastContextKey: 'tab:2' },
    CFG
  );
  assert.deepEqual(r, { capture: false, reason: 'min-gap' });
});

test('decideCapture: context change after min-gap fires', () => {
  const r = decideCapture(
    { type: 'window-focus-changed', at: 100 * S + 2500, contextKey: 'win:9' },
    { enabled: true, lastCaptureAt: 100 * S, lastContextKey: 'win:8' },
    CFG
  );
  assert.equal(r.capture, true);
  assert.equal(r.reason, 'context-change');
});

test('decideCapture: same context on a non-dwell event does not fire', () => {
  const r = decideCapture(
    { type: 'tab-activated', at: 100 * S + 5000, contextKey: 'tab:2' },
    { enabled: true, lastCaptureAt: 100 * S, lastContextKey: 'tab:2' },
    CFG
  );
  assert.equal(r.capture, false);
  assert.equal(r.reason, 'no-context-change');
});

// ── decideCapture: dwell ────────────────────────────────────────
test('decideCapture: dwell tick fires once the interval has elapsed', () => {
  const r = decideCapture(
    { type: 'dwell-tick', at: 100 * S + 10000, contextKey: 'tab:2' },
    { enabled: true, lastCaptureAt: 100 * S, lastContextKey: 'tab:2' },
    CFG
  );
  assert.deepEqual(r, { capture: true, reason: 'dwell' });
});

test('decideCapture: dwell tick before the interval does not fire', () => {
  const r = decideCapture(
    { type: 'dwell-tick', at: 100 * S + 4000, contextKey: 'tab:2' },
    { enabled: true, lastCaptureAt: 100 * S, lastContextKey: 'tab:2' },
    CFG
  );
  assert.deepEqual(r, { capture: false, reason: 'dwell-not-elapsed' });
});

test('decideCapture: dwell tick on a fresh (unseen) context fires as context-change', () => {
  const r = decideCapture(
    { type: 'dwell-tick', at: 100 * S + 4000, contextKey: 'tab:7' },
    { enabled: true, lastCaptureAt: 100 * S, lastContextKey: 'tab:2' },
    { ...CFG, minGapMs: 0 }
  );
  assert.equal(r.capture, true);
  assert.equal(r.reason, 'context-change');
});

// ── captureSurface: browser⇄companion handoff ───────────────────
test('captureSurface: chrome focused → browser captures', () => {
  assert.equal(captureSurface({ chromeFocused: true, idle: false }), 'browser');
});

test('captureSurface: chrome blurred → companion (os) captures', () => {
  assert.equal(captureSurface({ chromeFocused: false, idle: false }), 'os');
});

test('captureSurface: idle → nobody captures', () => {
  assert.equal(captureSurface({ chromeFocused: true, idle: true }), 'none');
});
