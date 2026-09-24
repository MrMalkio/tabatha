#!/usr/bin/env node
// Tabatha fleet-install diagnostic — run ON THE MACHINE whose install is in
// doubt. Answers, from disk, the questions that otherwise cost hours:
//
//   • which Tabatha extensions this Chrome has (id, version, install kind,
//     enabled/disabled + why), and whether there are ghost duplicates
//   • what version of the fleet (jbdka…) install is actually on disk, vs what
//     the enterprise channel currently serves
//   • whether the profile's cached cloud policy even references the fleet id
//   • whether chrome.storage.local is alive: newest write, WAL growth over a
//     short window, and — the 2026-09-23 outage — whether LevelDB's own LOG
//     shows a latched background error ("Compaction error … NO_SPACE") after
//     which every write fails until the extension is reloaded
//   • free disk space
//
// Read-only. Windows/Chrome paths. Exit 1 when any verdict is `fail`.
//
// Usage:
//   node scripts/check-fleet-install.mjs [--offline] [--json] [--window=20]
import { existsSync, readdirSync, readFileSync, statSync, openSync, readSync, closeSync, statfsSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
  FLEET_ID, LIVE_UPDATE_URL, findTabathaEntries, classifyLevelDbLog, parseUpdateXml,
  verdictsFor, cmpVersion, fmtBytes
} from './lib/fleet-install.mjs';

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const asJson = args.includes('--json');
const windowS = Number(args.find((a) => a.startsWith('--window='))?.split('=')[1] || 20);

if (process.platform !== 'win32') {
  console.error('✘ this diagnostic reads Windows Chrome profile paths; run it on the affected Windows machine.');
  process.exit(2);
}

const LOCALAPPDATA = process.env.LOCALAPPDATA;
const USER_DATA_DIRS = [
  ['Chrome', join(LOCALAPPDATA, 'Google', 'Chrome', 'User Data')],
  ['Chrome Beta', join(LOCALAPPDATA, 'Google', 'Chrome Beta', 'User Data')],
  ['Chromium', join(LOCALAPPDATA, 'Chromium', 'User Data')]
].filter(([, p]) => existsSync(p));

// True file length even while another process holds the file open (directory
// metadata on NTFS can lag; reading to EOF cannot).
function readLength(path) {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    let n = 0; let r;
    while ((r = readSync(fd, buf, 0, buf.length, n)) > 0) n += r;
    return n;
  } finally { closeSync(fd); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const dirContains = (dir, needle) => {
  if (!existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) stack.push(p);
        else if (st.size < 32 * 1024 * 1024 && readFileSync(p).includes(needle)) return true;
      } catch { /* locked/unreadable: skip */ }
    }
  }
  return false;
};

async function inspectProfile(browser, userData, profile) {
  const dir = join(userData, profile);
  const securePrefs = readJson(join(dir, 'Secure Preferences')) || readJson(join(dir, 'Preferences'));
  const entries = securePrefs ? findTabathaEntries(securePrefs) : [];
  if (!entries.length) return null;

  const report = { browser, profile, entries, fleet: null, verdicts: [] };
  const extDir = join(dir, 'Extensions', FLEET_ID);
  const installedVersions = existsSync(extDir)
    ? readdirSync(extDir).map((v) => v.replace(/_\d+$/, '')).sort(cmpVersion)
    : [];
  const installedVersion = installedVersions[installedVersions.length - 1] || null;

  const storeDir = join(dir, 'Local Extension Settings', FLEET_ID);
  let store = null;
  if (existsSync(storeDir)) {
    const files = readdirSync(storeDir).map((f) => ({ f, st: statSync(join(storeDir, f)) }));
    const newest = files.reduce((a, b) => (!a || b.st.mtimeMs > a.st.mtimeMs ? b : a), null);
    const wal = files.filter((x) => x.f.endsWith('.log')).map((x) => join(storeDir, x.f));
    const before = wal.reduce((s, p) => s + readLength(p), 0);
    await sleep(windowS * 1000);
    const after = wal.reduce((s, p) => s + readLength(p), 0);
    const logPath = join(storeDir, 'LOG');
    store = {
      newestAt: newest ? newest.st.mtime.toISOString() : null,
      walGrowthBytes: after - before,
      log: existsSync(logPath) ? classifyLevelDbLog(readFileSync(logPath, 'utf8')) : null,
      sizeBytes: files.reduce((s, x) => s + x.st.size, 0)
    };
  }

  const policyMentionsFleet = dirContains(join(dir, 'Policy'), Buffer.from(FLEET_ID));
  let freeBytes = null;
  try { const fs = statfsSync(dir); freeBytes = Number(fs.bavail) * Number(fs.bsize); } catch { /* unknown */ }

  report.fleet = { installedVersions, installedVersion, store, policyMentionsFleet, freeBytes };
  return report;
}

let liveVersion = null;
if (!offline) {
  try {
    const xml = await (await fetch(LIVE_UPDATE_URL, { signal: AbortSignal.timeout(10000) })).text();
    const parsed = parseUpdateXml(xml);
    if (parsed.appid !== FLEET_ID) console.warn(`⚠ live update.xml appid is ${parsed.appid}, expected ${FLEET_ID}`);
    liveVersion = parsed.version;
  } catch (err) {
    console.warn(`⚠ could not fetch ${LIVE_UPDATE_URL}: ${err.message} (use --offline to silence)`);
  }
}

const reports = [];
for (const [browser, userData] of USER_DATA_DIRS) {
  for (const profile of readdirSync(userData).filter((p) => /^(Default|Profile \d+)$/.test(p))) {
    const r = await inspectProfile(browser, userData, profile);
    if (r) reports.push(r);
  }
}

let anyFail = false;
for (const r of reports) {
  r.verdicts = verdictsFor({
    installedVersion: r.fleet.installedVersion,
    liveVersion,
    entries: r.entries,
    storeNewestAt: r.fleet.store?.newestAt || null,
    walGrowthBytes: r.fleet.store ? r.fleet.store.walGrowthBytes : null,
    walWindowS: r.fleet.store ? windowS : null,
    log: r.fleet.store?.log || null,
    freeBytes: r.fleet.freeBytes,
    policyMentionsFleet: r.fleet.policyMentionsFleet
  });
  if (r.verdicts.some((v) => v.level === 'fail')) anyFail = true;
}

if (asJson) {
  console.log(JSON.stringify({ liveVersion, reports }, null, 2));
} else {
  if (!reports.length) console.log('No Tabatha extension entries found in any Chrome profile on this machine.');
  for (const r of reports) {
    console.log(`\n${r.browser} / ${r.profile}`);
    for (const e of r.entries) {
      const state = e.enabled ? 'enabled' : `DISABLED (${e.disableReasons.join('|')})`;
      console.log(`  ${e.id}  ${(e.version || '?').padEnd(8)} ${e.locationName.padEnd(24)} ${state}${e.path ? `  ${e.path}` : ''}`);
    }
    const f = r.fleet;
    console.log(`  fleet install dirs: ${f.installedVersions.join(', ') || '(none)'}   channel: ${liveVersion || (offline ? '(offline)' : '(unknown)')}`);
    if (f.store) {
      console.log(`  storage: ${fmtBytes(f.store.sizeBytes)}, newest write ${f.store.newestAt}, WAL +${f.store.walGrowthBytes} B / ${windowS}s`);
      if (f.store.log?.errors.length) console.log(`  leveldb LOG: ${f.store.log.errors.length} error line(s); last "${f.store.log.errors.at(-1).message}"`);
    }
    for (const v of r.verdicts) {
      const mark = { ok: '✔', warn: '⚠', fail: '✘', info: '·' }[v.level] || '·';
      console.log(`  ${mark} ${v.text}`);
    }
  }
}
process.exitCode = anyFail ? 1 : 0;
