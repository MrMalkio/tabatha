// Cortex Phase 1 T4 — ledgerExport pure helpers (TDD: written first).
// Nightly plain-file export of the observations ledger that harness agents
// (C6 cron-in-harness) read, including the ≥3× repeat pre-aggregation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectObservationsForDay,
  buildLedgerExport,
  buildExportRelPath,
  pruneLedgerByAge
} from '../src/utils/ledgerExport.js';

function obs(ts, extra = {}) {
  return {
    ts, kind: 'context', surface: 'browser', app: null, host: 'example.com',
    title: null, category: null, focusId: null, intentId: null,
    captureRef: null, partition: 'personal', ...extra
  };
}

const DAY = '2026-07-09';
const LEDGER = [
  obs('2026-07-08T23:59:59.000Z'),
  obs('2026-07-09T00:00:00.000Z'),
  obs('2026-07-09T12:30:00.000Z', { host: 'github.com', partition: 'org' }),
  obs('2026-07-09T23:59:59.999Z'),
  obs('2026-07-10T00:00:00.000Z')
];

// ── selectObservationsForDay ───────────────────────────────

test('selectObservationsForDay: UTC day boundaries are inclusive-start, exclusive-end', () => {
  const picked = selectObservationsForDay(LEDGER, DAY);
  assert.equal(picked.length, 3);
  assert.equal(picked.every((r) => r.ts.startsWith('2026-07-09')), true);
});

test('selectObservationsForDay: empty ledger / no matches → []', () => {
  assert.deepEqual(selectObservationsForDay([], DAY), []);
  assert.deepEqual(selectObservationsForDay(LEDGER, '2020-01-01'), []);
});

test('selectObservationsForDay: partial day string does not prefix-over-match', () => {
  assert.deepEqual(selectObservationsForDay(LEDGER, '2026-07-1'), []);
});

// ── buildLedgerExport ──────────────────────────────────────

test('buildLedgerExport: envelope has schema, day, generatedAt, counts, records', () => {
  const now = Date.parse('2026-07-10T03:30:00.000Z');
  const { filename, content } = buildLedgerExport(LEDGER, { day: DAY, now });
  assert.equal(filename, 'cortex-ledger-2026-07-09.json');
  assert.equal(content.schema, 'cortex-ledger-export.v1');
  assert.equal(content.day, DAY);
  assert.equal(content.generatedAt, '2026-07-10T03:30:00.000Z');
  assert.equal(content.counts.total, 3);
  assert.deepEqual(content.counts.byPartition, { personal: 2, org: 1 });
  assert.equal(content.records.length, 3);
});

test('buildLedgerExport: repeat aggregation counts identical contexts and flags ≥3 candidates', () => {
  const now = Date.parse('2026-07-10T03:30:00.000Z');
  const repeats = [
    obs('2026-07-09T09:00:00.000Z', { host: 'mail.google.com' }),
    obs('2026-07-09T10:00:00.000Z', { host: 'mail.google.com' }),
    obs('2026-07-09T11:00:00.000Z', { host: 'mail.google.com' }),
    obs('2026-07-09T12:00:00.000Z', { host: 'once.com' })
  ];
  const { content } = buildLedgerExport(repeats, { day: DAY, now });
  assert.equal(content.repeats.threshold, 3);
  const candidate = content.repeats.candidates.find((c) => c.key.includes('mail.google.com'));
  assert.ok(candidate, 'mail.google.com should be a repeat candidate');
  assert.equal(candidate.count, 3);
  assert.equal(content.repeats.candidates.some((c) => c.key.includes('once.com')), false);
});

test('buildLedgerExport: candidates sorted by count desc', () => {
  const now = 0;
  const many = [
    ...Array.from({ length: 5 }, (_, i) => obs(`2026-07-09T0${i}:00:00.000Z`, { host: 'five.com' })),
    ...Array.from({ length: 3 }, (_, i) => obs(`2026-07-09T1${i}:00:00.000Z`, { host: 'three.com' }))
  ];
  const { content } = buildLedgerExport(many, { day: DAY, now });
  assert.equal(content.repeats.candidates[0].key.includes('five.com'), true);
});

test('buildLedgerExport: day with no observations still produces a valid empty envelope', () => {
  const { content } = buildLedgerExport([], { day: DAY, now: 0 });
  assert.equal(content.counts.total, 0);
  assert.deepEqual(content.records, []);
  assert.deepEqual(content.repeats.candidates, []);
});

// ── buildExportRelPath ─────────────────────────────────────

test('buildExportRelPath: exports live beside the capture store', () => {
  const p = buildExportRelPath('Tabatha/Cortex/captures', 'cortex-ledger-2026-07-09.json');
  assert.equal(p, 'Tabatha/Cortex/exports/cortex-ledger-2026-07-09.json');
});

test('buildExportRelPath: falls back to default root when store path is empty', () => {
  const p = buildExportRelPath('', 'f.json');
  assert.equal(p, 'Tabatha/Cortex/exports/f.json');
});

// ── pruneLedgerByAge ───────────────────────────────────────

test('pruneLedgerByAge: applies per-partition maxAgeDays (C3 dual retention)', () => {
  const now = Date.parse('2026-07-10T00:00:00.000Z');
  const ledger = [
    obs('2026-06-01T00:00:00.000Z'),                       // personal, 39d old → pruned @30d
    obs('2026-07-01T00:00:00.000Z'),                       // personal, 9d old → kept
    obs('2026-03-01T00:00:00.000Z', { partition: 'org' }), // org, 131d old → pruned @90d
    obs('2026-05-01T00:00:00.000Z', { partition: 'org' })  // org, 70d old → kept
  ];
  const retention = { personal: { maxAgeDays: 30 }, org: { maxAgeDays: 90 } };
  const kept = pruneLedgerByAge(ledger, retention, now);
  assert.equal(kept.length, 2);
  assert.deepEqual(kept.map((r) => r.ts), ['2026-07-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z']);
});

test('pruneLedgerByAge: missing/zero policy for a partition keeps its records', () => {
  const now = Date.parse('2026-07-10T00:00:00.000Z');
  const ledger = [obs('2020-01-01T00:00:00.000Z')];
  assert.equal(pruneLedgerByAge(ledger, {}, now).length, 1);
  assert.equal(pruneLedgerByAge(ledger, { personal: { maxAgeDays: 0 } }, now).length, 1);
});

test('pruneLedgerByAge: unparseable ts is kept, never silently dropped', () => {
  const now = Date.parse('2026-07-10T00:00:00.000Z');
  const ledger = [obs('not-a-timestamp')];
  assert.equal(pruneLedgerByAge(ledger, { personal: { maxAgeDays: 1 } }, now).length, 1);
});
