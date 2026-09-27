/* global chrome */
// ============================================================
// Tabatha — Update Service (6.7.88, "New version available")
//
// WHY: the old "Reload extension" button only called chrome.runtime.reload(),
// which never fetches a new version — the owner clicked it and stayed on
// 6.7.83 while 6.7.87 was published. Chrome only polls policy update URLs
// every few hours. This service learns what is published, asks Chrome for
// it, and applies it with a reload once it is on disk.
//
// Channels (see src/utils/updateDecision.js):
//   admin       → requestUpdateCheck() + our enterprise update.xml
//   normal      → requestUpdateCheck()
//   development → staff latest.json + the on-disk manifest.json (the external
//                 updater swaps files; a reload applies them)
//
// NOTE: registering runtime.onUpdateAvailable defers Chrome's automatic
// apply-when-idle. The UpdateBanner surfaces the ready version, an idle/locked
// listener applies it when nobody is at the machine, and Chrome still applies
// it on the next browser restart.
//
// Storage: chrome.storage.local['updateStatus'] = { currentVersion,
//   publishedVersion, readyVersion, diskVersion, installType, source,
//   lastCheckedAt, lastResult, pendingApply }
// ============================================================

import { getStorage, setStorage } from './storageService.js';
import { compareVersions } from '../../utils/semver.js';
import {
  UPDATE_STATUS_KEY,
  ENTERPRISE_UPDATE_XML_URL,
  STAFF_LATEST_JSON_URL,
  usesChromeUpdater,
  shouldFetchEnterpriseXml,
  parseUpdateXmlVersion,
  parseLatestJsonVersion,
  normalizeUpdateStatus,
  decideApplyAction,
  shouldAutoApplyOnIdle
} from '../../utils/updateDecision.js';

export const UPDATE_CHECK_ALARM = 'tabatha-update-check';
const UPDATE_CHECK_PERIOD_MIN = 60;
const STARTUP_CHECK_DELAY_MS = 15 * 1000;
// Automatic checks (startup / alarm) skip if one ran this recently; the user's
// own "Check for updates" click always runs.
const AUTO_CHECK_MIN_INTERVAL_MS = 10 * 60 * 1000;
const APPLY_WAIT_MS = 20 * 1000;
// "Get it now" while Chrome is still downloading: reload automatically when
// the download lands within this window.
const PENDING_APPLY_WINDOW_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10 * 1000;
const RELOAD_DELAY_MS = 300;

let listenersRegistered = false;
let checkInFlight = null;
const readyWaiters = new Set();

// ── helpers ─────────────────────────────────────────────────────────
function runningVersion() {
  try { return chrome.runtime.getManifest().version; } catch { return null; }
}

export async function getInstallInfo() {
  try {
    const self = await chrome.management.getSelf();
    return { installType: self?.installType || 'unknown', updateUrl: self?.updateUrl || null };
  } catch {
    return { installType: 'unknown', updateUrl: null };
  }
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    return await fetch(url, { cache: 'no-store', ...opts, ...(ctrl ? { signal: ctrl.signal } : {}) });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadUpdateStatus() {
  const { [UPDATE_STATUS_KEY]: raw } = await getStorage(UPDATE_STATUS_KEY);
  return normalizeUpdateStatus(raw, runningVersion());
}

async function saveUpdateStatus(patch) {
  const current = await loadUpdateStatus();
  const next = normalizeUpdateStatus({ ...current, ...patch }, runningVersion());
  await setStorage({ [UPDATE_STATUS_KEY]: next });
  return next;
}

function reloadSoon() {
  // Let the message response reach the page before the SW goes away.
  setTimeout(() => { try { chrome.runtime.reload(); } catch { /* ignore */ } }, RELOAD_DELAY_MS);
}

// ── channel probes ──────────────────────────────────────────────────
async function fetchEnterprisePublishedVersion() {
  const res = await fetchWithTimeout(ENTERPRISE_UPDATE_XML_URL);
  if (!res.ok) throw new Error(`update.xml HTTP ${res.status}`);
  const xml = await res.text();
  let appId = null;
  try { appId = chrome.runtime.id || null; } catch { /* ignore */ }
  // Prefer the entry for our own appid; fall back to the first updatecheck
  // (the feed only carries Tabatha).
  return parseUpdateXmlVersion(xml, appId) || parseUpdateXmlVersion(xml);
}

async function fetchStaffPublishedVersion() {
  const res = await fetchWithTimeout(STAFF_LATEST_JSON_URL);
  if (!res.ok) throw new Error(`latest.json HTTP ${res.status}`);
  return parseLatestJsonVersion(await res.json());
}

// The staff updater swaps files under the loaded unpacked directory; the
// running manifest (getManifest) is cached at load, the file on disk is not.
async function fetchDiskManifestVersion() {
  const res = await fetchWithTimeout(chrome.runtime.getURL('manifest.json'));
  if (!res.ok) return null;
  const json = await res.json();
  return parseLatestJsonVersion(json);
}

async function requestChromeUpdateCheck() {
  try {
    const out = await chrome.runtime.requestUpdateCheck();
    // MV3 resolves { status, version }; older shapes passed (status, details).
    if (Array.isArray(out)) return { status: out[0], version: out[1]?.version || null };
    return { status: out?.status || 'no_update', version: out?.version || null };
  } catch (err) {
    return { status: 'error', error: err?.message || String(err) };
  }
}

// ── check ───────────────────────────────────────────────────────────
// `chromeResult` lets APPLY_UPDATE reuse the requestUpdateCheck() answer it
// already has — calling it twice in a row invites Chrome's throttle.
export async function checkForUpdate({ force = false, chromeResult = null } = {}) {
  if (checkInFlight) return checkInFlight;
  checkInFlight = (async () => {
    const current = runningVersion();
    const { installType, updateUrl } = await getInstallInfo();
    const prev = await loadUpdateStatus();

    if (!force && prev.lastCheckedAt && Date.now() - prev.lastCheckedAt < AUTO_CHECK_MIN_INTERVAL_MS
      && prev.installType === installType) {
      return { ...prev, skipped: true };
    }

    const patch = { installType, currentVersion: current, lastCheckedAt: Date.now(), lastError: null };
    const sources = [];
    const newer = (v) => (v && compareVersions(v, current) > 0 ? v : null);
    const maxOf = (a, b) => (!a ? b : !b ? a : compareVersions(a, b) >= 0 ? a : b);
    let chromeStatus = null;
    let published = null;
    let publishedKnown = false; // did any channel answer about "published"?

    if (usesChromeUpdater(installType)) {
      const check = chromeResult || await requestChromeUpdateCheck();
      sources.push('chrome');
      chromeStatus = check.status;
      if (check.status === 'update_available') {
        published = maxOf(published, newer(check.version));
        publishedKnown = true;
      } else if (check.status === 'no_update') {
        publishedKnown = true;
      } else if (check.status === 'error') {
        patch.lastError = check.error || null;
      }
    }

    if (shouldFetchEnterpriseXml(installType, updateUrl)) {
      try {
        published = maxOf(published, newer(await fetchEnterprisePublishedVersion()));
        publishedKnown = true;
        sources.push('update.xml');
      } catch (err) {
        patch.lastError = err?.message || String(err);
      }
    }

    if (installType === 'development') {
      try {
        published = maxOf(published, newer(await fetchStaffPublishedVersion()));
        publishedKnown = true;
        sources.push('latest.json');
      } catch (err) {
        patch.lastError = err?.message || String(err);
      }
      try {
        patch.diskVersion = newer(await fetchDiskManifestVersion());
        sources.push('disk');
      } catch { /* disk read is best-effort */ }
    }

    // A failed probe must not erase what an earlier check learned.
    patch.publishedVersion = publishedKnown ? published : (prev.publishedVersion || null);

    const ready = newer(prev.readyVersion) || patch.diskVersion || null;
    let lastResult;
    if (!usesChromeUpdater(installType) && installType !== 'development') lastResult = 'unsupported';
    else if (ready) lastResult = 'ready';
    else if (chromeStatus === 'update_available') lastResult = 'update_available';
    else if (chromeStatus === 'throttled') lastResult = 'throttled';
    else if (patch.publishedVersion) lastResult = 'published_not_downloaded';
    else if (!publishedKnown && patch.lastError) lastResult = 'error';
    else lastResult = 'no_update';

    patch.lastResult = lastResult;
    patch.source = sources.join('+') || null;
    return saveUpdateStatus(patch);
  })();
  try {
    return await checkInFlight;
  } finally {
    checkInFlight = null;
  }
}

// ── ready (onUpdateAvailable) ───────────────────────────────────────
export async function markUpdateReady(version) {
  const status = await saveUpdateStatus({ readyVersion: version || null, lastResult: 'ready' });
  for (const resolve of readyWaiters) resolve(version);
  readyWaiters.clear();
  const pending = status.pendingApply;
  if (pending && Number(pending.until) > Date.now()
    && (!version || !pending.version || compareVersions(version, pending.version) >= 0)) {
    // The user already asked for this update ("Get it now") — finish it.
    await saveUpdateStatus({ pendingApply: null });
    reloadSoon();
  }
  return status;
}

function waitForReady(timeoutMs) {
  return new Promise((resolve) => {
    const done = (v) => { clearTimeout(timer); readyWaiters.delete(done); resolve(v || true); };
    const timer = setTimeout(() => { readyWaiters.delete(done); resolve(null); }, timeoutMs);
    readyWaiters.add(done);
  });
}

// ── apply ───────────────────────────────────────────────────────────
export async function applyUpdate({ waitMs = APPLY_WAIT_MS } = {}) {
  const current = runningVersion();
  const { installType } = await getInstallInfo();
  let status = await loadUpdateStatus();

  // Staff installs: re-read disk right now — the updater may have just swapped.
  if (installType === 'development') {
    try {
      const disk = await fetchDiskManifestVersion();
      status = await saveUpdateStatus({ diskVersion: disk && compareVersions(disk, current) > 0 ? disk : null });
    } catch { /* ignore */ }
  }

  const action = decideApplyAction({
    installType,
    currentVersion: current,
    readyVersion: status.readyVersion,
    diskVersion: status.diskVersion
  });

  if (action === 'reload') {
    reloadSoon();
    return { ok: true, action: 'reloading', version: status.readyVersion || status.diskVersion, installType };
  }

  if (action === 'none') {
    // Staff install with nothing newer on disk yet.
    const refreshed = await checkForUpdate({ force: true });
    if (refreshed.diskVersion) {
      reloadSoon();
      return { ok: true, action: 'reloading', version: refreshed.diskVersion, installType };
    }
    if (refreshed.publishedVersion) {
      return { ok: false, reason: 'published_not_downloaded', version: refreshed.publishedVersion, installType };
    }
    return { ok: false, reason: installType === 'development' ? 'no_update' : 'unsupported', installType };
  }

  // action === 'request_check' (Workspace / Web Store)
  const check = await requestChromeUpdateCheck();
  if (check.status === 'update_available') {
    const waiter = waitForReady(waitMs);
    // onUpdateAvailable may already have fired while requestUpdateCheck ran.
    const fresh = await loadUpdateStatus();
    if (fresh.readyVersion) {
      reloadSoon();
      return { ok: true, action: 'reloading', version: fresh.readyVersion, installType };
    }
    const readyVersion = await waiter;
    if (readyVersion) {
      reloadSoon();
      return { ok: true, action: 'reloading', version: typeof readyVersion === 'string' ? readyVersion : check.version, installType };
    }
    // Still downloading: finish automatically when it lands.
    await saveUpdateStatus({
      publishedVersion: check.version || status.publishedVersion || null,
      pendingApply: { version: check.version || null, until: Date.now() + PENDING_APPLY_WINDOW_MS },
      lastResult: 'update_available',
      lastCheckedAt: Date.now()
    });
    return { ok: false, reason: 'downloading', version: check.version, installType };
  }

  // Keep the published version fresh for the message copy (reusing Chrome's
  // answer — no second requestUpdateCheck).
  const refreshed = await checkForUpdate({ force: true, chromeResult: check });
  if (check.status === 'throttled') {
    return { ok: false, reason: 'throttled', version: refreshed.publishedVersion, installType };
  }
  if (check.status === 'error') {
    return { ok: false, reason: 'error', error: check.error, installType };
  }
  if (refreshed.readyVersion) {
    reloadSoon();
    return { ok: true, action: 'reloading', version: refreshed.readyVersion, installType };
  }
  if (refreshed.publishedVersion && compareVersions(refreshed.publishedVersion, current) > 0) {
    return { ok: false, reason: 'published_not_downloaded', version: refreshed.publishedVersion, installType };
  }
  return { ok: false, reason: 'no_update', installType };
}

// ── lifecycle ───────────────────────────────────────────────────────
function scheduleStartupCheck() {
  setTimeout(() => { checkForUpdate().catch(() => {}); }, STARTUP_CHECK_DELAY_MS);
}

export async function ensureUpdateCheckAlarm() {
  try {
    const existing = await chrome.alarms.get(UPDATE_CHECK_ALARM);
    if (!existing) {
      chrome.alarms.create(UPDATE_CHECK_ALARM, {
        delayInMinutes: UPDATE_CHECK_PERIOD_MIN,
        periodInMinutes: UPDATE_CHECK_PERIOD_MIN
      });
    }
  } catch { /* ignore */ }
}

// Routed from alarmService.
export async function handleUpdateCheckAlarm() {
  return checkForUpdate();
}

// Must be called synchronously at SW top level (listeners registered late
// miss the wake-up event).
export function registerUpdateServiceListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  chrome.runtime.onUpdateAvailable?.addListener((details) => {
    markUpdateReady(details?.version || null).catch(() => {});
  });

  chrome.runtime.onInstalled?.addListener(async (details) => {
    if (details?.reason === 'update' || details?.reason === 'install') {
      // Running a new build: drop published/ready fields we've caught up to.
      try {
        const { installType } = await getInstallInfo();
        await saveUpdateStatus({ installType, currentVersion: runningVersion(), readyVersion: null, pendingApply: null });
      } catch { /* ignore */ }
    }
    scheduleStartupCheck();
  });

  chrome.runtime.onStartup?.addListener(() => {
    scheduleStartupCheck();
  });

  // Our onUpdateAvailable listener stops Chrome's own apply-when-idle, so do
  // it here: when nobody is at the machine and a newer build is downloaded,
  // reload onto it. The banner covers the case where the user is active.
  chrome.idle?.onStateChanged?.addListener((idleState) => {
    (async () => {
      const status = await loadUpdateStatus();
      if (shouldAutoApplyOnIdle({ idleState, status, currentVersion: runningVersion() })) reloadSoon();
    })().catch(() => {});
  });

  ensureUpdateCheckAlarm();
}

export async function handleMessage(type) {
  switch (type) {
    case 'CHECK_FOR_UPDATE': {
      try {
        const status = await checkForUpdate({ force: true });
        return { ok: true, status };
      } catch (err) {
        return { ok: false, reason: 'error', error: err?.message || String(err) };
      }
    }
    case 'APPLY_UPDATE': {
      try {
        return await applyUpdate();
      } catch (err) {
        return { ok: false, reason: 'error', error: err?.message || String(err) };
      }
    }
    case 'GET_UPDATE_STATUS':
      return { ok: true, status: await loadUpdateStatus() };
    default:
      return undefined;
  }
}
