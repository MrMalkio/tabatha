// Plan 036 Phase 1 — companion bridge activity helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

installChromeMock();
const { companionBridge } = await import('../src/background/services/companionService.js');

function reset({ connected, lastMessageAt, lastActivityAt, desktopIdle, app }) {
  companionBridge.connected = connected;
  companionBridge.lastMessageAt = lastMessageAt;
  companionBridge.lastActivityAt = lastActivityAt;
  companionBridge.desktopIdle = desktopIdle;
  companionBridge.lastAppSwitch = app;
}

test('isRecentlyActive true when connected, recent message + activity, not idle', () => {
  reset({ connected: true, lastMessageAt: Date.now(), lastActivityAt: Date.now(), desktopIdle: false });
  assert.equal(companionBridge.isRecentlyActive(5 * 60000), true);
});

test('isRecentlyActive false when the companion reports desktop idle', () => {
  reset({ connected: true, lastMessageAt: Date.now(), lastActivityAt: Date.now(), desktopIdle: true });
  assert.equal(companionBridge.isRecentlyActive(5 * 60000), false);
});

test('isRecentlyActive false when the companion has gone silent (stale heartbeat)', () => {
  const old = Date.now() - 10 * 60000;
  reset({ connected: true, lastMessageAt: old, lastActivityAt: old, desktopIdle: false });
  assert.equal(companionBridge.isRecentlyActive(5 * 60000), false);
});

test('isRecentlyActive false when disconnected', () => {
  reset({ connected: false, lastMessageAt: Date.now(), lastActivityAt: Date.now(), desktopIdle: false });
  assert.equal(companionBridge.isRecentlyActive(5 * 60000), false);
});

test('getActiveApp normalises a canonical name', () => {
  reset({ connected: true, lastMessageAt: Date.now(), lastActivityAt: Date.now(), desktopIdle: false, app: { displayName: 'Figma', category: 'design' } });
  assert.equal(companionBridge.getActiveApp().name, 'Figma');
  assert.equal(companionBridge.getActiveAppCategory(), 'design');
});

test('getActiveApp returns null when nothing is known', () => {
  reset({ connected: true, lastMessageAt: Date.now(), lastActivityAt: Date.now(), desktopIdle: false, app: null });
  assert.equal(companionBridge.getActiveApp(), null);
});
