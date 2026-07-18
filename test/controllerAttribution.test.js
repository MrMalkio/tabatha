// Cortex Phase 5 (Plan 044 T1) — pure controller-attribution decision table
// (TDD: written first). C11: distinguish human vs AI-agent control so attention
// is attributed to the right entity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attributeController } from '../src/utils/controllerAttribution.js';

test('explicit agent self-announcement wins outright', () => {
  const r = attributeController({ agentAnnounced: true, inputEventsRecent: true });
  assert.deepEqual(r, { controller: 'ai-agent', confidence: 'explicit', signals: ['agent-announced'] });
});

test('webdriver / CDP / agent process ancestry → ai-agent (high)', () => {
  for (const sig of ['webdriver', 'cdpActive', 'processAncestryAgent']) {
    const r = attributeController({ [sig]: true });
    assert.equal(r.controller, 'ai-agent');
    assert.equal(r.confidence, 'high');
  }
});

test('recent human input with no automation markers → human (high)', () => {
  const r = attributeController({ inputEventsRecent: true });
  assert.equal(r.controller, 'human');
  assert.equal(r.confidence, 'high');
});

test('automation marker + recent input → ai-agent, but only medium confidence (co-driving)', () => {
  const r = attributeController({ webdriver: true, inputEventsRecent: true });
  assert.equal(r.controller, 'ai-agent');
  assert.equal(r.confidence, 'medium');
});

test('activity without input events or markers → unknown', () => {
  const r = attributeController({});
  assert.equal(r.controller, 'unknown');
  assert.equal(r.confidence, 'low');
});

test('signals list names every contributing marker', () => {
  const r = attributeController({ webdriver: true, cdpActive: true });
  assert.deepEqual(r.signals.sort(), ['cdp-active', 'webdriver']);
});
