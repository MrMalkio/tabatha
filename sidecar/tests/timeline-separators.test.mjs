// Fix Wave 3, item 4 (2026-07-20 spec) — day/week/month timeline boundary
// markers. Same mirror convention as the other tests/* files:
// sidecar/src/components/FocusTimeline.tsx can't be `import`ed under plain
// `node --test` (react-native/theme imports at module scope), so the pure
// boundary-math helpers are mirrored here verbatim.
//
//   dayKeyOf / isoWeekKeyOf / monthKeyOf / classifyBoundary
//     <- sidecar/src/components/FocusTimeline.tsx (exported, pure)
//
// If the source changes, update the mirror + re-run this file.

import test from 'node:test';
import assert from 'node:assert/strict';

// ── mirror: sidecar/src/components/FocusTimeline.tsx ───────────────────
function dayKeyOf(t, dayResetHour) {
  const d = new Date(t);
  const eff = d.getHours() < dayResetHour ? new Date(d.getTime() - 24 * 3600000) : d;
  return `${eff.getFullYear()}-${String(eff.getMonth() + 1).padStart(2, '0')}-${String(eff.getDate()).padStart(2, '0')}`;
}

function isoWeekKeyOf(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + firstDayNum) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKeyOf(dayKey) {
  return dayKey.slice(0, 7);
}

function classifyBoundary(prevT, currT, dayResetHour) {
  const prevDay = dayKeyOf(prevT, dayResetHour);
  const currDay = dayKeyOf(currT, dayResetHour);
  if (prevDay === currDay) return null;
  const prevMonth = monthKeyOf(prevDay);
  const currMonth = monthKeyOf(currDay);
  if (prevMonth !== currMonth) return 'month';
  const prevWeek = isoWeekKeyOf(prevDay);
  const currWeek = isoWeekKeyOf(currDay);
  if (prevWeek !== currWeek) return 'week';
  return 'day';
}
// ── end mirror ──────────────────────────────────────────────────────────

const HOUR = 3600000;
const DAY = 24 * HOUR;

test('dayKeyOf: same calendar day, resetHour=0 -> identical keys, no crossing', () => {
  const morning = new Date(2026, 0, 15, 9, 0).getTime();
  const evening = new Date(2026, 0, 15, 22, 0).getTime();
  assert.equal(dayKeyOf(morning, 0), dayKeyOf(evening, 0));
  assert.equal(classifyBoundary(morning, evening, 0), null);
});

test('classifyBoundary: crossing real midnight (resetHour=0) -> day', () => {
  const before = new Date(2026, 0, 15, 23, 30).getTime();
  const after = new Date(2026, 0, 16, 0, 30).getTime();
  assert.equal(classifyBoundary(before, after, 0), 'day');
});

test('dayKeyOf: dayResetHour rolls an early-morning timestamp back to the PREVIOUS calendar day', () => {
  // 1am with dayResetHour=6 -> still counts as the previous day, mirroring
  // profileLocalClock's own roll-back rule (Context View's day countdown
  // uses the same convention).
  const oneAm = new Date(2026, 0, 16, 1, 0).getTime();
  assert.equal(dayKeyOf(oneAm, 6), '2026-01-15');
});

test('classifyBoundary: dayResetHour=6 means 1am and 5am of the "same" calendar day are NOT a crossing, but 1am and the next 7am IS', () => {
  const oneAm = new Date(2026, 0, 16, 1, 0).getTime();
  const fiveAm = new Date(2026, 0, 16, 5, 0).getTime();
  assert.equal(classifyBoundary(oneAm, fiveAm, 6), null, 'both roll back to Jan 15 under a 6am reset hour');

  const nextSevenAm = new Date(2026, 0, 16, 7, 0).getTime();
  assert.equal(classifyBoundary(oneAm, nextSevenAm, 6), 'day', 'the 7am timestamp is past the reset hour -> Jan 16, a real crossing');
});

test('classifyBoundary: a gap within the same ISO week but crossing a day -> day, not week', () => {
  // Tuesday -> Wednesday, same week.
  const tue = new Date(2026, 0, 13, 20, 0).getTime(); // Tue Jan 13 2026
  const wed = new Date(2026, 0, 14, 8, 0).getTime(); // Wed Jan 14 2026
  assert.equal(classifyBoundary(tue, wed, 0), 'day');
});

test('classifyBoundary: crossing an ISO week boundary (Sunday -> Monday) -> week', () => {
  // Jan 11 2026 is a Sunday, Jan 12 2026 is a Monday (new ISO week).
  const sun = new Date(2026, 0, 11, 20, 0).getTime();
  const mon = new Date(2026, 0, 12, 8, 0).getTime();
  assert.equal(classifyBoundary(sun, mon, 0), 'week');
});

test('classifyBoundary: crossing a month boundary -> month (the largest granularity wins, not also "week")', () => {
  const jan31 = new Date(2026, 0, 31, 20, 0).getTime();
  const feb1 = new Date(2026, 1, 1, 8, 0).getTime();
  const kind = classifyBoundary(jan31, feb1, 0);
  assert.equal(kind, 'month');
});

test('classifyBoundary: a multi-week gap that also crosses a month boundary reports ONLY "month" (single marker per gap)', () => {
  const midJan = new Date(2026, 0, 10, 12, 0).getTime();
  const midMarch = new Date(2026, 2, 10, 12, 0).getTime();
  assert.equal(classifyBoundary(midJan, midMarch, 0), 'month');
});

test('classifyBoundary: a multi-week gap within the SAME month reports "week" (not "month")', () => {
  const jan1 = new Date(2026, 0, 1, 12, 0).getTime();
  const jan28 = new Date(2026, 0, 28, 12, 0).getTime();
  assert.equal(classifyBoundary(jan1, jan28, 0), 'week');
});

test('classifyBoundary is order-agnostic about which arg is "prev" for the null (same-day) case', () => {
  const t0 = Date.now();
  const t1 = t0 + 30 * 60000; // 30 min later, same day (assuming not near a reset-hour edge)
  const kindForward = classifyBoundary(t0, t1, 0);
  const kindBackward = classifyBoundary(t1, t0, 0);
  assert.equal(kindForward, kindBackward);
});

test('classifyBoundary: exactly one day (24h) apart at the same wall-clock time -> day', () => {
  const t0 = new Date(2026, 0, 15, 14, 0).getTime();
  const t1 = t0 + DAY;
  assert.equal(classifyBoundary(t0, t1, 0), 'day');
});
