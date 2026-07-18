// ============================================================
// Pure helpers for the Cortex C4 Observations Ledger. Normalize raw
// observation events (browser context, desktop app focus, captures,
// signals) into a stable, storage-ready record shape; collapse
// consecutive identical contexts; and split org vs personal time.
// No chrome / DOM / supabase dependencies — unit-tested in isolation.
// ============================================================

const ORG_CLOCK_STATES = new Set(['clocked_in', 'on_break']);

function orNull(value) {
  return value === undefined || value === null ? null : value;
}

/**
 * Normalize a raw observation into the canonical ledger record shape.
 * Every optional field is coerced to a concrete value or `null` (never
 * `undefined`) so downstream storage/serialization is stable.
 *
 * @param {object} raw
 * @param {number} raw.at          epoch ms (REQUIRED, finite)
 * @param {string} [raw.surface]   e.g. 'browser' | 'desktop'
 * @param {string} [raw.host]      hostname (lowercased on output)
 * @param {string} [raw.url]       (not carried onto the record)
 * @param {string} [raw.appName]   desktop app name
 * @param {string} [raw.title]     window/tab title (trimmed on output)
 * @param {string} [raw.category]
 * @param {string} [raw.focusId]
 * @param {string} [raw.intentId]
 * @param {string} [raw.captureRef]
 * @param {string} [raw.kind]      overrides derived kind if provided
 * @returns {{ts:string,kind:string,surface:string|null,app:string|null,
 *   host:string|null,title:string|null,category:string|null,
 *   focusId:string|null,intentId:string|null,captureRef:string|null}}
 */
export function normalizeObservation(raw = {}) {
  const { at } = raw;
  if (typeof at !== 'number' || !Number.isFinite(at)) {
    throw new TypeError('normalizeObservation: `at` must be a finite epoch-ms number');
  }

  const host = raw.host ? String(raw.host).toLowerCase() : null;
  const app = orNull(raw.appName);
  const captureRef = orNull(raw.captureRef);

  let title = null;
  if (raw.title !== undefined && raw.title !== null) {
    const trimmed = String(raw.title).trim();
    title = trimmed === '' ? null : trimmed;
  }

  let kind = orNull(raw.kind);
  if (!kind) {
    if (captureRef) kind = 'capture';
    else if (host || app) kind = 'context';
    else kind = 'signal';
  }

  return {
    ts: new Date(at).toISOString(),
    kind,
    surface: orNull(raw.surface),
    app,
    host,
    title,
    category: orNull(raw.category),
    focusId: orNull(raw.focusId),
    intentId: orNull(raw.intentId),
    captureRef
  };
}

/**
 * Stable key used to collapse consecutive identical contexts. Two records
 * that share surface + (host|app) + focus + intent are considered the same
 * ongoing context regardless of timestamp.
 *
 * @param {object} rec  a normalized observation record
 * @returns {string}
 */
export function dedupeKey(rec) {
  return `${rec.surface || ''}|${rec.host || rec.app || ''}|${rec.focusId || ''}|${rec.intentId || ''}`;
}

/**
 * Which ledger partition an observation belongs to. Everything captured while
 * clocked in (including on break) is org time; everything else is personal.
 *
 * @param {object} rec         normalized observation (unused today; reserved)
 * @param {string|null} clockState
 * @returns {'org'|'personal'}
 */
export function partitionOf(rec, clockState) {
  return ORG_CLOCK_STATES.has(clockState) ? 'org' : 'personal';
}
