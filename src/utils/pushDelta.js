// Push only rows that changed since the last successful push.
//
// 2026-09-27 Flux outage: every sync cycle re-upserted every focus row and
// every registry row with unchanged content. Identical-value UPDATEs still
// write new tuples, index entries, WAL and realtime events, which drained the
// free-tier Disk IO budget until the database stopped responding. This module
// decides which rows actually need writing. A periodic full resync keeps the
// cloud converging even if a row was changed or lost server-side.
//
// Pure: no chrome/Supabase access; the caller loads/saves `state`.

// Fields the writers stamp with "now" on every push. They carry no content, so
// they must not make an otherwise identical row look changed.
const VOLATILE_KEYS = new Set(['synced_at', 'updated_at', 'last_seen_at']);

export const FULL_RESYNC_MS = 24 * 60 * 60 * 1000;
export const MAX_TRACKED_KEYS = 3000;

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

// 32-bit FNV-1a over the stable JSON, hex. Collisions only risk skipping one
// push until the next full resync.
export function rowFingerprint(row) {
  const content = {};
  for (const [k, v] of Object.entries(row || {})) if (!VOLATILE_KEYS.has(k)) content[k] = v;
  const s = stableStringify(content);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export function rowKey(row, onConflict) {
  return String(onConflict || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => String(row?.[c] ?? ''))
    .join('|');
}

// Returns { rows: rowsToPush, nextState }. Persist nextState ONLY after the
// push succeeds, so a failed write is retried next cycle.
export function selectChangedRows(rows, onConflict, state, now = Date.now()) {
  const prevHashes = state && typeof state.hashes === 'object' && state.hashes && !Array.isArray(state.hashes)
    ? state.hashes
    : {};
  const fullAtMs = state && typeof state.fullAt === 'string' ? Date.parse(state.fullAt) : NaN;
  const full = !Number.isFinite(fullAtMs) || now - fullAtMs >= FULL_RESYNC_MS || Object.keys(prevHashes).length === 0;

  const out = [];
  const batch = {};
  for (const row of rows) {
    const key = rowKey(row, onConflict);
    const fp = rowFingerprint(row);
    batch[key] = fp;
    if (full || prevHashes[key] !== fp) out.push(row);
  }

  // Newest entries last; keep the most recent MAX_TRACKED_KEYS.
  const merged = { ...prevHashes };
  for (const [k, v] of Object.entries(batch)) { delete merged[k]; merged[k] = v; }
  const keys = Object.keys(merged);
  const hashes = {};
  for (const k of keys.slice(Math.max(0, keys.length - MAX_TRACKED_KEYS))) hashes[k] = merged[k];

  return {
    rows: out,
    nextState: { hashes, fullAt: full ? new Date(now).toISOString() : state.fullAt }
  };
}
