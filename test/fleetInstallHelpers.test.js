// Pure-helper tests for scripts/check-fleet-install.mjs. Fixtures are the
// real shapes observed on Malkio's dev box during the 2026-09-24 diagnosis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLEET_ID, chromeTimeToIso, decodeDisableReasons, locationName, extensionIdFromManifestKey,
  cmpVersion, findTabathaEntries, classifyLevelDbLog, parseUpdateXml, verdictsFor
} from '../scripts/lib/fleet-install.mjs';

test('chromeTimeToIso converts Chrome microsecond prefs (1601 epoch)', () => {
  // last_update_time of the fleet install on 2026-07-22.
  assert.match(chromeTimeToIso('13429204320935574'), /^2026-07-22T/);
  assert.equal(chromeTimeToIso(undefined), null);
  assert.equal(chromeTimeToIso('0'), null);
});

test('decodeDisableReasons handles list form, bitmask form, and empty', () => {
  assert.deepEqual(decodeDisableReasons([4]), ['RELOAD']);
  assert.deepEqual(decodeDisableReasons(6), ['PERMISSIONS_INCREASE', 'RELOAD']);
  assert.deepEqual(decodeDisableReasons([]), []);
  assert.deepEqual(decodeDisableReasons(undefined), []);
});

test('locationName names unpacked vs policy installs', () => {
  assert.equal(locationName(4), 'unpacked');
  assert.equal(locationName(7), 'external-policy-download');
  assert.equal(locationName(42), 'unknown(42)');
});

test('extensionIdFromManifestKey derives the pinned staff id from the repo key', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../public/manifest.json', import.meta.url)), 'utf8'));
  assert.match(extensionIdFromManifestKey(manifest.key), /^[a-p]{32}$/);
});

test('cmpVersion is numeric per segment', () => {
  assert.ok(cmpVersion('6.7.56', '6.7.83') < 0);
  assert.ok(cmpVersion('6.7.83', '6.7.9') > 0);
  assert.equal(cmpVersion('6.7.83', '6.7.83'), 0);
});

test('findTabathaEntries picks fleet, unpacked, and ghost entries with state', () => {
  const prefs = {
    extensions: {
      settings: {
        dphebjboopafmehmmcclgmhbgfahchde: { location: 4, path: 'C:\\x\\Tabatha\\dist', disable_reasons: [4], first_install_time: '13427146742311016' },
        hoknmoclnhccpgofpdihmiadmnmejjod: { location: 4, path: 'C:\\x\\Tabatha\\dist' },
        [FLEET_ID]: { location: 7, path: `${FLEET_ID}\\6.7.56_0`, manifest: { name: 'Tabatha', version: '6.7.56' }, last_update_time: '13429204320935574' },
        someotherextensionidxxxxxxxxxxxx: { location: 1, manifest: { name: 'Not it' } }
      }
    }
  };
  const entries = findTabathaEntries(prefs);
  assert.equal(entries.length, 3);
  const ghost = entries.find((e) => e.id.startsWith('dphebjbo'));
  assert.equal(ghost.enabled, false);
  assert.deepEqual(ghost.disableReasons, ['RELOAD']);
  const fleet = entries.find((e) => e.id === FLEET_ID);
  assert.equal(fleet.version, '6.7.56');
  assert.equal(fleet.locationName, 'external-policy-download');
  assert.equal(fleet.enabled, true);
});

const HEALTHY_LOG = [
  '2026/09/23-16:31:09.715 64bc Level-0 table #218364: started',
  '2026/09/23-16:31:09.725 64bc Level-0 table #218364: 684561 bytes OK'
].join('\n');
const POISONED_LOG = `${HEALTHY_LOG}
2026/09/23-16:32:08.748 64bc Compacting 3@0 + 1@1 files
2026/09/23-16:32:08.763 64bc compacted to: files[ 3 2 2 0 0 0 0 ]
2026/09/23-16:32:08.764 64bc Compaction error: IO error: C:\\x\\jbdka\\218365.ldb: FILE_ERROR_NO_SPACE (ChromeMethodBFE: 3::WritableFileAppend::8)`;

test('classifyLevelDbLog flags a latched NO_SPACE compaction error as poisoned', () => {
  const c = classifyLevelDbLog(POISONED_LOG);
  assert.equal(c.poisoned, true);
  assert.equal(c.diskFull, true);
  assert.equal(c.errors.length, 1);
  assert.equal(c.errors[0].at, '2026/09/23-16:32:08.764');
  assert.match(c.errors[0].message, /NO_SPACE/);
});

test('classifyLevelDbLog: an error followed by later successful writes is not poisoned', () => {
  const recovered = `${POISONED_LOG}\n2026/09/24-09:00:00.000 1111 Level-0 table #218370: 1000 bytes OK`;
  const c = classifyLevelDbLog(recovered);
  assert.equal(c.poisoned, false);
  assert.equal(c.errors.length, 1);
  assert.equal(classifyLevelDbLog(HEALTHY_LOG).poisoned, false);
  assert.equal(classifyLevelDbLog('').lineCount, 0);
});

test('parseUpdateXml reads the <updatecheck> attributes, not the XML prolog version', () => {
  const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${FLEET_ID}'>
    <updatecheck codebase='https://x/tabatha-6.7.83.crx' version='6.7.83' />
  </app>
</gupdate>`;
  assert.deepEqual(parseUpdateXml(xml), { appid: FLEET_ID, version: '6.7.83', codebase: 'https://x/tabatha-6.7.83.crx' });
  assert.deepEqual(parseUpdateXml(''), { appid: null, version: null, codebase: null });
});

test('verdictsFor: the 2026-09-24 dev-box picture yields the right fails/warns', () => {
  const v = verdictsFor({
    installedVersion: '6.7.56',
    liveVersion: '6.7.83',
    entries: findTabathaEntries({ extensions: { settings: {
      dphebjboopafmehmmcclgmhbgfahchde: { location: 4, path: 'Tabatha\\dist', disable_reasons: [4] },
      hoknmoclnhccpgofpdihmiadmnmejjod: { location: 4, path: 'Tabatha\\dist' },
      [FLEET_ID]: { location: 7, manifest: { name: 'Tabatha', version: '6.7.56' } }
    } } }),
    storeNewestAt: '2026-09-23T20:32:08.000Z',
    walGrowthBytes: 0,
    walWindowS: 20,
    log: classifyLevelDbLog(POISONED_LOG),
    freeBytes: 244 * 1024 * 1024,
    policyMentionsFleet: true
  });
  const fails = v.filter((x) => x.level === 'fail').map((x) => x.text);
  assert.equal(fails.length, 3, JSON.stringify(v, null, 1));
  assert.match(fails[0], /disk nearly full — 244 MB free/);
  assert.match(fails[1], /POISONED since 2026\/09\/23-16:32:08/);
  assert.match(fails[2], /installed 6\.7\.56 but the enterprise channel serves 6\.7\.83/);
  const warns = v.filter((x) => x.level === 'warn').map((x) => x.text);
  assert.ok(warns.some((t) => /2 Tabatha extensions are ENABLED/.test(t)));
  assert.ok(warns.some((t) => /ghost card/.test(t)));
  assert.ok(v.some((x) => x.level === 'ok' && /cached cloud policy/.test(x.text)));
});

test('verdictsFor: a healthy, current install is all ok', () => {
  const v = verdictsFor({
    installedVersion: '6.7.84', liveVersion: '6.7.84',
    entries: [{ id: FLEET_ID, enabled: true, disableReasons: [], locationName: 'external-policy-download' }],
    walGrowthBytes: 512, walWindowS: 20, log: classifyLevelDbLog(HEALTHY_LOG),
    freeBytes: 50 * 1024 ** 3, policyMentionsFleet: true
  });
  assert.ok(v.every((x) => x.level === 'ok'), JSON.stringify(v));
});

test('verdictsFor: missing install + unknown policy + no channel is reported, not guessed', () => {
  const v = verdictsFor({ installedVersion: null, liveVersion: null, entries: [] });
  assert.equal(v.length, 1);
  assert.equal(v[0].level, 'fail');
  assert.match(v[0].text, /not installed/);
});
