// Plan 036 Phases 2 & 3 — Auto-Focus + drift regression tests.
// Guards: whitelist, decay/cooldown engine (prompt-storm mitigation,
// Resolution 5), explicit auto-create, suggestion surfacing, and the drift
// association hierarchy (Resolution 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

installChromeMock();
const af = await import('../src/background/services/autoFocusService.js');

const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

test('getDomain strips www and parses hostname', () => {
  assert.equal(af.getDomain('https://www.github.com/foo'), 'github.com');
  assert.equal(af.getDomain('not a url'), null);
});

test('isWhitelisted covers browser-internal and local-dev surfaces', () => {
  assert.equal(af.isWhitelisted('chrome://extensions'), true);
  assert.equal(af.isWhitelisted('http://localhost:3000/app'), true);
  assert.equal(af.isWhitelisted('http://127.0.0.1:8080'), true);
  assert.equal(af.isWhitelisted('https://github.com'), false);
  assert.equal(af.isWhitelisted(''), true);
});

test('decay engine escalates cooldown 30→60→120 and reports cooldown window', async () => {
  const chrome = installChromeMock();
  af.configureAutoFocusService({});
  await af.recordDismissal('news.example.com');
  assert.equal(chrome._storage.autoFocusDismissals['news.example.com'].cooldownMinutes, 30);
  assert.equal(await af.isOnCooldown('news.example.com'), true);

  await af.recordDismissal('news.example.com');
  assert.equal(chrome._storage.autoFocusDismissals['news.example.com'].cooldownMinutes, 60);
  await af.recordDismissal('news.example.com');
  assert.equal(chrome._storage.autoFocusDismissals['news.example.com'].cooldownMinutes, 120);
  assert.equal(chrome._storage.autoFocusDismissals['news.example.com'].dismissCount, 3);

  assert.equal(await af.isOnCooldown('never-seen.com'), false);
});

test('explicit URL rule with autoCreateFocus silently starts a focus', async () => {
  let started = null;
  const tabs = { 5: { url: 'https://jira.acme.com/board/42', title: 'Sprint board' } };
  installChromeMock({ tabs, store: { urlRules: [{ pattern: 'jira.acme.com', defaultIntent: 'Sprint work', autoCreateFocus: true }] } });
  af.configureAutoFocusService({
    getFocusEngine: async () => ({ activeFocusId: null, items: {} }),
    getTabData: async () => tabs,
    startFocus: async (label) => { started = label; return { activeFocusId: 'x', items: {} }; }
  });
  await af.evaluateTab(5);
  assert.equal(started, 'Sprint work');
});

test('category match surfaces a high-confidence suggestion chip', async () => {
  const tabs = { 6: { url: 'https://github.com/acme/repo', title: 'acme/repo' } };
  const chrome = installChromeMock({ tabs });
  af.configureAutoFocusService({
    getFocusEngine: async () => ({ activeFocusId: null, items: {} }),
    getTabData: async () => tabs
  });
  await af.evaluateTab(6);
  const sug = chrome._storage._autoFocusSuggestion;
  assert.ok(sug, 'suggestion should be stored');
  assert.equal(sug.confidence, 'high');
  assert.equal(sug.domain, 'github.com');
});

test('a dismissed (on-cooldown) domain does not re-surface a suggestion', async () => {
  const tabs = { 7: { url: 'https://github.com/acme/repo', title: 'acme/repo' } };
  const chrome = installChromeMock({ tabs, store: {
    autoFocusDismissals: { 'github.com': { dismissCount: 1, lastDismissed: new Date().toISOString(), cooldownMinutes: 30 } }
  } });
  af.configureAutoFocusService({
    getFocusEngine: async () => ({ activeFocusId: null, items: {} }),
    getTabData: async () => tabs
  });
  await af.evaluateTab(7);
  assert.equal(chrome._storage._autoFocusSuggestion, undefined);
});

test('drift: associated tab is NOT drift (no wandering armed)', async () => {
  af._setDriftState(null);
  const tabs = { 8: { url: 'https://github.com/acme/repo' } };
  installChromeMock({ tabs });
  const engine = { activeFocusId: 'f1', items: { f1: { id: 'f1', label: 'Code', focusState: 'active', associatedTabIds: [8] } } };
  af.configureAutoFocusService({ getFocusEngine: async () => engine, getTabData: async () => tabs, companionBridge: null });
  await af.evaluateTab(8);
  assert.equal(af._getDriftState(), null);
});

test('drift: unrelated tab enters WANDERING state', async () => {
  af._setDriftState(null);
  const tabs = { 9: { url: 'https://reddit.com/r/all' } };
  installChromeMock({ tabs });
  const engine = { activeFocusId: 'f1', items: { f1: { id: 'f1', label: 'Code', focusState: 'active', associatedTabIds: [] } } };
  af.configureAutoFocusService({ getFocusEngine: async () => engine, getTabData: async () => tabs, companionBridge: null });
  await af.evaluateTab(9);
  const ds = af._getDriftState();
  assert.ok(ds && ds.focusId === 'f1' && ds.drifted === false);
});

test('drift: companion overrule (active in IDE) suppresses wandering', async () => {
  af._setDriftState(null);
  const tabs = { 13: { url: 'https://reddit.com/r/all' } };
  installChromeMock({ tabs });
  const engine = { activeFocusId: 'f1', items: { f1: { id: 'f1', label: 'Code', focusState: 'active', associatedTabIds: [] } } };
  af.configureAutoFocusService({
    getFocusEngine: async () => engine,
    getTabData: async () => tabs,
    companionBridge: { isRecentlyActive: () => true }
  });
  await af.evaluateTab(13);
  assert.equal(af._getDriftState(), null); // anchored by desktop activity
});
