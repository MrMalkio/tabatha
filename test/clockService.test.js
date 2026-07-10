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

// ── NB-09: offline-gap detector ──

const MIN = 60000;

function gapEngine(over = {}) {
  return {
    activeFocusId: 'f1',
    items: {
      f1: {
        id: 'f1', label: 'Deep work', focusState: 'active',
        elapsedMs: 10 * MIN, lastResumedAt: minsAgo(45), startedAt: minsAgo(60),
        checkpoint: [], funnelStage: 'addressing', ...over
      }
    }
  };
}

test('NB-09: checkOfflineGap retro-pauses at the gap start and routes through the idle-prompt machinery exactly once', async () => {
  const engine = gapEngine();
  const lastAlive = Date.now() - 40 * MIN; // resumed 45m ago, heartbeat died 40m ago
  const chrome = configure({
    engine,
    store: { _lastAliveAt: lastAlive, settings: { offlineGapThresholdMinutes: 10 } }
  });
  const sent = [];
  chrome.runtime.sendMessage = async (m) => { sent.push(m); };

  const r1 = await clock.checkOfflineGap('test');
  assert.ok(r1, 'expected a gap verdict');
  assert.equal(r1.trimmed, true);

  const f1 = engine.items.f1;
  assert.equal(f1.focusState, 'paused');
  assert.equal(f1.pausedReason, 'offline_gap');
  assert.equal(f1.lastResumedAt, null);
  // Credited ONLY up to the last heartbeat: 45m resumed − 40m gap = ~5m credit → ~15m stored.
  assert.ok(f1.elapsedMs >= 14.8 * MIN && f1.elapsedMs <= 15.2 * MIN, `elapsed was ${f1.elapsedMs}`);
  // Retro-paused AT the gap start, not at now.
  assert.ok(Math.abs(new Date(f1.pausedAt).getTime() - lastAlive) < 1000, `pausedAt was ${f1.pausedAt}`);
  // System checkpoint starts with "Paused" so remove-last-pause can splice it.
  assert.ok(f1.checkpoint.some(c => c.triggeredBy === 'system' && /^Paused \(offline gap/.test(c.text)), 'expected a Paused checkpoint');

  // Routed through the EXISTING _idlePrompt machinery, exactly once.
  const prompts = sent.filter(m => m?.type === 'IDLE_PROMPT');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].source, 'gap');
  assert.ok(prompts[0].gapMs >= 39.8 * MIN, `gapMs was ${prompts[0].gapMs}`);
  assert.equal(chrome._storage._idlePrompt?.source, 'gap');

  // Heartbeat refreshed — an immediate re-check must not re-detect the gap.
  const r2 = await clock.checkOfflineGap('test');
  assert.equal(r2, null);
  assert.equal(sent.filter(m => m?.type === 'IDLE_PROMPT').length, 1, 'a second prompt must never stack');
});

test('NB-09: checkOfflineGap under threshold or with a paused focus does nothing', async () => {
  // Under threshold.
  let engine = gapEngine();
  configure({ engine, store: { _lastAliveAt: Date.now() - 3 * MIN, settings: { offlineGapThresholdMinutes: 10 } } });
  assert.equal(await clock.checkOfflineGap('test'), null);
  assert.equal(engine.items.f1.focusState, 'active');

  // Paused focus — nothing accruing, nothing to trim.
  engine = gapEngine({ focusState: 'paused', lastResumedAt: null });
  configure({ engine, store: { _lastAliveAt: Date.now() - 40 * MIN, settings: {} } });
  assert.equal(await clock.checkOfflineGap('test'), null);
  assert.equal(engine.items.f1.focusState, 'paused');
});

test('NB-09: active companion during the gap suppresses the auto-trim but still surfaces the prompt as info', async () => {
  const engine = gapEngine();
  const chrome = configure({
    engine,
    store: { _lastAliveAt: Date.now() - 40 * MIN, settings: { offlineGapThresholdMinutes: 10 } },
    companion: { isRecentlyActive: () => true, getActiveApp: () => ({ name: 'VS Code' }) }
  });
  const sent = [];
  chrome.runtime.sendMessage = async (m) => { sent.push(m); };

  const r = await clock.checkOfflineGap('test');
  assert.ok(r, 'expected a gap verdict');
  assert.equal(r.trimmed, false);
  // Focus keeps running — the accrued time is probably legitimate off-Chrome work.
  assert.equal(engine.items.f1.focusState, 'active');
  assert.ok(engine.items.f1.lastResumedAt, 'lastResumedAt must survive a suppressed trim');

  const prompts = sent.filter(m => m?.type === 'IDLE_PROMPT');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].source, 'gap');
  assert.equal(prompts[0].trimmed, false);
  assert.ok(prompts[0].suppressors.some(s => s.type === 'companion'));
});

test('NB-09: a fresh pending _idlePrompt blocks a second gap prompt (single-flight guard)', async () => {
  const engine = gapEngine();
  const chrome = configure({
    engine,
    store: {
      _lastAliveAt: Date.now() - 40 * MIN,
      settings: { offlineGapThresholdMinutes: 10 },
      _idlePrompt: { id: 'idle_x', focusId: 'f1', ts: Date.now() - 2 * MIN }
    }
  });
  const sent = [];
  chrome.runtime.sendMessage = async (m) => { sent.push(m); };

  const r = await clock.checkOfflineGap('test');
  assert.equal(r, null);
  assert.equal(sent.filter(m => m?.type === 'IDLE_PROMPT').length, 0);
  assert.equal(engine.items.f1.focusState, 'active', 'focus untouched while another prompt is pending');
  assert.equal(chrome._storage._idlePrompt.id, 'idle_x', 'pending prompt must not be clobbered');
});

test('NB-09: off-device focuses are exempt from gap retro-pausing', async () => {
  const engine = gapEngine({ offDevice: true });
  configure({ engine, store: { _lastAliveAt: Date.now() - 40 * MIN, settings: {} } });
  assert.equal(await clock.checkOfflineGap('test'), null);
  assert.equal(engine.items.f1.focusState, 'active');
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
