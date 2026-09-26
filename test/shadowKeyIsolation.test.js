// Regression guards for the 2026-09-26 "InPop won't let me type" report.
//
// ROOT CAUSE (reproduced in a real Chromium against the shipped 6.7.83 build):
// InPop lives in a CLOSED shadow root, so to the host page every keystroke
// typed into it looks like it targets the shadow host <div>, not an <input>.
// Sites with single-key shortcuts (Gmail, Asana, GitHub, YouTube…) listen at
// the document in the capture phase, see a non-input target, and
// preventDefault() — the input keeps focus but no character is ever inserted.
// A listener on the host itself is too late: document capture runs before it.
// The fix registers a window-level capture listener at document_start (before
// any page script), which stops key events aimed at our host before the page
// sees them, and routes our own keydown handling (Enter-to-submit) through a
// callback because the event no longer reaches the input's own listeners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isolateShadowHostKeys, ISOLATED_KEY_EVENTS } from '../src/utils/shadowKeyIsolation.js';

function fakeWindow() {
  const listeners = [];
  return {
    listeners,
    addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
    removeEventListener(type, fn, capture) {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture);
      if (i >= 0) listeners.splice(i, 1);
    },
    dispatch(ev) { for (const l of listeners.filter((x) => x.type === ev.type)) l.fn(ev); }
  };
}
function keyEvent(type, target, key = 'a') {
  return {
    type, target, key, stopped: false, prevented: false,
    stopImmediatePropagation() { this.stopped = true; },
    preventDefault() { this.prevented = true; }
  };
}

test('registers capture-phase listeners for keydown, keypress and keyup on the window', () => {
  const win = fakeWindow();
  isolateShadowHostKeys(win, {});
  assert.deepEqual(ISOLATED_KEY_EVENTS, ['keydown', 'keypress', 'keyup']);
  assert.deepEqual(win.listeners.map((l) => [l.type, l.capture]), [['keydown', true], ['keypress', true], ['keyup', true]]);
});

test('keys aimed at our shadow host are stopped before the page sees them — and never cancelled', () => {
  const win = fakeWindow();
  const host = {};
  isolateShadowHostKeys(win, host);
  for (const type of ISOLATED_KEY_EVENTS) {
    const ev = keyEvent(type, host);
    win.dispatch(ev);
    assert.equal(ev.stopped, true, `${type} must not reach page listeners`);
    assert.equal(ev.prevented, false, `${type} must keep its default action so the character is inserted`);
  }
});

test("the page's own keystrokes are untouched", () => {
  const win = fakeWindow();
  isolateShadowHostKeys(win, {});
  const ev = keyEvent('keydown', { tagName: 'INPUT' });
  win.dispatch(ev);
  assert.equal(ev.stopped, false);
});

test('our keydown handling is routed through onKeydown (Enter-to-submit keeps working)', () => {
  const win = fakeWindow();
  const host = {};
  const seen = [];
  isolateShadowHostKeys(win, host, { onKeydown: (e) => seen.push(e.key) });
  win.dispatch(keyEvent('keydown', host, 'Enter'));
  win.dispatch(keyEvent('keyup', host, 'Enter'));
  win.dispatch(keyEvent('keydown', {}, 'x'));
  assert.deepEqual(seen, ['Enter'], 'only keydowns aimed at our host reach onKeydown');
});

test('a throwing onKeydown never lets the key leak to the page', () => {
  const win = fakeWindow();
  const host = {};
  isolateShadowHostKeys(win, host, { onKeydown: () => { throw new Error('boom'); } });
  const ev = keyEvent('keydown', host, 'Enter');
  win.dispatch(ev);
  assert.equal(ev.stopped, true);
});

test('teardown removes every listener', () => {
  const win = fakeWindow();
  const off = isolateShadowHostKeys(win, {});
  off();
  assert.equal(win.listeners.length, 0);
});
