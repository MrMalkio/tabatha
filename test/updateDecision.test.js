// 6.7.88 — "New version available": semver compare + update-state decisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isVersionNewer } from '../src/utils/semver.js';
import {
  channelForInstallType,
  usesChromeUpdater,
  shouldFetchEnterpriseXml,
  parseUpdateXmlVersion,
  parseLatestJsonVersion,
  normalizeUpdateStatus,
  availableUpdate,
  decideUpdateBanner,
  decideApplyAction,
  describeUpdateResult,
  isSnoozed,
  makeSnooze,
  shouldAutoApplyOnIdle,
  UPDATE_SNOOZE_MS
} from '../src/utils/updateDecision.js';

// ── compareVersions ────────────────────────────────────────────────
test('compareVersions orders numerically, not lexically', () => {
  assert.equal(compareVersions('6.7.88', '6.7.87'), 1);
  assert.equal(compareVersions('6.7.87', '6.7.88'), -1);
  assert.equal(compareVersions('6.7.10', '6.7.9'), 1);
  assert.equal(compareVersions('6.10.0', '6.9.99'), 1);
  assert.equal(compareVersions('7.0.0', '6.99.99'), 1);
});

test('compareVersions treats missing trailing parts as zero', () => {
  assert.equal(compareVersions('6.7', '6.7.0'), 0);
  assert.equal(compareVersions('6.7.0.1', '6.7'), 1);
});

test('compareVersions: missing versions sort lowest, never "newer"', () => {
  assert.equal(compareVersions(null, '6.7.87'), -1);
  assert.equal(compareVersions('6.7.87', undefined), 1);
  assert.equal(compareVersions('', null), 0);
  assert.equal(isVersionNewer('6.7.87', null), false);
});

// ── channels ───────────────────────────────────────────────────────
test('channelForInstallType labels every install channel', () => {
  assert.equal(channelForInstallType('admin').label, 'Workspace');
  assert.equal(channelForInstallType('normal').label, 'Chrome Web Store');
  assert.equal(channelForInstallType('development').label, 'Staff');
  assert.equal(channelForInstallType('sideload').id, 'other');
  assert.equal(channelForInstallType(null).label, 'Unknown');
});

test('only admin/normal installs use Chrome\'s updater', () => {
  assert.equal(usesChromeUpdater('admin'), true);
  assert.equal(usesChromeUpdater('normal'), true);
  assert.equal(usesChromeUpdater('development'), false);
  assert.equal(usesChromeUpdater('other'), false);
});

test('shouldFetchEnterpriseXml: admin only, and not for Web Store update URLs', () => {
  assert.equal(shouldFetchEnterpriseXml('admin', null), true);
  assert.equal(shouldFetchEnterpriseXml('admin', 'https://tabatha.pondocean.co/enterprise/update.xml'), true);
  assert.equal(shouldFetchEnterpriseXml('admin', 'https://clients2.google.com/service/update2/crx'), false);
  assert.equal(shouldFetchEnterpriseXml('normal', null), false);
  assert.equal(shouldFetchEnterpriseXml('development', null), false);
});

// ── channel parsing ────────────────────────────────────────────────
const XML = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='jbdkacccpknbiphigeabcdojemnhacjj'>
    <updatecheck codebase='https://tabatha.pondocean.co/enterprise/tabatha-6.7.87.crx' version='6.7.87' />
  </app>
</gupdate>`;

test('parseUpdateXmlVersion reads the updatecheck version (not the XML decl)', () => {
  assert.equal(parseUpdateXmlVersion(XML), '6.7.87');
  assert.equal(parseUpdateXmlVersion(XML, 'jbdkacccpknbiphigeabcdojemnhacjj'), '6.7.87');
});

test('parseUpdateXmlVersion scopes to the given appid', () => {
  assert.equal(parseUpdateXmlVersion(XML, 'someotherappidxxxxxxxxxxxxxxxxxx'), null);
});

test('parseUpdateXmlVersion rejects garbage', () => {
  assert.equal(parseUpdateXmlVersion(''), null);
  assert.equal(parseUpdateXmlVersion(null), null);
  assert.equal(parseUpdateXmlVersion("<updatecheck version='latest' />"), null);
  assert.equal(parseUpdateXmlVersion('<html>404</html>'), null);
});

test('parseLatestJsonVersion validates the staff channel payload', () => {
  assert.equal(parseLatestJsonVersion({ version: '6.7.88', zipUrl: 'x', sha256: 'y' }), '6.7.88');
  assert.equal(parseLatestJsonVersion({ version: 'v6.7.88' }), null);
  assert.equal(parseLatestJsonVersion({}), null);
  assert.equal(parseLatestJsonVersion(null), null);
});

// ── status normalisation ───────────────────────────────────────────
test('normalizeUpdateStatus clears versions the running build caught up to', () => {
  const s = normalizeUpdateStatus(
    { publishedVersion: '6.7.87', readyVersion: '6.7.87', diskVersion: '6.7.86', pendingApply: { version: '6.7.87', until: 9e15 } },
    '6.7.87'
  );
  assert.equal(s.publishedVersion, null);
  assert.equal(s.readyVersion, null);
  assert.equal(s.diskVersion, null);
  assert.equal(s.pendingApply, null);
  assert.equal(s.currentVersion, '6.7.87');
});

test('normalizeUpdateStatus keeps genuinely newer versions', () => {
  const s = normalizeUpdateStatus({ publishedVersion: '6.7.88', readyVersion: '6.7.88' }, '6.7.87');
  assert.equal(s.publishedVersion, '6.7.88');
  assert.equal(s.readyVersion, '6.7.88');
});

test('normalizeUpdateStatus tolerates a missing status', () => {
  const s = normalizeUpdateStatus(undefined, '6.7.87');
  assert.equal(s.currentVersion, '6.7.87');
});

// ── availableUpdate / banner ───────────────────────────────────────
test('availableUpdate: ready beats published when it is at least as new', () => {
  assert.deepEqual(availableUpdate({ readyVersion: '6.7.88', publishedVersion: '6.7.88' }, '6.7.87'), { kind: 'ready', version: '6.7.88' });
});

test('availableUpdate: a newer published version outranks an older ready one', () => {
  const a = availableUpdate({ readyVersion: '6.7.88', publishedVersion: '6.7.90' }, '6.7.87');
  assert.equal(a.kind, 'published');
  assert.equal(a.version, '6.7.90');
});

test('availableUpdate: staff disk version counts as ready', () => {
  assert.deepEqual(availableUpdate({ diskVersion: '6.7.88' }, '6.7.87'), { kind: 'ready', version: '6.7.88' });
});

test('availableUpdate: nothing newer → null', () => {
  assert.equal(availableUpdate({ publishedVersion: '6.7.87' }, '6.7.87'), null);
  assert.equal(availableUpdate(null, '6.7.87'), null);
});

test('decideUpdateBanner copy — ready vs published', () => {
  const ready = decideUpdateBanner({ status: { readyVersion: '6.7.88' }, currentVersion: '6.7.87' });
  assert.equal(ready.text, 'Tabatha 6.7.88 is ready.');
  assert.equal(ready.action, 'Update now');
  const out = decideUpdateBanner({ status: { publishedVersion: '6.7.88' }, currentVersion: '6.7.87' });
  assert.equal(out.text, 'Tabatha 6.7.88 is out.');
  assert.equal(out.action, 'Get it now');
});

test('decideUpdateBanner hides when running version is current', () => {
  assert.equal(decideUpdateBanner({ status: { publishedVersion: '6.7.88' }, currentVersion: '6.7.88' }), null);
});

test('"Later" snoozes that version for one hour only', () => {
  const now = 1_000_000;
  const snooze = makeSnooze('6.7.88', now);
  assert.equal(snooze.until, now + UPDATE_SNOOZE_MS);
  const status = { publishedVersion: '6.7.88' };
  assert.equal(decideUpdateBanner({ status, currentVersion: '6.7.87', snooze, now: now + 1000 }), null);
  assert.ok(decideUpdateBanner({ status, currentVersion: '6.7.87', snooze, now: now + UPDATE_SNOOZE_MS + 1 }));
});

test('snoozing one version does not hide a newer one', () => {
  const now = 1_000_000;
  const snooze = makeSnooze('6.7.88', now);
  assert.equal(isSnoozed(snooze, '6.7.89', now + 10), false);
  assert.ok(decideUpdateBanner({ status: { publishedVersion: '6.7.89' }, currentVersion: '6.7.87', snooze, now: now + 10 }));
});

// ── apply decision ─────────────────────────────────────────────────
test('decideApplyAction reloads when a newer build is on this machine', () => {
  assert.equal(decideApplyAction({ installType: 'admin', currentVersion: '6.7.87', readyVersion: '6.7.88' }), 'reload');
  assert.equal(decideApplyAction({ installType: 'development', currentVersion: '6.7.87', diskVersion: '6.7.88' }), 'reload');
});

test('decideApplyAction asks Chrome for admin/store installs with nothing ready', () => {
  assert.equal(decideApplyAction({ installType: 'admin', currentVersion: '6.7.83' }), 'request_check');
  assert.equal(decideApplyAction({ installType: 'normal', currentVersion: '6.7.83', readyVersion: '6.7.83' }), 'request_check');
});

test('decideApplyAction: staff install with nothing on disk → none', () => {
  assert.equal(decideApplyAction({ installType: 'development', currentVersion: '6.7.87', diskVersion: '6.7.87' }), 'none');
});

test('describeUpdateResult gives the specified copy', () => {
  assert.equal(describeUpdateResult({ reason: 'downloading' }), 'Chrome is downloading it. This updates in a moment.');
  assert.equal(describeUpdateResult({ reason: 'throttled' }), 'Chrome is limiting update checks. Restart Chrome to finish.');
  assert.match(describeUpdateResult({ reason: 'published_not_downloaded', version: '6.7.88', installType: 'admin' }), /Restart Chrome/);
  assert.match(describeUpdateResult({ reason: 'published_not_downloaded', version: '6.7.88', installType: 'development' }), /staff updater/);
  assert.equal(describeUpdateResult({ reason: 'no_update' }), "You're on the latest version.");
  assert.equal(describeUpdateResult({ action: 'reloading' }), 'Updating now…');
});

// Idle auto-apply: registering onUpdateAvailable stops Chrome applying a
// downloaded update on its own, so we apply it when the machine goes idle.
test('shouldAutoApplyOnIdle applies a ready newer build only when idle or locked', () => {
  const status = { readyVersion: '6.7.89' };
  assert.equal(shouldAutoApplyOnIdle({ idleState: 'idle', status, currentVersion: '6.7.88' }), true);
  assert.equal(shouldAutoApplyOnIdle({ idleState: 'locked', status, currentVersion: '6.7.88' }), true);
  assert.equal(shouldAutoApplyOnIdle({ idleState: 'active', status, currentVersion: '6.7.88' }), false);
});

test('shouldAutoApplyOnIdle ignores stale, missing, or disk-only versions', () => {
  assert.equal(shouldAutoApplyOnIdle({ idleState: 'idle', status: { readyVersion: '6.7.88' }, currentVersion: '6.7.88' }), false);
  assert.equal(shouldAutoApplyOnIdle({ idleState: 'idle', status: {}, currentVersion: '6.7.88' }), false);
  assert.equal(shouldAutoApplyOnIdle({ idleState: 'idle', status: null, currentVersion: '6.7.88' }), false);
  assert.equal(shouldAutoApplyOnIdle({ idleState: 'idle', status: { diskVersion: '6.7.89' }, currentVersion: '6.7.88', installType: 'development' }), true);
});
