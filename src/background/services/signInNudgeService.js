/* global chrome */
// ============================================================
// Tabatha — Workspace sign-in reminders (6.7.88)
//
// Workspace (policy force-install, installType 'admin') users must be signed
// in so their time and intents sync. While signed out they get constant but
// NON-BLOCKING reminders — nothing here gates, dims or disables a feature:
//   • SignInNudge banner on Home / Sidebar / Settings (reads
//     chrome.storage.local['signInNudgeState'] written here)
//   • toolbar badge "!" + tooltip "Sign in to Tabatha" — only when the badge
//     is free; an active badge is never clobbered (tooltip only)
//   • a Chrome notification at most every 3 h, 08:00–20:00 local; clicking it
//     opens Settings → Sync & Account (routed in notificationService)
// Everything clears the moment a session appears: AUTH_STATE_CHANGED from a
// page, or the supabase auth-token key changing in chrome.storage.local.
// Non-Workspace installs never see any of it.
// ============================================================

import { getStorage, setStorage } from './storageService.js';
import {
  SIGNIN_NUDGE_STATE_KEY,
  SIGNIN_NOTIFY_LAST_KEY,
  SIGNIN_NOTIFICATION_ID,
  BADGE_TEXT,
  BADGE_COLOR,
  BADGE_TITLE,
  isWorkspaceInstall,
  needsSignIn,
  shouldNotify,
  decideBadge
} from '../../utils/signInNudge.js';

export const SIGNIN_NUDGE_ALARM = 'tabatha-signin-nudge';
const NUDGE_TICK_MIN = 15;
const AUTH_KEY_RE = /^sb-.*-auth-token$/;

let deps = {};
let listenersRegistered = false;
let evaluating = null;
let reevaluateTimer = null;

export function configureSignInNudgeService(injected = {}) {
  deps = { ...deps, ...injected };
}

export function signInSettingsUrl() {
  return chrome.runtime.getURL('settings.html#sync');
}

async function getInstallType() {
  try {
    const self = await chrome.management.getSelf();
    return self?.installType || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function isSignedIn() {
  const supabase = deps.supabase;
  if (!supabase) return null; // unknown — never nudge on unknown
  try {
    const { data: { session } = {} } = await supabase.auth.getSession();
    return !!session;
  } catch {
    return null;
  }
}

function defaultTitle() {
  try { return chrome.runtime.getManifest()?.action?.default_title || 'Tabatha'; } catch { return 'Tabatha'; }
}

async function applyBadge({ installType, signedIn }) {
  if (!chrome.action) return;
  let currentBadgeText = '';
  try { currentBadgeText = (await chrome.action.getBadgeText({})) || ''; } catch { /* ignore */ }
  const plan = decideBadge({ installType, signedIn, currentBadgeText });
  try {
    if (plan.badge === 'set') {
      await chrome.action.setBadgeText({ text: BADGE_TEXT });
      await chrome.action.setBadgeBackgroundColor?.({ color: BADGE_COLOR });
      await chrome.action.setBadgeTextColor?.({ color: '#000000' });
    } else if (plan.badge === 'clear') {
      await chrome.action.setBadgeText({ text: '' });
    }
    if (plan.title === 'set') await chrome.action.setTitle({ title: BADGE_TITLE });
    else if (plan.title === 'restore') await chrome.action.setTitle({ title: defaultTitle() });
  } catch { /* badge is decoration — never fail the evaluation */ }
}

async function maybeNotify({ installType, signedIn }) {
  const now = Date.now();
  const { [SIGNIN_NOTIFY_LAST_KEY]: lastNotifiedAt } = await getStorage(SIGNIN_NOTIFY_LAST_KEY);
  if (!shouldNotify({ installType, signedIn, lastNotifiedAt, now })) return false;
  try {
    chrome.notifications.create(SIGNIN_NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Sign in to Tabatha',
      message: "You're using Tabatha through your workspace. Sign in so your time and intents sync.",
      priority: 0
    });
  } catch { /* ignore */ }
  await setStorage({ [SIGNIN_NOTIFY_LAST_KEY]: now });
  return true;
}

function clearNotification() {
  try { chrome.notifications.clear(SIGNIN_NOTIFICATION_ID); } catch { /* ignore */ }
}

// Re-read install type + session and bring every reminder in line.
// `signedInHint` short-circuits the session read when a page just told us.
// Calls are serialized so a hint that arrives mid-evaluation is never dropped.
export function evaluateSignInNudge(opts = {}) {
  const run = () => runEvaluation(opts);
  const next = (evaluating || Promise.resolve()).then(run, run);
  evaluating = next;
  next.finally(() => { if (evaluating === next) evaluating = null; }).catch(() => {});
  return next;
}

async function runEvaluation({ signedInHint, notify = false } = {}) {
  const installType = await getInstallType();
  const signedIn = typeof signedInHint === 'boolean' ? signedInHint : await isSignedIn();
  const state = {
    installType,
    workspace: isWorkspaceInstall(installType),
    signedIn: signedIn === null ? null : !!signedIn,
    updatedAt: Date.now()
  };

  // Unknown auth state: keep whatever we showed before rather than flash.
  if (signedIn === null) return state;

  const { [SIGNIN_NUDGE_STATE_KEY]: prev } = await getStorage(SIGNIN_NUDGE_STATE_KEY);
  if (!prev || prev.installType !== state.installType || prev.signedIn !== state.signedIn || prev.workspace !== state.workspace) {
    await setStorage({ [SIGNIN_NUDGE_STATE_KEY]: state });
  }

  await applyBadge({ installType, signedIn });
  if (needsSignIn({ installType, signedIn })) {
    if (notify) await maybeNotify({ installType, signedIn });
  } else {
    clearNotification();
  }
  return state;
}

function scheduleReevaluate(opts = {}) {
  clearTimeout(reevaluateTimer);
  reevaluateTimer = setTimeout(() => { evaluateSignInNudge(opts).catch(() => {}); }, 250);
}

// Routed from alarmService.
export async function handleSignInNudgeAlarm() {
  return evaluateSignInNudge({ notify: true });
}

export function registerSignInNudgeListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  // Sign-in / sign-out from any context lands in chrome.storage.local via the
  // shared supabase storage adapter — react immediately.
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Object.keys(changes).some((k) => AUTH_KEY_RE.test(k))) scheduleReevaluate();
  });

  chrome.runtime.onStartup?.addListener(() => { evaluateSignInNudge({ notify: true }).catch(() => {}); });
  chrome.runtime.onInstalled?.addListener(() => { evaluateSignInNudge().catch(() => {}); });

  (async () => {
    try {
      const existing = await chrome.alarms.get(SIGNIN_NUDGE_ALARM);
      if (!existing) chrome.alarms.create(SIGNIN_NUDGE_ALARM, { delayInMinutes: 1, periodInMinutes: NUDGE_TICK_MIN });
    } catch { /* ignore */ }
  })();

  evaluateSignInNudge().catch(() => {});
}

export async function handleMessage(type, message = {}) {
  switch (type) {
    // Observe only — cloudWriteService (later in the chain) owns the reply.
    case 'AUTH_STATE_CHANGED':
      evaluateSignInNudge({ signedInHint: !!message.hasSession }).catch(() => {});
      return undefined;
    case 'REFRESH_SIGNIN_NUDGE':
      return { ok: true, state: await evaluateSignInNudge() };
    case 'OPEN_SIGN_IN':
      try { await chrome.tabs.create({ url: signInSettingsUrl() }); } catch { /* ignore */ }
      return { ok: true };
    default:
      return undefined;
  }
}
