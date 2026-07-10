// Cortex Phase 4 T3 (Plan 043) — multi-cadence harness bundle + intraday slice
// export (TDD). The generated harness task must run BOTH cadences off one
// export folder, self-selecting via the newest export's filename marker.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCadenceBundle,
  buildHarnessCronBundle,
  buildExecuteBundle,
  RECOMMENDATIONS_SCHEMA
} from '../src/utils/harnessCron.js';
import {
  buildIntradayExport,
  selectObservationsSince,
  INTRADAY_EXPORT_SCHEMA
} from '../src/utils/ledgerExport.js';

const OPTS = {
  exportDir: 'C:\\exports',
  outputDir: 'C:\\recs',
  promptVersion: 'economize-workflow.v1',
  promptText: 'EOD PROMPT BODY',
  intradayPromptVersion: 'economize-intraday.v1',
  intradayPromptText: 'INTRADAY PROMPT BODY'
};

// ── buildCadenceBundle ─────────────────────────────────────

test('buildCadenceBundle: claude-code ships the task + both prompt files', () => {
  const b = buildCadenceBundle({ harness: 'claude-code', ...OPTS });
  assert.equal(b.harness, 'claude-code');
  const paths = b.files.map((f) => f.relPath);
  assert.ok(paths.includes('scheduled-tasks/tabatha-cortex-optimize/SKILL.md'));
  assert.ok(paths.some((p) => p.endsWith('economize-workflow.v1.md')));
  assert.ok(paths.some((p) => p.endsWith('economize-intraday.v1.md')));
  const eod = b.files.find((f) => f.relPath.endsWith('economize-workflow.v1.md'));
  const intra = b.files.find((f) => f.relPath.endsWith('economize-intraday.v1.md'));
  assert.equal(eod.content, 'EOD PROMPT BODY');
  assert.equal(intra.content, 'INTRADAY PROMPT BODY');
});

test('buildCadenceBundle: SKILL describes cadence detection via the filename marker', () => {
  const b = buildCadenceBundle({ harness: 'claude-code', ...OPTS });
  const skill = b.files.find((f) => f.relPath.endsWith('SKILL.md')).content;
  assert.ok(skill.includes('cortex-ledger-intraday-'), 'names the intraday marker');
  assert.ok(skill.includes('economize-intraday.v1'), 'points at the intraday prompt');
  assert.ok(skill.includes('economize-workflow.v1'), 'points at the EOD prompt');
  assert.ok(skill.includes('>=3x'), 'both cadences keep the ≥3× rule');
  assert.ok(skill.includes(RECOMMENDATIONS_SCHEMA), 'writes the recommendations envelope');
});

test('buildCadenceBundle: codex packs both cadences into one file with both prompts', () => {
  const b = buildCadenceBundle({ harness: 'codex', ...OPTS });
  assert.equal(b.files.length, 1);
  const body = b.files[0].content;
  assert.ok(body.includes('EOD PROMPT BODY'));
  assert.ok(body.includes('INTRADAY PROMPT BODY'));
  assert.ok(/two schedules/i.test(b.files[0].content));
});

test('buildCadenceBundle: instructions mention both an EOD and an intraday schedule', () => {
  const b = buildCadenceBundle({ harness: 'claude-code', ...OPTS, eodScheduleHint: '03:30 local', intradayScheduleHint: 'every 90 min' });
  assert.ok(/EOD/i.test(b.instructions));
  assert.ok(b.instructions.includes('03:30 local'));
  assert.ok(b.instructions.includes('every 90 min'));
});

test('buildCadenceBundle: unknown harness throws', () => {
  assert.throws(() => buildCadenceBundle({ harness: 'nope', ...OPTS }), /unknown harness/);
});

test('buildCadenceBundle is additive — the EOD-only builders still work unchanged', () => {
  const eod = buildHarnessCronBundle({
    harness: 'claude-code', exportDir: 'e', outputDir: 'o',
    promptVersion: 'economize-workflow.v1', promptText: 'X', scheduleHint: '03:30'
  });
  assert.equal(eod.files.length, 2);
  const exec = buildExecuteBundle({ harness: 'codex', actionsDir: 'a', reviewDir: 'r' });
  assert.equal(exec.files.length, 1);
});

// ── buildIntradayExport (recent-window slice) ──────────────

const obs = (ts, extra = {}) => ({
  ts, kind: 'context', surface: 'browser', host: 'example.com',
  focusId: null, intentId: null, partition: 'personal', ...extra
});

test('selectObservationsSince: keeps only records at/after the window start', () => {
  const now = Date.parse('2026-07-10T12:00:00.000Z');
  const since = now - 120 * 60000; // 10:00
  const ledger = [
    obs('2026-07-10T09:30:00.000Z'),   // before window → excluded
    obs('2026-07-10T10:30:00.000Z'),   // in window
    obs('2026-07-10T11:59:00.000Z'),   // in window
    obs('not-a-date')                  // unparseable → excluded
  ];
  const picked = selectObservationsSince(ledger, since);
  assert.equal(picked.length, 2);
});

test('buildIntradayExport: tagged intraday envelope with a marker filename', () => {
  const now = Date.parse('2026-07-10T12:00:00.000Z');
  const since = now - 120 * 60000;
  const ledger = [
    obs('2026-07-10T10:10:00.000Z', { host: 'mail.google.com' }),
    obs('2026-07-10T10:40:00.000Z', { host: 'mail.google.com' }),
    obs('2026-07-10T11:10:00.000Z', { host: 'mail.google.com' }),
    obs('2026-07-10T11:40:00.000Z', { host: 'once.com' })
  ];
  const { filename, content } = buildIntradayExport(ledger, { sinceMs: since, now });
  assert.ok(filename.startsWith('cortex-ledger-intraday-'), 'marker prefix drives cadence detection');
  assert.ok(!/[:.]/.test(filename.replace('.json', '')), 'filename is filesystem-safe');
  assert.equal(content.schema, INTRADAY_EXPORT_SCHEMA);
  assert.equal(content.cadence, 'intraday');
  assert.equal(content.windowStart, '2026-07-10T10:00:00.000Z');
  assert.equal(content.counts.total, 4);
  // ≥3× repeat rule holds within the slice.
  const cand = content.repeats.candidates.find((c) => c.key.includes('mail.google.com'));
  assert.ok(cand && cand.count === 3);
  assert.equal(content.repeats.candidates.some((c) => c.key.includes('once.com')), false);
});

test('buildIntradayExport: empty slice → valid empty envelope', () => {
  const now = Date.parse('2026-07-10T12:00:00.000Z');
  const { content } = buildIntradayExport([], { sinceMs: now - 3600000, now });
  assert.equal(content.counts.total, 0);
  assert.deepEqual(content.records, []);
  assert.deepEqual(content.repeats.candidates, []);
});
