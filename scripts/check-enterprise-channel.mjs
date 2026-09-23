#!/usr/bin/env node
// Tabatha enterprise (fleet) channel preflight.
//
// Why this exists: the jbdka force-install channel's entire state lives in the
// site tree (site/enterprise/update.xml + the .crx beside it), and `site:deploy`
// publishes a FULL snapshot. So a site deploy from any tree that predates the
// latest CRX release silently ROLLS THE FLEET BACK.
//
// That is not hypothetical. On 2026-07-24 the 6.7.78 enterprise release shipped
// correctly (verified crx id + inner version, deployed, live). A later site
// deploy from the staging tree — which carried neither the 6.7.78 crx nor the
// updated update.xml — reverted the fleet to 6.7.76. Nothing failed, nothing
// logged; the fleet just stopped being offered a Koda-cleared release.
//
// Checks (all fail-closed):
//   1. update.xml's referenced .crx actually exists in site/enterprise/
//   2. that file is a real CRX3 (Cr24 magic) whose crx_id is the fleet id
//   3. its inner manifest version equals the version update.xml advertises
//   4. the local version is not LOWER than what the live channel already serves
//      (the rollback guard; skipped ONLY with explicit --offline)
//
// Usage:
//   node scripts/check-enterprise-channel.mjs [--offline]

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTERPRISE_DIR = resolve(ROOT, 'site/enterprise');
const UPDATE_XML = resolve(ENTERPRISE_DIR, 'update.xml');
const FLEET_ID = 'jbdkacccpknbiphigeabcdojemnhacjj';
const LIVE_UPDATE_URL = 'https://tabatha.pondocean.co/enterprise/update.xml';

const offline = process.argv.includes('--offline');
const fail = (msg) => {
  console.error(`✘ ${msg}`);
  process.exitCode = 1;
};

const cmpVersion = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
};

// Decode a CRX3 file: returns { id, version }
function readCrx(path) {
  const buf = readFileSync(path);
  if (buf.slice(0, 4).toString() !== 'Cr24') {
    throw new Error(`not a CRX (magic is "${buf.slice(0, 4).toString()}") — a 404 HTML page saved as .crx looks exactly like this`);
  }
  const headerLen = buf.readUInt32LE(8);
  const header = buf.slice(12, 12 + headerLen);

  // crx_id lives in the protobuf as tag 0x0a (field 1, len-delimited) len 0x10
  const marker = header.indexOf(Buffer.from([0x0a, 0x10]));
  if (marker < 0) throw new Error('no crx_id found in CRX3 header');
  const raw = header.slice(marker + 2, marker + 18);
  let id = '';
  for (const byte of raw) {
    id += String.fromCharCode(97 + (byte >> 4));
    id += String.fromCharCode(97 + (byte & 0x0f));
  }

  // payload is a zip; pull manifest.json out of the local file headers
  const zip = buf.slice(12 + headerLen);
  let off = 0;
  let version = null;
  while (off < zip.length - 4 && zip.readUInt32LE(off) === 0x04034b50) {
    const method = zip.readUInt16LE(off + 8);
    const csize = zip.readUInt32LE(off + 18);
    const nameLen = zip.readUInt16LE(off + 26);
    const extraLen = zip.readUInt16LE(off + 28);
    const name = zip.slice(off + 30, off + 30 + nameLen).toString();
    const dataStart = off + 30 + nameLen + extraLen;
    if (name === 'manifest.json') {
      const chunk = zip.slice(dataStart, dataStart + csize);
      version = JSON.parse((method === 8 ? inflateRawSync(chunk) : chunk).toString()).version;
      break;
    }
    off = dataStart + csize;
  }
  if (!version) throw new Error('could not read manifest.json version from the CRX payload');
  return { id, version };
}

if (!existsSync(UPDATE_XML)) {
  fail(`no update.xml at ${UPDATE_XML}`);
  process.exit(1);
}

// Scope to the <updatecheck> attributes — a bare /version='...'/ matches the
// XML declaration's version='1.0' first.
const UPDATECHECK_VERSION = /<updatecheck\b[^>]*\sversion=(['"])([^'"]*)\1/;

function channelVersion(xml) {
  const value = xml.match(UPDATECHECK_VERSION)?.[2];
  // Chrome versions have one to four integer components, each 0..65535.
  // Reject malformed input instead of letting NaN compare as an equal version.
  if (!value || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  if (parts.some(part => part > 65535) || !parts.some(part => part > 0)) return null;
  return value;
}

const xml = readFileSync(UPDATE_XML, 'utf8');
const declaredVersion = channelVersion(xml);
const codebase = xml.match(/codebase='([^']+)'/)?.[1];

if (!declaredVersion || !codebase) {
  fail('update.xml has a missing/invalid version or missing codebase attribute');
  process.exit(1);
}

const crxName = codebase.split('/').pop();
const crxPath = resolve(ENTERPRISE_DIR, crxName);

console.log(`fleet channel: update.xml advertises ${declaredVersion} → ${crxName}`);

// 1 + 2 + 3
if (!existsSync(crxPath)) {
  fail(`update.xml points at ${crxName}, but that file is NOT in site/enterprise/.`);
  console.error('   Deploying now would publish a dangling reference and break fleet updates.');
} else {
  try {
    const { id, version } = readCrx(crxPath);
    if (id !== FLEET_ID) {
      fail(`${crxName} has crx_id ${id}, expected ${FLEET_ID} — wrong signing key; the fleet would ignore it.`);
    } else {
      console.log(`✓ crx_id ${id}`);
    }
    if (version !== declaredVersion) {
      fail(`${crxName} contains version ${version} but update.xml advertises ${declaredVersion}.`);
    } else {
      console.log(`✓ inner manifest version ${version} matches update.xml`);
    }
  } catch (err) {
    fail(`${crxName}: ${err.message}`);
  }
}

// 4 — rollback guard
if (offline) {
  console.log('· live rollback check skipped (--offline)');
} else {
  try {
    const res = await fetch(`${LIVE_UPDATE_URL}?preflight=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`live channel HTTP ${res.status}`);
    const liveVersion = channelVersion(await res.text());
    if (!liveVersion) {
      fail('missing or invalid live channel version — cannot establish rollback safety');
    } else if (cmpVersion(declaredVersion, liveVersion) < 0) {
      fail(`ROLLBACK: live fleet channel serves ${liveVersion}, this tree would publish ${declaredVersion}.`);
      console.error('   A site deploy publishes a full snapshot, so this would downgrade every managed Chrome.');
      console.error(`   Bring the newer crx + update.xml into this tree first, or deploy from the tree that has ${liveVersion}.`);
    } else {
      console.log(`✓ no rollback (live ${liveVersion} → publishing ${declaredVersion})`);
    }
  } catch (err) {
    fail(`could not verify live channel — ${err.message}`);
  }
}

if (process.exitCode === 1) {
  console.error('\n✘ enterprise channel preflight FAILED — fix the above before deploying the site.');
} else {
  console.log(offline
    ? '✓ enterprise channel local-only validation passed (--offline; rollback safety not checked)'
    : '✓ enterprise channel preflight passed');
}
