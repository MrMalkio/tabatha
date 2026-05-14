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

// ── Chrome storage wrappers ──

export async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

export async function setStorage(data) {
  return chrome.storage.local.set(data);
}

export async function getSettings() {
  const { settings } = await getStorage('settings');
  return { ...DEFAULT_SETTINGS, ...settings, storage: { ...DEFAULT_SETTINGS.storage, ...(settings?.storage || {}) } };
}

export async function getTabData() {
  const { tabs } = await getStorage('tabs');
  return tabs || {};
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
  return focusEngine || { ...DEFAULT_FOCUS_ENGINE };
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
