// FIX-12 — toolbar-click action apply logic.
// Verifies the persistent-config approach (setPopup + setPanelBehavior) rather
// than per-click toggling, plus the hotkey popup opener and mode normalization.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

installChromeMock();
const svc = await import('../src/background/services/toolbarActionService.js');

test('normalizeMode falls back to sidepanel for invalid input', () => {
  assert.equal(svc.normalizeMode('sidepanel'), 'sidepanel');
  assert.equal(svc.normalizeMode('popup'), 'popup');
  assert.equal(svc.normalizeMode(undefined), 'sidepanel');
  assert.equal(svc.normalizeMode('garbage'), 'sidepanel');
});

test('sidepanel mode clears the popup and opens the side panel on click', async () => {
  const chrome = installChromeMock();
  const mode = await svc.applyToolbarClickAction('sidepanel');
  assert.equal(mode, 'sidepanel');
  assert.equal(chrome.action._lastPopup, ''); // no popup → side panel gesture wins
  assert.deepEqual(chrome.sidePanel._lastBehavior, { openPanelOnActionClick: true });
});

test('popup mode sets popup.html and disables side-panel-on-click', async () => {
  const chrome = installChromeMock();
  const mode = await svc.applyToolbarClickAction('popup');
  assert.equal(mode, 'popup');
  assert.equal(chrome.action._lastPopup, 'popup.html');
  assert.deepEqual(chrome.sidePanel._lastBehavior, { openPanelOnActionClick: false });
});

test('invalid mode is treated as the default (sidepanel)', async () => {
  const chrome = installChromeMock();
  const mode = await svc.applyToolbarClickAction('nonsense');
  assert.equal(mode, 'sidepanel');
  assert.equal(chrome.action._lastPopup, '');
  assert.deepEqual(chrome.sidePanel._lastBehavior, { openPanelOnActionClick: true });
});

test('syncToolbarClickAction reads the persisted setting', async () => {
  const chrome = installChromeMock({ store: { settings: { toolbarClickAction: 'popup' } } });
  await svc.syncToolbarClickAction();
  assert.equal(chrome.action._lastPopup, 'popup.html');
  assert.deepEqual(chrome.sidePanel._lastBehavior, { openPanelOnActionClick: false });
});

test('syncToolbarClickAction defaults to sidepanel when unset', async () => {
  const chrome = installChromeMock();
  await svc.syncToolbarClickAction();
  assert.equal(chrome.action._lastPopup, '');
  assert.deepEqual(chrome.sidePanel._lastBehavior, { openPanelOnActionClick: true });
});

test('openTabListPopup spawns a real popup window (not action.openPopup)', async () => {
  const chrome = installChromeMock();
  await svc.openTabListPopup();
  assert.equal(chrome.windows._created.length, 1);
  const w = chrome.windows._created[0];
  assert.equal(w.type, 'popup');
  assert.equal(w.url, 'popup.html'); // mock getURL is identity
  assert.equal(w.focused, true);
});

test('registerToolbarActionListeners wires listeners without throwing', () => {
  installChromeMock();
  assert.doesNotThrow(() => svc.registerToolbarActionListeners());
});
