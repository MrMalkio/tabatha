// ════════════════════════════════════════════
// Tabatha — Auto-Focus Service (Plan 036 Phases 2 & 3)
//
// Watches tab activations and either (Phase 2) suggests/creates a focus when
// none is active, or (Phase 3) detects context drift away from the active
// focus. Every surface is non-blocking: the most intrusive element allowed is
// a transient InBar chip. A decay engine (exponential cooldown) prevents
// prompt storms by remembering dismissals per-domain.
// ════════════════════════════════════════════

import { getStorage, setStorage, getSettings, getCategories } from './storageService.js';
import { broadcastAll, broadcastToExtension } from './notificationService.js';
import { detectCategory } from '../helpers.js';

let deps = {};
let listenerRegistered = false;

// Confidence ladder (higher index = more confident).
const CONFIDENCE_ORDER = ['low', 'medium', 'high', 'explicit'];
const DISMISSALS_KEY = 'autoFocusDismissals';
const SUGGESTION_KEY = '_autoFocusSuggestion';

// Phase 3 — per-active-focus drift bookkeeping (service-worker lifetime).
let driftState = null; // { focusId, wanderingSince, snoozedUntil, lastUnrelatedDomain }

export function configureAutoFocusService(injected = {}) {
  deps = { ...deps, ...injected };
}

export function registerAutoFocusListeners() {
  if (listenerRegistered) return;
  listenerRegistered = true;
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    evaluateTab(tabId).catch(() => { /* best-effort */ });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

// Automatic whitelist (challenge-response Resolution 3): browser-internal and
// local-dev surfaces never count as focus context or as drift.
function isWhitelisted(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|devtools|about|edge|view-source|file):/i.test(url) ||
    /(^https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url);
}

function confidenceMeets(confidence, threshold) {
  return CONFIDENCE_ORDER.indexOf(confidence) >= CONFIDENCE_ORDER.indexOf(threshold);
}

async function getFocusEngine() {
  return deps.getFocusEngine ? deps.getFocusEngine() : (await getStorage('focusEngine')).focusEngine || { activeFocusId: null, items: {}, history: [] };
}

async function getTabData() {
  return deps.getTabData ? deps.getTabData() : (await getStorage('tabs')).tabs || {};
}

// ── Decay engine (prompt-storm mitigation) ─────────────────────────────────

async function getDismissals() {
  const { [DISMISSALS_KEY]: d } = await getStorage(DISMISSALS_KEY);
  return d || {};
}

async function isOnCooldown(domain) {
  if (!domain) return false;
  const entry = (await getDismissals())[domain];
  if (!entry?.lastDismissed) return false;
  const elapsed = Date.now() - new Date(entry.lastDismissed).getTime();
  return elapsed < (entry.cooldownMinutes || 30) * 60000;
}

async function recordDismissal(domain) {
  if (!domain) return;
  const all = await getDismissals();
  const prev = all[domain];
  // 30 → 60 → 120 → 240 → 480 (cap).
  const nextCooldown = prev ? Math.min((prev.cooldownMinutes || 30) * 2, 480) : 30;
  all[domain] = {
    dismissCount: (prev?.dismissCount || 0) + 1,
    lastDismissed: new Date().toISOString(),
    cooldownMinutes: nextCooldown
  };
  await setStorage({ [DISMISSALS_KEY]: all });
}

// ── Heuristic matching (Phase 2) ───────────────────────────────────────────

// Returns the best { confidence, label, source } for a tab, or null.
async function matchTab(tabId) {
  const tabs = await getTabData();
  const tabData = tabs[tabId];
  let url = tabData?.url || '';
  let title = tabData?.title || '';
  try {
    const chromeTab = await chrome.tabs.get(Number(tabId));
    url = chromeTab?.url || url;
    title = chromeTab?.title || title;
  } catch { /* tab gone */ }

  if (isWhitelisted(url)) return null;

  // Explicit — a URL rule that opts into auto-creation.
  try {
    const { urlRules } = await getStorage('urlRules');
    const lower = url.toLowerCase();
    for (const rule of urlRules || []) {
      if (!rule.autoCreateFocus) continue;
      if (lower.includes((rule.pattern || '').toLowerCase())) {
        return { confidence: 'explicit', label: rule.defaultIntent || rule.defaultContext || getDomain(url), source: 'url_rule' };
      }
    }
  } catch { /* no rules */ }

  // High — category / domain group match.
  try {
    const categories = await getCategories();
    const cat = detectCategory(url, false, categories);
    if (cat && cat !== 'unknown') {
      const catName = categories[cat]?.name || cat;
      return { confidence: 'high', label: `Working on ${catName}`, source: 'category', category: cat };
    }
  } catch { /* ignore */ }

  // Medium — desktop companion's active-app category.
  const companionCat = deps.companionBridge?.getActiveAppCategory?.();
  if (companionCat) {
    const appName = deps.companionBridge?.getActiveApp?.()?.name || companionCat;
    return { confidence: 'medium', label: `Working in ${appName}`, source: 'companion', category: companionCat };
  }

  // Low — tab-title keyword (logged only, never surfaced).
  if (title && title.length > 3) {
    return { confidence: 'low', label: title.slice(0, 60), source: 'title' };
  }
  return null;
}

async function evaluateSuggestion(tabId, settings) {
  const match = await matchTab(tabId);
  if (!match) return;

  const tabs = await getTabData();
  const domain = getDomain(tabs[tabId]?.url || '');

  // Explicit rules auto-create silently (the user configured this).
  if (match.confidence === 'explicit') {
    await deps.startFocus?.(match.label, settings.globalTimerMinutes || 15, {});
    broadcastToExtension({ type: 'AUTO_FOCUS_CREATED', label: match.label, source: match.source });
    return;
  }

  // Everything below is a suggestion. 'low' is internal-only.
  if (match.confidence === 'low') {
    await logAuto('auto_focus_hint', { tabId, ...match, domain });
    return;
  }

  // Respect the user's minimum-confidence threshold and the decay cooldown.
  const threshold = settings.autoFocusConfidence || 'high';
  if (!confidenceMeets(match.confidence, threshold)) return;
  if (await isOnCooldown(domain)) return;

  await setStorage({
    [SUGGESTION_KEY]: { tabId, label: match.label, confidence: match.confidence, source: match.source, domain, ts: Date.now() }
  });
  broadcastAll({
    type: 'AUTO_FOCUS_SUGGESTED',
    tabId,
    label: match.label,
    confidence: match.confidence,
    source: match.source,
    domain
  });
  await logAuto('auto_focus_suggested', { tabId, ...match, domain });
}

// ── Drift detection (Phase 3) — implemented in the drift phase ─────────────

async function evaluateDrift(/* tabId, engine, active, settings */) {
  // Filled in Plan 036 Phase 3.
  return;
}

// ── Entry point ────────────────────────────────────────────────────────────

export async function evaluateTab(tabId) {
  const settings = await getSettings();
  if (settings.autoFocusEnabled === false) return;

  const engine = await getFocusEngine();
  const active = engine.activeFocusId ? engine.items[engine.activeFocusId] : null;

  if (active && active.focusState === 'active') {
    return evaluateDrift(tabId, engine, active, settings);
  }
  return evaluateSuggestion(tabId, settings);
}

async function logAuto(type, data) {
  try {
    const { tabathaLogs } = await getStorage('tabathaLogs');
    const logs = tabathaLogs || [];
    logs.push({ type, ...data, ts: new Date().toISOString() });
    await setStorage({ tabathaLogs: logs.slice(-500) });
  } catch { /* non-critical */ }
}

// ── Router ───────────────────────────────────────────────────────────────

export async function handleMessage(type, message) {
  switch (type) {
    case 'ACCEPT_AUTO_FOCUS': {
      const { [SUGGESTION_KEY]: sug } = await getStorage(SUGGESTION_KEY);
      const label = message.label || sug?.label;
      if (!label) return { error: 'No suggestion to accept' };
      const settings = await getSettings();
      const engine = await deps.startFocus?.(label, settings.globalTimerMinutes || 15, {});
      await setStorage({ [SUGGESTION_KEY]: null });
      broadcastAll({ type: 'AUTO_FOCUS_DISMISSED' });
      return { success: true, focusEngine: engine };
    }

    case 'DISMISS_AUTO_FOCUS': {
      const { [SUGGESTION_KEY]: sug } = await getStorage(SUGGESTION_KEY);
      const domain = message.domain || sug?.domain;
      await recordDismissal(domain);
      await setStorage({ [SUGGESTION_KEY]: null });
      broadcastAll({ type: 'AUTO_FOCUS_DISMISSED', domain });
      return { success: true };
    }

    case 'GET_AUTO_FOCUS_DISMISSALS':
      return { dismissals: await getDismissals() };

    case 'CLEAR_AUTO_FOCUS_DISMISSALS':
      await setStorage({ [DISMISSALS_KEY]: {} });
      return { success: true };

    default:
      return undefined;
  }
}

// Exposed for the drift phase / tests.
export { recordDismissal, isOnCooldown, getDomain, isWhitelisted };
export function _getDriftState() { return driftState; }
export function _setDriftState(s) { driftState = s; }
