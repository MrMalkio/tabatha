// ════════════════════════════════════════════
// Tabatha — Storage Helpers (background module)
// Shared chrome.storage wrappers
// ════════════════════════════════════════════

import { BUILT_IN_CATEGORIES, DEFAULT_FOCUS_ENGINE, DEFAULT_SETTINGS, PRIORITY_LEVELS } from '../constants.js';

export { BUILT_IN_CATEGORIES, DEFAULT_FOCUS_ENGINE, DEFAULT_SETTINGS, PRIORITY_LEVELS };


// ── Chrome storage wrappers ──

export async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

export async function setStorage(data) {
  return chrome.storage.local.set(data);
}

export async function getSettings() {
  const { settings } = await getStorage('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
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
