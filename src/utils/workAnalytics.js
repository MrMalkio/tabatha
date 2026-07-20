// ============================================================
// Pure work-analytics computations for the Work Shifts → Analytics page
// (NB-04 P1+P2). Given local data — clock sessions, focus history, intent
// history — and a date range, produce every metric the page renders:
//   dailyHours[], weekly[], peakHours[24], breaks{}, perFocus[], switching{}
// No chrome / supabase / DOM dependencies — unit-tested in isolation
// (test/workAnalytics.test.js).
//
// Data shapes (from GET_CLOCK_HISTORY / GET_FOCUS_ENGINE / intentHistory):
//   session: { clockedInAt, clockedOutAt?, workMs?, breakMs?, breaks: [{start, end}] }
//     — clockedOutAt missing/null ⇒ OPEN shift, treated as ending `now`.
//   focus item: { id, label, startedAt?, endedAt?, completedAt?, elapsedMs? }
//   intent entry: { timestamp, action?, oldIntent?, newIntent?, oldContext?, newContext? }
// ============================================================

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

// ── Local-time date key (YYYY-MM-DD). Local, not UTC — a shift at 11pm
// belongs to the user's calendar day, matching how they think about it.
export function dayKey(dateLike) {
  const d = new Date(dateLike);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Start of the LOCAL day containing `dateLike`.
function startOfDay(dateLike) {
  const d = new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Start of the LOCAL week (Sunday) containing `dateLike` — matches the
// existing weeklyGroups convention in src/workshifts/index.jsx.
export function weekStart(dateLike) {
  const d = startOfDay(dateLike);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/**
 * Resolve a named range to an inclusive [startMs, endMs] window.
 * @param {'week'|'7d'|'30d'} range
 * @param {number} nowMs
 */
export function resolveRange(range, nowMs = Date.now()) {
  const end = nowMs;
  if (range === '7d') return { startMs: startOfDay(nowMs - 6 * DAY_MS).getTime(), endMs: end };
  if (range === '30d') return { startMs: startOfDay(nowMs - 29 * DAY_MS).getTime(), endMs: end };
  // default: this week (Sunday → now)
  return { startMs: weekStart(nowMs).getTime(), endMs: end };
}

// ── Interval helpers ──────────────────────────────────────────

/**
 * A session's WORK intervals: [clockedInAt, clockedOutAt||now] minus its
 * break intervals. Every downstream aggregation (daily, hourly, focus
 * overlap) walks these, so midnight-spanning shifts and open shifts are
 * handled once, here.
 * @returns {Array<[number, number]>} sorted, non-overlapping ms intervals
 */
export function sessionWorkIntervals(session, nowMs = Date.now()) {
  const start = new Date(session.clockedInAt).getTime();
  if (!Number.isFinite(start)) return [];
  const rawEnd = session.clockedOutAt ? new Date(session.clockedOutAt).getTime() : nowMs;
  const end = Math.max(start, Math.min(rawEnd, nowMs));
  if (end <= start) return [];

  // Clamp breaks into the shift window and sort.
  const breaks = (session.breaks || [])
    .map(b => {
      const bs = new Date(b.start).getTime();
      const be = b.end ? new Date(b.end).getTime() : end; // open break ⇒ runs to shift end
      return [Math.max(start, bs), Math.min(end, be)];
    })
    .filter(([bs, be]) => Number.isFinite(bs) && Number.isFinite(be) && be > bs)
    .sort((a, b) => a[0] - b[0]);

  const out = [];
  let cursor = start;
  for (const [bs, be] of breaks) {
    if (bs > cursor) out.push([cursor, bs]);
    cursor = Math.max(cursor, be);
  }
  if (cursor < end) out.push([cursor, end]);
  return out;
}

/** Overlap in ms between two [start, end] windows. */
export function overlapMs(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

// A focus item's [startMs, endMs] window, or null when it has no usable start.
function focusWindow(item, nowMs) {
  const start = item.startedAt ? new Date(item.startedAt).getTime() : NaN;
  if (!Number.isFinite(start)) return null;
  let end;
  if (item.endedAt) end = new Date(item.endedAt).getTime();
  else if (item.completedAt) end = new Date(item.completedAt).getTime();
  else if (typeof item.elapsedMs === 'number' && item.elapsedMs > 0) end = start + item.elapsedMs;
  else end = nowMs; // still running
  if (!Number.isFinite(end) || end <= start) return null;
  return [start, Math.min(end, nowMs)];
}

// True for intentHistory entries that represent a real context/intent change
// (mirrors isIntentChangeEntry in src/home/index.jsx).
function isIntentChange(entry) {
  return entry?.action === 'change'
    || entry?.oldIntent != null
    || entry?.newIntent != null
    || entry?.oldContext != null
    || entry?.newContext != null;
}

// ── Main computation ──────────────────────────────────────────

/**
 * Compute every Analytics-page metric from local data.
 *
 * @param {object} args
 * @param {Array}  args.sessions       clock history ({clockedInAt, clockedOutAt?, breaks[], ...})
 * @param {Array}  [args.focusHistory] focus items (engine history + queue union is fine)
 * @param {Array}  [args.intentHistory] intent history entries
 * @param {'week'|'7d'|'30d'} [args.range]
 * @param {number} [args.nowMs]
 * @param {number} [args.topFocusN]
 * @returns {{
 *   range: {startMs:number, endMs:number},
 *   dailyHours: Array<{date:string, label:string, workMs:number, breakMs:number, shifts:number}>,
 *   weekly: Array<{weekKey:string, workMs:number, breakMs:number, shifts:number}>,
 *   peakHours: number[],
 *   breaks: {count:number, totalMs:number, avgMs:number, byHour:number[]},
 *   perFocus: Array<{label:string, ms:number}>,
 *   switching: {total:number, shiftsCounted:number, avgPerShift:number, perHour:number},
 *   totals: {workMs:number, breakMs:number, shifts:number}
 * }}
 */
export function computeWorkAnalytics({
  sessions = [],
  focusHistory = [],
  intentHistory = [],
  range = 'week',
  nowMs = Date.now(),
  topFocusN = 8,
} = {}) {
  const win = resolveRange(range, nowMs);

  // Sessions relevant to the window (any overlap counts — a midnight-spanning
  // shift contributes its in-window portion).
  const relevant = sessions
    .map(s => ({ session: s, intervals: sessionWorkIntervals(s, nowMs) }))
    .filter(({ intervals }) =>
      intervals.length > 0
      && overlapMs(intervals[0][0], intervals[intervals.length - 1][1], win.startMs, win.endMs) > 0
    );

  // ── Daily hours: one row per calendar day in the range (zero-filled) ──
  const dailyMap = new Map();
  {
    // Step by calendar day (setDate) rather than +24h so DST days don't
    // skip or double-count.
    const cursor = startOfDay(win.startMs);
    while (cursor.getTime() <= win.endMs) {
      const key = dayKey(cursor);
      dailyMap.set(key, {
        date: key,
        label: cursor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        workMs: 0,
        breakMs: 0,
        shifts: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const hourBuckets = new Array(24).fill(0);
  let totalWorkMs = 0;

  for (const { intervals } of relevant) {
    for (const [s, e] of intervals) {
      // Split each work interval at LOCAL day boundaries.
      let cur = Math.max(s, win.startMs);
      const stop = Math.min(e, win.endMs);
      while (cur < stop) {
        const nextMidnight = new Date(cur);
        nextMidnight.setHours(24, 0, 0, 0); // rolls to next-day 00:00 local (DST-safe)
        const dayEnd = nextMidnight.getTime();
        const sliceEnd = Math.min(stop, dayEnd);
        const key = dayKey(cur);
        const row = dailyMap.get(key);
        const ms = sliceEnd - cur;
        if (row) row.workMs += ms;
        totalWorkMs += ms;

        // Hour-of-day buckets (peak productivity) — split at hour boundaries.
        let hCur = cur;
        while (hCur < sliceEnd) {
          const hd = new Date(hCur);
          const hourEnd = hd.setMinutes(60, 0, 0); // jump to next hour boundary
          const hSlice = Math.min(sliceEnd, hourEnd);
          hourBuckets[new Date(hCur).getHours()] += hSlice - hCur;
          hCur = hSlice;
        }
        cur = sliceEnd;
      }
    }
  }

  // Per-day break time + shift counts (shift attributed to its clock-in day).
  let totalBreakMs = 0;
  let shiftsInRange = 0;
  const breakStats = { count: 0, totalMs: 0, byHour: new Array(24).fill(0) };

  for (const { session } of relevant) {
    const inMs = new Date(session.clockedInAt).getTime();
    if (overlapMs(inMs, inMs + 1, win.startMs, win.endMs) > 0) {
      const row = dailyMap.get(dayKey(inMs));
      if (row) row.shifts += 1;
      shiftsInRange += 1;
    }
    for (const b of session.breaks || []) {
      const bs = new Date(b.start).getTime();
      const be = b.end ? new Date(b.end).getTime() : nowMs;
      if (!Number.isFinite(bs) || !Number.isFinite(be) || be <= bs) continue;
      const inWindow = overlapMs(bs, be, win.startMs, win.endMs);
      if (inWindow <= 0) continue;
      totalBreakMs += inWindow;
      breakStats.count += 1;
      breakStats.totalMs += inWindow;
      breakStats.byHour[new Date(Math.max(bs, win.startMs)).getHours()] += 1;
      const row = dailyMap.get(dayKey(Math.max(bs, win.startMs)));
      if (row) row.breakMs += inWindow;
    }
  }

  const dailyHours = [...dailyMap.values()]; // chronological by construction

  // ── Weekly comparison: group ALL sessions by week (last 8 weeks) ──
  // Deliberately range-independent, mirroring weeklyGroups in the page.
  const weeklyMap = new Map();
  for (const s of sessions) {
    const intervals = sessionWorkIntervals(s, nowMs);
    if (intervals.length === 0) continue;
    const key = dayKey(weekStart(new Date(s.clockedInAt)));
    if (!weeklyMap.has(key)) weeklyMap.set(key, { weekKey: key, workMs: 0, breakMs: 0, shifts: 0 });
    const wk = weeklyMap.get(key);
    wk.workMs += intervals.reduce((a, [is, ie]) => a + (ie - is), 0);
    for (const b of s.breaks || []) {
      const bs = new Date(b.start).getTime();
      const be = b.end ? new Date(b.end).getTime() : nowMs;
      if (Number.isFinite(bs) && Number.isFinite(be) && be > bs) wk.breakMs += be - bs;
    }
    wk.shifts += 1;
  }
  const weekly = [...weeklyMap.values()]
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey))
    .slice(-8);

  // ── P2: time per focus during shifts (timestamp overlap) ──
  const focusTotals = new Map();
  for (const item of focusHistory) {
    const fw = focusWindow(item, nowMs);
    if (!fw) continue;
    const label = item.label || item.name || '(unlabeled)';
    let ms = 0;
    for (const { intervals } of relevant) {
      for (const [s, e] of intervals) {
        ms += overlapMs(Math.max(s, win.startMs), Math.min(e, win.endMs), fw[0], fw[1]);
      }
    }
    if (ms > 0) focusTotals.set(label, (focusTotals.get(label) || 0) + ms);
  }
  const perFocus = [...focusTotals.entries()]
    .map(([label, ms]) => ({ label, ms }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, topFocusN);

  // ── P2: context-switching frequency per shift ──
  // A "switch" = an intent-change entry inside a shift window, plus each
  // focus START beyond the first within the same shift.
  const intentChangeTimes = (intentHistory || [])
    .filter(isIntentChange)
    .map(e => new Date(e.timestamp || e.createdAt || 0).getTime())
    .filter(Number.isFinite);
  const focusStartTimes = (focusHistory || [])
    .map(f => (f.startedAt ? new Date(f.startedAt).getTime() : NaN))
    .filter(Number.isFinite);

  let totalSwitches = 0;
  let shiftsCounted = 0;
  for (const { session } of relevant) {
    const sStart = Math.max(new Date(session.clockedInAt).getTime(), win.startMs);
    const rawEnd = session.clockedOutAt ? new Date(session.clockedOutAt).getTime() : nowMs;
    const sEnd = Math.min(rawEnd, win.endMs);
    if (sEnd <= sStart) continue;
    shiftsCounted += 1;
    const intentSwitches = intentChangeTimes.filter(t => t >= sStart && t <= sEnd).length;
    const focusStarts = focusStartTimes.filter(t => t >= sStart && t <= sEnd).length;
    totalSwitches += intentSwitches + Math.max(0, focusStarts - 1);
  }
  const workHours = totalWorkMs / HOUR_MS;
  const switching = {
    total: totalSwitches,
    shiftsCounted,
    avgPerShift: shiftsCounted > 0 ? totalSwitches / shiftsCounted : 0,
    perHour: workHours > 0 ? totalSwitches / workHours : 0,
  };

  return {
    range: win,
    dailyHours,
    weekly,
    peakHours: hourBuckets,
    breaks: {
      count: breakStats.count,
      totalMs: breakStats.totalMs,
      avgMs: breakStats.count > 0 ? breakStats.totalMs / breakStats.count : 0,
      byHour: breakStats.byHour,
    },
    perFocus,
    switching,
    totals: { workMs: totalWorkMs, breakMs: totalBreakMs, shifts: shiftsInRange },
  };
}

// ── CSV export ────────────────────────────────────────────────

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const msToHours = (ms) => (ms / HOUR_MS).toFixed(2);

/**
 * Serialize computed analytics into a single CSV document with one section
 * per metric (daily, weekly, peak hours, breaks, focus, switching).
 * @param {ReturnType<typeof computeWorkAnalytics>} a
 * @returns {string}
 */
export function analyticsToCsv(a) {
  const lines = [];
  lines.push('# Tabatha Work Analytics');

  lines.push('');
  lines.push('## Daily hours');
  lines.push('date,work_hours,break_hours,shifts');
  for (const d of a.dailyHours) {
    lines.push([d.date, msToHours(d.workMs), msToHours(d.breakMs), d.shifts].map(csvEscape).join(','));
  }

  lines.push('');
  lines.push('## Weekly comparison');
  lines.push('week_of,work_hours,break_hours,shifts');
  for (const w of a.weekly) {
    lines.push([w.weekKey, msToHours(w.workMs), msToHours(w.breakMs), w.shifts].map(csvEscape).join(','));
  }

  lines.push('');
  lines.push('## Peak hours (work time by hour of day)');
  lines.push('hour,work_hours');
  a.peakHours.forEach((ms, h) => lines.push(`${h},${msToHours(ms)}`));

  lines.push('');
  lines.push('## Breaks');
  lines.push('breaks_count,total_break_hours,avg_break_minutes');
  lines.push([a.breaks.count, msToHours(a.breaks.totalMs), (a.breaks.avgMs / 60000).toFixed(1)].join(','));

  lines.push('');
  lines.push('## Time per focus (during shifts)');
  lines.push('focus,hours');
  for (const f of a.perFocus) lines.push([csvEscape(f.label), msToHours(f.ms)].join(','));

  lines.push('');
  lines.push('## Context switching');
  lines.push('total_switches,shifts_counted,avg_per_shift,per_hour');
  lines.push([
    a.switching.total,
    a.switching.shiftsCounted,
    a.switching.avgPerShift.toFixed(2),
    a.switching.perHour.toFixed(2),
  ].join(','));

  return lines.join('\n') + '\n';
}
