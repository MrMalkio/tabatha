// Cortex C9 — voice decisioning tests (pure). Written alongside the helper
// (Plan 042 T2). Covers the speak-vs-modal ladder and the varied-line pool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSpeakOrModal, composeSpokenLine } from '../src/utils/voiceDecision.js';

const ON = {
  enabled: true,
  output: { enabled: true, toneBeforeSpeak: true, micPreOpenMs: 1500, modalFallback: true, perModalType: {} }
};

test('decide: output disabled → modal', () => {
  const s = { enabled: true, output: { enabled: false } };
  assert.equal(decideSpeakOrModal('drift-detected', s, 'present').mode, 'modal');
});

test('decide: master voice disabled → modal even if output.enabled', () => {
  const s = { enabled: false, output: { enabled: true } };
  assert.equal(decideSpeakOrModal('drift-detected', s, 'present').mode, 'modal');
});

test('decide: enabled + present + no override → speak', () => {
  assert.equal(decideSpeakOrModal('focus-timer-expired', ON, 'present').mode, 'speak');
});

test('decide: enabled + present + boolean-true presence → speak', () => {
  assert.equal(decideSpeakOrModal('focus-timer-expired', ON, true).mode, 'speak');
});

test('decide: absent presence → modal (never silently dropped)', () => {
  assert.equal(decideSpeakOrModal('focus-timer-expired', ON, 'absent').mode, 'modal');
});

test('decide: unknown/undefined presence → modal', () => {
  assert.equal(decideSpeakOrModal('focus-timer-expired', ON, 'unknown').mode, 'modal');
  assert.equal(decideSpeakOrModal('focus-timer-expired', ON).mode, 'modal');
});

test('decide: perModalType "modal" override wins even when present', () => {
  const s = { ...ON, output: { ...ON.output, perModalType: { 'drift-detected': 'modal' } } };
  assert.equal(decideSpeakOrModal('drift-detected', s, 'present').mode, 'modal');
});

test('decide: perModalType "silent" override wins over presence gate', () => {
  const s = { ...ON, output: { ...ON.output, perModalType: { 'checkpoint-prompt': 'silent' } } };
  // silent is a deliberate mute — applies even when the user is absent.
  assert.equal(decideSpeakOrModal('checkpoint-prompt', s, 'absent').mode, 'silent');
});

test('decide: perModalType "speak" override forces voice when present', () => {
  const s = { ...ON, output: { ...ON.output, perModalType: { 'welcome-back': 'speak' } } };
  assert.equal(decideSpeakOrModal('welcome-back', s, 'present').mode, 'speak');
});

test('decide: knobs (preTone/micPreOpenMs/fallbackToModal) reflect settings', () => {
  const s = { enabled: true, output: { enabled: true, toneBeforeSpeak: false, micPreOpenMs: 900, modalFallback: false, perModalType: {} } };
  const r = decideSpeakOrModal('idle-pause', s, 'present');
  assert.equal(r.preTone, false);
  assert.equal(r.micPreOpenMs, 900);
  assert.equal(r.fallbackToModal, false);
});

test('decide: defaults for missing knobs (preTone true, mic 0, fallback true)', () => {
  const s = { enabled: true, output: { enabled: true } };
  const r = decideSpeakOrModal('idle-pause', s, 'present');
  assert.equal(r.preTone, true);
  assert.equal(r.micPreOpenMs, 0);
  assert.equal(r.fallbackToModal, true);
});

test('decide: empty settings → modal, no throw', () => {
  assert.equal(decideSpeakOrModal('drift-detected').mode, 'modal');
  assert.equal(decideSpeakOrModal('drift-detected', {}).mode, 'modal');
});

test('compose: returns a non-empty string for every required modal type', () => {
  for (const t of ['focus-timer-expired', 'checkpoint-prompt', 'drift-detected', 'welcome-back', 'idle-pause']) {
    const line = composeSpokenLine(t, { seed: 0, focusLabel: 'Ship the docs' });
    assert.equal(typeof line, 'string');
    assert.ok(line.length > 0, `${t} produced an empty line`);
  }
});

test('compose: deterministic — same seed yields the same line', () => {
  const a = composeSpokenLine('drift-detected', { seed: 42, focusLabel: 'X' });
  const b = composeSpokenLine('drift-detected', { seed: 42, focusLabel: 'X' });
  assert.equal(a, b);
});

test('compose: varied — different seeds cover different lines', () => {
  const lines = new Set(
    [0, 1, 2].map((seed) => composeSpokenLine('welcome-back', { seed, focusLabel: 'X' }))
  );
  assert.ok(lines.size >= 2, 'expected the pool to vary across seeds');
});

test('compose: incorporates the focus label from context', () => {
  const line = composeSpokenLine('focus-timer-expired', { seed: 0, focusLabel: 'Refactor router' });
  assert.match(line, /Refactor router/);
});

test('compose: unknown modal type falls back to a generic non-empty line', () => {
  const line = composeSpokenLine('totally-unknown-type', { seed: 1 });
  assert.equal(typeof line, 'string');
  assert.ok(line.length > 0);
});
