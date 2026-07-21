// Security fix wave (2026-07-21 audit, NOW #1) — escapeHtml() unit tests.
//
// This exercises the canonical copy at src/utils/escapeHtml.js. gatekeeper.js
// and inbar.js each carry a deliberately-duplicated inline copy of the exact
// same function body (see the comment above each duplicate for why: Rollup
// chunk-splits a module shared by 2+ content-script entries, and Chrome can't
// resolve an `import` statement in a classic/non-module content script). There
// is no DOM test harness in this repo (no jsdom dependency in package.json),
// so this pure-function test is the verification for the escaping logic
// itself; the "renders inert" claim for the real sink sites was verified
// manually by inspecting the built dist/assets/{gatekeeper,inbar}.js output
// for the inlined replace-chain and confirming zero `<script`/`onerror=`-shaped
// strings survive unescaped through the template literals that take user data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/utils/escapeHtml.js';

test('escapeHtml: escapes all five HTML-significant characters', () => {
  assert.equal(escapeHtml('&'), '&amp;');
  assert.equal(escapeHtml('<'), '&lt;');
  assert.equal(escapeHtml('>'), '&gt;');
  assert.equal(escapeHtml('"'), '&quot;');
  assert.equal(escapeHtml("'"), '&#39;');
});

test('escapeHtml: neutralizes a classic <img onerror> payload', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const out = escapeHtml(payload);
  assert.equal(out, '&lt;img src=x onerror=alert(1)&gt;');
  assert.ok(!out.includes('<img'));
  assert.ok(!/<[a-z]/i.test(out)); // no real tag can be parsed out of the result
});

test('escapeHtml: neutralizes an attribute-breakout payload (quote + new attr)', () => {
  // e.g. a label like:  x" onmouseover="alert(1)
  const payload = 'x" onmouseover="alert(1)';
  const out = escapeHtml(payload);
  assert.equal(out, 'x&quot; onmouseover=&quot;alert(1)');
  assert.ok(!out.includes('"'));
});

test('escapeHtml: neutralizes a </textarea> breakout payload', () => {
  const payload = 'notes</textarea><script>alert(1)</script>';
  const out = escapeHtml(payload);
  assert.ok(!out.includes('</textarea>'));
  assert.ok(!out.includes('<script>'));
});

test('escapeHtml: ampersand is escaped first (no double-escaping of produced entities)', () => {
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
  assert.equal(escapeHtml('&amp;'), '&amp;amp;');
});

test('escapeHtml: preserves newlines and plain text unchanged', () => {
  assert.equal(escapeHtml('line one\nline two'), 'line one\nline two');
  assert.equal(escapeHtml('Plain intent label 123'), 'Plain intent label 123');
});

test('escapeHtml: null/undefined/empty are safe no-ops', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(''), '');
});

test('escapeHtml: coerces non-string input (numbers, objects) via String()', () => {
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(0), '0');
});
