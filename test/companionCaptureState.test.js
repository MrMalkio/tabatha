// Cortex capture-visibility fix (Malkio 2026-07-10): the Cortex panel showed
// only the extension's own cortexLedger count, never the desktop companion's
// real frames directory — "where are my captures?" Covers: the companion's
// CAPTURE_STATE reply is persisted to storage, GET_COMPANION_CAPTURE_STATE
// returns it, and a fresh state is requested on every bridge reconnect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

globalThis.WebSocket ??= { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };

let chromeMock = installChromeMock();
const { companionBridge } = await import('../src/background/services/companionService.js');
const capture = await import('../src/background/services/captureService.js');

capture.registerCompanionCaptureBridge(companionBridge);

test('CAPTURE_STATE from the companion is persisted to companionCaptureState storage', async () => {
  chromeMock = installChromeMock();
  companionBridge._emit('captureState', {
    type: 'CAPTURE_STATE',
    enabled: true,
    mode: 'os',
    last_capture_at: '2026-07-10T12:00:00.000Z',
    frames_dir: 'C:\\Users\\mrmal\\AppData\\Roaming\\Tabatha Desktop\\captures'
  });

  // The listener's setStorage() call is async — flush microtasks.
  await Promise.resolve();
  await Promise.resolve();

  const { companionCaptureState } = await chromeMock.storage.local.get('companionCaptureState');
  assert.equal(companionCaptureState.enabled, true);
  assert.equal(companionCaptureState.mode, 'os');
  assert.equal(companionCaptureState.lastCaptureAt, '2026-07-10T12:00:00.000Z');
  assert.equal(companionCaptureState.framesDir, 'C:\\Users\\mrmal\\AppData\\Roaming\\Tabatha Desktop\\captures');
  assert.equal(typeof companionCaptureState.receivedAt, 'number');
});

test('GET_COMPANION_CAPTURE_STATE returns the last-known companion snapshot', async () => {
  chromeMock = installChromeMock({
    store: {
      companionCaptureState: {
        enabled: true, mode: 'browser', framesDir: 'D:\\captures',
        lastCaptureAt: '2026-07-10T09:00:00.000Z', receivedAt: 123
      }
    }
  });

  const res = await capture.handleMessage('GET_COMPANION_CAPTURE_STATE', {});
  assert.equal(res.framesDir, 'D:\\captures');
  assert.equal(res.lastCaptureAt, '2026-07-10T09:00:00.000Z');
  assert.equal(res.enabled, true);
  assert.equal(res.mode, 'browser');
});

test('GET_COMPANION_CAPTURE_STATE returns nulls (not a throw) when the companion has never reported', async () => {
  chromeMock = installChromeMock();
  const res = await capture.handleMessage('GET_COMPANION_CAPTURE_STATE', {});
  assert.equal(res.framesDir, null);
  assert.equal(res.lastCaptureAt, null);
});

test('bridge "connected" event requests a fresh capture-state snapshot from the companion', async () => {
  chromeMock = installChromeMock({ store: { settings: {} } });
  const sent = [];
  companionBridge.connected = true;
  companionBridge.ws = { readyState: 1, send: (data) => sent.push(JSON.parse(data)) };

  companionBridge._emit('connected', {});
  await Promise.resolve();
  await Promise.resolve();

  assert.ok(sent.some((m) => m.type === 'GET_CAPTURE_STATE'), 'should request GET_CAPTURE_STATE on connect');

  companionBridge.connected = false;
  companionBridge.ws = null;
});
