// Plan 036 Phase 1 — Smart Idle Engine regression tests.
// Guards: multi-profile sync-race suppression (challenge Resolution 1),
// 3-layer meeting detection (Resolution 2), and the hard-pause primitive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

installChromeMock();
const clock = await import('../src/background/services/clockService.js');

const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

function configure({ tabs = {}, store = {}, companion = null, engine = null } = {}) {
  const chrome = installChromeMock({ tabs, store });
  const deps = {
    getTabData: async () => tabs,
    companionBridge: companion,
  };
  if (engine) {
    deps.getFocusEngine = async () => engine;
    deps.setFocusEngine = async (e) => { Object.assign(engine, e); };
  }
  clock.configureClockService(deps);
  return chrome;
}

test('isUserInMeeting detects a backgrounded, muted meeting tab (all-tab scan)', async () => {
  configure({
    tabs: {
      10: { url: 'https://meet.google.com/abc-defg', audible: false, active: false, title: 'Project sync', openedAt: minsAgo(10) },
      11: { url: 'https://docs.google.com/document/d/1', active: true, openedAt: minsAgo(1) }
    }
  });
  const verdict = await clock.isUserInMeeting();
  assert.equal(verdict.detected, true);
  assert.equal(verdict.source, 'browser');
});

test('isUserInMeeting ignores a STALE meeting tab (forgotten, past grace window)', async () => {
  // Open 3h ago, muted, not the active tab, no call-y title → must NOT suppress
  // idle (otherwise a forgotten Zoom tab disables idle all day).
  configure({
    tabs: { 99: { url: 'https://zoom.us/j/123', audible: false, active: false, title: 'Zoom', openedAt: minsAgo(180) } },
    store: { settings: { meetingIdleGraceMinutes: 60 } }
  });
  const verdict = await clock.isUserInMeeting();
  assert.equal(verdict.detected, false);
});

test('isUserInMeeting still catches a recently-joined muted meeting (within grace)', async () => {
  configure({
    tabs: { 98: { url: 'https://zoom.us/j/123', audible: false, active: false, title: 'Zoom', openedAt: minsAgo(10) } },
    store: { settings: { meetingIdleGraceMinutes: 60 } }
  });
  const verdict = await clock.isUserInMeeting();
  assert.equal(verdict.detected, true);
});

test('isUserInMeeting ignores a brief, non-call landing page', async () => {
  configure({
    tabs: { 12: { url: 'https://zoom.us/pricing', audible: false, active: false, title: 'Plans', openedAt: minsAgo(0) } }
  });
  const verdict = await clock.isUserInMeeting();
  assert.equal(verdict.detected, false);
});

test('isUserInMeeting falls back to the companion app (L3)', async () => {
  configure({
    tabs: {},
    companion: { getActiveApp: () => ({ name: 'Zoom Meeting' }) }
  });
  const verdict = await clock.isUserInMeeting();
  assert.equal(verdict.detected, true);
  assert.equal(verdict.source, 'companion');
});

test('collectIdleSuppressors suppresses when another profile is online+active (sync-race fix)', async () => {
  configure({
    store: { _otherProfiles: [{ online: true, idle_state: 'active', profile_name: 'Work' }] }
  });
  const sup = await clock.collectIdleSuppressors();
  assert.ok(sup.some(s => s.type === 'profile' && s.name === 'Work'));
});

test('collectIdleSuppressors does NOT suppress for an idle remote profile', async () => {
  configure({
    store: { _otherProfiles: [{ online: true, idle_state: 'idle', profile_name: 'Work' }] }
  });
  const sup = await clock.collectIdleSuppressors();
  assert.equal(sup.some(s => s.type === 'profile'), false);
});

test('collectIdleSuppressors suppresses on recent companion activity', async () => {
  configure({
    store: {},
    companion: { isRecentlyActive: () => true, getActiveApp: () => ({ name: 'VS Code' }) }
  });
  const sup = await clock.collectIdleSuppressors();
  assert.ok(sup.some(s => s.type === 'companion' && s.app === 'VS Code'));
});

test('hardPauseActiveFocus pauses the active focus and accrues elapsed', async () => {
  const engine = {
    activeFocusId: 'f1',
    items: { f1: { id: 'f1', focusState: 'active', elapsedMs: 1000, lastResumedAt: minsAgo(1), funnelStage: 'addressing' } }
  };
  configure({ engine });
  const paused = await clock.hardPauseActiveFocus('idle');
  assert.equal(paused, 'f1');
  assert.equal(engine.items.f1.focusState, 'paused');
  assert.ok(engine.items.f1.elapsedMs > 1000); // accrued the ~1 min
  assert.equal(engine.items.f1.lastResumedAt, null);
});
