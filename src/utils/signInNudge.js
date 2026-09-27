// ============================================================
// Tabatha — Workspace sign-in reminder decisions (6.7.88).
//
// Workspace (policy force-installed, installType 'admin') users must be
// signed in so their time and intents sync. The reminders are constant but
// NEVER block, gate, dim or disable anything. Pure helpers only — the
// background signInNudgeService and the SignInNudge banner both use them,
// and test/signInNudge.test.js covers every rule.
// ============================================================

export const SIGNIN_NUDGE_STATE_KEY = 'signInNudgeState';
export const SIGNIN_NUDGE_SNOOZE_KEY = 'signInNudgeSnoozedUntil';
export const SIGNIN_NOTIFY_LAST_KEY = 'signInNudgeLastNotifiedAt';
export const SIGNIN_NOTIFICATION_ID = 'signin-reminder';

export const NUDGE_SNOOZE_MS = 2 * 60 * 60 * 1000;          // "Remind me later" = 2 h
export const NOTIFY_INTERVAL_MS = 3 * 60 * 60 * 1000;       // at most one toast / 3 h
export const NOTIFY_START_HOUR = 8;                          // 08:00 local
export const NOTIFY_END_HOUR = 20;                           // until 20:00 local

export const BADGE_TEXT = '!';
export const BADGE_COLOR = '#F59E0B'; // amber
export const BADGE_TITLE = 'Sign in to Tabatha';

// Only Workspace policy installs get nudged.
export function isWorkspaceInstall(installType) {
  return installType === 'admin';
}

// Should reminders be active at all (independent of snooze / hours)?
export function needsSignIn({ installType, signedIn }) {
  return isWorkspaceInstall(installType) && signedIn === false;
}

// Banner at the top of Home / Sidebar / Settings.
export function shouldShowNudge({ installType, signedIn, snoozedUntil, now = Date.now() }) {
  if (!needsSignIn({ installType, signedIn })) return false;
  if (snoozedUntil && Number(snoozedUntil) > now) return false;
  return true;
}

export function snoozeUntil(now = Date.now(), ms = NUDGE_SNOOZE_MS) {
  return now + ms;
}

// 08:00 ≤ local hour < 20:00.
export function isWithinNotifyHours(date = new Date()) {
  const h = date.getHours();
  return h >= NOTIFY_START_HOUR && h < NOTIFY_END_HOUR;
}

// Earliest time the next Chrome notification may fire: 3 h after the last
// one, pushed forward into the 08:00–20:00 local window.
export function nextNotificationAt({ lastNotifiedAt, now = Date.now() }) {
  let t = Math.max(now, lastNotifiedAt ? Number(lastNotifiedAt) + NOTIFY_INTERVAL_MS : now);
  const d = new Date(t);
  const h = d.getHours();
  if (h < NOTIFY_START_HOUR) {
    d.setHours(NOTIFY_START_HOUR, 0, 0, 0);
    t = d.getTime();
  } else if (h >= NOTIFY_END_HOUR) {
    d.setDate(d.getDate() + 1);
    d.setHours(NOTIFY_START_HOUR, 0, 0, 0);
    t = d.getTime();
  }
  return t;
}

export function shouldNotify({ installType, signedIn, lastNotifiedAt, now = Date.now() }) {
  if (!needsSignIn({ installType, signedIn })) return false;
  if (!isWithinNotifyHours(new Date(now))) return false;
  return nextNotificationAt({ lastNotifiedAt, now }) <= now;
}

// Toolbar badge plan. We must never clobber a badge someone else set: if the
// badge currently shows anything other than our own "!", only the tooltip
// is changed.
//   { badge: 'set' | 'clear' | 'leave', title: 'set' | 'restore' | 'leave' }
export function decideBadge({ installType, signedIn, currentBadgeText }) {
  const current = currentBadgeText || '';
  const ours = current === BADGE_TEXT;
  if (needsSignIn({ installType, signedIn })) {
    return { badge: current === '' || ours ? 'set' : 'leave', title: 'set' };
  }
  // Signed in (or not a Workspace install): remove only what we put there.
  // Non-Workspace installs never had our tooltip, so leave theirs alone.
  if (!isWorkspaceInstall(installType) && !ours) return { badge: 'leave', title: 'leave' };
  return { badge: ours ? 'clear' : 'leave', title: 'restore' };
}
