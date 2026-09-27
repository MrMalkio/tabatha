// 6.7.88 — updateService: channel probes, persisted updateStatus, APPLY_UPDATE
// outcomes, and the sign-in nudge service's badge / notification wiring.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

let chrome;
let fetchRoutes;
let reloads;

function setup({ installType = 'admin', version = '6.7.83', updateCheck = { status: 'no_update' }, store = {}, badgeText = '' } = {}) {
  chrome = installChromeMock({ store });
  reloads = 0;
  chrome.runtime.id = 'jbdkacccpknbiphigeabcdojemnhacjj';
  chrome.runtime.getManifest = () => ({ version, action: { default_title: 'Tabatha — Quick Switch' } });
  chrome.runtime.getURL = (p) => `chrome-extension://self/${p}`;
  chrome.runtime.reload = () => { reloads += 1; };
  chrome.runtime.requestUpdateCheck = async () => (typeof updateCheck === 'function' ? updateCheck() : updateCheck);
  chrome.runtime.onUpdateAvailable = { addListener() {} };
  chrome.management = { async getSelf() { return { installType, updateUrl: null }; } };
  chrome.alarms.get = async () => null;
  chrome.action._badge = badgeText;
  chrome.action._title = null;
  chrome.action.getBadgeText = async () => chrome.action._badge;
  chrome.action.setBadgeText = async ({ text }) => { chrome.action._badge = text; };
  chrome.action.setBadgeBackgroundColor = async () => {};
  chrome.action.setBadgeTextColor = async () => {};
  chrome.action.setTitle = async ({ title }) => { chrome.action._title = title; };
  chrome.notifications._created = [];
  chrome.notifications._cleared = [];
  chrome.notifications.create = (id, opts) => { chrome.notifications._created.push({ id, opts }); };
  chrome.notifications.clear = (id) => { chrome.notifications._cleared.push(id); };
  fetchRoutes = {};
  globalThis.fetch = async (url) => {
    const route = fetchRoutes[url];
    if (!route) return { ok: false, status: 404, async text() { return ''; }, async json() { return {}; } };
    if (route instanceof Error) throw route;
    return {
      ok: true,
      status: 200,
      async text() { return typeof route === 'string' ? route : JSON.stringify(route); },
      async json() { return typeof route === 'string' ? JSON.parse(route) : route; }
    };
  };
  return chrome;
}

const xmlFor = (v) => `<?xml version='1.0' encoding='UTF-8'?><gupdate><app appid='jbdkacccpknbiphigeabcdojemnhacjj'><updatecheck codebase='x' version='${v}' /></app></gupdate>`;
const XML_URL = 'https://tabatha.pondocean.co/enterprise/update.xml';
const LATEST_URL = 'https://raw.githubusercontent.com/MrMalkio/tabatha/update-channel/latest.json';

setup();
const svc = await import('../src/background/services/updateService.js');
const nudge = await import('../src/background/services/signInNudgeService.js');

beforeEach(() => setup());

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── checkForUpdate ─────────────────────────────────────────────────
test('admin: throttled Chrome check still learns the published version from update.xml', async () => {
  setup({ installType: 'admin', version: '6.7.83', updateCheck: { status: 'throttled' } });
  fetchRoutes[XML_URL] = xmlFor('6.7.87');
  const s = await svc.checkForUpdate({ force: true });
  assert.equal(s.installType, 'admin');
  assert.equal(s.publishedVersion, '6.7.87');
  assert.equal(s.lastResult, 'throttled');
  assert.equal(chrome._storage.updateStatus.publishedVersion, '6.7.87');
  assert.match(s.source, /chrome/);
  assert.match(s.source, /update\.xml/);
});

test('admin: no_update from Chrome but newer XML → published_not_downloaded', async () => {
  setup({ installType: 'admin', version: '6.7.83', updateCheck: { status: 'no_update' } });
  fetchRoutes[XML_URL] = xmlFor('6.7.87');
  const s = await svc.checkForUpdate({ force: true });
  assert.equal(s.lastResult, 'published_not_downloaded');
});

test('admin: up to date → no_update, published cleared', async () => {
  setup({ installType: 'admin', version: '6.7.87', store: { updateStatus: { publishedVersion: '6.7.87' } } });
  fetchRoutes[XML_URL] = xmlFor('6.7.87');
  const s = await svc.checkForUpdate({ force: true });
  assert.equal(s.lastResult, 'no_update');
  assert.equal(s.publishedVersion, null);
});

test('store (normal): never fetches the enterprise XML', async () => {
  setup({ installType: 'normal', version: '6.7.83', updateCheck: { status: 'update_available', version: '6.7.87' } });
  let xmlFetched = false;
  fetchRoutes[XML_URL] = xmlFor('9.9.9');
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, o) => { if (url === XML_URL) xmlFetched = true; return orig(url, o); };
  const s = await svc.checkForUpdate({ force: true });
  assert.equal(xmlFetched, false);
  assert.equal(s.publishedVersion, '6.7.87');
  assert.equal(s.lastResult, 'update_available');
});

test('staff (development): newer files already on disk → ready', async () => {
  setup({ installType: 'development', version: '6.7.83' });
  fetchRoutes[LATEST_URL] = { version: '6.7.87', zipUrl: 'z', sha256: 'h' };
  fetchRoutes['chrome-extension://self/manifest.json'] = { version: '6.7.87' };
  const s = await svc.checkForUpdate({ force: true });
  assert.equal(s.diskVersion, '6.7.87');
  assert.equal(s.publishedVersion, '6.7.87');
  assert.equal(s.lastResult, 'ready');
});

test('staff: published but not swapped yet → published_not_downloaded', async () => {
  setup({ installType: 'development', version: '6.7.83' });
  fetchRoutes[LATEST_URL] = { version: '6.7.87' };
  fetchRoutes['chrome-extension://self/manifest.json'] = { version: '6.7.83' };
  const s = await svc.checkForUpdate({ force: true });
  assert.equal(s.diskVersion, null);
  assert.equal(s.lastResult, 'published_not_downloaded');
});

test('a failed channel fetch keeps the previously learned published version', async () => {
  setup({ installType: 'development', version: '6.7.83', store: { updateStatus: { publishedVersion: '6.7.87' } } });
  fetchRoutes[LATEST_URL] = new Error('offline');
  const s = await svc.checkForUpdate({ force: true });
  assert.equal(s.publishedVersion, '6.7.87');
});

test('automatic checks are rate-limited; forced checks are not', async () => {
  setup({ installType: 'admin', version: '6.7.83', store: { updateStatus: { installType: 'admin', lastCheckedAt: Date.now() } } });
  let calls = 0;
  chrome.runtime.requestUpdateCheck = async () => { calls += 1; return { status: 'no_update' }; };
  const skipped = await svc.checkForUpdate();
  assert.equal(skipped.skipped, true);
  assert.equal(calls, 0);
  await svc.checkForUpdate({ force: true });
  assert.equal(calls, 1);
});

// ── APPLY_UPDATE ───────────────────────────────────────────────────
test('APPLY_UPDATE reloads straight away when an update is ready', async () => {
  setup({ installType: 'admin', version: '6.7.83', store: { updateStatus: { readyVersion: '6.7.87' } } });
  const res = await svc.handleMessage('APPLY_UPDATE');
  assert.equal(res.ok, true);
  assert.equal(res.action, 'reloading');
  await wait(400);
  assert.equal(reloads, 1);
});

test('APPLY_UPDATE: update_available then onUpdateAvailable → reload', async () => {
  setup({ installType: 'admin', version: '6.7.83', updateCheck: { status: 'update_available', version: '6.7.87' } });
  setTimeout(() => { svc.markUpdateReady('6.7.87'); }, 30);
  const res = await svc.applyUpdate({ waitMs: 2000 });
  assert.equal(res.action, 'reloading');
  await wait(400);
  assert.ok(reloads >= 1);
});

test('APPLY_UPDATE: still downloading → "downloading", and reloads when it lands', async () => {
  setup({ installType: 'admin', version: '6.7.83', updateCheck: { status: 'update_available', version: '6.7.87' } });
  const res = await svc.applyUpdate({ waitMs: 20 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'downloading');
  assert.equal(chrome._storage.updateStatus.pendingApply.version, '6.7.87');
  await svc.markUpdateReady('6.7.87');
  await wait(400);
  assert.equal(reloads, 1);
});

test('APPLY_UPDATE: throttled → clear reason, no reload, one Chrome check only', async () => {
  setup({ installType: 'admin', version: '6.7.83' });
  let calls = 0;
  chrome.runtime.requestUpdateCheck = async () => { calls += 1; return { status: 'throttled' }; };
  fetchRoutes[XML_URL] = xmlFor('6.7.87');
  const res = await svc.applyUpdate();
  assert.equal(res.reason, 'throttled');
  assert.equal(res.version, '6.7.87');
  assert.equal(calls, 1);
  await wait(400);
  assert.equal(reloads, 0);
});

test('APPLY_UPDATE: Chrome says no_update but XML is newer → published_not_downloaded', async () => {
  setup({ installType: 'admin', version: '6.7.83', updateCheck: { status: 'no_update' } });
  fetchRoutes[XML_URL] = xmlFor('6.7.87');
  const res = await svc.applyUpdate();
  assert.equal(res.reason, 'published_not_downloaded');
  assert.equal(res.version, '6.7.87');
});

test('APPLY_UPDATE: nothing newer anywhere → no_update', async () => {
  setup({ installType: 'admin', version: '6.7.87', updateCheck: { status: 'no_update' } });
  fetchRoutes[XML_URL] = xmlFor('6.7.87');
  const res = await svc.applyUpdate();
  assert.equal(res.reason, 'no_update');
});

test('APPLY_UPDATE (staff): newer manifest on disk → reload', async () => {
  setup({ installType: 'development', version: '6.7.83' });
  fetchRoutes['chrome-extension://self/manifest.json'] = { version: '6.7.87' };
  const res = await svc.applyUpdate();
  assert.equal(res.action, 'reloading');
  await wait(400);
  assert.equal(reloads, 1);
});

test('unknown messages fall through', async () => {
  assert.equal(await svc.handleMessage('SOMETHING_ELSE'), undefined);
});

// ── sign-in nudge service ──────────────────────────────────────────
function fakeSupabase(signedIn) {
  return { auth: { async getSession() { return { data: { session: signedIn ? { user: { id: 'u' } } : null } }; } } };
}

test('nudge: Workspace + signed out → state, amber badge, tooltip, notification', async () => {
  setup({ installType: 'admin' });
  nudge.configureSignInNudgeService({ supabase: fakeSupabase(false) });
  const hour = new Date().getHours();
  const state = await nudge.evaluateSignInNudge({ notify: true });
  assert.equal(state.workspace, true);
  assert.equal(state.signedIn, false);
  assert.equal(chrome._storage.signInNudgeState.signedIn, false);
  assert.equal(chrome.action._badge, '!');
  assert.equal(chrome.action._title, 'Sign in to Tabatha');
  const inHours = hour >= 8 && hour < 20;
  assert.equal(chrome.notifications._created.length, inHours ? 1 : 0);
});

test('nudge: never clobbers an active badge (tooltip only)', async () => {
  setup({ installType: 'admin', badgeText: '25m' });
  nudge.configureSignInNudgeService({ supabase: fakeSupabase(false) });
  await nudge.evaluateSignInNudge();
  assert.equal(chrome.action._badge, '25m');
  assert.equal(chrome.action._title, 'Sign in to Tabatha');
});

test('nudge: AUTH_STATE_CHANGED sign-in clears badge + notification immediately and is not consumed', async () => {
  setup({ installType: 'admin', badgeText: '!' });
  nudge.configureSignInNudgeService({ supabase: fakeSupabase(false) });
  const res = await nudge.handleMessage('AUTH_STATE_CHANGED', { hasSession: true });
  assert.equal(res, undefined); // cloudWriteService still owns the reply
  await nudge.evaluateSignInNudge({ signedInHint: true });
  assert.equal(chrome.action._badge, '');
  assert.equal(chrome.action._title, 'Tabatha — Quick Switch');
  assert.ok(chrome.notifications._cleared.includes('signin-reminder'));
  assert.equal(chrome._storage.signInNudgeState.signedIn, true);
});

test('nudge: non-Workspace installs get nothing', async () => {
  setup({ installType: 'normal' });
  nudge.configureSignInNudgeService({ supabase: fakeSupabase(false) });
  const state = await nudge.evaluateSignInNudge({ notify: true });
  assert.equal(state.workspace, false);
  assert.equal(chrome.action._badge, '');
  assert.equal(chrome.action._title, null);
  assert.equal(chrome.notifications._created.length, 0);
});

test('nudge: notification respects the 3-hour spacing', async () => {
  const hour = new Date().getHours();
  if (hour < 8 || hour >= 20) return; // outside notify hours: covered by pure tests
  setup({ installType: 'admin', store: { signInNudgeLastNotifiedAt: Date.now() - 60 * 60 * 1000 } });
  nudge.configureSignInNudgeService({ supabase: fakeSupabase(false) });
  await nudge.evaluateSignInNudge({ notify: true });
  assert.equal(chrome.notifications._created.length, 0);
});
