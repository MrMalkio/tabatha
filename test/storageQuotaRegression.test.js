// Regression guards for the 2026-07-05 pause/resume outage.
//
// ROOT CAUSE: chrome.storage.local was pinned at its 10MB QUOTA_BYTES cap
// (manifest lacked "unlimitedStorage"). Every byte-adding write — including
// PAUSE_FOCUS / RESUME_FOCUS persisting the focusEngine — rejected with
// "Resource::kQuotaBytes quota exceeded". Reads kept working and in-memory
// state kept ticking, so the extension LOOKED alive while every state
// mutation silently died (the UI swallows {error} responses).
//
// Guards:
//   1. manifest lint — "unlimitedStorage" must stay in permissions.
//   2. setStorage must surface write failures (console + notification) and
//      still rethrow, throttled so a wedged install doesn't notification-spam.
//   3. The full router chain must return {error} (not hang / not crash) when
//      storage writes fail, mirroring background.js behavior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { installChromeMock } from '../testutils/chromeMock.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('manifest keeps the unlimitedStorage permission (10MB-cap outage guard)', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'public', 'manifest.json'), 'utf8'));
  assert.ok(
    manifest.permissions.includes('unlimitedStorage'),
    'public/manifest.json must declare "unlimitedStorage" — without it chrome.storage.local ' +
    'caps at 10MB and, once pinned at the cap, EVERY write (pause/resume/clock/edits) fails silently'
  );
  assert.ok(manifest.permissions.includes('storage'), 'storage permission must also remain');
});

test('setStorage surfaces write failures loudly and rethrows', async () => {
  const chrome = installChromeMock();
  const quotaError = new Error('Resource::kQuotaBytes quota exceeded');
  chrome.storage.local.set = async () => { throw quotaError; };
  const notices = [];
  chrome.notifications = { create: (id, opts) => notices.push({ id, opts }) };
  chrome.runtime.getURL = (p) => p;

  const storage = await import('../src/background/services/storageService.js');
  storage._resetWriteFailureNotice();

  await assert.rejects(
    () => storage.setStorage({ focusEngine: {} }),
    /quota exceeded/,
    'the failure must still propagate to callers (router turns it into {error})'
  );
  assert.equal(notices.length, 1, 'a user-visible notification must fire');
  assert.equal(notices[0].id, 'tabatha-storage-write-failure');
  assert.match(notices[0].opts.message, /not saving/i);

  // Throttled: an immediate second failure must not re-notify.
  await assert.rejects(() => storage.setStorage({ focusEngine: {} }), /quota exceeded/);
  assert.equal(notices.length, 1, 'notice must be throttled (max 1 per 10 min)');
});

test('PAUSE_FOCUS through focusService returns an error (not silence) when storage writes fail', async () => {
  const MIN = 60000;
  const chrome = installChromeMock({
    store: {
      focusEngine: {
        activeFocusId: 'f1',
        items: {
          f1: {
            id: 'f1', label: 'Live', focusState: 'active', elapsedMs: 5 * MIN,
            lastResumedAt: new Date(Date.now() - 20 * MIN).toISOString(),
            startedAt: new Date(Date.now() - 30 * MIN).toISOString(),
            checkpoint: [], funnelStage: 'addressing'
          }
        },
        history: []
      }
    }
  });
  chrome.notifications = { create: () => {} };
  chrome.runtime.getURL = (p) => p;

  // Real chrome.storage returns deep-serialized copies; the shared mock returns
  // live references, which would let in-memory mutations masquerade as persisted
  // state. Clone on read so "persisted" means persisted.
  const rawGet = chrome.storage.local.get.bind(chrome.storage.local);
  chrome.storage.local.get = async (keys) => structuredClone(await rawGet(keys));

  const storage = await import('../src/background/services/storageService.js');
  storage._resetWriteFailureNotice();
  const focusService = await import('../src/background/services/focusService.js');

  // Simulate the pinned-at-quota state: reads fine, writes reject.
  chrome.storage.local.set = async () => { throw new Error('Resource::kQuotaBytes quota exceeded'); };

  // Mirror background.js's router try/catch.
  let result;
  try {
    result = await focusService.handleMessage('PAUSE_FOCUS', { type: 'PAUSE_FOCUS', focusId: 'f1' });
  } catch (err) {
    result = { error: err.message };
  }
  assert.match(result.error || '', /quota exceeded/, 'the quota failure must surface as an error, never a fake success');

  // And the stored state must be unchanged (still active) — matching the live symptom.
  const { focusEngine } = await chrome.storage.local.get('focusEngine');
  assert.equal(focusEngine.items.f1.focusState, 'active');
});
