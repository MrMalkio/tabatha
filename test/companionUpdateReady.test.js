// Workstream D2 — companion UPDATE_READY auto-reload handler.
// Verifies the loop guard (ignore equal/older) and the reload path (newer:
// write breadcrumb + chrome.runtime.reload after a short defer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

const chrome = installChromeMock();

// Augment the mock with the pieces _handleUpdateReady needs: a settable
// manifest version and a reload() spy.
let manifestVersion = '6.4.0';
let reloadCount = 0;
chrome.runtime.getManifest = () => ({ version: manifestVersion });
chrome.runtime.reload = () => { reloadCount += 1; };

const { companionBridge, isVersionNewer } = await import(
  '../src/background/services/companionService.js'
);

function reset(version) {
  manifestVersion = version;
  reloadCount = 0;
  // Clear any breadcrumb from a previous test.
  delete chrome._storage._pendingUpdate;
}

// Synchronous storage write so we can assert the breadcrumb immediately
// (the real handler uses chrome.storage.local.set which is async in the mock;
// the mock's set returns a resolved promise but mutates synchronously enough
// for our purposes since Object.assign runs before the await resolves — to be
// safe we read the underlying store directly).

test('isVersionNewer: strictly-greater semantics', () => {
  assert.equal(isVersionNewer('6.4.0', '6.5.0'), true);
  assert.equal(isVersionNewer('6.4.0', '6.4.1'), true);
  assert.equal(isVersionNewer('6.4.0', '6.4.0'), false);
  assert.equal(isVersionNewer('6.4.0', '6.3.9'), false);
  assert.equal(isVersionNewer('6.4.0', '7.0.0'), true);
});

test('UPDATE_READY with a newer version writes breadcrumb and reloads', async () => {
  reset('6.4.0');
  companionBridge._handleUpdateReady({ type: 'UPDATE_READY', version: '6.5.0', notes: 'fixes' });

  // Breadcrumb written synchronously into the mock store.
  const crumb = chrome._storage._pendingUpdate;
  assert.ok(crumb, 'breadcrumb should be written');
  assert.equal(crumb.from, '6.4.0');
  assert.equal(crumb.to, '6.5.0');
  assert.equal(crumb.notes, 'fixes');

  // Reload is deferred ~1.5s; wait it out.
  assert.equal(reloadCount, 0, 'reload should be deferred, not immediate');
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(reloadCount, 1, 'reload should fire after the defer');
});

test('UPDATE_READY with the same version is ignored (loop guard)', async () => {
  reset('6.5.0');
  companionBridge._handleUpdateReady({ type: 'UPDATE_READY', version: '6.5.0' });
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(reloadCount, 0, 'equal version must not reload');
  assert.equal(chrome._storage._pendingUpdate, undefined, 'no breadcrumb for equal version');
});

test('UPDATE_READY with an older version is ignored', async () => {
  reset('6.5.0');
  companionBridge._handleUpdateReady({ type: 'UPDATE_READY', version: '6.4.0' });
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(reloadCount, 0, 'older version must not reload');
});

test('UPDATE_READY missing version is ignored safely', async () => {
  reset('6.4.0');
  companionBridge._handleUpdateReady({ type: 'UPDATE_READY' });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(reloadCount, 0);
  assert.equal(chrome._storage._pendingUpdate, undefined);
});
