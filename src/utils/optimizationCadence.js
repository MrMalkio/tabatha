// ============================================================
// Cortex C6 — pure multi-cadence optimization helpers (Plan 043 T3).
// The scheduling brain for the optimization loop: decide whether a LOW
// (intraday, cheap) or HIGH (end-of-day, deep) pass is due; build the
// lighter intraday prompt; and dedupe an intraday pass against what the
// EOD/earlier passes already emitted so we don't re-surface the same
// recommendation twice in one day.
// No chrome / DOM / supabase deps — unit-tested in isolation.
//
// Time model: `now` (and the last-run timestamps) are read in UTC so the
// decision is deterministic across machines/timezones (mirrors the UTC day
// boundary in ledgerExport.js). The alarm layer owns local-clock dispatch;
// this module only reasons about the injected `now`.
// ============================================================

import { INTRADAY_PROMPT_VERSION, INTRADAY_PROMPT_TEXT } from '../background/cortexPrompt.js';

function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function firstNum(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    const n = typeof v === 'number' ? v : Date.parse(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function wallClock(now) {
  const d = now instanceof Date ? now : new Date(now);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return { ms: NaN, hour: NaN, minute: NaN, dayKey: '' };
  return {
    ms,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dayKey: d.toISOString().slice(0, 10)
  };
}

/**
 * Decide whether a LOW (intraday) or HIGH (EOD) optimization pass is due.
 *
 * @param {number|Date} now
 * @param {object} state  runtime cadence state: { lastLowRunAt, lastHighRunAt }
 *                        (epoch ms or ISO strings). Takes precedence over config.
 * @param {object} config tunables: {
 *   intradayEveryMins = 120,  // LOW cadence
 *   eodHour = 22,             // HIGH fires once at/after this UTC hour
 *   activeStartHour = 7,      // LOW only during active hours
 *   highGuardMins = 60,       // LOW suppressed within N mins BEFORE eodHour
 *   lastLowRunAt, lastHighRunAt // fallback if not in `state`
 * }
 * @returns {{ run: 'low'|'high'|null, reason: string }}
 */
export function decideCadenceRun(now, state = {}, config = {}) {
  const intradayEveryMins = numOr(config.intradayEveryMins, 120);
  const eodHour = numOr(config.eodHour, 22);
  const activeStartHour = numOr(config.activeStartHour, 7);
  const highGuardMins = numOr(config.highGuardMins, 60);
  const lastLowRunAt = firstNum(state.lastLowRunAt, config.lastLowRunAt);
  const lastHighRunAt = firstNum(state.lastHighRunAt, config.lastHighRunAt);

  const wc = wallClock(now);
  if (!Number.isFinite(wc.ms)) return { run: null, reason: 'invalid-now' };

  const minsOfDay = wc.hour * 60 + wc.minute;
  const eodMins = eodHour * 60;

  // HIGH pass — end of day, at most once per UTC day. Takes priority.
  if (wc.hour >= eodHour) {
    const highRanToday =
      lastHighRunAt != null && wallClock(lastHighRunAt).dayKey === wc.dayKey;
    if (!highRanToday) return { run: 'high', reason: 'eod-high-due' };
    return { run: null, reason: 'eod-complete' };
  }

  // LOW pass — intraday, only during active hours, never inside the EOD guard.
  if (wc.hour < activeStartHour) return { run: null, reason: 'before-active-hours' };
  if (eodMins - minsOfDay < highGuardMins) return { run: null, reason: 'near-high-guard' };
  if (lastLowRunAt == null) return { run: 'low', reason: 'low-first' };
  const elapsedMins = (wc.ms - lastLowRunAt) / 60000;
  if (elapsedMins >= intradayEveryMins) return { run: 'low', reason: 'low-interval' };
  return { run: null, reason: 'low-cooldown' };
}

/**
 * Build the LIGHT intraday prompt for a recent ledger slice. Reuses the
 * versioned INTRADAY_PROMPT_TEXT (mirror of economize-intraday.v1.md) and
 * appends a compact summary of the slice so the harness agent has the
 * candidates in-context. The EOD pass still reuses economize-workflow.v1.
 *
 * @param {object} ledgerSlice a `cortex-ledger-intraday.v1` envelope, OR a
 *   `{ filename, content }` wrapper, OR a bare `{ records, repeats, counts }`.
 * @returns {{ version: string, text: string }}
 */
export function buildIntradayPrompt(ledgerSlice) {
  const slice = ledgerSlice && typeof ledgerSlice === 'object' ? ledgerSlice : {};
  const content = slice.content && typeof slice.content === 'object' ? slice.content : slice;
  const recordsCount =
    content?.counts?.total ??
    (Array.isArray(content?.records) ? content.records.length : 0);
  const candidates = Array.isArray(content?.repeats?.candidates)
    ? content.repeats.candidates
    : [];

  const summary =
    `Slice window: ${content?.windowStart || 'recent'} → ${content?.generatedAt || 'now'}\n` +
    `Records in slice: ${recordsCount}\n` +
    `Repeat candidates (>=3x this slice):\n` +
    (candidates.length
      ? candidates.map((c) => `  - ${c.key} x${c.count}`).join('\n')
      : '  (none)');

  return {
    version: INTRADAY_PROMPT_VERSION,
    text: `${INTRADAY_PROMPT_TEXT}\n\n---\n\n## This slice\n${summary}\n`
  };
}

/**
 * Stable dedupe key for a recommendation: type + its evidence keys (order-
 * independent). Falls back to the lowercased title when a recommendation
 * carries no evidence. Used so an intraday pass doesn't re-flag what an
 * earlier pass already surfaced.
 */
export function recommendationDedupeKey(rec) {
  const type = rec?.type || 'other';
  const keys = (Array.isArray(rec?.evidence) ? rec.evidence : [])
    .map((e) => String(e?.key || ''))
    .filter(Boolean)
    .sort();
  const basis = keys.length ? keys.join(',') : String(rec?.title || '').trim().toLowerCase();
  return `${type}|${basis}`;
}

function recTime(r) {
  const v = r?.emittedAt ?? r?.importedAt ?? r?.decidedAt ?? r?.ts ?? r?.day ?? null;
  if (v == null) return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Drop new recommendations that duplicate one already emitted within the
 * cooldown window. A new rec is dropped when a recent rec shares its dedupe
 * key AND was emitted no more than `windowHrs` before the new rec. When
 * either timestamp is missing, a keyed match is treated as a duplicate
 * (conservative — prefer not to double-surface).
 *
 * @returns {{ kept: object[], dropped: object[] }}
 */
export function dedupeAgainstRecent(newRecs, recentRecs, windowHrs = 24) {
  const windowMs = Math.max(0, numOr(windowHrs, 24)) * 3600000;

  // Latest emission time per recent key.
  const recentByKey = new Map();
  for (const r of Array.isArray(recentRecs) ? recentRecs : []) {
    const key = recommendationDedupeKey(r);
    const t = recTime(r);
    if (!recentByKey.has(key)) {
      recentByKey.set(key, t);
    } else {
      const prev = recentByKey.get(key);
      if (t != null && (prev == null || t > prev)) recentByKey.set(key, t);
    }
  }

  const kept = [];
  const dropped = [];
  for (const rec of Array.isArray(newRecs) ? newRecs : []) {
    const key = recommendationDedupeKey(rec);
    if (recentByKey.has(key)) {
      const recentT = recentByKey.get(key);
      const newT = recTime(rec);
      const withinWindow =
        recentT == null || newT == null || (newT - recentT >= 0 && newT - recentT <= windowMs);
      if (withinWindow) {
        dropped.push(rec);
        continue;
      }
    }
    kept.push(rec);
  }
  return { kept, dropped };
}
