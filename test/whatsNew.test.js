// FIX-11 — "What's New" decision + seed/mark-seen behaviour.
// Verifies:
//   • newer version → show once, and marks _lastSeenVersion on dismiss
//   • fresh install (no _lastSeenVersion) → seed silently, no modal
//   • same (or older) stored version → no-op
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeStore } from '../testutils/chromeMock.js';

const chrome = installChromeMock();

const { decideWhatsNew, LAST_SEEN_KEY } = await import('../src/hooks/useWhatsNew.js');

// ── Pure decision function ────────────────────────────────────────────────

test('decideWhatsNew: newer running version → show', () => {
  assert.deepEqual(
    decideWhatsNew({ current: '6.5.0', lastSeen: '6.4.0' }),
    { action: 'show', version: '6.5.0' }
  );
});

test('decideWhatsNew: fresh install (no lastSeen) → seed, no modal', () => {
  assert.deepEqual(
    decideWhatsNew({ current: '6.5.0', lastSeen: undefined }),
    { action: 'seed', version: '6.5.0' }
  );
  // empty-string / null are also treated as "never seen"
  assert.equal(decideWhatsNew({ current: '6.5.0', lastSeen: '' }).action, 'seed');
  assert.equal(decideWhatsNew({ current: '6.5.0', lastSeen: null }).action, 'seed');
});

test('decideWhatsNew: same version → noop', () => {
  assert.deepEqual(
    decideWhatsNew({ current: '6.4.0', lastSeen: '6.4.0' }),
    { action: 'noop' }
  );
});

test('decideWhatsNew: older running version → noop (never regress)', () => {
  assert.deepEqual(
    decideWhatsNew({ current: '6.3.0', lastSeen: '6.4.0' }),
    { action: 'noop' }
  );
});

test('decideWhatsNew: missing current → noop', () => {
  assert.equal(decideWhatsNew({ current: null, lastSeen: '6.4.0' }).action, 'noop');
});

// ── Storage side-effects (mirrors the hook's effect using the chrome mock) ──
// The hook wires decideWhatsNew to chrome.storage.local; here we replay that
// wiring against the in-memory mock to prove the seed/mark-seen writes land.

async function runDecisionFlow(current) {
  const stored = await chrome.storage.local.get(LAST_SEEN_KEY);
  const decision = decideWhatsNew({ current, lastSeen: stored[LAST_SEEN_KEY] });
  if (decision.action === 'seed') {
    await chrome.storage.local.set({ [LAST_SEEN_KEY]: decision.version });
  }
  return decision;
}

// Simulate the hook's dismiss(): mark the current version as seen.
async function dismiss(current) {
  await chrome.storage.local.set({ [LAST_SEEN_KEY]: current });
}

test('fresh install seeds _lastSeenVersion silently and shows nothing', async () => {
  resetChromeStore(chrome, {});
  const decision = await runDecisionFlow('6.4.0');
  assert.equal(decision.action, 'seed');
  const after = await chrome.storage.local.get(LAST_SEEN_KEY);
  assert.equal(after[LAST_SEEN_KEY], '6.4.0', 'seeded to current version');
});

test('newer version shows once, then dismiss marks it seen and it no-ops after', async () => {
  resetChromeStore(chrome, { [LAST_SEEN_KEY]: '6.4.0' });

  // First run on the new version → show.
  const first = await runDecisionFlow('6.5.0');
  assert.equal(first.action, 'show');
  assert.equal(first.version, '6.5.0');

  // storage not yet updated (show does not seed).
  let s = await chrome.storage.local.get(LAST_SEEN_KEY);
  assert.equal(s[LAST_SEEN_KEY], '6.4.0');

  // User dismisses → marked seen.
  await dismiss('6.5.0');
  s = await chrome.storage.local.get(LAST_SEEN_KEY);
  assert.equal(s[LAST_SEEN_KEY], '6.5.0');

  // Second run on the same version → no-op (does not re-show).
  const second = await runDecisionFlow('6.5.0');
  assert.equal(second.action, 'noop');
});

test('same version is a no-op with no storage write', async () => {
  resetChromeStore(chrome, { [LAST_SEEN_KEY]: '6.4.0' });
  const decision = await runDecisionFlow('6.4.0');
  assert.equal(decision.action, 'noop');
  const s = await chrome.storage.local.get(LAST_SEEN_KEY);
  assert.equal(s[LAST_SEEN_KEY], '6.4.0', 'unchanged');
});
