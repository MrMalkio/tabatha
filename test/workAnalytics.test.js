// Tests for the pure work-analytics computations behind the
// Work Shifts → Analytics page (NB-04 P1+P2).
// Run: node --test test/workAnalytics.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey,
  weekStart,
  resolveRange,
  sessionWorkIntervals,
  overlapMs,
  computeWorkAnalytics,
  analyticsToCsv,
} from '../src/utils/workAnalytics.js';

const H = 3600000;
const M = 60000;

// Fixed anchor: a local Wednesday at 18:00 so "this week" always contains
// several prior days regardless of when tests run.
function localDate(y, mo, d, h = 0, mi = 0) {
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}
const NOW = localDate(2026, 7, 1, 18, 0); // Wed Jul 1 2026, 18:00 local
const NOW_MS = NOW.getTime();
const iso = (ms) => new Date(ms).toISOString();

function mkSession(startMs, endMs, breaks = []) {
  return {
    clockedInAt: iso(startMs),
    clockedOutAt: endMs == null ? null : iso(endMs),
    breaks: breaks.map(([bs, be]) => ({ start: iso(bs), end: be == null ? null : iso(be) })),
  };
}

// ── dayKey / weekStart / resolveRange ────────────────────────────
test('dayKey uses local calendar day', () => {
  assert.equal(dayKey(localDate(2026, 7, 1, 23, 59)), '2026-07-01');
  assert.equal(dayKey(localDate(2026, 7, 2, 0, 0)), '2026-07-02');
});

test('weekStart returns the local Sunday at midnight', () => {
  const ws = weekStart(NOW); // Wed Jul 1 2026 → Sun Jun 28 2026
  assert.equal(dayKey(ws), '2026-06-28');
  assert.equal(ws.getHours(), 0);
});

test('resolveRange: week starts at local Sunday, 7d/30d start at local midnight N-1 days back', () => {
  const wk = resolveRange('week', NOW_MS);
  assert.equal(dayKey(wk.startMs), '2026-06-28');
  assert.equal(wk.endMs, NOW_MS);

  const d7 = resolveRange('7d', NOW_MS);
  assert.equal(dayKey(d7.startMs), '2026-06-25'); // 6 days back, midnight
  const d30 = resolveRange('30d', NOW_MS);
  assert.equal(dayKey(d30.startMs), '2026-06-02'); // 29 days back
});

// ── sessionWorkIntervals ─────────────────────────────────────────
test('sessionWorkIntervals: simple closed shift, no breaks', () => {
  const s = mkSession(NOW_MS - 4 * H, NOW_MS - 1 * H);
  assert.deepEqual(sessionWorkIntervals(s, NOW_MS), [[NOW_MS - 4 * H, NOW_MS - 1 * H]]);
});

test('sessionWorkIntervals: breaks are subtracted', () => {
  const start = NOW_MS - 4 * H;
  const s = mkSession(start, NOW_MS, [[start + H, start + H + 30 * M]]);
  const iv = sessionWorkIntervals(s, NOW_MS);
  assert.deepEqual(iv, [
    [start, start + H],
    [start + H + 30 * M, NOW_MS],
  ]);
});

test('sessionWorkIntervals: OPEN shift ends at now', () => {
  const s = mkSession(NOW_MS - 2 * H, null);
  assert.deepEqual(sessionWorkIntervals(s, NOW_MS), [[NOW_MS - 2 * H, NOW_MS]]);
});

test('sessionWorkIntervals: open break runs to shift end', () => {
  const start = NOW_MS - 2 * H;
  const s = mkSession(start, null, [[start + H, null]]);
  assert.deepEqual(sessionWorkIntervals(s, NOW_MS), [[start, start + H]]);
});

test('sessionWorkIntervals: garbage input yields no intervals', () => {
  assert.deepEqual(sessionWorkIntervals({ clockedInAt: 'not-a-date' }, NOW_MS), []);
  // end before start
  assert.deepEqual(sessionWorkIntervals(mkSession(NOW_MS, NOW_MS - H), NOW_MS), []);
});

test('sessionWorkIntervals: future clockedOutAt is clamped to now', () => {
  const s = mkSession(NOW_MS - H, NOW_MS + 5 * H);
  assert.deepEqual(sessionWorkIntervals(s, NOW_MS), [[NOW_MS - H, NOW_MS]]);
});

test('overlapMs: disjoint windows overlap zero', () => {
  assert.equal(overlapMs(0, 10, 20, 30), 0);
  assert.equal(overlapMs(0, 10, 5, 30), 5);
});

// ── computeWorkAnalytics: zero data ──────────────────────────────
test('zero data: all metrics are empty/zero but well-formed', () => {
  const a = computeWorkAnalytics({ sessions: [], range: 'week', nowMs: NOW_MS });
  assert.equal(a.totals.workMs, 0);
  assert.equal(a.totals.shifts, 0);
  assert.equal(a.breaks.count, 0);
  assert.equal(a.breaks.avgMs, 0);
  assert.equal(a.peakHours.length, 24);
  assert.ok(a.peakHours.every(v => v === 0));
  assert.deepEqual(a.perFocus, []);
  assert.equal(a.switching.total, 0);
  assert.equal(a.switching.avgPerShift, 0);
  // zero-filled day rows Sunday → Wednesday inclusive
  assert.equal(a.dailyHours.length, 4);
  assert.ok(a.dailyHours.every(d => d.workMs === 0 && d.shifts === 0));
});

// ── daily hours ──────────────────────────────────────────────────
test('daily hours: work lands on the right local day', () => {
  const mondayNine = localDate(2026, 6, 29, 9).getTime();
  const sessions = [mkSession(mondayNine, mondayNine + 4 * H)];
  const a = computeWorkAnalytics({ sessions, range: 'week', nowMs: NOW_MS });
  const mon = a.dailyHours.find(d => d.date === '2026-06-29');
  assert.equal(mon.workMs, 4 * H);
  assert.equal(mon.shifts, 1);
  assert.equal(a.totals.workMs, 4 * H);
  assert.equal(a.totals.shifts, 1);
});

test('daily hours: midnight-spanning shift is split across both days', () => {
  // Mon 22:00 → Tue 02:00
  const start = localDate(2026, 6, 29, 22).getTime();
  const end = localDate(2026, 6, 30, 2).getTime();
  const a = computeWorkAnalytics({ sessions: [mkSession(start, end)], range: 'week', nowMs: NOW_MS });
  const mon = a.dailyHours.find(d => d.date === '2026-06-29');
  const tue = a.dailyHours.find(d => d.date === '2026-06-30');
  assert.equal(mon.workMs, 2 * H);
  assert.equal(tue.workMs, 2 * H);
  assert.equal(a.totals.workMs, 4 * H);
  // the shift itself is attributed to its clock-in day
  assert.equal(mon.shifts, 1);
  assert.equal(tue.shifts, 0);
});

test('daily hours: open shift accrues work up to now', () => {
  const start = NOW_MS - 3 * H;
  const a = computeWorkAnalytics({ sessions: [mkSession(start, null)], range: 'week', nowMs: NOW_MS });
  assert.equal(a.totals.workMs, 3 * H);
  const today = a.dailyHours.find(d => d.date === '2026-07-01');
  assert.equal(today.workMs, 3 * H);
});

test('range filtering: out-of-range sessions are excluded, straddlers clipped', () => {
  const lastMonth = localDate(2026, 5, 10, 9).getTime();
  // straddler: Sat 23:00 → Sun 01:00 (week starts Sun Jun 28 00:00)
  const satNight = localDate(2026, 6, 27, 23).getTime();
  const sessions = [
    mkSession(lastMonth, lastMonth + 8 * H),
    mkSession(satNight, satNight + 2 * H),
  ];
  const a = computeWorkAnalytics({ sessions, range: 'week', nowMs: NOW_MS });
  // only the in-window hour (Sun 00:00→01:00) counts
  assert.equal(a.totals.workMs, 1 * H);
  const sun = a.dailyHours.find(d => d.date === '2026-06-28');
  assert.equal(sun.workMs, 1 * H);
  // straddler clocked in before the window → not counted as an in-range shift
  assert.equal(a.totals.shifts, 0);
});

// ── peak hours ───────────────────────────────────────────────────
test('peak hours: work is bucketed by local hour of day', () => {
  // Mon 09:30 → 11:30 ⇒ 30m in hour 9, 60m in hour 10, 30m in hour 11
  const start = localDate(2026, 6, 29, 9, 30).getTime();
  const a = computeWorkAnalytics({ sessions: [mkSession(start, start + 2 * H)], range: 'week', nowMs: NOW_MS });
  assert.equal(a.peakHours[9], 30 * M);
  assert.equal(a.peakHours[10], 60 * M);
  assert.equal(a.peakHours[11], 30 * M);
  assert.equal(a.peakHours.reduce((x, y) => x + y, 0), 2 * H);
});

// ── breaks ───────────────────────────────────────────────────────
test('breaks: count, total, average, and hour bucket', () => {
  const start = localDate(2026, 6, 29, 9).getTime();
  const sessions = [mkSession(start, start + 8 * H, [
    [start + 3 * H, start + 3 * H + 30 * M],   // 12:00–12:30
    [start + 6 * H, start + 6 * H + 10 * M],   // 15:00–15:10
  ])];
  const a = computeWorkAnalytics({ sessions, range: 'week', nowMs: NOW_MS });
  assert.equal(a.breaks.count, 2);
  assert.equal(a.breaks.totalMs, 40 * M);
  assert.equal(a.breaks.avgMs, 20 * M);
  assert.equal(a.breaks.byHour[12], 1);
  assert.equal(a.breaks.byHour[15], 1);
  // break time excluded from work
  assert.equal(a.totals.workMs, 8 * H - 40 * M);
  const mon = a.dailyHours.find(d => d.date === '2026-06-29');
  assert.equal(mon.breakMs, 40 * M);
});

// ── weekly comparison ────────────────────────────────────────────
test('weekly: groups all sessions by local Sunday-start week, capped at 8', () => {
  const sessions = [];
  for (let w = 0; w < 10; w++) {
    const monday = localDate(2026, 6, 29, 9).getTime() - w * 7 * 24 * H;
    sessions.push(mkSession(monday, monday + 2 * H));
  }
  const a = computeWorkAnalytics({ sessions, range: 'week', nowMs: NOW_MS });
  assert.equal(a.weekly.length, 8);
  // chronological ascending; newest week is this week
  assert.equal(a.weekly[a.weekly.length - 1].weekKey, '2026-06-28');
  assert.ok(a.weekly.every(w => w.workMs === 2 * H && w.shifts === 1));
});

// ── P2: time per focus ───────────────────────────────────────────
test('perFocus: focus time is clipped to shift work intervals', () => {
  const shiftStart = localDate(2026, 6, 29, 9).getTime();
  const sessions = [mkSession(shiftStart, shiftStart + 4 * H, [
    [shiftStart + H, shiftStart + H + 30 * M], // break 10:00–10:30
  ])];
  const focusHistory = [
    // 09:30–11:30 focus: 90m inside work (30m eaten by the break)
    { label: 'Deep Work', startedAt: iso(shiftStart + 30 * M), endedAt: iso(shiftStart + 2 * H + 30 * M) },
    // entirely outside any shift
    { label: 'Evening Reading', startedAt: iso(shiftStart + 10 * H), endedAt: iso(shiftStart + 11 * H) },
    // no start ⇒ ignored
    { label: 'Ghost', endedAt: iso(shiftStart + H) },
  ];
  const a = computeWorkAnalytics({ sessions, focusHistory, range: 'week', nowMs: NOW_MS });
  assert.equal(a.perFocus.length, 1);
  assert.equal(a.perFocus[0].label, 'Deep Work');
  assert.equal(a.perFocus[0].ms, 90 * M);
});

test('perFocus: still-running focus (no end) is clipped to now; same labels merge', () => {
  const shiftStart = NOW_MS - 2 * H;
  const sessions = [mkSession(shiftStart, null)]; // open shift
  const focusHistory = [
    { label: 'NB-04', startedAt: iso(shiftStart), endedAt: iso(shiftStart + H) },
    { label: 'NB-04', startedAt: iso(shiftStart + H) }, // open, runs to now
  ];
  const a = computeWorkAnalytics({ sessions, focusHistory, range: 'week', nowMs: NOW_MS });
  assert.equal(a.perFocus.length, 1);
  assert.equal(a.perFocus[0].ms, 2 * H);
});

test('perFocus: elapsedMs is used as duration when no end timestamp', () => {
  const shiftStart = localDate(2026, 6, 29, 9).getTime();
  const sessions = [mkSession(shiftStart, shiftStart + 4 * H)];
  const focusHistory = [
    { label: 'Sized', startedAt: iso(shiftStart), elapsedMs: 45 * M },
  ];
  const a = computeWorkAnalytics({ sessions, focusHistory, range: 'week', nowMs: NOW_MS });
  assert.equal(a.perFocus[0].ms, 45 * M);
});

test('perFocus: top-N cap and descending order', () => {
  const shiftStart = localDate(2026, 6, 29, 8).getTime();
  const sessions = [mkSession(shiftStart, shiftStart + 10 * H)];
  const focusHistory = Array.from({ length: 12 }, (_, i) => ({
    label: `F${i}`,
    startedAt: iso(shiftStart + i * 30 * M),
    endedAt: iso(shiftStart + i * 30 * M + (i + 1) * M), // longer for higher i
  }));
  const a = computeWorkAnalytics({ sessions, focusHistory, range: 'week', nowMs: NOW_MS, topFocusN: 5 });
  assert.equal(a.perFocus.length, 5);
  assert.equal(a.perFocus[0].label, 'F11');
  assert.ok(a.perFocus.every((f, i, arr) => i === 0 || arr[i - 1].ms >= f.ms));
});

// ── P2: context switching ────────────────────────────────────────
test('switching: intent changes inside shifts count; outside do not', () => {
  const shiftStart = localDate(2026, 6, 29, 9).getTime();
  const sessions = [mkSession(shiftStart, shiftStart + 4 * H)];
  const intentHistory = [
    { timestamp: iso(shiftStart + H), action: 'change' },
    { timestamp: iso(shiftStart + 2 * H), oldIntent: 'a', newIntent: 'b' },
    { timestamp: iso(shiftStart + 10 * H), action: 'change' }, // outside shift
    { timestamp: iso(shiftStart + 3 * H), action: 'created' }, // not a change entry
  ];
  const a = computeWorkAnalytics({ sessions, intentHistory, range: 'week', nowMs: NOW_MS });
  assert.equal(a.switching.total, 2);
  assert.equal(a.switching.shiftsCounted, 1);
  assert.equal(a.switching.avgPerShift, 2);
});

test('switching: each focus start beyond the first in a shift is a switch', () => {
  const shiftStart = localDate(2026, 6, 29, 9).getTime();
  const sessions = [mkSession(shiftStart, shiftStart + 4 * H)];
  const focusHistory = [
    { label: 'A', startedAt: iso(shiftStart + 10 * M) },
    { label: 'B', startedAt: iso(shiftStart + H) },
    { label: 'C', startedAt: iso(shiftStart + 2 * H) },
  ];
  const a = computeWorkAnalytics({ sessions, focusHistory, range: 'week', nowMs: NOW_MS });
  assert.equal(a.switching.total, 2); // 3 starts − 1
  assert.equal(a.switching.perHour, 0.5); // 2 switches / 4h work
});

test('switching: single focus start in a shift is zero switches', () => {
  const shiftStart = localDate(2026, 6, 29, 9).getTime();
  const sessions = [mkSession(shiftStart, shiftStart + 2 * H)];
  const focusHistory = [{ label: 'Solo', startedAt: iso(shiftStart + 10 * M) }];
  const a = computeWorkAnalytics({ sessions, focusHistory, range: 'week', nowMs: NOW_MS });
  assert.equal(a.switching.total, 0);
});

// ── CSV export ───────────────────────────────────────────────────
test('analyticsToCsv: contains every section and the computed rows', () => {
  const shiftStart = localDate(2026, 6, 29, 9).getTime();
  const sessions = [mkSession(shiftStart, shiftStart + 4 * H, [[shiftStart + H, shiftStart + H + 30 * M]])];
  const focusHistory = [{ label: 'Deep, "Work"', startedAt: iso(shiftStart), endedAt: iso(shiftStart + H) }];
  const a = computeWorkAnalytics({ sessions, focusHistory, range: 'week', nowMs: NOW_MS });
  const csv = analyticsToCsv(a);
  assert.ok(csv.includes('## Daily hours'));
  assert.ok(csv.includes('## Weekly comparison'));
  assert.ok(csv.includes('## Peak hours'));
  assert.ok(csv.includes('## Breaks'));
  assert.ok(csv.includes('## Time per focus'));
  assert.ok(csv.includes('## Context switching'));
  assert.ok(csv.includes('2026-06-29,3.50,0.50,1')); // 4h shift − 30m break
  assert.ok(csv.includes('"Deep, ""Work""",1.00')); // CSV escaping
  assert.ok(csv.endsWith('\n'));
});

test('analyticsToCsv: zero data still yields a valid document', () => {
  const a = computeWorkAnalytics({ sessions: [], range: 'week', nowMs: NOW_MS });
  const csv = analyticsToCsv(a);
  assert.ok(csv.startsWith('# Tabatha Work Analytics'));
  assert.ok(csv.includes('breaks_count,total_break_hours,avg_break_minutes'));
  assert.ok(csv.includes('0,0.00,0.0'));
});
