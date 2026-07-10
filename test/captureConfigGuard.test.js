// Reconnect-flap footgun (Malkio 2026-07-10, real ~90s capture-off gap):
// pushCaptureConfig used to call getSettings() unconditionally on every
// companion bridge 'connected' event. getSettings() ALWAYS merges onto
// DEFAULT_SETTINGS (screenshotCapture: false), so a settings read racing an
// MV3 SW-restart storm — before the raw `settings` key was ever persisted —
// silently resolved to "off" and pushed enabled:false to the companion,
// flapping real capture off even though the user had it on.
//
// Covers both the pure guard predicate (isSettingsLoaded) and the
// integration behavior: no CAPTURE_CONFIG push when settings aren't
// confirmed loaded, a real push once they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

globalThis.WebSocket ??= { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };

installChromeMock();
const { companionBridge } = await import('../src/background/services/companionService.js');
const capture = await import('../src/background/services/captureService.js');

capture.registerCompanionCaptureBridge(companionBridge);

// pushCaptureConfig chains multiple awaits (getStorage -> getSettings, each
// with its own internal await) before it sends — a macrotask boundary
// reliably drains all of them, where a fixed count of microtask ticks is
// fragile to internal refactors.
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('isSettingsLoaded: undefined/null raw settings are NOT confirmed loaded', () => {
  assert.equal(capture.isSettingsLoaded(undefined), false);
  assert.equal(capture.isSettingsLoaded(null), false);
});

test('isSettingsLoaded: any settings object (including screenshotCapture:false) IS confirmed loaded', () => {
  assert.equal(capture.isSettingsLoaded({}), true);
  assert.equal(capture.isSettingsLoaded({ screenshotCapture: false }), true);
  assert.equal(capture.isSettingsLoaded({ screenshotCapture: true }), true);
});

test('reconnect with NO settings key in storage does NOT push CAPTURE_CONFIG (flap guard)', async () => {
  installChromeMock({ store: {} }); // no `settings` key at all — "not loaded yet"
  const sent = [];
  companionBridge.connected = true;
  companionBridge.ws = { readyState: 1, send: (data) => sent.push(JSON.parse(data)) };

  companionBridge._emit('connected', {});
  await flush();

  assert.equal(sent.some((m) => m.type === 'CAPTURE_CONFIG'), false, 'must not push a guessed CAPTURE_CONFIG before settings are confirmed loaded');

  companionBridge.connected = false;
  companionBridge.ws = null;
});

test('reconnect WITH settings confirmed loaded pushes the real enabled state', async () => {
  installChromeMock({ store: { settings: { screenshotCapture: true } } });
  const sent = [];
  companionBridge.connected = true;
  companionBridge.ws = { readyState: 1, send: (data) => sent.push(JSON.parse(data)) };

  companionBridge._emit('connected', {});
  await flush();

  const cfg = sent.find((m) => m.type === 'CAPTURE_CONFIG');
  assert.ok(cfg, 'should push CAPTURE_CONFIG once settings are confirmed loaded');
  assert.equal(cfg.enabled, true);

  companionBridge.connected = false;
  companionBridge.ws = null;
});

test('reconnect with settings confirmed loaded and capture explicitly OFF still pushes enabled:false (genuine off, not a guess)', async () => {
  installChromeMock({ store: { settings: { screenshotCapture: false } } });
  const sent = [];
  companionBridge.connected = true;
  companionBridge.ws = { readyState: 1, send: (data) => sent.push(JSON.parse(data)) };

  companionBridge._emit('connected', {});
  await flush();

  const cfg = sent.find((m) => m.type === 'CAPTURE_CONFIG');
  assert.ok(cfg, 'a confirmed, user-set off state should still be pushed');
  assert.equal(cfg.enabled, false);

  companionBridge.connected = false;
  companionBridge.ws = null;
});
