// 6.7.88 — Workspace sign-in reminders: pure decisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkspaceInstall,
  needsSignIn,
  shouldShowNudge,
  snoozeUntil,
  isWithinNotifyHours,
  nextNotificationAt,
  shouldNotify,
  decideBadge,
  NUDGE_SNOOZE_MS,
  NOTIFY_INTERVAL_MS,
  BADGE_TEXT
} from '../src/utils/signInNudge.js';

const at = (h, m = 0, day = 15) => new Date(2026, 8, day, h, m, 0, 0).getTime(); // local time

test('only Workspace (admin) installs are nudged', () => {
  assert.equal(isWorkspaceInstall('admin'), true);
  for (const t of ['normal', 'development', 'sideload', 'other', undefined, null]) {
    assert.equal(isWorkspaceInstall(t), false, String(t));
    assert.equal(needsSignIn({ installType: t, signedIn: false }), false);
  }
});

test('signed in or unknown auth → no nudge', () => {
  assert.equal(needsSignIn({ installType: 'admin', signedIn: true }), false);
  assert.equal(needsSignIn({ installType: 'admin', signedIn: null }), false);
  assert.equal(needsSignIn({ installType: 'admin', signedIn: undefined }), false);
  assert.equal(needsSignIn({ installType: 'admin', signedIn: false }), true);
});

test('shouldShowNudge: Workspace + signed out → show', () => {
  assert.equal(shouldShowNudge({ installType: 'admin', signedIn: false, now: 1 }), true);
});

test('shouldShowNudge: never for store/staff installs', () => {
  assert.equal(shouldShowNudge({ installType: 'normal', signedIn: false, now: 1 }), false);
  assert.equal(shouldShowNudge({ installType: 'development', signedIn: false, now: 1 }), false);
});

test('"Remind me later" hides for 2 hours, then it returns', () => {
  const now = 10_000_000;
  const until = snoozeUntil(now);
  assert.equal(until, now + NUDGE_SNOOZE_MS);
  assert.equal(shouldShowNudge({ installType: 'admin', signedIn: false, snoozedUntil: until, now: now + 60_000 }), false);
  assert.equal(shouldShowNudge({ installType: 'admin', signedIn: false, snoozedUntil: until, now: until + 1 }), true);
});

test('notification hours are 08:00–20:00 local', () => {
  assert.equal(isWithinNotifyHours(new Date(at(7, 59))), false);
  assert.equal(isWithinNotifyHours(new Date(at(8, 0))), true);
  assert.equal(isWithinNotifyHours(new Date(at(19, 59))), true);
  assert.equal(isWithinNotifyHours(new Date(at(20, 0))), false);
  assert.equal(isWithinNotifyHours(new Date(at(2, 0))), false);
});

test('nextNotificationAt: 3 hours after the last one', () => {
  assert.equal(nextNotificationAt({ lastNotifiedAt: at(9), now: at(10) }), at(9) + NOTIFY_INTERVAL_MS);
});

test('nextNotificationAt: never notified → now (inside hours)', () => {
  assert.equal(nextNotificationAt({ lastNotifiedAt: null, now: at(10) }), at(10));
});

test('nextNotificationAt: pushes into the morning window', () => {
  // Last at 18:30 → +3h = 21:30 → next day 08:00.
  assert.equal(nextNotificationAt({ lastNotifiedAt: at(18, 30), now: at(19) }), at(8, 0, 16));
  // Early morning, never notified → 08:00 same day.
  assert.equal(nextNotificationAt({ lastNotifiedAt: null, now: at(5) }), at(8));
});

test('shouldNotify: at most every 3 hours', () => {
  const base = { installType: 'admin', signedIn: false };
  assert.equal(shouldNotify({ ...base, lastNotifiedAt: null, now: at(9) }), true);
  assert.equal(shouldNotify({ ...base, lastNotifiedAt: at(9), now: at(11, 59) }), false);
  assert.equal(shouldNotify({ ...base, lastNotifiedAt: at(9), now: at(12) }), true);
});

test('shouldNotify: quiet outside 08:00–20:00', () => {
  const base = { installType: 'admin', signedIn: false, lastNotifiedAt: null };
  assert.equal(shouldNotify({ ...base, now: at(7) }), false);
  assert.equal(shouldNotify({ ...base, now: at(21) }), false);
});

test('shouldNotify: never when signed in or non-Workspace', () => {
  assert.equal(shouldNotify({ installType: 'admin', signedIn: true, lastNotifiedAt: null, now: at(10) }), false);
  assert.equal(shouldNotify({ installType: 'normal', signedIn: false, lastNotifiedAt: null, now: at(10) }), false);
});

test('decideBadge: sets "!" when the badge is free', () => {
  assert.deepEqual(decideBadge({ installType: 'admin', signedIn: false, currentBadgeText: '' }), { badge: 'set', title: 'set' });
  assert.deepEqual(decideBadge({ installType: 'admin', signedIn: false, currentBadgeText: BADGE_TEXT }), { badge: 'set', title: 'set' });
});

test('decideBadge: never clobbers an active badge — tooltip only', () => {
  assert.deepEqual(decideBadge({ installType: 'admin', signedIn: false, currentBadgeText: '25m' }), { badge: 'leave', title: 'set' });
});

test('decideBadge: on sign-in clears only our own badge and restores the tooltip', () => {
  assert.deepEqual(decideBadge({ installType: 'admin', signedIn: true, currentBadgeText: BADGE_TEXT }), { badge: 'clear', title: 'restore' });
  assert.deepEqual(decideBadge({ installType: 'admin', signedIn: true, currentBadgeText: '25m' }), { badge: 'leave', title: 'restore' });
});

test('decideBadge: non-Workspace installs are left alone', () => {
  assert.deepEqual(decideBadge({ installType: 'normal', signedIn: false, currentBadgeText: '' }), { badge: 'leave', title: 'leave' });
  assert.deepEqual(decideBadge({ installType: 'development', signedIn: true, currentBadgeText: '3' }), { badge: 'leave', title: 'leave' });
});
