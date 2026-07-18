// Cortex Phase 2 (Plan 041 T5) — pure action-layer helpers (TDD: written first).
// C7 execution: turn APPROVED recommendations into concrete artifact specs the
// routing layer (C8) can run, and assemble the consolidated morning digest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActionSpec,
  buildMorningDigest
} from '../src/utils/cortexActions.js';

const APPROVED = {
  id: 'digest-mail',
  type: 'digest',
  title: 'Replace mail polling with one 9am digest',
  rationale: 'mail.google.com opened 14 times.',
  evidence: [{ key: 'browser|mail.google.com||', count: 14 }],
  expectedSavings: '~25 min/day',
  status: 'approved'
};

// ── buildActionSpec ────────────────────────────────────────

test('buildActionSpec: digest type → digest-source spec, no codegen', () => {
  const spec = buildActionSpec(APPROVED);
  assert.equal(spec.kind, 'digest-source');
  assert.equal(spec.recommendationId, 'digest-mail');
  assert.deepEqual(spec.sources, ['mail.google.com']);
  assert.equal(spec.requiresAi, false);
});

test('buildActionSpec: hotkey type → instruction artifact (no execution)', () => {
  const spec = buildActionSpec({ ...APPROVED, id: 'hk', type: 'hotkey', title: 'Bind X' });
  assert.equal(spec.kind, 'instructions');
  assert.equal(spec.requiresAi, true); // generation of the how-to uses the routed model
  assert.ok(spec.prompt.includes('Bind X'));
});

test('buildActionSpec: custom-code type → codegen task spec with guardrails', () => {
  const spec = buildActionSpec({ ...APPROVED, id: 'cc', type: 'custom-code', title: 'Page-set opener' });
  assert.equal(spec.kind, 'codegen');
  assert.equal(spec.requiresAi, true);
  assert.match(spec.prompt, /review/i);           // artifact must demand human review
  assert.match(spec.prompt, /page-set opener/i);
  assert.equal(spec.guardrails.autoInstall, false); // never self-installing
});

test('buildActionSpec: tool-replacement → comparison brief spec', () => {
  const spec = buildActionSpec({ ...APPROVED, id: 'tr', type: 'tool-replacement' });
  assert.equal(spec.kind, 'brief');
  assert.equal(spec.requiresAi, true);
});

test('buildActionSpec: only approved recommendations are actionable', () => {
  assert.throws(() => buildActionSpec({ ...APPROVED, status: 'pending' }), /approved/i);
});

test('buildActionSpec: unknown type falls back to instructions', () => {
  const spec = buildActionSpec({ ...APPROVED, id: 'o', type: 'other' });
  assert.equal(spec.kind, 'instructions');
});

// ── buildMorningDigest ─────────────────────────────────────

function obs(ts, host, extra = {}) {
  return { ts, kind: 'context', surface: 'browser', host, app: null, partition: 'personal', ...extra };
}

test('buildMorningDigest: summarizes yesterday per digest source, newest first', () => {
  const now = Date.parse('2026-07-10T09:00:00.000Z');
  const observations = [
    obs('2026-07-09T08:00:00.000Z', 'mail.google.com'),
    obs('2026-07-09T09:00:00.000Z', 'mail.google.com'),
    obs('2026-07-09T10:00:00.000Z', 'news.ycombinator.com')
  ];
  const digest = buildMorningDigest({
    observations,
    approved: [APPROVED],
    day: '2026-07-09',
    now
  });
  assert.equal(digest.schema, 'cortex-digest.v1');
  assert.equal(digest.day, '2026-07-09');
  assert.equal(digest.sections.length, 1);
  assert.equal(digest.sections[0].source, 'mail.google.com');
  assert.equal(digest.sections[0].visits, 2);
  assert.ok(digest.generatedAt);
});

test('buildMorningDigest: no approved digest recommendations → empty sections, still valid', () => {
  const digest = buildMorningDigest({ observations: [], approved: [], day: '2026-07-09', now: 0 });
  assert.deepEqual(digest.sections, []);
});

test('buildMorningDigest: non-digest approvals are ignored', () => {
  const digest = buildMorningDigest({
    observations: [obs('2026-07-09T08:00:00.000Z', 'x.com')],
    approved: [{ ...APPROVED, type: 'hotkey' }],
    day: '2026-07-09',
    now: 0
  });
  assert.deepEqual(digest.sections, []);
});
