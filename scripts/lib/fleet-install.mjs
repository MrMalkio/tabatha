// Pure helpers for scripts/check-fleet-install.mjs — the machine-side
// diagnostic for a Tabatha extension install. No I/O here so every rule is
// unit-testable (test/fleetInstallHelpers.test.js).
import { createHash } from 'node:crypto';

export const FLEET_ID = 'jbdkacccpknbiphigeabcdojemnhacjj';
export const LIVE_UPDATE_URL = 'https://tabatha.pondocean.co/enterprise/update.xml';

// Chrome's "time" prefs are microseconds since 1601-01-01 (Windows FILETIME/1e1).
const WINDOWS_EPOCH_OFFSET_S = 11644473600;
export function chromeTimeToIso(v) {
  const us = Number(v);
  if (!Number.isFinite(us) || us <= 0) return null;
  const ms = us / 1000 - WINDOWS_EPOCH_OFFSET_S * 1000;
  return new Date(ms).toISOString();
}

// chrome/browser/extensions/disable_reason.h (bit values; prefs may store the
// bitmask as an int or, in newer Chromes, as a list of the individual values).
export const DISABLE_REASONS = {
  1: 'USER_ACTION', 2: 'PERMISSIONS_INCREASE', 4: 'RELOAD', 8: 'UNSUPPORTED_REQUIREMENT',
  16: 'SIDELOAD_WIPEOUT', 32: 'UNKNOWN_FROM_SYNC', 128: 'NOT_VERIFIED', 256: 'GREYLIST',
  512: 'CORRUPTED', 1024: 'REMOTE_INSTALL', 2048: 'EXTERNAL_EXTENSION',
  4096: 'UPDATE_REQUIRED_BY_POLICY', 8192: 'CUSTODIAN_APPROVAL_REQUIRED',
  16384: 'BLOCKED_BY_POLICY', 32768: 'REINSTALL', 65536: 'NOT_ALLOWLISTED'
};
export function decodeDisableReasons(v) {
  if (v == null) return [];
  const bits = Array.isArray(v) ? v.map(Number) : [Number(v)];
  const out = new Set();
  for (const b of bits) {
    if (!Number.isFinite(b) || b <= 0) continue;
    for (const [bit, name] of Object.entries(DISABLE_REASONS)) {
      if (b & Number(bit)) out.add(name);
    }
  }
  return [...out];
}

// extensions/common/mojom/manifest.mojom ManifestLocation.
export const LOCATIONS = {
  1: 'internal', 2: 'external-pref', 3: 'external-registry', 4: 'unpacked', 5: 'component',
  6: 'external-pref-download', 7: 'external-policy-download', 8: 'external-policy',
  9: 'external-component'
};
export const locationName = (n) => LOCATIONS[Number(n)] || `unknown(${n})`;

// Extension id = first 16 bytes of SHA-256(SPKI DER), each nibble mapped a-p.
export function extensionIdFromSpki(der) {
  const h = createHash('sha256').update(der).digest();
  let id = '';
  for (let i = 0; i < 16; i += 1) {
    id += String.fromCharCode(97 + (h[i] >> 4)) + String.fromCharCode(97 + (h[i] & 15));
  }
  return id;
}
export const extensionIdFromManifestKey = (b64) => extensionIdFromSpki(Buffer.from(b64, 'base64'));

export function cmpVersion(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Every Tabatha-looking entry in a profile's Secure Preferences `extensions.settings`.
export function findTabathaEntries(securePrefs, { ids = [FLEET_ID] } = {}) {
  const settings = securePrefs?.extensions?.settings || {};
  const out = [];
  for (const [id, e] of Object.entries(settings)) {
    const name = e?.manifest?.name || '';
    const path = e?.path || '';
    const looksTabatha = /tabatha/i.test(name) || /tabatha/i.test(path) || ids.includes(id);
    if (!looksTabatha) continue;
    const disableReasons = decodeDisableReasons(e?.disable_reasons);
    out.push({
      id,
      name: name || null,
      version: e?.manifest?.version || null,
      location: Number(e?.location) || null,
      locationName: locationName(e?.location),
      path: path || null,
      fromWebstore: !!e?.from_webstore,
      disableReasons,
      enabled: disableReasons.length === 0,
      firstInstallAt: chromeTimeToIso(e?.first_install_time),
      lastUpdateAt: chromeTimeToIso(e?.last_update_time)
    });
  }
  return out;
}

// LevelDB's text LOG. Once a background error is recorded, LevelDB rejects
// every later write until the DB is reopened — so an error line that is not
// followed by a later successful flush/compaction means "poisoned".
const LOG_LINE_RE = /^(\d{4}\/\d{2}\/\d{2}-\d{2}:\d{2}:\d{2}\.\d+)\s+\S+\s+(.*)$/;
export function classifyLevelDbLog(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  const errors = [];
  let lastSuccessIdx = -1;
  let lastErrorIdx = -1;
  lines.forEach((line, i) => {
    const m = line.match(LOG_LINE_RE);
    const at = m ? m[1] : null;
    const msg = m ? m[2] : line;
    if (/Compaction error|IO error|Corruption|error:/i.test(msg)) {
      errors.push({ at, message: msg, diskFull: /NO_SPACE|no space|ENOSPC/i.test(msg) });
      lastErrorIdx = i;
    } else if (/bytes OK$|^Compacted |^compacted to/i.test(msg)) {
      lastSuccessIdx = i;
    }
  });
  const last = lines.length ? lines[lines.length - 1].match(LOG_LINE_RE) : null;
  return {
    lineCount: lines.length,
    lastAt: last ? last[1] : null,
    errors,
    poisoned: lastErrorIdx >= 0 && lastErrorIdx > lastSuccessIdx,
    diskFull: errors.some((e) => e.diskFull)
  };
}

// Only the <updatecheck> attributes count — the XML prolog also says
// version='1.0', which is not a Tabatha version.
export function parseUpdateXml(xml) {
  const s = String(xml || '');
  const check = s.match(/<updatecheck\b([^>]*)>/)?.[1] || '';
  return {
    appid: s.match(/<app\b[^>]*\bappid='([^']+)'/)?.[1] || null,
    version: check.match(/\bversion='([^']+)'/)?.[1] || null,
    codebase: check.match(/\bcodebase='([^']+)'/)?.[1] || null
  };
}

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
export const fmtBytes = (n) => (n >= GIB ? `${(n / GIB).toFixed(1)} GB` : `${Math.round(n / MIB)} MB`);

// The verdict rules. Input is whatever the caller could establish; nulls mean
// "unknown" and are reported, never guessed around.
export function verdictsFor({
  installedVersion = null,
  liveVersion = null,
  entries = [],
  storeNewestAt = null,
  walGrowthBytes = null,
  walWindowS = null,
  log = null,
  freeBytes = null,
  policyMentionsFleet = null
} = {}) {
  const out = [];
  const add = (level, text) => out.push({ level, text });

  if (freeBytes != null) {
    if (freeBytes < 1 * GIB) add('fail', `disk nearly full — ${fmtBytes(freeBytes)} free. Storage writes fail on a full disk; free space FIRST, then reload the extension.`);
    else add('ok', `disk has ${fmtBytes(freeBytes)} free`);
  }

  if (log?.poisoned) {
    const e = log.errors[log.errors.length - 1];
    add('fail', `chrome.storage.local is POISONED since ${e.at}: "${e.message}". Every write has failed since. Reload the extension (chrome://extensions → ↻) once the disk has room — or let 6.7.84+ self-heal.`);
  } else if (log && log.errors.length) {
    add('warn', `${log.errors.length} earlier LevelDB error(s), last at ${log.errors[log.errors.length - 1].at}; writes have succeeded since.`);
  }

  if (installedVersion && liveVersion) {
    const c = cmpVersion(installedVersion, liveVersion);
    if (c < 0) add('fail', `installed ${installedVersion} but the enterprise channel serves ${liveVersion}. Force a check: chrome://extensions → Developer mode → Update; and confirm chrome://policy lists ${FLEET_ID} with ${LIVE_UPDATE_URL}.`);
    else if (c === 0) add('ok', `installed ${installedVersion} = channel ${liveVersion}`);
    else add('warn', `installed ${installedVersion} is NEWER than the channel's ${liveVersion} — a site deploy may have rolled the channel back.`);
  } else if (!installedVersion) {
    add('fail', `the fleet extension ${FLEET_ID} is not installed in this profile.`);
  }

  if (policyMentionsFleet === false) add('warn', `no cached cloud policy in this profile references ${FLEET_ID} — the Workspace force-install may not apply here (sign-in account / OU).`);
  if (policyMentionsFleet === true) add('ok', 'cached cloud policy references the fleet extension');

  const enabled = entries.filter((e) => e.enabled);
  const disabled = entries.filter((e) => !e.enabled);
  if (enabled.length > 1) add('warn', `${enabled.length} Tabatha extensions are ENABLED at once (${enabled.map((e) => `${e.id.slice(0, 8)}… ${e.locationName}`).join(', ')}); only one should be live.`);
  for (const d of disabled) add('warn', `disabled Tabatha entry ${d.id.slice(0, 8)}… (${d.locationName}, reasons: ${d.disableReasons.join('|')}) — a ghost card; remove it.`);

  if (walGrowthBytes != null && walWindowS != null) {
    if (walGrowthBytes > 0) add('ok', `storage is being written (+${walGrowthBytes} B in ${walWindowS}s)`);
    else add(log?.poisoned ? 'info' : 'warn', `no storage writes observed in ${walWindowS}s (newest file ${storeNewestAt || 'unknown'})`);
  }
  return out;
}
