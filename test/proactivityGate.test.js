// Cortex Phase 4 (Plan 043 T1) — pure proactivity gate (TDD: written first).
// C8: reactive (dashboard yes/no) ↔ proactive (agent acts overnight). The gate
// decides whether an ACTION SPEC may run without a fresh human click.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gateProactiveExecution } from '../src/utils/proactivityGate.js';

const DIGEST_SPEC = { kind: 'digest-source', recommendationId: 'r1', requiresAi: false };
const CODEGEN_SPEC = { kind: 'codegen', recommendationId: 'r2', requiresAi: true, guardrails: { autoInstall: false } };
const INSTR_SPEC = { kind: 'instructions', recommendationId: 'r3', requiresAi: true };

test('reactive mode: nothing executes proactively', () => {
  const r = gateProactiveExecution(DIGEST_SPEC, { cortexProactivity: 'reactive' });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'reactive-mode');
});

test('proactive mode: whitelisted kinds may run', () => {
  const settings = { cortexProactivity: 'proactive', cortexProactiveKinds: ['digest-source', 'instructions'] };
  assert.equal(gateProactiveExecution(DIGEST_SPEC, settings).allowed, true);
  assert.equal(gateProactiveExecution(INSTR_SPEC, settings).allowed, true);
});

test('proactive mode: non-whitelisted kind stays reactive', () => {
  const settings = { cortexProactivity: 'proactive', cortexProactiveKinds: ['digest-source'] };
  const r = gateProactiveExecution(INSTR_SPEC, settings);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'kind-not-whitelisted');
});

test('codegen artifacts may be DRAFTED proactively but are always review-first', () => {
  const settings = { cortexProactivity: 'proactive', cortexProactiveKinds: ['codegen'] };
  const r = gateProactiveExecution(CODEGEN_SPEC, settings);
  assert.equal(r.allowed, true);
  assert.equal(r.reviewRequired, true); // invariant: never auto-install
});

test('default settings are safe: reactive', () => {
  const r = gateProactiveExecution(DIGEST_SPEC, {});
  assert.equal(r.allowed, false);
});
