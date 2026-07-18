// Tests for the pure Sensitive-Data Guard (Cortex C2).
// Given the FOCUSED capture target + user/org rules, decide whether to skip the
// frame entirely (suppress) and/or which regions to redact BEFORE it is written.
// Nuance: this evaluates the target being captured; suppressing QuickBooks-in-focus
// must NOT suppress other tabs — that is the caller's job (only calls per-frame).
// Run: node --test test/sensitiveDataGuard.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCapture } from '../src/utils/sensitiveDataGuard.js';

const QB = { region: 'bottom', percent: 80 };

test('evaluateCapture: no rules → clear, capture allowed, nothing redacted', () => {
  const r = evaluateCapture({ surface: 'browser', host: 'github.com' }, []);
  assert.deepEqual(r, { suppress: false, redactions: [], reason: 'clear' });
});

test('evaluateCapture: suppress rule on host skips the frame', () => {
  const rules = [{ when: { hostContains: 'intuit.com' }, action: 'suppress' }];
  const r = evaluateCapture(
    { surface: 'browser', host: 'quickbooks.online.intuit.com' },
    rules
  );
  assert.equal(r.suppress, true);
  assert.equal(r.reason, 'suppressed');
});

test('evaluateCapture: suppress rule on OS app name skips the frame', () => {
  const rules = [{ when: { appName: 'QuickBooks' }, action: 'suppress' }];
  const r = evaluateCapture({ surface: 'os', appName: 'QuickBooks' }, rules);
  assert.equal(r.suppress, true);
});

test('evaluateCapture: app-name match is case-insensitive', () => {
  const rules = [{ when: { appName: 'QuickBooks' }, action: 'suppress' }];
  const r = evaluateCapture({ surface: 'os', appName: 'quickbooks' }, rules);
  assert.equal(r.suppress, true);
});

test('evaluateCapture: redact rule returns the region and still allows capture', () => {
  const rules = [{ when: { hostContains: 'intuit.com' }, action: 'redact', redact: QB }];
  const r = evaluateCapture(
    { surface: 'browser', host: 'quickbooks.online.intuit.com' },
    rules
  );
  assert.equal(r.suppress, false);
  assert.deepEqual(r.redactions, [QB]);
  assert.equal(r.reason, 'redacted');
});

test('evaluateCapture: rule for a different site does not match the focused target', () => {
  const rules = [{ when: { host: 'quickbooks.online.intuit.com' }, action: 'suppress' }];
  const r = evaluateCapture({ surface: 'browser', host: 'github.com' }, rules);
  assert.deepEqual(r, { suppress: false, redactions: [], reason: 'clear' });
});

test('evaluateCapture: suppress wins over a redact rule on the same target', () => {
  const rules = [
    { when: { hostContains: 'intuit.com' }, action: 'redact', redact: QB },
    { when: { hostContains: 'intuit.com' }, action: 'suppress' }
  ];
  const r = evaluateCapture(
    { surface: 'browser', host: 'quickbooks.online.intuit.com' },
    rules
  );
  assert.equal(r.suppress, true);
});

test('evaluateCapture: multiple redact rules accumulate regions', () => {
  const top = { region: 'top', percent: 10 };
  const rules = [
    { when: { hostContains: 'intuit.com' }, action: 'redact', redact: QB },
    { when: { hostContains: 'intuit' }, action: 'redact', redact: top }
  ];
  const r = evaluateCapture(
    { surface: 'browser', host: 'quickbooks.online.intuit.com' },
    rules
  );
  assert.equal(r.suppress, false);
  assert.equal(r.redactions.length, 2);
});

test('evaluateCapture: multi-key rule requires ALL keys to match', () => {
  const rules = [{ when: { appName: 'Chrome', hostContains: 'bank' }, action: 'suppress' }];
  // appName matches but host does not → no match
  const r = evaluateCapture({ surface: 'os', appName: 'Chrome', host: 'github.com' }, rules);
  assert.equal(r.suppress, false);
});
