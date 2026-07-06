// ════════════════════════════════════════════
// scheduleModel — pure helpers for NB-01/NB-02 (Work Schedule +
// Required Hours). NO chrome.* / NO supabase — unit-testable under
// `node --test` (see test/scheduleModel.test.js).
//
// HOURS MODEL (Malkio-approved):
//   Required-hours minimums are INDEPENDENT floors at any combination of
//   daily / weekly / monthly cadences (anti-back-loading: satisfying the
//   weekly floor never excuses missed daily floors — each cadence is
//   evaluated on its own).
//
// CONVENTIONS:
//   • weekday 0 = Monday … 6 = Sunday (matches migration 023 + the
//     Mon-first DAYS order in src/workshifts).
//   • Cadence windows: daily = local calendar day; weekly = Monday 00:00
//     through Sunday 24:00 (local); monthly = 1st through last day.
//   • period_start (the ledger key) = ISO date (YYYY-MM-DD) of the
//     window's first day, in LOCAL time.
// ════════════════════════════════════════════

export const CADENCES = Object.freeze(['daily', 'weekly', 'monthly']);

export const WEEKDAY_LABELS = Object.freeze([
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
]);

/** JS Date#getDay() (Sun=0) → Tabatha weekday (Mon=0 … Sun=6). */
export function jsDayToWeekday(jsDay) {
  return (Number(jsDay) + 6) % 7;
}

/** Minutes-from-midnight → 'HH:MM' (for <input type="time">). */
export function minuteToHHMM(min) {
  const m = Math.max(0, Math.min(1440, Math.round(Number(min) || 0)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 'HH:MM' → minutes-from-midnight, or null when unparseable. */
export function hhmmToMinute(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59) return null;
  return Math.min(1440, h * 60 + mm);
}

/** Local YYYY-MM-DD for a Date. */
export function toISODate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The cadence window containing `at` (Date or ms).
 * Returns { start: Date, end: Date, periodStart: 'YYYY-MM-DD' } where
 * start is inclusive and end is EXCLUSIVE (first instant after the window).
 */
export function cadenceWindow(cadence, at) {
  const d = new Date(at);
  const y = d.getFullYear();
  const mo = d.getMonth();
  const day = d.getDate();

  let start;
  let end;
  if (cadence === 'daily') {
    start = new Date(y, mo, day);
    end = new Date(y, mo, day + 1);
  } else if (cadence === 'weekly') {
    const back = jsDayToWeekday(d.getDay()); // days since Monday
    start = new Date(y, mo, day - back);
    end = new Date(y, mo, day - back + 7);
  } else if (cadence === 'monthly') {
    start = new Date(y, mo, 1);
    end = new Date(y, mo + 1, 1);
  } else {
    throw new Error(`Unknown cadence: ${cadence}`);
  }
  return { start, end, periodStart: toISODate(start) };
}

/** The cadence window immediately BEFORE the one containing `at`. */
export function previousCadenceWindow(cadence, at) {
  const { start } = cadenceWindow(cadence, at);
  return cadenceWindow(cadence, start.getTime() - 1);
}

/**
 * Worked minutes from clock sessions clipped to [windowStart, windowEnd).
 * Sessions use the clockHistory shape:
 *   { clockedInAt, clockedOutAt|null, breaks: [{start, end}] }
 * An open session (no clockedOutAt) is counted up to `now`.
 * Break time inside the window is subtracted proportionally to its overlap.
 */
export function computeWorkedMinutes(sessions, windowStart, windowEnd, now = Date.now()) {
  const ws = new Date(windowStart).getTime();
  const we = new Date(windowEnd).getTime();
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  let workedMs = 0;

  for (const s of sessions || []) {
    const inAt = s?.clockedInAt ? new Date(s.clockedInAt).getTime() : NaN;
    if (!Number.isFinite(inAt)) continue;
    const outAt = s?.clockedOutAt ? new Date(s.clockedOutAt).getTime() : nowMs;
    if (!Number.isFinite(outAt) || outAt <= inAt) continue;

    const from = Math.max(inAt, ws);
    const to = Math.min(outAt, we);
    if (to <= from) continue;
    let ms = to - from;

    for (const b of s.breaks || []) {
      const bs = b?.start ? new Date(b.start).getTime() : NaN;
      const be = b?.end ? new Date(b.end).getTime() : nowMs;
      if (!Number.isFinite(bs) || !Number.isFinite(be) || be <= bs) continue;
      const overlap = Math.min(be, to) - Math.max(bs, from);
      if (overlap > 0) ms -= overlap;
    }
    workedMs += Math.max(0, ms);
  }
  return Math.floor(workedMs / 60000);
}

/**
 * Shortfall for ONE requirement in the window containing `at`.
 * requirement: { cadence, min_minutes } (snake_case, as stored).
 * Returns { cadence, periodStart, minMinutes, workedMinutes,
 *           missingMinutes, remainingWindowMinutes }.
 */
export function computeShortfall(requirement, sessions, at, now = at) {
  const cadence = requirement?.cadence;
  const minMinutes = Math.max(0, Number(requirement?.min_minutes) || 0);
  const win = cadenceWindow(cadence, at);
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  const workedMinutes = computeWorkedMinutes(sessions, win.start, win.end, nowMs);
  const missingMinutes = Math.max(0, minMinutes - workedMinutes);
  const remainingWindowMinutes = Math.max(0, Math.floor((win.end.getTime() - nowMs) / 60000));
  return {
    cadence,
    periodStart: win.periodStart,
    minMinutes,
    workedMinutes,
    missingMinutes,
    remainingWindowMinutes,
  };
}

/**
 * Is a requirement row active on a given date? (effective_from/effective_to
 * are inclusive ISO dates; effective_to null = open.)
 */
export function isRequirementActive(requirement, onDate) {
  const iso = typeof onDate === 'string' ? onDate : toISODate(new Date(onDate));
  if (requirement?.effective_from && iso < requirement.effective_from) return false;
  if (requirement?.effective_to && iso > requirement.effective_to) return false;
  return true;
}

/**
 * shortfallsToPrompt — the detection core (NB-02).
 *
 * Evaluated at clock-out / when a cadence window nears close. For EVERY
 * active requirement (each cadence is an INDEPENDENT floor):
 *   1. The window that JUST CLOSED (the previous window) — if it ended with
 *      missing minutes, that shortfall is final: prompt + ledger it.
 *   2. The CURRENT window — prompt early only when the miss is already
 *      mathematically certain (missing > minutes remaining in the window),
 *      so back-loading can't silently make a floor unreachable.
 *
 * Returns an array of
 *   { cadence, periodStart, minMinutes, workedMinutes, missingMinutes,
 *     final: boolean }  — final=true for closed windows.
 */
export function shortfallsToPrompt(requirements, sessions, now = Date.now()) {
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  const out = [];

  for (const req of requirements || []) {
    if (!CADENCES.includes(req?.cadence)) continue;
    const minMinutes = Number(req?.min_minutes) || 0;
    if (minMinutes <= 0) continue;

    // (1) Previous (closed) window — the floor verdict is final.
    const prev = previousCadenceWindow(req.cadence, nowMs);
    if (isRequirementActive(req, prev.periodStart)) {
      const worked = computeWorkedMinutes(sessions, prev.start, prev.end, nowMs);
      const missing = Math.max(0, minMinutes - worked);
      if (missing > 0) {
        out.push({
          cadence: req.cadence,
          periodStart: prev.periodStart,
          minMinutes,
          workedMinutes: worked,
          missingMinutes: missing,
          final: true,
        });
      }
    }

    // (2) Current window — only when the miss is already certain.
    const cur = computeShortfall(req, sessions, nowMs, nowMs);
    if (
      isRequirementActive(req, cur.periodStart) &&
      cur.missingMinutes > 0 &&
      cur.missingMinutes > cur.remainingWindowMinutes
    ) {
      out.push({
        cadence: req.cadence,
        periodStart: cur.periodStart,
        minMinutes,
        workedMinutes: cur.workedMinutes,
        missingMinutes: cur.missingMinutes,
        final: false,
      });
    }
  }
  return out;
}

/** Dedupe key for a shortfall prompt (mirrors uq_shortfall_ledger_period). */
export function shortfallKey(s) {
  return `${s.cadence}:${s.periodStart}`;
}

// ────────────────────────────────────────────────────────────
// Slot <-> legacy local `workSchedule` cache conversion.
// The legacy chrome.storage key is { Monday: {start:'09:00', end:'17:00',
// enabled:true}, … } — kept as an OFFLINE CACHE; server slots are the
// source of truth when signed in.
// ────────────────────────────────────────────────────────────

/** Server slot rows → legacy local cache shape (first slot per weekday). */
export function slotsToLocalSchedule(slots) {
  const out = {};
  for (const s of slots || []) {
    const label = WEEKDAY_LABELS[s?.weekday];
    if (!label) continue;
    if (out[label]) continue; // legacy shape holds one range per day
    out[label] = {
      start: minuteToHHMM(s.start_minute),
      end: minuteToHHMM(s.end_minute),
      enabled: true,
    };
  }
  return out;
}

/** Legacy local cache shape → server slot payloads (enabled days only). */
export function localScheduleToSlots(schedule) {
  const out = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const entry = schedule?.[WEEKDAY_LABELS[weekday]];
    if (!entry?.enabled) continue;
    const start = hhmmToMinute(entry.start);
    const end = hhmmToMinute(entry.end);
    if (start === null || end === null || end <= start) continue;
    out.push({ weekday, start_minute: start, end_minute: end });
  }
  return out;
}

/** Total scheduled minutes per week from slot rows. */
export function weeklyScheduledMinutes(slots) {
  return (slots || []).reduce((sum, s) => {
    const dur = (Number(s?.end_minute) || 0) - (Number(s?.start_minute) || 0);
    return sum + Math.max(0, dur);
  }, 0);
}

/** Human label for minutes: 90 → '1h 30m'. */
export function fmtMinutes(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0 && mm > 0) return `${h}h ${mm}m`;
  if (h > 0) return `${h}h`;
  return `${mm}m`;
}
