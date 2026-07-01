// Plan 036 Phase 1 — companion bridge activity helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

let chromeMock = installChromeMock();
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

// ── FIX-02 / FIX-05: companion → extension clock sync ──
// A companion CLOCK_STATE must land in the canonical `clockSession` key that
// Home reads, mapped snake_case → camelCase, and must NOT echo back out to the
// companion (which would create an infinite sync loop).

const waitForClockWrite = async () => {
  // _handleClockState fires setSessionFromCompanion without awaiting; give the
  // microtask queue a tick to flush the async storage write.
  await new Promise((r) => setTimeout(r, 0));
};

test('CLOCK_STATE writes a clocked-in clockSession (snake_case → camelCase) and does NOT echo to companion', async () => {
  chromeMock = installChromeMock();
  // Track any outbound WebSocket sends so we can prove there's no echo.
  const sent = [];
  companionBridge.ws = { readyState: 1, send: (data) => sent.push(JSON.parse(data)) };
  companionBridge.connected = true;

  const clockedInAt = new Date('2026-07-01T09:00:00.000Z').toISOString();
  companionBridge._handleClockState({
    type: 'CLOCK_STATE',
    clock: {
      active: true,
      on_break: false,
      clocked_in_at: clockedInAt,
      break_started_at: null,
      total_break_ms: 0
    }
  });
  await waitForClockWrite();

  const { clockSession } = await chromeMock.storage.local.get('clockSession');
  assert.ok(clockSession, 'clockSession must be written');
  assert.equal(clockSession.active, true);
  assert.equal(clockSession.clockedInAt, clockedInAt);
  assert.equal(clockSession.clockedOutAt, null);
  assert.equal(clockSession.onBreak, false);
  assert.equal(clockSession.breakStartedAt, null);
  assert.deepEqual(clockSession.breaks, []);

  // Companion-origin write must be silent — no outbound CLOCK_IN/OUT/BREAK.
  assert.equal(sent.length, 0, 'must not echo any message back to the companion');
});

test('CLOCK_STATE on-break payload maps total_break_ms into breaks[] and preserves breakStartedAt', async () => {
  chromeMock = installChromeMock();
  const sent = [];
  companionBridge.ws = { readyState: 1, send: (data) => sent.push(JSON.parse(data)) };
  companionBridge.connected = true;

  const clockedInAt = new Date('2026-07-01T09:00:00.000Z').toISOString();
  const breakStartedAt = new Date('2026-07-01T10:00:00.000Z').toISOString();
  companionBridge._handleClockState({
    type: 'CLOCK_STATE',
    clock: {
      active: true,
      on_break: true,
      clocked_in_at: clockedInAt,
      break_started_at: breakStartedAt,
      total_break_ms: 15 * 60000
    }
  });
  await waitForClockWrite();

  const { clockSession } = await chromeMock.storage.local.get('clockSession');
  assert.equal(clockSession.active, true);
  assert.equal(clockSession.onBreak, true);
  assert.equal(clockSession.breakStartedAt, breakStartedAt);
  assert.equal(clockSession.breaks.length, 1);
  const b = clockSession.breaks[0];
  const dur = new Date(b.end).getTime() - new Date(b.start).getTime();
  assert.equal(dur, 15 * 60000, 'synthetic break duration equals total_break_ms');
  assert.equal(sent.length, 0, 'must not echo any message back to the companion');
});

test('CLOCK_STATE is robust to a missing/empty clock payload (yields inactive session)', async () => {
  chromeMock = installChromeMock();
  const sent = [];
  companionBridge.ws = { readyState: 1, send: (data) => sent.push(JSON.parse(data)) };
  companionBridge.connected = true;

  companionBridge._handleClockState({ type: 'CLOCK_STATE', clock: undefined });
  await waitForClockWrite();

  const { clockSession } = await chromeMock.storage.local.get('clockSession');
  assert.ok(clockSession);
  assert.equal(clockSession.active, false);
  assert.equal(clockSession.onBreak, false);
  assert.deepEqual(clockSession.breaks, []);
  assert.equal(sent.length, 0);
});
