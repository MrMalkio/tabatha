// Regression: Malkio (live, 2026-07-05) — unable to PAUSE or RESUME a live
// focus after the NB-09 merge (1496e9f). This test reproduces the FULL
// background.js dispatch: every service imported in router order, listeners
// registered (simulating MV3 SW module init), then PAUSE_FOCUS / RESUME_FOCUS
// dispatched through the same for-of chain background.js uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

const MIN = 60000;
const minsAgo = (m) => new Date(Date.now() - m * MIN).toISOString();

function liveEngine() {
  return {
    activeFocusId: 'f1',
    items: {
      f1: {
        id: 'f1', label: 'Live focus', focusState: 'active',
        elapsedMs: 5 * MIN, lastResumedAt: minsAgo(20), startedAt: minsAgo(30),
        checkpoint: [], funnelStage: 'addressing'
      }
    },
    history: []
  };
}

const chrome = installChromeMock({
  store: {
    focusEngine: liveEngine(),
    settings: {},
    tabs: {}
  }
});

// ── Import every routed service in background.js's exact order ──
const notificationService = await import('../src/background/services/notificationService.js');
const settingsService = await import('../src/background/services/settingsService.js');
const tabTrackingService = await import('../src/background/services/tabTrackingService.js');
const categoryService = await import('../src/background/services/categoryService.js');
const sessionService = await import('../src/background/services/sessionService.js');
const clockService = await import('../src/background/services/clockService.js');
const clockTickService = await import('../src/background/services/clockTickService.js');
const companionService = await import('../src/background/services/companionService.js');
const taskService = await import('../src/background/services/taskService.js');
const tabService = await import('../src/background/services/tabService.js');
const focusService = await import('../src/background/services/focusService.js');
const groupService = await import('../src/background/services/groupService.js');
const blockgateService = await import('../src/background/services/blockgateService.js');
const calendarService = await import('../src/background/services/calendarService.js');
const alarmService = await import('../src/background/services/alarmService.js');
const syncService = await import('../src/background/services/syncService.js');
const awarenessService = await import('../src/background/services/awarenessService.js');
const autoFocusService = await import('../src/background/services/autoFocusService.js');
const domainHistoryService = await import('../src/background/services/domainHistoryService.js');
const feedbackService = await import('../src/background/services/feedbackService.js');

const services = [
  notificationService, settingsService, tabTrackingService, categoryService,
  sessionService, clockService, clockTickService, companionService,
  taskService, tabService, focusService, groupService, blockgateService,
  calendarService, alarmService, syncService, awarenessService,
  autoFocusService, domainHistoryService, feedbackService
];

// Mirror background.js's onMessage handler.
async function dispatch(message) {
  try {
    for (const service of services) {
      const result = await service.handleMessage?.(message?.type, message, null);
      if (result !== undefined) return result;
    }
    return { error: `Unknown message type: ${message?.type}` };
  } catch (err) {
    return { error: err.message || 'Unknown error' };
  }
}

test('SW init: listener registration (incl. NB-09 heartbeat) does not throw', () => {
  // Simulates the top-level registration calls in background.js.
  focusService.configureFocusService({});
  clockService.configureClockService({
    getFocusEngine: focusService.getFocusEngine,
    setFocusEngine: focusService.setFocusEngine
  });
  assert.doesNotThrow(() => {
    clockService.registerClockServiceListeners();
    focusService.registerFocusServiceAlarms();
  });
});

test('PAUSE_FOCUS through the full router chain pauses the live focus', async () => {
  const res = await dispatch({ type: 'PAUSE_FOCUS', focusId: 'f1' });
  assert.equal(res.error, undefined, `dispatch errored: ${res.error}`);
  const f1 = res.focusEngine?.items?.f1;
  assert.ok(f1, 'expected focusEngine in response');
  assert.equal(f1.focusState, 'paused');
  assert.equal(f1.lastResumedAt, null);
  assert.ok(f1.elapsedMs >= 24 * MIN, `elapsed should accrue the live span, was ${f1.elapsedMs}`);

  const stored = chrome._storage.focusEngine;
  assert.equal(stored.items.f1.focusState, 'paused', 'pause must persist to storage');
});

test('RESUME_FOCUS through the full router chain reactivates the focus', async () => {
  const res = await dispatch({ type: 'RESUME_FOCUS', focusId: 'f1' });
  assert.equal(res.error, undefined, `dispatch errored: ${res.error}`);
  const f1 = res.focusEngine?.items?.f1;
  assert.ok(f1, 'expected focusEngine in response');
  assert.equal(f1.focusState, 'active');
  assert.ok(f1.lastResumedAt, 'lastResumedAt must be set on resume');
  assert.equal(res.focusEngine.activeFocusId, 'f1');
});

test('NB-09: a pending gap _idlePrompt must not block manual PAUSE/RESUME', async () => {
  // The exact live state after an offline-gap retro-pause whose prompt the
  // user never answered (overlay hidden / dismissed): source:'gap' pending.
  chrome._storage._idlePrompt = { id: 'gap_f1_x', focusId: 'f1', ts: Date.now() - 2 * MIN, source: 'gap' };
  chrome._storage.focusEngine.items.f1.pausedReason = 'offline_gap';

  const r1 = await dispatch({ type: 'RESUME_FOCUS', focusId: 'f1' });
  assert.equal(r1.focusEngine.items.f1.focusState, 'active', 'resume must work with a pending gap prompt');

  const r2 = await dispatch({ type: 'PAUSE_FOCUS', focusId: 'f1' });
  assert.equal(r2.focusEngine.items.f1.focusState, 'paused', 'pause must work with a pending gap prompt');
});
