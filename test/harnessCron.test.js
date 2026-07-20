// Cortex Phase 1 T5 — harnessCron pure helpers (TDD: written first).
// C8 tier-① "cron-in-harness": build the scheduled-task file bundle a user
// (or the companion, later) places into their Claude Code / Codex harness so
// an overnight agent runs the economize prompt over the nightly ledger export
// and writes recommendations back. Also: the recommendation record contract
// the C7 dashboard consumes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHarnessCronBundle,
  buildExecuteBundle,
  validateRecommendation,
  normalizeRecommendations
} from '../src/utils/harnessCron.js';

const OPTS = {
  harness: 'claude-code',
  exportDir: 'C:\\Users\\me\\Downloads\\Tabatha\\Cortex\\exports',
  outputDir: 'C:\\Users\\me\\Downloads\\Tabatha\\Cortex\\recommendations',
  promptVersion: 'economize-workflow.v1',
  promptText: 'PROMPT BODY HERE',
  scheduleHint: '03:30 local'
};

// ── buildHarnessCronBundle ─────────────────────────────────

test('buildHarnessCronBundle: claude-code bundle is a scheduled-task SKILL.md + prompt file', () => {
  const bundle = buildHarnessCronBundle(OPTS);
  assert.equal(bundle.harness, 'claude-code');
  const paths = bundle.files.map((f) => f.relPath);
  assert.ok(paths.includes('scheduled-tasks/tabatha-cortex-optimize/SKILL.md'));
  assert.ok(paths.some((p) => p.endsWith('economize-workflow.v1.md')));
});

test('buildHarnessCronBundle: task file embeds export dir, output dir, and the ≥3 rule', () => {
  const bundle = buildHarnessCronBundle(OPTS);
  const task = bundle.files.find((f) => f.relPath.endsWith('SKILL.md'));
  assert.ok(task.content.includes(OPTS.exportDir));
  assert.ok(task.content.includes(OPTS.outputDir));
  assert.match(task.content, /3/); // repeat threshold is stated
  assert.ok(task.content.includes('cortex-recommendations.v1'));
});

test('buildHarnessCronBundle: prompt file carries the prompt text verbatim', () => {
  const bundle = buildHarnessCronBundle(OPTS);
  const prompt = bundle.files.find((f) => f.relPath.endsWith('economize-workflow.v1.md'));
  assert.ok(prompt.content.includes('PROMPT BODY HERE'));
});

test('buildHarnessCronBundle: codex harness gets its own layout', () => {
  const bundle = buildHarnessCronBundle({ ...OPTS, harness: 'codex' });
  assert.equal(bundle.harness, 'codex');
  assert.ok(bundle.files.length >= 1);
});

test('buildHarnessCronBundle: unknown harness throws', () => {
  assert.throws(() => buildHarnessCronBundle({ ...OPTS, harness: 'mystery' }), /harness/i);
});

// ── validateRecommendation ─────────────────────────────────

const GOOD_REC = {
  id: 'rec-1',
  type: 'hotkey',
  title: 'Bind clipboard history to a hotkey',
  rationale: 'Opened clipboard manager via menu 14× on 2026-07-09.',
  evidence: [{ key: 'browser|mail.google.com||', count: 14 }],
  expectedSavings: '~6 min/day',
  status: 'pending'
};

test('validateRecommendation: accepts a well-formed record', () => {
  assert.deepEqual(validateRecommendation(GOOD_REC), { ok: true, errors: [] });
});

test('validateRecommendation: rejects unknown type and status', () => {
  const bad = validateRecommendation({ ...GOOD_REC, type: 'magic', status: 'maybe' });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 2);
});

test('validateRecommendation: requires id, title, rationale', () => {
  const bad = validateRecommendation({ type: 'hotkey', status: 'pending' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes('id')));
  assert.ok(bad.errors.some((e) => e.includes('title')));
  assert.ok(bad.errors.some((e) => e.includes('rationale')));
});

// ── normalizeRecommendations ───────────────────────────────

test('normalizeRecommendations: accepts the harness output envelope, stamps ids + importedAt, drops invalid rows', () => {
  const now = Date.parse('2026-07-10T09:00:00.000Z');
  const envelope = {
    schema: 'cortex-recommendations.v1',
    recommendations: [
      { ...GOOD_REC, id: undefined },
      { type: 'nonsense' },
      { ...GOOD_REC, id: 'keep-me', type: 'tool-replacement' }
    ]
  };
  const { accepted, rejected } = normalizeRecommendations(envelope, { now });
  assert.equal(accepted.length, 2);
  assert.equal(rejected.length, 1);
  assert.equal(accepted[1].id, 'keep-me');
  assert.ok(accepted[0].id, 'missing id gets generated');
  assert.equal(accepted[0].importedAt, '2026-07-10T09:00:00.000Z');
  assert.equal(accepted[0].status, 'pending');
});

test('normalizeRecommendations: rejects a non-matching schema outright', () => {
  assert.throws(
    () => normalizeRecommendations({ schema: 'other.v9', recommendations: [] }, { now: 0 }),
    /schema/i
  );
});

test('normalizeRecommendations: bare array is accepted as a lenient fallback', () => {
  const { accepted } = normalizeRecommendations([GOOD_REC], { now: 0 });
  assert.equal(accepted.length, 1);
});

test('normalizeRecommendations: null / non-object payload throws cleanly', () => {
  assert.throws(() => normalizeRecommendations(null, { now: 0 }), /schema/i);
  assert.throws(() => normalizeRecommendations('garbage', { now: 0 }), /schema/i);
});

// ── buildExecuteBundle (Phase 4 — proactive overnight executor) ─────────

const EXEC_OPTS = {
  harness: 'claude-code',
  actionsDir: 'C:\\Users\\me\\Downloads\\Tabatha\\Cortex\\exports',
  reviewDir: 'C:\\Users\\me\\Downloads\\Tabatha\\Cortex\\review',
  scheduleHint: '04:30 local'
};

test('buildExecuteBundle: claude-code layout with EXECUTE task file', () => {
  const bundle = buildExecuteBundle(EXEC_OPTS);
  assert.equal(bundle.harness, 'claude-code');
  const task = bundle.files.find((f) => f.relPath === 'scheduled-tasks/tabatha-cortex-execute/SKILL.md');
  assert.ok(task, 'EXECUTE SKILL.md present');
  assert.ok(task.content.includes(EXEC_OPTS.actionsDir));
  assert.ok(task.content.includes(EXEC_OPTS.reviewDir));
});

test('buildExecuteBundle: task file encodes the hard guardrails', () => {
  const task = buildExecuteBundle(EXEC_OPTS).files[0];
  assert.match(task.content, /proactive.*true/i);        // only proactive-flagged actions run
  assert.match(task.content, /never install/i);          // review-first invariant
  assert.match(task.content, /cortex-actions\.v1/);      // input schema pinned
});

test('buildExecuteBundle: unknown harness throws', () => {
  assert.throws(() => buildExecuteBundle({ ...EXEC_OPTS, harness: 'mystery' }), /harness/i);
});
