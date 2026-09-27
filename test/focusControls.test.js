// Regression guard for the 2026-09-26 "I can no longer pause from the sidebar"
// report. The sidebar offered ⏸ Pause only when the current focus was exactly
// 'active' and ▶ Resume only when 'paused' — a 'drifted' focus (timer ran out,
// or "I diverged" on the away-gap prompt) got NEITHER, while the home page and
// the background's pauseFocus both treat drifted as pausable. Drift is routine,
// so the sidebar's Pause vanished every time a timer overran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primaryFocusControl } from '../src/utils/focusControls.js';

test('a paused focus offers Resume', () => {
  assert.equal(primaryFocusControl('paused'), 'resume');
});

test('an active focus offers Pause', () => {
  assert.equal(primaryFocusControl('active'), 'pause');
});

test('a drifted focus (timer ran out) still offers Pause', () => {
  assert.equal(primaryFocusControl('drifted'), 'pause');
});

test('completed or unknown states offer nothing', () => {
  assert.equal(primaryFocusControl('completed'), null);
  assert.equal(primaryFocusControl(undefined), null);
  assert.equal(primaryFocusControl(''), null);
});
