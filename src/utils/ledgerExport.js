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
export const REPEAT_THRESHOLD = 3; // C5: flag a pattern only at ≥3 repetitions

const DEFAULT_EXPORT_ROOT = 'Tabatha/Cortex';

/**
 * Pick the observations belonging to one UTC day ('YYYY-MM-DD').
 * UTC keeps the boundary deterministic across machines/timezones; the
 * consuming prompt reasons about the day as a whole, not clock edges.
 */
export function selectObservationsForDay(observations, day) {
  return (observations || []).filter((r) => typeof r?.ts === 'string' && r.ts.startsWith(day));
}

/**
 * Build the export envelope + filename for one day.
 * `now` is injected (epoch ms) so the builder stays pure/testable.
 */
export function buildLedgerExport(observations, { day, now }) {
  const records = selectObservationsForDay(observations, day);

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

  return {
    filename: `cortex-ledger-${day}.json`,
    content: {
      schema: EXPORT_SCHEMA,
      day,
      generatedAt: new Date(now).toISOString(),
      counts: { total: records.length, byPartition, byKind },
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
