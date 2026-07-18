// Cortex C3/C4 — silent-write routing for the capture service.
// Covers: nightly ledger export buffers when the companion is offline and
// flushes on reconnect (never chrome.downloads), and the C1 browser⇄OS handoff
// gate (no tab grab while Chrome is blurred).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

// companionBridge.send() references WebSocket.OPEN; provide a stub for node
// versions without a global WebSocket.
globalThis.WebSocket ??= { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };

let chromeMock = installChromeMock();
const { companionBridge } = await import('../src/background/services/companionService.js');
const capture = await import('../src/background/services/captureService.js');

const DAY = '2026-07-09';
function obs(ts, extra = {}) {
  return { ts, kind: 'context', surface: 'browser', partition: 'personal', ...extra };
}

test('nightly export BUFFERS to pendingCortexExports when the companion is offline (no chrome.downloads)', async () => {
  chromeMock = installChromeMock({
    store: {
      settings: { screenshotCapture: true },
      cortexLedger: [obs(`${DAY}T12:00:00.000Z`)]
    }
  });
  companionBridge.connected = false;

  const res = await capture.runNightlyExport(DAY);
  assert.equal(res.records, 1);
  assert.equal(res.exported, false);
  assert.equal(res.buffered, true);

  const { pendingCortexExports } = await chromeMock.storage.local.get('pendingCortexExports');
  assert.equal(Array.isArray(pendingCortexExports), true);
  assert.equal(pendingCortexExports.length, 1);
  assert.equal(pendingCortexExports[0].filename, `cortex-ledger-${DAY}.json`);
  assert.equal(typeof pendingCortexExports[0].content, 'string');
});

test('flushPendingCortexExports sends buffered exports over the bridge and clears the buffer', async () => {
  chromeMock = installChromeMock({
    store: {
      pendingCortexExports: [
        { filename: `cortex-ledger-${DAY}.json`, content: '{"a":1}', bufferedAt: 1 }
      ]
    }
  });
  const sent = [];
  companionBridge.connected = true;
  companionBridge.ws = { readyState: 1, send: (data) => sent.push(JSON.parse(data)) };

  const res = await capture.flushPendingCortexExports();
  assert.equal(res.flushed, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'WRITE_EXPORT');
  assert.equal(sent[0].filename, `cortex-ledger-${DAY}.json`);
  assert.equal(sent[0].content, '{"a":1}');

  const { pendingCortexExports } = await chromeMock.storage.local.get('pendingCortexExports');
  assert.deepEqual(pendingCortexExports, []);

  companionBridge.connected = false;
  companionBridge.ws = null;
});

test('flush is a no-op (buffer preserved) while the companion is disconnected', async () => {
  chromeMock = installChromeMock({
    store: { pendingCortexExports: [{ filename: 'x.json', content: '{}', bufferedAt: 1 }] }
  });
  companionBridge.connected = false;

  const res = await capture.flushPendingCortexExports();
  assert.equal(res.flushed, 0);
  const { pendingCortexExports } = await chromeMock.storage.local.get('pendingCortexExports');
  assert.equal(pendingCortexExports.length, 1);
});

test('C1 handoff: handleDwellTick records NO observation while Chrome is blurred', async () => {
  chromeMock = installChromeMock({
    store: { settings: { screenshotCapture: true } },
    tabs: { 1: { url: 'https://example.com/x', title: 'Example', active: true, incognito: false } }
  });
  companionBridge.connected = false;
  capture.setChromeFocused(false);

  await capture.handleDwellTick();

  const { cortexLedger } = await chromeMock.storage.local.get('cortexLedger');
  assert.equal(cortexLedger === undefined || cortexLedger.length === 0, true);
});

test('C1 handoff: handleDwellTick DOES record a (context-only) observation while Chrome is focused', async () => {
  chromeMock = installChromeMock({
    store: { settings: { screenshotCapture: true } },
    tabs: { 1: { url: 'https://example.com/x', title: 'Example', active: true, incognito: false } }
  });
  companionBridge.connected = false;
  capture.setChromeFocused(true);

  // captureVisibleTab is absent on the mock → grab throws → context-only record.
  await capture.handleDwellTick();

  const { cortexLedger } = await chromeMock.storage.local.get('cortexLedger');
  assert.equal(Array.isArray(cortexLedger), true);
  assert.equal(cortexLedger.length, 1);
  assert.equal(cortexLedger[0].captureRef ?? null, null);

  capture.setChromeFocused(true); // restore default
});
