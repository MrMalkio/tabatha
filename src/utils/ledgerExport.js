// ============================================================
// Cortex C4/C6 — pure ledger-export helpers (Phase 1 T4).
// Build the nightly plain-file export the cron-in-harness agent reads:
// a JSON envelope with the day's normalized observations plus a repeat
// pre-aggregation that feeds the ≥3–4× pattern rule (C5).
// No chrome / DOM / supabase deps — unit-tested in isolation.
// ============================================================

import { dedupeKey } from './observationLedger.js';
import { sanitizeRelPath } from './captureArtifacts.js';

export const EXPORT_SCHEMA = 'cortex-ledger-export.v1';
export const INTRADAY_EXPORT_SCHEMA = 'cortex-ledger-intraday.v1';
export const REPEAT_THRESHOLD = 3; // C5: flag a pattern only at ≥3 repetitions

const DEFAULT_EXPORT_ROOT = 'Tabatha/Cortex';

// Shared partition/kind/repeat aggregation over a record set. The repeat
// candidates feed the ≥3× pattern rule (C5); consecutive-dwell collapsing is
// the consuming prompt's job (it can't be done safely without ordering here).
function aggregate(records) {
  const byPartition = {};
  const byKind = {};
  const repeatCounts = new Map();
  for (const rec of records) {
    if (rec.partition) byPartition[rec.partition] = (byPartition[rec.partition] || 0) + 1;
    if (rec.kind) byKind[rec.kind] = (byKind[rec.kind] || 0) + 1;
    const key = dedupeKey(rec);
    repeatCounts.set(key, (repeatCounts.get(key) || 0) + 1);
  }
  const candidates = [...repeatCounts.entries()]
    .filter(([, count]) => count >= REPEAT_THRESHOLD)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
  return { counts: { total: records.length, byPartition, byKind }, candidates };
}

/**
 * Pick the observations belonging to one UTC day ('YYYY-MM-DD').
 * UTC keeps the boundary deterministic across machines/timezones; the
 * consuming prompt reasons about the day as a whole, not clock edges.
 */
export function selectObservationsForDay(observations, day) {
  // Exact 10-char date compare — a partial day string must not over-match
  // (e.g. '2026-07-1' matching the 10th through 19th).
  return (observations || []).filter(
    (r) => typeof r?.ts === 'string' && r.ts.slice(0, 10) === day
  );
}

/**
 * Build the export envelope + filename for one day.
 * `now` is injected (epoch ms) so the builder stays pure/testable.
 */
export function buildLedgerExport(observations, { day, now }) {
  const records = selectObservationsForDay(observations, day);
  const { counts, candidates } = aggregate(records);

  return {
    filename: `cortex-ledger-${day}.json`,
    content: {
      schema: EXPORT_SCHEMA,
      day,
      generatedAt: new Date(now).toISOString(),
      counts,
      repeats: { threshold: REPEAT_THRESHOLD, candidates },
      records
    }
  };
}

/**
 * Pick observations at or after `sinceMs` (the recent-window slice the C6
 * intraday cadence reasons over). Unparseable timestamps are excluded — a
 * slice must never carry a record it can't place in the window.
 */
export function selectObservationsSince(observations, sinceMs) {
  return (observations || []).filter((r) => {
    const t = Date.parse(r?.ts);
    return Number.isFinite(t) && t >= sinceMs;
  });
}

/**
 * Build the INTRADAY (low-cadence) slice export the harness reads several
 * times a day. Same envelope/aggregation as the nightly export, but scoped to
 * the recent window (`[sinceMs, now]`), tagged `cadence: 'intraday'`, and
 * filename-marked `cortex-ledger-intraday-*` so the harness task self-selects
 * the intraday prompt. `now` is injected (epoch ms) so the builder stays pure.
 */
export function buildIntradayExport(observations, { sinceMs, now }) {
  const records = selectObservationsSince(observations, sinceMs);
  const { counts, candidates } = aggregate(records);
  // Filesystem-safe timestamp (no ':' / '.') so the marker filename is valid
  // on Windows/Downloads.
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');

  return {
    filename: `cortex-ledger-intraday-${stamp}.json`,
    content: {
      schema: INTRADAY_EXPORT_SCHEMA,
      cadence: 'intraday',
      windowStart: new Date(sinceMs).toISOString(),
      generatedAt: new Date(now).toISOString(),
      counts,
      repeats: { threshold: REPEAT_THRESHOLD, candidates },
      records
    }
  };
}

/**
 * C3 dual retention applied to the in-storage ledger: each partition prunes
 * by ITS OWN maxAgeDays (personal user-controlled, org admin-controlled).
 * A missing or zero policy keeps that partition's records untouched.
 */
export function pruneLedgerByAge(observations, retention, now) {
  return (observations || []).filter((rec) => {
    const days = retention?.[rec.partition]?.maxAgeDays;
    if (!days || days <= 0) return true;
    const age = now - Date.parse(rec.ts);
    return !(Number.isFinite(age) && age > days * 86400000);
  });
}

/**
 * Exports live in a sibling `exports/` folder next to the capture store, so
 * the harness cron has ONE stable Downloads-relative directory to read.
 */
export function buildExportRelPath(captureStoragePath, filename) {
  const root = sanitizeRelPath(captureStoragePath) || `${DEFAULT_EXPORT_ROOT}/captures`;
  const base = root.endsWith('/captures') ? root.slice(0, -'/captures'.length) : root;
  return `${base}/exports/${filename}`;
}
