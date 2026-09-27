// ============================================================
// Tabatha — update-state decisions (6.7.88, "New version available").
//
// Pure helpers shared by the background updateService and the page-side
// UpdateBanner / Settings update controls. No chrome.* here, so every rule
// is unit-testable (test/updateDecision.test.js).
//
// Install channels (chrome.management.getSelf().installType):
//   'admin'       → Google Workspace policy force-install (packed CRX, our
//                   self-hosted update.xml). Chrome polls every few hours.
//   'normal'      → Chrome Web Store.
//   'development' → staff unpacked install, updated by the external
//                   file-swap updater reading the update-channel latest.json.
// ============================================================

import { compareVersions } from './semver.js';

export const UPDATE_STATUS_KEY = 'updateStatus';
export const UPDATE_SNOOZE_KEY = 'updateBannerSnooze';
export const UPDATE_SNOOZE_MS = 60 * 60 * 1000; // "Later" = 1 hour per version

export const ENTERPRISE_UPDATE_XML_URL = 'https://tabatha.pondocean.co/enterprise/update.xml';
export const STAFF_LATEST_JSON_URL = 'https://raw.githubusercontent.com/MrMalkio/tabatha/update-channel/latest.json';

// Map an installType to a user-facing channel.
export function channelForInstallType(installType) {
  switch (installType) {
    case 'admin': return { id: 'workspace', label: 'Workspace' };
    case 'normal': return { id: 'store', label: 'Chrome Web Store' };
    case 'development': return { id: 'staff', label: 'Staff' };
    default: return { id: 'other', label: installType ? String(installType) : 'Unknown' };
  }
}

// Only 'admin' and 'normal' installs are updated by Chrome itself, so only
// they can use chrome.runtime.requestUpdateCheck().
export function usesChromeUpdater(installType) {
  return installType === 'admin' || installType === 'normal';
}

// Should an 'admin' install also read our self-hosted update.xml? Yes unless
// the policy points it at the Web Store update service (then Chrome's own
// check is the only truth and our XML is irrelevant).
export function shouldFetchEnterpriseXml(installType, updateUrl) {
  if (installType !== 'admin') return false;
  if (!updateUrl) return true;
  return !/clients2\.google\.com|update\.googleapis\.com/i.test(String(updateUrl));
}

// Extract the published version from a gupdate response. Scoped to the
// <updatecheck> element (and to our appid when given) so an unrelated
// version='' attribute elsewhere never matches.
export function parseUpdateXmlVersion(xml, appId = null) {
  if (typeof xml !== 'string' || !xml) return null;
  let scope = xml;
  if (appId) {
    const appRe = new RegExp(`<app\\b[^>]*\\sappid=(['"])${appId}\\1[^>]*>([\\s\\S]*?)</app>`, 'i');
    const m = xml.match(appRe);
    if (!m) return null;
    scope = m[2];
  }
  const m = scope.match(/<updatecheck\b[^>]*\sversion=(['"])([^'"]*)\1/i);
  const v = m ? m[2].trim() : '';
  return /^\d+(\.\d+){0,3}$/.test(v) ? v : null;
}

// Validate a staff latest.json payload → version string or null.
export function parseLatestJsonVersion(json) {
  const v = json && typeof json.version === 'string' ? json.version.trim() : '';
  return /^\d+(\.\d+){0,3}$/.test(v) ? v : null;
}

// Drop published/ready versions the running build has already caught up to
// (after an update, or when the published channel rolled back). Returns a new
// object; never mutates.
export function normalizeUpdateStatus(status, currentVersion) {
  const s = { ...(status || {}) };
  s.currentVersion = currentVersion || s.currentVersion || null;
  if (s.publishedVersion && compareVersions(s.publishedVersion, s.currentVersion) <= 0) s.publishedVersion = null;
  if (s.readyVersion && compareVersions(s.readyVersion, s.currentVersion) <= 0) s.readyVersion = null;
  if (s.diskVersion && compareVersions(s.diskVersion, s.currentVersion) <= 0) s.diskVersion = null;
  if (s.pendingApply && (!s.pendingApply.version || compareVersions(s.pendingApply.version, s.currentVersion) <= 0)) {
    s.pendingApply = null;
  }
  return s;
}

// The newest version the user can move to, and how ready it is.
//   kind 'ready'     → Chrome has downloaded it (or the staff updater already
//                      swapped newer files onto disk) — a reload applies it.
//   kind 'published' → it's out, but not on this machine yet.
export function availableUpdate(status, currentVersion) {
  const s = normalizeUpdateStatus(status, currentVersion);
  const ready = [s.readyVersion, s.diskVersion].filter(Boolean)
    .sort((a, b) => compareVersions(b, a))[0] || null;
  const published = s.publishedVersion || null;
  if (ready && (!published || compareVersions(ready, published) >= 0)) {
    return { kind: 'ready', version: ready };
  }
  if (published) return { kind: 'published', version: published, readyVersion: ready };
  if (ready) return { kind: 'ready', version: ready };
  return null;
}

export function isSnoozed(snooze, version, now = Date.now()) {
  if (!snooze || !version) return false;
  return snooze.version === version && Number(snooze.until) > now;
}

export function makeSnooze(version, now = Date.now(), ms = UPDATE_SNOOZE_MS) {
  return { version, until: now + ms };
}

// What the banner should render. Returns null when nothing should show.
export function decideUpdateBanner({ status, currentVersion, snooze, now = Date.now() }) {
  const avail = availableUpdate(status, currentVersion);
  if (!avail) return null;
  if (isSnoozed(snooze, avail.version, now)) return null;
  if (avail.kind === 'ready') {
    return { kind: 'ready', version: avail.version, text: `Tabatha ${avail.version} is ready.`, action: 'Update now' };
  }
  return { kind: 'published', version: avail.version, text: `Tabatha ${avail.version} is out.`, action: 'Get it now' };
}

// Decide what APPLY_UPDATE should do before touching Chrome's updater.
//   'reload'        → a newer build is already on this machine; reload now.
//   'request_check' → ask Chrome to fetch it (admin / store installs).
//   'none'          → nothing to apply (staff install with nothing on disk).
export function decideApplyAction({ installType, currentVersion, readyVersion, diskVersion }) {
  if (readyVersion && compareVersions(readyVersion, currentVersion) > 0) return 'reload';
  if (diskVersion && compareVersions(diskVersion, currentVersion) > 0) return 'reload';
  if (usesChromeUpdater(installType)) return 'request_check';
  return 'none';
}

// Plain-language copy for every APPLY_UPDATE / CHECK_FOR_UPDATE outcome.
export function describeUpdateResult(result = {}) {
  const v = result.version ? ` ${result.version}` : '';
  switch (result.reason || result.action) {
    case 'reloading': return 'Updating now…';
    case 'downloading': return 'Chrome is downloading it. This updates in a moment.';
    case 'throttled': return 'Chrome is limiting update checks. Restart Chrome to finish.';
    case 'published_not_downloaded':
      return result.installType === 'development'
        ? `Tabatha${v} is out. The staff updater hasn't installed it yet — it will shortly.`
        : `Tabatha${v} is out, but Chrome hasn't downloaded it yet. Restart Chrome to get it now.`;
    case 'no_update': return "You're on the latest version.";
    case 'update_available': return `Tabatha${v} is available. Chrome is downloading it.`;
    case 'ready': return `Tabatha${v} is ready. Click Update and reload.`;
    case 'unsupported': return "This install can't check for updates by itself.";
    case 'error': return `Couldn't check for updates${result.error ? `: ${result.error}` : '.'}`;
    default: return '';
  }
}
