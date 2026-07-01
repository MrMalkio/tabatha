// ════════════════════════════════════════════
// Tabatha — Toolbar Action Service (FIX-12)
//
// Owns what clicking the browser-toolbar icon does. The user picks between two
// modes via `settings.toolbarClickAction`:
//   'sidepanel' (DEFAULT) → the icon opens Tabatha's side panel.
//   'popup'               → the icon opens the tab-list popup (popup.html).
//
// Koda's directive: configure the action PERSISTENTLY — on service-worker
// startup and whenever settings change — rather than the brittle per-click
// setPopup()/openPopup() toggling. We drive two Chrome surfaces in tandem:
//   - chrome.action.setPopup({ popup })         (''  = no popup → onClicked fires
//                                                 or the side panel opens)
//   - chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick })
//
// A hotkey (command "open_tab_list", default Ctrl+Shift+E, rebindable at
// chrome://extensions/shortcuts) always opens the tab-list popup regardless of
// the click mode, using chrome.windows.create — chrome.action.openPopup is
// flaky and gesture-gated, so we deliberately avoid it.
// ════════════════════════════════════════════

import { getSettings } from './storageService.js';
import { DEFAULT_SETTINGS } from '../constants.js';

export const OPEN_TAB_LIST_COMMAND = 'open_tab_list';
export const TAB_LIST_POPUP_PATH = 'popup.html';

// Valid modes. Anything else falls back to the default.
const VALID_MODES = new Set(['sidepanel', 'popup']);

export function normalizeMode(mode) {
  return VALID_MODES.has(mode) ? mode : DEFAULT_SETTINGS.toolbarClickAction;
}

/**
 * Apply a toolbar-click mode to the live Chrome action + side-panel config.
 * Idempotent and safe to call repeatedly (startup, settings change).
 *
 * @param {'sidepanel'|'popup'} rawMode
 */
export async function applyToolbarClickAction(rawMode) {
  const mode = normalizeMode(rawMode);

  if (mode === 'sidepanel') {
    // Icon opens the side panel. No popup → the click is consumed by Chrome's
    // side-panel gesture, which sidesteps the "user gesture required" problem
    // that plagues action.openPopup().
    try { await chrome.action.setPopup({ popup: '' }); } catch (e) { warn('setPopup(empty)', e); }
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (e) { warn('setPanelBehavior(true)', e); }
  } else {
    // Icon opens the tab-list popup. Disable the side-panel-on-click behavior
    // first so the two surfaces don't fight over the same gesture.
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    } catch (e) { warn('setPanelBehavior(false)', e); }
    try {
      await chrome.action.setPopup({ popup: TAB_LIST_POPUP_PATH });
    } catch (e) { warn('setPopup(popup.html)', e); }
  }

  return mode;
}

/** Re-read settings and apply the persisted mode. */
export async function syncToolbarClickAction() {
  const settings = await getSettings();
  return applyToolbarClickAction(settings?.toolbarClickAction);
}

/**
 * Reliably open the tab-list popup in its own small window. Used by the hotkey.
 * chrome.action.openPopup is flaky (gesture-gated, no-ops from a command
 * handler on some Chrome builds), so we spawn a real popup window instead.
 */
export async function openTabListPopup() {
  const url = chrome.runtime.getURL(TAB_LIST_POPUP_PATH);
  try {
    await chrome.windows.create({ url, type: 'popup', focused: true, width: 420, height: 640 });
  } catch (e) {
    warn('windows.create(popup)', e);
  }
}

function warn(where, e) {
  try { console.warn(`Tabatha: toolbarActionService ${where} failed`, e); } catch { /* noop */ }
}

// ── Lifecycle registration ──
// Called once from background.js at module load.
export function registerToolbarActionListeners() {
  // Apply once now (covers dev reloads / SW respawn).
  syncToolbarClickAction();

  // Re-apply on cold start.
  chrome.runtime.onStartup.addListener(() => { syncToolbarClickAction(); });
  chrome.runtime.onInstalled.addListener(() => { syncToolbarClickAction(); });

  // Re-apply whenever the settings object changes. The Settings UI writes
  // `settings` directly to chrome.storage.local (via useChromeStorage), so a
  // storage.onChanged watcher is the reliable persistent hook — no dependency
  // on the UPDATE_SETTINGS message path.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const prev = changes.settings.oldValue?.toolbarClickAction;
    const next = changes.settings.newValue?.toolbarClickAction;
    if (normalizeMode(prev) !== normalizeMode(next)) {
      applyToolbarClickAction(next);
    }
  });

  // Hotkey → always open the tab-list popup, regardless of click mode.
  chrome.commands.onCommand.addListener((command) => {
    if (command === OPEN_TAB_LIST_COMMAND) openTabListPopup();
  });
}
