// Regression guards for the 2026-09-23 disk-full outage.
//
// ROOT CAUSE: the machine ran out of disk mid-compaction. LevelDB latched
// "Compaction error: IO error: ... FILE_ERROR_NO_SPACE" as a background error,
// after which EVERY chrome.storage.local write rejected — for 25+ hours —
// while reads kept working. The service worker kept heartbeating and pushing
// its frozen snapshot to the cloud every sync cycle, and every add / resolve /
// pause failed on save. Only reopening the database (extension reload or
// Chrome restart) recovers it; freeing space alone does not.
//
// Guards:
//   1. A disk-full error produces a disk-full notification (actionable copy).
//   2. Below the threshold nothing is probed or reloaded.
//   3. At threshold + age, with disk room (probe write succeeds) → exactly one
//      chrome.runtime.reload(), and a cooldown marker lands in storage.sync.
//   4. If the probe write ALSO fails (disk still full) → no reload.
//   5. Inside the cooldown window → no reload (no loop).
//   6. A successful write resets the failure counter.
//   7. The failure still propagates to callers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

const storage = await import('../src/background/services/storageService.js');
const DISK_FULL = new Error('IO error: 218365.ldb: FILE_ERROR_NO_SPACE (ChromeMethodBFE: 3::WritableFileAppend::8)');

function arm({ probeFails = false, marker = null } = {}) {
  const chrome = installChromeMock();
  const notices = [];
  chrome.notifications = { create: (id, opts) => notices.push({ id, opts }) };
  const reloads = [];
  chrome.runtime.reload = () => reloads.push(Date.now());
  const syncStore = marker ? { [storage.SELF_HEAL_MARKER_KEY]: marker } : {};
  chrome.storage.sync = {
    async get(key) { return { [key]: syncStore[key] }; },
    async set(obj) {
      if (probeFails) throw DISK_FULL;
      Object.assign(syncStore, obj);
    }
  };
  chrome.storage.local.set = async () => { throw DISK_FULL; };

  let now = 1_000_000;
  storage._resetWriteFailureNotice();
  storage._setNowForTests(() => now);
  const advance = (ms) => { now += ms; };
  return { chrome, notices, reloads, syncStore, advance };
}

async function failOnce() {
  await assert.rejects(() => storage.setStorage({ focusEngine: {} }), /NO_SPACE/);
}

test('disk-full write failures notify with disk-full copy and still rethrow', async () => {
  const { notices } = arm();
  await failOnce();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].id, 'tabatha-storage-write-failure');
  assert.match(notices[0].opts.message, /disk is full/i);
  assert.match(notices[0].opts.message, /not saving/i);
  assert.ok(storage.isDiskFullError(DISK_FULL));
  assert.ok(!storage.isDiskFullError(new Error('Resource::kQuotaBytes quota exceeded')));
});

test('below the threshold: no probe, no reload', async () => {
  const { reloads, syncStore, advance } = arm();
  for (let i = 0; i < storage.WRITE_FAILURE_RELOAD_THRESHOLD - 1; i += 1) {
    await failOnce();
    advance(storage.WRITE_FAILURE_RELOAD_MIN_AGE_MS);
  }
  assert.equal(reloads.length, 0);
  assert.equal(Object.keys(syncStore).length, 0, 'sync must not even be probed');
  assert.equal(storage._getWriteFailureState().consecutive, storage.WRITE_FAILURE_RELOAD_THRESHOLD - 1);
});

test('threshold reached with disk room → one reload and a cooldown marker', async () => {
  const { reloads, syncStore, advance } = arm();
  await failOnce();                                  // #1 — starts the clock
  advance(storage.WRITE_FAILURE_RELOAD_MIN_AGE_MS);  // long enough to be real
  await failOnce();                                  // #2
  assert.equal(reloads.length, 0, 'not yet');
  await failOnce();                                  // #3 → heal
  assert.equal(reloads.length, 1, 'exactly one reload');
  assert.ok(syncStore[storage.SELF_HEAL_MARKER_KEY], 'cooldown marker written to storage.sync');
});

test('threshold reached too quickly (burst) → no reload yet', async () => {
  const { reloads } = arm();
  for (let i = 0; i < storage.WRITE_FAILURE_RELOAD_THRESHOLD + 2; i += 1) await failOnce();
  assert.equal(reloads.length, 0, 'a burst inside one minute is not evidence of a poisoned DB');
});

test('probe write also fails (disk still full) → no reload', async () => {
  const { reloads, advance } = arm({ probeFails: true });
  await failOnce(); advance(storage.WRITE_FAILURE_RELOAD_MIN_AGE_MS); await failOnce(); await failOnce();
  assert.equal(reloads.length, 0, 'reloading into a full disk gains nothing');
});

test('inside the cooldown window → no reload (no reload loop)', async () => {
  const { reloads, advance } = arm({ marker: new Date(1_000_000 - 60_000).toISOString() });
  await failOnce(); advance(storage.WRITE_FAILURE_RELOAD_MIN_AGE_MS); await failOnce(); await failOnce();
  assert.equal(reloads.length, 0);
});

test('cooldown expired → reload allowed again', async () => {
  const stale = new Date(1_000_000 - storage.WRITE_FAILURE_RELOAD_COOLDOWN_MS - 1).toISOString();
  const { reloads, advance } = arm({ marker: stale });
  await failOnce(); advance(storage.WRITE_FAILURE_RELOAD_MIN_AGE_MS); await failOnce(); await failOnce();
  assert.equal(reloads.length, 1);
});

test('a successful write resets the failure counter', async () => {
  const { chrome } = arm();
  await failOnce(); await failOnce();
  assert.equal(storage._getWriteFailureState().consecutive, 2);
  chrome.storage.local.set = async () => {};
  await storage.setStorage({ ok: true });
  assert.deepEqual(storage._getWriteFailureState(), { consecutive: 0, firstAt: 0 });
});

test('no storage.sync / no runtime.reload in this browser → degrades to notify-only', async () => {
  const { chrome, reloads, advance } = arm();
  delete chrome.storage.sync;
  await failOnce(); advance(storage.WRITE_FAILURE_RELOAD_MIN_AGE_MS); await failOnce(); await failOnce();
  assert.equal(reloads.length, 0);
});
