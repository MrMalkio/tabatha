// NB-01/NB-02 — pure-helper tests for src/utils/scheduleModel.js.
// Cadence window math, worked-minute clipping, shortfall computation, the
// anti-back-loading independent-floors rule, and slot conversions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jsDayToWeekday,
  minuteToHHMM,
  hhmmToMinute,
  toISODate,
  cadenceWindow,
  previousCadenceWindow,
  computeWorkedMinutes,
  computeShortfall,
  isRequirementActive,
  shortfallsToPrompt,
  shortfallKey,
  slotsToLocalSchedule,
  localScheduleToSlots,
  weeklyScheduledMinutes,
  fmtMinutes,
} from '../src/utils/scheduleModel.js';

// Local-time fixture helpers. 2026-07-15 is a Wednesday.
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const session = (start, end, breaks = []) => ({
  clockedInAt: new Date(start).toISOString(),
  clockedOutAt: end ? new Date(end).toISOString() : null,
  breaks: breaks.map(([bs, be]) => ({ start: new Date(bs).toISOString(), end: new Date(be).toISOString() })),
});

// ── conventions ──

test('jsDayToWeekday maps Sun=0 JS days to Mon=0 Tabatha weekdays', () => {
  assert.equal(jsDayToWeekday(1), 0); // Monday
  assert.equal(jsDayToWeekday(3), 2); // Wednesday
  assert.equal(jsDayToWeekday(0), 6); // Sunday
});

test('minute/HHMM round-trips and rejects garbage', () => {
  assert.equal(minuteToHHMM(540), '09:00');
  assert.equal(minuteToHHMM(1439), '23:59');
  assert.equal(hhmmToMinute('09:00'), 540);
  assert.equal(hhmmToMinute('23:59'), 1439);
  assert.equal(hhmmToMinute('9:30'), 570);
  assert.equal(hhmmToMinute('nope'), null);
  assert.equal(hhmmToMinute('25:00'), null);
});

// ── cadence windows ──

test('daily window is the local calendar day', () => {
  const w = cadenceWindow('daily', at(2026, 7, 15, 14, 30));
  assert.equal(toISODate(w.start), '2026-07-15');
  assert.equal(toISODate(w.end), '2026-07-16');
  assert.equal(w.periodStart, '2026-07-15');
});

test('weekly window runs Monday through Sunday (Mon-first)', () => {
  const w = cadenceWindow('weekly', at(2026, 7, 15)); // a Wednesday
  assert.equal(w.periodStart, '2026-07-13'); // that Monday
  assert.equal(toISODate(w.end), '2026-07-20'); // next Monday (exclusive)
  // A Sunday belongs to the week that STARTED the previous Monday.
  const sun = cadenceWindow('weekly', at(2026, 7, 19, 23, 59));
  assert.equal(sun.periodStart, '2026-07-13');
  // A Monday starts its own week.
  const mon = cadenceWindow('weekly', at(2026, 7, 13, 0, 0));
  assert.equal(mon.periodStart, '2026-07-13');
});

test('monthly window spans the calendar month incl. length quirks', () => {
  const w = cadenceWindow('monthly', at(2026, 2, 10)); // February 2026 (28 days)
  assert.equal(w.periodStart, '2026-02-01');
  assert.equal(toISODate(w.end), '2026-03-01');
});

test('previousCadenceWindow returns the adjacent earlier window', () => {
  assert.equal(previousCadenceWindow('daily', at(2026, 7, 15, 9)).periodStart, '2026-07-14');
  assert.equal(previousCadenceWindow('weekly', at(2026, 7, 15)).periodStart, '2026-07-06');
  assert.equal(previousCadenceWindow('monthly', at(2026, 7, 15)).periodStart, '2026-06-01');
  // Year boundary
  assert.equal(previousCadenceWindow('monthly', at(2026, 1, 5)).periodStart, '2025-12-01');
});

test('cadenceWindow throws on an unknown cadence', () => {
  assert.throws(() => cadenceWindow('fortnightly', Date.now()));
});

// ── worked minutes ──

test('computeWorkedMinutes clips sessions to the window and subtracts breaks', () => {
  const win = cadenceWindow('daily', at(2026, 7, 15));
  const sessions = [
    // 9:00–17:00 with a 30m break → 450m
    session(at(2026, 7, 15, 9), at(2026, 7, 15, 17), [[at(2026, 7, 15, 12), at(2026, 7, 15, 12, 30)]]),
    // Previous day — fully outside the window
    session(at(2026, 7, 14, 9), at(2026, 7, 14, 17)),
    // Overnight from the 14th, ends 01:00 on the 15th → only 60m counts
    session(at(2026, 7, 14, 22), at(2026, 7, 15, 1)),
  ];
  assert.equal(computeWorkedMinutes(sessions, win.start, win.end), 450 + 60);
});

test('computeWorkedMinutes counts an open session up to now', () => {
  const win = cadenceWindow('daily', at(2026, 7, 15));
  const open = [session(at(2026, 7, 15, 9), null)];
  assert.equal(computeWorkedMinutes(open, win.start, win.end, at(2026, 7, 15, 11)), 120);
});

test('computeWorkedMinutes tolerates malformed rows', () => {
  const win = cadenceWindow('daily', at(2026, 7, 15));
  const junk = [{}, { clockedInAt: 'not-a-date' }, null, session(at(2026, 7, 15, 10), at(2026, 7, 15, 9))];
  assert.equal(computeWorkedMinutes(junk, win.start, win.end), 0);
});

// ── shortfalls ──

test('computeShortfall reports missing minutes against the floor', () => {
  const req = { cadence: 'daily', min_minutes: 480 };
  const sessions = [session(at(2026, 7, 15, 9), at(2026, 7, 15, 13))]; // 240m
  const s = computeShortfall(req, sessions, at(2026, 7, 15, 13));
  assert.equal(s.workedMinutes, 240);
  assert.equal(s.missingMinutes, 240);
  assert.equal(s.periodStart, '2026-07-15');
});

test('isRequirementActive honours effective_from/effective_to', () => {
  const req = { cadence: 'daily', min_minutes: 60, effective_from: '2026-07-10', effective_to: '2026-07-20' };
  assert.equal(isRequirementActive(req, '2026-07-09'), false);
  assert.equal(isRequirementActive(req, '2026-07-10'), true);
  assert.equal(isRequirementActive(req, '2026-07-20'), true);
  assert.equal(isRequirementActive(req, '2026-07-21'), false);
  assert.equal(isRequirementActive({ cadence: 'daily', min_minutes: 60 }, '2026-07-15'), true);
});

test('shortfallsToPrompt flags a just-closed daily window as final', () => {
  const reqs = [{ cadence: 'daily', min_minutes: 480 }];
  // Worked only 4h yesterday (the 14th); today untouched, plenty of day left.
  const sessions = [session(at(2026, 7, 14, 9), at(2026, 7, 14, 13))];
  const out = shortfallsToPrompt(reqs, sessions, at(2026, 7, 15, 8));
  const finals = out.filter(s => s.final);
  assert.equal(finals.length, 1);
  assert.equal(finals[0].periodStart, '2026-07-14');
  assert.equal(finals[0].missingMinutes, 240);
});

test('shortfallsToPrompt flags the current window only when the miss is certain', () => {
  const reqs = [{ cadence: 'daily', min_minutes: 480 }];
  // 23:30 on the 15th, nothing worked today: 480 missing > 30 remaining → certain.
  const certain = shortfallsToPrompt(reqs, [session(at(2026, 7, 14, 9), at(2026, 7, 14, 17, 30))], at(2026, 7, 15, 23, 30));
  const current = certain.filter(s => !s.final && s.periodStart === '2026-07-15');
  assert.equal(current.length, 1);
  // 09:00 same day, same zero progress: still 900 minutes left → NOT flagged.
  const early = shortfallsToPrompt(reqs, [session(at(2026, 7, 14, 9), at(2026, 7, 14, 17, 30))], at(2026, 7, 15, 9));
  assert.equal(early.filter(s => !s.final).length, 0);
});

test('ANTI-BACK-LOADING: floors are independent — weekly met does not excuse daily misses', () => {
  const reqs = [
    { cadence: 'daily', min_minutes: 240 },   // 4h/day floor
    { cadence: 'weekly', min_minutes: 1200 }, // 20h/week floor
  ];
  // Week of Mon 2026-07-06: user back-loaded — 0h Mon-Thu, then 20h Fri+Sat.
  const sessions = [
    session(at(2026, 7, 10, 8), at(2026, 7, 10, 18)),  // Fri 10h
    session(at(2026, 7, 11, 8), at(2026, 7, 11, 18)),  // Sat 10h
  ];
  // Evaluate Saturday evening after Friday closed.
  const out = shortfallsToPrompt(reqs, sessions, at(2026, 7, 11, 20));
  // Weekly floor for THIS week (2026-07-06, 1200m worked) → no weekly
  // shortfall. (The empty PREVIOUS week 2026-06-29 is legitimately flagged —
  // out of scope for this fixture.)
  assert.equal(out.filter(s => s.cadence === 'weekly' && s.periodStart === '2026-07-06').length, 0);
  // But Friday's DAILY floor was met (600m)… the previous day check looks at
  // Friday only. Thursday's miss was final on Friday. At Sat 20:00, previous
  // daily window = Friday (worked 600 ≥ 240 → fine).
  assert.equal(out.filter(s => s.cadence === 'daily' && s.final).length, 0);

  // Now evaluate Thursday night instead — Wednesday (0m) is a final daily miss
  // even though the weekly floor could still be met later (back-loading).
  const midWeek = shortfallsToPrompt(reqs, [], at(2026, 7, 9, 22));
  const daily = midWeek.filter(s => s.cadence === 'daily' && s.final);
  assert.equal(daily.length, 1);
  assert.equal(daily[0].periodStart, '2026-07-08');
  assert.equal(daily[0].missingMinutes, 240);
});

test('shortfallsToPrompt skips inactive requirements and zero floors', () => {
  const reqs = [
    { cadence: 'daily', min_minutes: 0 },
    { cadence: 'daily', min_minutes: 240, effective_from: '2026-08-01' }, // not yet active
    { cadence: 'bogus', min_minutes: 240 },
  ];
  assert.deepEqual(shortfallsToPrompt(reqs, [], at(2026, 7, 15, 23, 59)), []);
});

test('shortfallKey matches the ledger uniqueness grain', () => {
  assert.equal(shortfallKey({ cadence: 'weekly', periodStart: '2026-07-13' }), 'weekly:2026-07-13');
});

// ── slot conversions ──

test('slotsToLocalSchedule / localScheduleToSlots round-trip', () => {
  const slots = [
    { weekday: 0, start_minute: 540, end_minute: 1020 }, // Mon 09:00–17:00
    { weekday: 4, start_minute: 600, end_minute: 840 },  // Fri 10:00–14:00
  ];
  const local = slotsToLocalSchedule(slots);
  assert.deepEqual(local.Monday, { start: '09:00', end: '17:00', enabled: true });
  assert.deepEqual(local.Friday, { start: '10:00', end: '14:00', enabled: true });
  assert.equal(local.Tuesday, undefined);
  const back = localScheduleToSlots(local);
  assert.deepEqual(back, slots);
});

test('localScheduleToSlots drops disabled and invalid days', () => {
  const out = localScheduleToSlots({
    Monday: { start: '09:00', end: '17:00', enabled: false },
    Tuesday: { start: '17:00', end: '09:00', enabled: true }, // inverted
    Wednesday: { start: 'nah', end: '17:00', enabled: true },
    Thursday: { start: '08:00', end: '12:00', enabled: true },
  });
  assert.deepEqual(out, [{ weekday: 3, start_minute: 480, end_minute: 720 }]);
});

test('weeklyScheduledMinutes sums slot durations', () => {
  assert.equal(weeklyScheduledMinutes([
    { start_minute: 540, end_minute: 1020 },
    { start_minute: 600, end_minute: 840 },
  ]), 480 + 240);
});

test('fmtMinutes renders human durations', () => {
  assert.equal(fmtMinutes(90), '1h 30m');
  assert.equal(fmtMinutes(120), '2h');
  assert.equal(fmtMinutes(45), '45m');
  assert.equal(fmtMinutes(0), '0m');
});
