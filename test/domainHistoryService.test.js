// Plan 038 Phase 1 — persistent domain store regression tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

installChromeMock();
const dh = await import('../src/background/services/domainHistoryService.js');

test('recordDomainVisit creates an entry with normalised domain + path', async () => {
  const chrome = installChromeMock();
  await dh.recordDomainVisit('https://www.github.com/acme/repo', 'Coding');
  const entry = chrome._storage.domainHistory['github.com'];
  assert.ok(entry);
  assert.equal(entry.visitCount, 1);
  assert.deepEqual(entry.paths, ['/acme/repo']);
  assert.deepEqual(entry.observedIntents, ['Coding']);
  assert.equal(entry.status, 'active');
});

test('repeat visits increment count and dedupe paths', async () => {
  const chrome = installChromeMock();
  await dh.recordDomainVisit('https://github.com/a');
  await dh.recordDomainVisit('https://github.com/a'); // same path
  await dh.recordDomainVisit('https://github.com/b'); // new path
  const entry = chrome._storage.domainHistory['github.com'];
  assert.equal(entry.visitCount, 3);
  assert.deepEqual(entry.paths.sort(), ['/a', '/b']);
});

test('browser-internal URLs are not recorded', async () => {
  const chrome = installChromeMock();
  await dh.recordDomainVisit('chrome://extensions');
  await dh.recordDomainVisit('devtools://devtools/bundled');
  assert.deepEqual(chrome._storage.domainHistory || {}, {});
});

test('LRU cap evicts the least-recently-seen domain', async () => {
  const chrome = installChromeMock({ store: { settings: { domainHistoryMaxDomains: 2 } } });
  await dh.recordDomainVisit('https://a.com/');
  await new Promise(r => setTimeout(r, 5));
  await dh.recordDomainVisit('https://b.com/');
  await new Promise(r => setTimeout(r, 5));
  await dh.recordDomainVisit('https://c.com/'); // should evict a.com
  const keys = Object.keys(chrome._storage.domainHistory);
  assert.equal(keys.length, 2);
  assert.equal(keys.includes('a.com'), false);
  assert.equal(keys.includes('c.com'), true);
});

test('DISMISS_DOMAIN / TARGET_DOMAIN / RESTORE_DOMAIN update status', async () => {
  const chrome = installChromeMock();
  await dh.recordDomainVisit('https://news.com/');
  await dh.handleMessage('DISMISS_DOMAIN', { domain: 'news.com' });
  assert.equal(chrome._storage.domainHistory['news.com'].status, 'dismissed');
  await dh.handleMessage('TARGET_DOMAIN', { domain: 'news.com' });
  assert.equal(chrome._storage.domainHistory['news.com'].status, 'targeted');
  await dh.handleMessage('RESTORE_DOMAIN', { domain: 'news.com' });
  assert.equal(chrome._storage.domainHistory['news.com'].status, 'active');
});

test('GET_DOMAIN_HISTORY returns the stored domains; CLEAR empties them', async () => {
  const chrome = installChromeMock();
  await dh.recordDomainVisit('https://x.com/');
  await dh.recordDomainVisit('https://y.com/');
  const res = await dh.handleMessage('GET_DOMAIN_HISTORY', {});
  assert.equal(res.domains.length, 2);
  await dh.handleMessage('CLEAR_DOMAIN_HISTORY', {});
  const res2 = await dh.handleMessage('GET_DOMAIN_HISTORY', {});
  assert.equal(res2.domains.length, 0);
});

test('dismissed domains still accrue visits (so targeting later has data)', async () => {
  const chrome = installChromeMock();
  await dh.recordDomainVisit('https://z.com/');
  await dh.handleMessage('DISMISS_DOMAIN', { domain: 'z.com' });
  await dh.recordDomainVisit('https://z.com/page2');
  const entry = chrome._storage.domainHistory['z.com'];
  assert.equal(entry.visitCount, 2);
  assert.equal(entry.status, 'dismissed'); // status preserved across visits
});
