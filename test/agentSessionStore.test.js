// Cortex C11a (Plan 044 T2) — pure agent-session span store (TDD: written first).
// Controller spans mark a tab / window / whole machine as agent-driven so the
// observations ledger can stamp `controller: 'ai-agent'`. No chrome/DOM deps.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openSession,
  closeSession,
  findActiveSession,
  isAgentSpanActive,
  pruneExpired,
  openSessions
} from '../src/utils/agentSessionStore.js';

const T0 = Date.parse('2026-07-10T14:00:00.000Z');

test('openSession appends a span with id, startedAt, open end, and manual source by default', () => {
  const out = openSession([], { scope: 'machine', now: T0 });
  assert.equal(out.length, 1);
  const s = out[0];
  assert.ok(s.id.startsWith('agsess_'));
  assert.equal(s.scope, 'machine');
  assert.equal(s.endedAt, null);
  assert.equal(s.source, 'manual');
  assert.equal(s.supervising, false);
  assert.equal(s.startedAt, new Date(T0).toISOString());
});

test('openSession honours source: announced', () => {
  const [s] = openSession([], { scope: 'tab', tabId: 7, source: 'announced', agentName: 'playwright', now: T0 });
  assert.equal(s.source, 'announced');
  assert.equal(s.agentName, 'playwright');
});

test('openSession with tab scope carries tabId and null windowId', () => {
  const [s] = openSession([], { scope: 'tab', tabId: 42, windowId: 9, now: T0 });
  assert.equal(s.tabId, 42);
  assert.equal(s.windowId, null);
});

test('openSession with window scope carries windowId and null tabId', () => {
  const [s] = openSession([], { scope: 'window', tabId: 42, windowId: 9, now: T0 });
  assert.equal(s.windowId, 9);
  assert.equal(s.tabId, null);
});

test('openSession with machine scope has null tabId and windowId', () => {
  const [s] = openSession([], { scope: 'machine', tabId: 42, windowId: 9, now: T0 });
  assert.equal(s.tabId, null);
  assert.equal(s.windowId, null);
});

test('openSession enforces a FIFO cap', () => {
  let list = [];
  for (let i = 0; i < 5; i++) list = openSession(list, { scope: 'machine', now: T0 + i, cap: 3 });
  assert.equal(list.length, 3);
  // Oldest dropped, newest kept
  assert.equal(list[list.length - 1].startedAt, new Date(T0 + 4).toISOString());
});

test('closeSession stamps endedAt on the matching span and leaves others', () => {
  const opened = openSession(openSession([], { scope: 'machine', id: 'a', now: T0 }), { scope: 'tab', tabId: 1, id: 'b', now: T0 });
  const out = closeSession(opened, 'a', T0 + 1000);
  assert.equal(out.find((s) => s.id === 'a').endedAt, new Date(T0 + 1000).toISOString());
  assert.equal(out.find((s) => s.id === 'b').endedAt, null);
});

test('closeSession is a no-op for an unknown or already-closed id', () => {
  const opened = openSession([], { scope: 'machine', id: 'a', now: T0 });
  const closed = closeSession(opened, 'a', T0 + 1000);
  const again = closeSession(closed, 'a', T0 + 5000);
  assert.equal(again.find((s) => s.id === 'a').endedAt, new Date(T0 + 1000).toISOString());
  const unknown = closeSession(opened, 'zzz', T0 + 1000);
  assert.equal(unknown.find((s) => s.id === 'a').endedAt, null);
});

test('findActiveSession matches a tab-scoped span by tabId', () => {
  const list = openSession([], { scope: 'tab', tabId: 5, now: T0 });
  assert.equal(findActiveSession(list, { tabId: 5, now: T0 + 1 })?.scope, 'tab');
  assert.equal(findActiveSession(list, { tabId: 6, now: T0 + 1 }), null);
});

test('findActiveSession applies scope priority tab > window > machine', () => {
  let list = [];
  list = openSession(list, { scope: 'machine', id: 'm', now: T0 });
  list = openSession(list, { scope: 'window', windowId: 3, id: 'w', now: T0 + 1 });
  list = openSession(list, { scope: 'tab', tabId: 8, id: 't', now: T0 + 2 });
  assert.equal(findActiveSession(list, { tabId: 8, windowId: 3, now: T0 + 3 }).id, 't');
  assert.equal(findActiveSession(list, { tabId: 99, windowId: 3, now: T0 + 3 }).id, 'w');
  assert.equal(findActiveSession(list, { tabId: 99, windowId: 99, now: T0 + 3 }).id, 'm');
});

test('a machine-scoped span matches any tab/window', () => {
  const list = openSession([], { scope: 'machine', now: T0 });
  assert.ok(findActiveSession(list, { tabId: 1234, windowId: 5678, now: T0 + 1 }));
  assert.ok(isAgentSpanActive(list, { tabId: 1234, at: T0 + 1 }));
});

test('findActiveSession ignores closed spans', () => {
  let list = openSession([], { scope: 'machine', id: 'm', now: T0 });
  list = closeSession(list, 'm', T0 + 100);
  assert.equal(findActiveSession(list, { tabId: 1, now: T0 + 200 }), null);
  assert.equal(isAgentSpanActive(list, { tabId: 1, at: T0 + 200 }), false);
});

test('isAgentSpanActive returns false for an empty/None store', () => {
  assert.equal(isAgentSpanActive([], { tabId: 1, at: T0 }), false);
  assert.equal(isAgentSpanActive(null, { tabId: 1, at: T0 }), false);
});

test('pruneExpired closes spans past their autoExpiresAt', () => {
  const list = openSession([], { scope: 'machine', autoExpiresAt: new Date(T0 + 1000).toISOString(), now: T0 });
  const before = pruneExpired(list, T0 + 500);
  assert.equal(before[0].endedAt, null);
  const after = pruneExpired(list, T0 + 2000);
  assert.equal(after[0].endedAt, new Date(T0 + 1000).toISOString());
});

test('an auto-expired span is not active past its expiry', () => {
  const list = openSession([], { scope: 'tab', tabId: 3, autoExpiresAt: new Date(T0 + 1000).toISOString(), now: T0 });
  assert.ok(isAgentSpanActive(list, { tabId: 3, at: T0 + 500 }));
  assert.equal(isAgentSpanActive(list, { tabId: 3, at: T0 + 1500 }), false);
});

test('openSessions lists only currently-open spans', () => {
  let list = openSession([], { scope: 'machine', id: 'm', now: T0 });
  list = openSession(list, { scope: 'tab', tabId: 1, id: 't', now: T0 + 1 });
  list = closeSession(list, 't', T0 + 2);
  const open = openSessions(list, T0 + 3);
  assert.equal(open.length, 1);
  assert.equal(open[0].id, 'm');
});
