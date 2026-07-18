// Tests for the pure self-correction helpers (Cortex C10 — Passive
// Self-Correction, Plan 042 T7). Detectors are PROPOSAL generators: they
// never mutate their inputs. No chrome / supabase / DOM dependencies.
// Run: node --test test/selfCorrection.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIDENCE_ORDER,
  confidenceRank,
  scoreCorrectionConfidence,
  applyConfidenceFloor,
  detectTabIntentMismatches,
  recomputeActualWorkTime
} from '../src/utils/selfCorrection.js';

const iso = (ms) => new Date(ms).toISOString();
const M = 60000;
const BASE = 1_700_000_000_000;

// obs(offsetMinutes, fields) → a normalized-ledger-shaped observation.
function obs(offMin, fields = {}) {
  return {
    ts: iso(BASE + offMin * M),
    kind: fields.kind || 'context',
    surface: fields.surface || 'browser',
    app: fields.app ?? null,
    host: fields.host ?? null,
    title: fields.title ?? null,
    category: fields.category ?? null,
    focusId: fields.focusId ?? null,
    intentId: fields.intentId ?? null,
    captureRef: fields.captureRef ?? null
  };
}

// ── scoreCorrectionConfidence ────────────────────────────────────
test('scoreCorrectionConfidence: explicit signal wins outright', () => {
  assert.equal(scoreCorrectionConfidence(['host-run', 'explicit']), 'explicit');
});
test('scoreCorrectionConfidence: two distinct signals → high', () => {
  assert.equal(scoreCorrectionConfidence(['host-run', 'category']), 'high');
});
test('scoreCorrectionConfidence: single signal → medium', () => {
  assert.equal(scoreCorrectionConfidence(['host-run']), 'medium');
});
test('scoreCorrectionConfidence: no signal → low', () => {
  assert.equal(scoreCorrectionConfidence([]), 'low');
  assert.equal(scoreCorrectionConfidence([null, undefined, false]), 'low');
});
test('scoreCorrectionConfidence: duplicate signals collapse (still one)', () => {
  assert.equal(scoreCorrectionConfidence(['host-run', 'host-run']), 'medium');
});

// ── confidenceRank / applyConfidenceFloor ────────────────────────
test('confidenceRank mirrors the autoFocusService ladder ordering', () => {
  assert.deepEqual(CONFIDENCE_ORDER, ['low', 'medium', 'high', 'explicit']);
  assert.ok(confidenceRank('explicit') > confidenceRank('high'));
  assert.ok(confidenceRank('high') > confidenceRank('medium'));
  assert.ok(confidenceRank('medium') > confidenceRank('low'));
});

test('applyConfidenceFloor: keeps at/above floor, drops below', () => {
  const corrections = [
    { id: 'a', confidence: 'low' },
    { id: 'b', confidence: 'medium' },
    { id: 'c', confidence: 'high' },
    { id: 'd', confidence: 'explicit' }
  ];
  assert.deepEqual(applyConfidenceFloor(corrections, 'high').map(c => c.id), ['c', 'd']);
  assert.deepEqual(applyConfidenceFloor(corrections, 'medium').map(c => c.id), ['b', 'c', 'd']);
});

test('applyConfidenceFloor: explicit floor keeps only explicit', () => {
  const corrections = [
    { id: 'b', confidence: 'medium' },
    { id: 'c', confidence: 'high' },
    { id: 'd', confidence: 'explicit' }
  ];
  assert.deepEqual(applyConfidenceFloor(corrections, 'explicit').map(c => c.id), ['d']);
});

test('applyConfidenceFloor: invalid floor defaults to high', () => {
  const corrections = [
    { id: 'b', confidence: 'medium' },
    { id: 'c', confidence: 'high' }
  ];
  assert.deepEqual(applyConfidenceFloor(corrections, 'banana').map(c => c.id), ['c']);
});

test('applyConfidenceFloor: empty input → empty output', () => {
  assert.deepEqual(applyConfidenceFloor([], 'high'), []);
  assert.deepEqual(applyConfidenceFloor(undefined, 'high'), []);
});

// ── detectTabIntentMismatches ────────────────────────────────────
test('detectTabIntentMismatches: sustained differing intent → correction', () => {
  const observations = [
    obs(0, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(5, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(10, { host: 'stripe.com', intentId: 'invoice-cleanup' })
  ];
  const tabs = [{ tabId: 7, host: 'stripe.com', intentId: 'q3-report' }];
  const out = detectTabIntentMismatches(observations, tabs, { minRun: 3 });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'tab-intent-link');
  assert.equal(out[0].tabId, 7);
  assert.equal(out[0].from, 'q3-report');
  assert.equal(out[0].to, 'invoice-cleanup');
  assert.ok(Array.isArray(out[0].evidence) && out[0].evidence.length > 0);
});

test('detectTabIntentMismatches: observed intent agrees with record → no correction', () => {
  const observations = [
    obs(0, { host: 'stripe.com', intentId: 'q3-report' }),
    obs(5, { host: 'stripe.com', intentId: 'q3-report' }),
    obs(10, { host: 'stripe.com', intentId: 'q3-report' })
  ];
  const tabs = [{ tabId: 7, host: 'stripe.com', intentId: 'q3-report' }];
  assert.deepEqual(detectTabIntentMismatches(observations, tabs), []);
});

test('detectTabIntentMismatches: run shorter than minRun → no correction', () => {
  const observations = [
    obs(0, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(5, { host: 'stripe.com', intentId: 'invoice-cleanup' })
  ];
  const tabs = [{ tabId: 7, host: 'stripe.com', intentId: 'q3-report' }];
  assert.deepEqual(detectTabIntentMismatches(observations, tabs, { minRun: 3 }), []);
});

test('detectTabIntentMismatches: a null-intent observation breaks the run', () => {
  const observations = [
    obs(0, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(5, { host: 'stripe.com', intentId: null }), // idle / no focus → resets
    obs(10, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(15, { host: 'stripe.com', intentId: 'invoice-cleanup' })
  ];
  const tabs = [{ tabId: 7, host: 'stripe.com', intentId: 'q3-report' }];
  // Longest differing run is 2 (< minRun 3).
  assert.deepEqual(detectTabIntentMismatches(observations, tabs, { minRun: 3 }), []);
});

test('detectTabIntentMismatches: unlabeled tab gains a link (from null)', () => {
  const observations = [
    obs(0, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(5, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(10, { host: 'stripe.com', intentId: 'invoice-cleanup' })
  ];
  const tabs = [{ tabId: 7, host: 'stripe.com', intentId: null }];
  const out = detectTabIntentMismatches(observations, tabs, { minRun: 3 });
  assert.equal(out.length, 1);
  assert.equal(out[0].from, null);
  assert.equal(out[0].to, 'invoice-cleanup');
});

test('detectTabIntentMismatches: category corroboration lifts medium → high', () => {
  const hostOnly = [
    obs(0, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(5, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(10, { host: 'stripe.com', intentId: 'invoice-cleanup' })
  ];
  const tabs = [{ tabId: 7, host: 'stripe.com', intentId: 'q3-report' }];
  assert.equal(detectTabIntentMismatches(hostOnly, tabs, { minRun: 3 })[0].confidence, 'medium');

  const withCategory = hostOnly.map(o => ({ ...o, category: 'finance' }));
  assert.equal(detectTabIntentMismatches(withCategory, tabs, { minRun: 3 })[0].confidence, 'high');
});

test('detectTabIntentMismatches: explicit source marks the correction explicit', () => {
  const observations = [
    obs(0, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(5, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(10, { host: 'stripe.com', intentId: 'invoice-cleanup' })
  ].map(o => ({ ...o, source: 'url_rule' }));
  const tabs = [{ tabId: 7, host: 'stripe.com', intentId: 'q3-report' }];
  assert.equal(detectTabIntentMismatches(observations, tabs, { minRun: 3 })[0].confidence, 'explicit');
});

test('detectTabIntentMismatches: accepts tabs as an object map keyed by tabId', () => {
  const observations = [
    obs(0, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(5, { host: 'stripe.com', intentId: 'invoice-cleanup' }),
    obs(10, { host: 'stripe.com', intentId: 'invoice-cleanup' })
  ];
  const tabs = { 7: { host: 'stripe.com', intent: 'q3-report' } };
  const out = detectTabIntentMismatches(observations, tabs, { minRun: 3 });
  assert.equal(out.length, 1);
  assert.equal(out[0].tabId, 7);
  assert.equal(out[0].from, 'q3-report');
});

test('detectTabIntentMismatches: does not mutate its inputs', () => {
  const observations = [obs(0, { host: 'stripe.com', intentId: 'invoice-cleanup' })];
  const tabs = [{ tabId: 7, host: 'stripe.com', intentId: 'q3-report' }];
  const obsSnap = JSON.stringify(observations);
  const tabsSnap = JSON.stringify(tabs);
  detectTabIntentMismatches(observations, tabs);
  assert.equal(JSON.stringify(observations), obsSnap);
  assert.equal(JSON.stringify(tabs), tabsSnap);
});

test('detectTabIntentMismatches: empty inputs → []', () => {
  assert.deepEqual(detectTabIntentMismatches([], []), []);
  assert.deepEqual(detectTabIntentMismatches(undefined, undefined), []);
  assert.deepEqual(detectTabIntentMismatches([obs(0, { host: 'x.com', intentId: 'a' })], []), []);
});

// ── recomputeActualWorkTime ──────────────────────────────────────
// A focus whose elapsedMs froze at 40m while observation evidence continued
// for another 20m (SW suspend / forgotten stop) — attribution by time window.
function frozenSession() {
  const observations = [];
  for (let i = 0; i <= 60; i += 5) {
    observations.push(obs(i, { host: 'quickbooks.com', surface: 'browser' }));
  }
  const sessions = [{
    focusId: 'f1',
    recordedMs: 40 * M,
    startedAt: iso(BASE),
    endedAt: iso(BASE + 60 * M)
  }];
  return { observations, sessions };
}

test('recomputeActualWorkTime: frozen elapsedMs recomputed from observations', () => {
  const { observations, sessions } = frozenSession();
  const out = recomputeActualWorkTime(observations, sessions, { now: BASE + 61 * M });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'focus-time');
  assert.equal(out[0].focusId, 'f1');
  assert.equal(out[0].recordedMs, 40 * M);
  assert.equal(out[0].observedMs, 60 * M);
  assert.equal(out[0].deltaMs, 20 * M);
});

test('recomputeActualWorkTime: delta within 20% → no correction', () => {
  const observations = [];
  for (let i = 0; i <= 60; i += 5) observations.push(obs(i, { host: 'quickbooks.com' }));
  // recorded 55m, observed 60m → 5m delta = ~9% < 20% floor.
  const sessions = [{ focusId: 'f1', recordedMs: 55 * M, startedAt: iso(BASE), endedAt: iso(BASE + 60 * M) }];
  assert.deepEqual(recomputeActualWorkTime(observations, sessions, { now: BASE + 61 * M }), []);
});

test('recomputeActualWorkTime: delta over 20% but under 5min floor → no correction', () => {
  const observations = [obs(0, { host: 'x.com' }), obs(4, { host: 'x.com' })];
  // observed 4m, recorded 1m → 3m delta, 300% > 20% but < 5min absolute floor.
  const sessions = [{ focusId: 'f1', recordedMs: 1 * M, startedAt: iso(BASE), endedAt: iso(BASE + 4 * M) }];
  assert.deepEqual(recomputeActualWorkTime(observations, sessions, { now: BASE + 5 * M }), []);
});

test('recomputeActualWorkTime: long idle gaps are capped, not counted whole', () => {
  const observations = [
    obs(0, { host: 'x.com' }),
    obs(120, { host: 'x.com' }) // 2h gap — user walked away, capped to maxGapMs
  ];
  const sessions = [{ focusId: 'f1', recordedMs: 5 * M, startedAt: iso(BASE), endedAt: iso(BASE + 121 * M) }];
  const out = recomputeActualWorkTime(observations, sessions, { maxGapMs: 5 * M, now: BASE + 122 * M });
  // Only the single capped 5m gap counts → observedMs 5m, delta 0 → no correction.
  assert.deepEqual(out, []);
});

test('recomputeActualWorkTime: attribution by focusId when observations carry it', () => {
  const observations = [];
  for (let i = 0; i <= 60; i += 5) observations.push(obs(i, { host: 'q.com', focusId: 'f1' }));
  observations.push(obs(3, { host: 'other.com', focusId: 'f2' })); // belongs to a different focus
  const sessions = [{ focusId: 'f1', recordedMs: 40 * M }];
  const out = recomputeActualWorkTime(observations, sessions, { now: BASE + 61 * M });
  assert.equal(out.length, 1);
  assert.equal(out[0].observedMs, 60 * M);
});

test('recomputeActualWorkTime: capture + browser evidence → high confidence', () => {
  const observations = [];
  for (let i = 0; i <= 60; i += 5) {
    observations.push(obs(i, { host: 'q.com', surface: 'browser', kind: i % 10 === 0 ? 'capture' : 'context', captureRef: i % 10 === 0 ? `cap-${i}` : null }));
  }
  const sessions = [{ focusId: 'f1', recordedMs: 40 * M, startedAt: iso(BASE), endedAt: iso(BASE + 60 * M) }];
  assert.equal(recomputeActualWorkTime(observations, sessions, { now: BASE + 61 * M })[0].confidence, 'high');
});

test('recomputeActualWorkTime: single-surface context evidence → medium confidence', () => {
  const observations = [];
  for (let i = 0; i <= 60; i += 5) observations.push(obs(i, { host: 'q.com', surface: 'browser', kind: 'context' }));
  const sessions = [{ focusId: 'f1', recordedMs: 40 * M, startedAt: iso(BASE), endedAt: iso(BASE + 60 * M) }];
  assert.equal(recomputeActualWorkTime(observations, sessions, { now: BASE + 61 * M })[0].confidence, 'medium');
});

test('recomputeActualWorkTime: fewer than 2 observations → no correction', () => {
  const sessions = [{ focusId: 'f1', recordedMs: 40 * M, startedAt: iso(BASE), endedAt: iso(BASE + 60 * M) }];
  assert.deepEqual(recomputeActualWorkTime([obs(0, { host: 'q.com' })], sessions, { now: BASE + 61 * M }), []);
  assert.deepEqual(recomputeActualWorkTime([], sessions, { now: BASE + 61 * M }), []);
});

test('recomputeActualWorkTime: does not mutate its inputs', () => {
  const { observations, sessions } = frozenSession();
  const obsSnap = JSON.stringify(observations);
  const sesSnap = JSON.stringify(sessions);
  recomputeActualWorkTime(observations, sessions, { now: BASE + 61 * M });
  assert.equal(JSON.stringify(observations), obsSnap);
  assert.equal(JSON.stringify(sessions), sesSnap);
});

test('recomputeActualWorkTime: empty inputs → []', () => {
  assert.deepEqual(recomputeActualWorkTime([], []), []);
  assert.deepEqual(recomputeActualWorkTime(undefined, undefined), []);
});
