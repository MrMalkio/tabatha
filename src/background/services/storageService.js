/* global chrome */
// ════════════════════════════════════════════
// Tabatha — Storage Service (canonical background storage layer)
// Wraps chrome.storage.local. Constants are re-exported from
// ../constants.js so callers can import everything from this module.
// ════════════════════════════════════════════

export {
  DEFAULT_SETTINGS,
  PRIORITY_LEVELS,
  BUILT_IN_CATEGORIES,
  DEFAULT_FOCUS_ENGINE
} from '../constants.js';

import { DEFAULT_SETTINGS, BUILT_IN_CATEGORIES, DEFAULT_FOCUS_ENGINE } from '../constants.js';
import { sanitizeFocusEngine, sanitizeTabsMap } from '../../utils/focusDataSanitize.js';
import { logger } from '../../services/logger.js';

// ── Chrome storage wrappers ──

export async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

// 2026-07-05 pause/resume outage: chrome.storage.local hit its 10MB
// QUOTA_BYTES cap (manifest lacked "unlimitedStorage"), so EVERY write —
// PAUSE_FOCUS, RESUME_FOCUS, clock, edits — rejected with
// "Resource::kQuotaBytes quota exceeded" while reads kept working. The UI
// swallowed the {error} responses, so the extension looked alive but no
// state change persisted. "unlimitedStorage" now removes the cap; this
// guard makes any future write failure LOUD instead of silent.
//
// 2026-09-23 disk-full outage — same shape, different cause. The machine ran
// out of disk during a LevelDB compaction (the store's LOG records
// "Compaction error: IO error: ... FILE_ERROR_NO_SPACE"). LevelDB latches that
// as a background error, so every later chrome.storage.local write rejects
// until the database is REOPENED — which only an extension reload or a Chrome
// restart does. Reads keep working, the service worker keeps syncing its
// frozen snapshot to the cloud, and every add/resolve/pause fails on save.
// Freeing disk space alone does NOT recover it. So on repeated write failures
// we self-heal: probe a DIFFERENT LevelDB (chrome.storage.sync) with a tiny
// write. If the probe succeeds the disk has room and the local DB is merely
// poisoned → chrome.runtime.reload() reopens it. If the probe also fails the
// disk is still full → a reload gains nothing, so we only keep notifying, with
// a disk-full message. A cooldown marker in storage.sync (which survives the
// reload) prevents a reload loop.
let _lastWriteFailureNoticeAt = 0;
const WRITE_FAILURE_NOTICE_INTERVAL_MS = 10 * 60000;

// Self-heal tuning (exported so tests pin the contract).
export const WRITE_FAILURE_RELOAD_THRESHOLD = 3;          // consecutive failures…
export const WRITE_FAILURE_RELOAD_MIN_AGE_MS = 60000;     // …spanning at least this long
export const WRITE_FAILURE_RELOAD_COOLDOWN_MS = 30 * 60000;
export const SELF_HEAL_MARKER_KEY = '_storageSelfHealReloadedAt';
const SELF_HEAL_PROBE_KEY = '_storageHealthProbeAt';

let _consecutiveWriteFailures = 0;
let _firstWriteFailureAt = 0;
let _selfHealInFlight = false;
let _now = () => Date.now();

export function isDiskFullError(err) {
  return /NO_SPACE|no space|ENOSPC|disk full/i.test(err?.message || String(err));
}

// Test seams (node --test runs share module state).
export function _resetWriteFailureNotice() {
  _lastWriteFailureNoticeAt = 0;
  _consecutiveWriteFailures = 0;
  _firstWriteFailureAt = 0;
  _selfHealInFlight = false;
}
export function _setNowForTests(fn) {
  _now = typeof fn === 'function' ? fn : () => Date.now();
}
export function _getWriteFailureState() {
  return { consecutive: _consecutiveWriteFailures, firstAt: _firstWriteFailureAt };
}

function notifyWriteFailure(err, now) {
  if (now - _lastWriteFailureNoticeAt <= WRITE_FAILURE_NOTICE_INTERVAL_MS) return;
  _lastWriteFailureNoticeAt = now;
  const msg = err?.message || err;
  console.error('[Tabatha:storage] WRITE FAILED — state changes are NOT persisting:', msg);
  const message = isDiskFullError(err)
    ? 'Your disk is full, so changes are not saving. Free some space — Tabatha will reload itself and recover.'
    : `Changes are not saving (${msg || 'unknown error'}). Restart Chrome; if it persists, clear old logs/archives in Settings.`;
  try {
    chrome.notifications?.create?.('tabatha-storage-write-failure', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Tabatha — storage write failed',
      message,
      requireInteraction: true
    });
  } catch { /* notifications best-effort */ }
}

// Resolves true when an extension reload was triggered.
async function maybeSelfHeal(now) {
  if (_selfHealInFlight) return false;
  if (_consecutiveWriteFailures < WRITE_FAILURE_RELOAD_THRESHOLD) return false;
  if (now - _firstWriteFailureAt < WRITE_FAILURE_RELOAD_MIN_AGE_MS) return false;
  const sync = chrome.storage?.sync;
  if (typeof sync?.get !== 'function' || typeof sync?.set !== 'function') return false;
  if (typeof chrome.runtime?.reload !== 'function') return false;
  _selfHealInFlight = true;
  try {
    // The probe: a tiny write to a different LevelDB. Still fails while the
    // disk is full — and then a reload would only reopen into the same error.
    await sync.set({ [SELF_HEAL_PROBE_KEY]: new Date(now).toISOString() });
    const { [SELF_HEAL_MARKER_KEY]: last } = await sync.get(SELF_HEAL_MARKER_KEY);
    const lastMs = last ? Date.parse(last) : 0;
    if (Number.isFinite(lastMs) && lastMs > 0 && now - lastMs < WRITE_FAILURE_RELOAD_COOLDOWN_MS) return false;
    await sync.set({ [SELF_HEAL_MARKER_KEY]: new Date(now).toISOString() });
    console.warn('[Tabatha:storage] local storage is poisoned but the disk has room — reloading the extension to reopen it');
    chrome.runtime.reload();
    return true;
  } catch (probeErr) {
    console.warn('[Tabatha:storage] self-heal probe failed (disk still full?) — not reloading:', probeErr?.message || probeErr);
    return false;
  } finally {
    _selfHealInFlight = false;
  }
}

export async function setStorage(data) {
  try {
    const result = await chrome.storage.local.set(data);
    _consecutiveWriteFailures = 0;
    _firstWriteFailureAt = 0;
    return result;
  } catch (err) {
    const now = _now();
    _consecutiveWriteFailures += 1;
    if (!_firstWriteFailureAt) _firstWriteFailureAt = now;
    notifyWriteFailure(err, now);
    await maybeSelfHeal(now);
    throw err;
  }
}

export async function getSettings() {
  const { settings } = await getStorage('settings');
  return { ...DEFAULT_SETTINGS, ...settings, storage: { ...DEFAULT_SETTINGS.storage, ...(settings?.storage || {}) } };
}

export async function getTabData() {
  const { tabs } = await getStorage('tabs');
  if (!tabs) return {};

  // 2026-07-23 self-heal (InPop "[object Object]" fix, defense-in-depth): a
  // legacy/historical write left some installs with an object-valued
  // `context` on one or more tabs. Because handleTabCreated copies
  // `inheritedContext = parent.context` verbatim to every child tab opened
  // from a corrupted parent, one bad ancestor tab can spread the object to
  // every descendant — this is exactly what surfaced as "[object Object]"
  // in the InPop's inherited-context input value. Sanitize on every read and
  // persist the repair so it's healed for good, not just for this call.
  const { tabs: healedTabs, healed, healedIds } = sanitizeTabsMap(tabs);
  if (healed) {
    logger.warn('DATA_SANITIZE', 'Healed corrupted tab context field(s) (object-valued context)', { healedIds });
    await setStorage({ tabs: healedTabs });
    return healedTabs;
  }
  return tabs;
}

export async function getSubGroups() {
  const { subGroups } = await getStorage('subGroups');
  return subGroups || {};
}

export async function getCategories() {
  const { categories } = await getStorage('categories');
  return { ...BUILT_IN_CATEGORIES, ...categories };
}

export async function getClosedContexts() {
  const { closedContexts } = await getStorage('closedContexts');
  return closedContexts || [];
}

export async function getSessions() {
  const { sessions } = await getStorage('sessions');
  return sessions || [];
}

export async function getTimeTracking() {
  const { timeTracking } = await getStorage('timeTracking');
  return timeTracking || { byTab: {}, byGroup: {}, bySubGroup: {}, byCategory: {}, byProject: {} };
}

export async function getFocusEngine() {
  const { focusEngine } = await getStorage('focusEngine');
  if (!focusEngine) return { ...DEFAULT_FOCUS_ENGINE };

  // 2026-07-23 self-heal (InPop "[object Object]" fix). This is the raw
  // accessor used by dataRehydrate.js's rehydrate-on-sign-in path — a
  // separate read of the SAME chrome.storage.local `focusEngine` key that
  // focusService.js's own getFocusEngine() also sanitizes. Both must heal
  // independently so whichever one happens to read first never re-persists
  // (or forwards into a merge) a still-corrupted item. See
  // src/utils/focusDataSanitize.js for the full root-cause writeup.
  const { engine: healedEngine, healed, healedIds } = sanitizeFocusEngine(focusEngine);
  if (healed) {
    logger.warn('DATA_SANITIZE', 'Healed corrupted focus-engine item(s) via raw storageService accessor', { healedIds });
    await setStorage({ focusEngine: healedEngine });
    return healedEngine;
  }
  return focusEngine;
}

export async function setFocusEngine(engine) {
  await setStorage({ focusEngine: engine });
}

// ── Cap enforcement & cleanup primitives ──

// Enforce a FIFO cap on an array-valued chrome.storage key. The cap is read
// from settings.storage[capSetting] (with DEFAULT_SETTINGS.storage as the
// fallback). Returns { dropped, kept } so callers can route dropped entries
// to archiveService.archiveBeforeCap before they're lost.
export async function enforceArrayCap(key, capSetting) {
  const settings = await getSettings();
  const cap = settings?.storage?.[capSetting] ?? DEFAULT_SETTINGS.storage[capSetting];
  if (!Number.isFinite(cap) || cap <= 0) {
    return { dropped: [], kept: [] };
  }

  const raw = await getStorage(key);
  const arr = Array.isArray(raw?.[key]) ? raw[key] : [];
  if (arr.length <= cap) {
    return { dropped: [], kept: arr };
  }

  // Keep the most recent `cap` entries. Treat the tail as "newest" — this
  // matches the existing `logs.slice(-500)` pattern in background.js. If a
  // future caller stores newest-first, it should pre-sort before persisting.
  const dropped = arr.slice(0, arr.length - cap);
  const kept = arr.slice(arr.length - cap);
  await setStorage({ [key]: kept });
  return { dropped, kept };
}

// Generalised stale-key pruner. Removes entries from an object-valued
// chrome.storage key whose keys aren't in the live set. Today the only
// caller is the bootstrap tabs cleanup; services in Tasks 04+ will use it
// for inbarNotes and other per-tab buckets.
export async function pruneStaleKeys(storageKey, liveKeys) {
  const raw = await getStorage(storageKey);
  const bucket = raw?.[storageKey];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return { removed: 0 };

  const live = new Set(Array.from(liveKeys, k => String(k)));
  let removed = 0;
  for (const k of Object.keys(bucket)) {
    if (!live.has(String(k))) {
      delete bucket[k];
      removed++;
    }
  }
  if (removed > 0) {
    await setStorage({ [storageKey]: bucket });
  }
  return { removed };
}
