// ============================================================
// Tabatha — Cloud Outbox (pure logic)
//
// A durable, retrying write queue for cloud mutations. Page contexts never
// block on their own auth state or race a UI timeout against a network call;
// they hand a mutation to the background service worker, which enqueues it
// here, gives an immediate optimistic ack, and flushes with exponential
// backoff when auth is ready / the network is online.
//
// This module is PURE: every function takes the current op list and returns a
// new one (or a small result object). All I/O (chrome.storage persistence,
// the actual Supabase call, alarms) lives in the background integration
// (src/background/services/cloudWriteService.js). Keeping the queue algebra
// pure makes enqueue / dedupe / backoff / flush-ordering unit-testable under
// node:test with zero mocking.
//
// Op shape:
//   {
//     id,            // stable unique id (reused across retries + dedupes)
//     key,           // idempotency key — latest-wins per key (e.g. profile name)
//     type,          // executor selector (e.g. 'cloud_profile_name')
//     payload,       // arbitrary JSON the executor needs
//     attempts,      // number of failed flush attempts so far
//     createdAt,     // first-enqueued time (drives FIFO order)
//     updatedAt,     // last mutated time
//     nextAttemptAt, // earliest time this op may be flushed again
//     lastError      // last failure message (diagnostics only)
//   }
// ============================================================

export const DEFAULT_BASE_DELAY_MS = 5000;      // 5s
export const DEFAULT_MAX_DELAY_MS = 5 * 60 * 1000; // 5m ceiling
export const DEFAULT_MAX_ATTEMPTS = 8;          // ~give up after 8 tries

/** A fresh, empty outbox. */
export function createOutbox() {
  return [];
}

/** Defensive: coerce any persisted value back into a clean op array. */
export function normalizeOutbox(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(op => op && typeof op === 'object' && op.id && op.type);
}

/**
 * Enqueue a mutation. Latest-wins per `key`: if an op with the same key is
 * already queued, its payload is replaced and it is rescheduled for immediate
 * retry (attempts reset to 0), so a burst of "rename to A, then B, then C"
 * collapses to a single pending write for C. Ops without a caller-supplied key
 * fall back to their id (never deduped against each other).
 *
 * Returns { outbox, op } — the new list and the (new or updated) op.
 */
export function enqueue(outbox, { type, key = null, payload = {}, now = Date.now(), id = null }) {
  const ops = normalizeOutbox(outbox);
  const dedupeKey = key || null;

  if (dedupeKey) {
    const idx = ops.findIndex(op => op.key === dedupeKey);
    if (idx >= 0) {
      const existing = ops[idx];
      const updated = {
        ...existing,
        type,
        payload,
        attempts: 0,
        updatedAt: now,
        nextAttemptAt: now,
        lastError: null
      };
      const next = ops.slice();
      next[idx] = updated;
      return { outbox: next, op: updated };
    }
  }

  const op = {
    id: id || makeOpId(dedupeKey, now),
    key: dedupeKey,
    type,
    payload,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: now,
    lastError: null
  };
  return { outbox: [...ops, op], op };
}

/** Ops whose backoff has elapsed, in FIFO (createdAt) order — flush order. */
export function dueOps(outbox, now = Date.now()) {
  return normalizeOutbox(outbox)
    .filter(op => (op.nextAttemptAt || 0) <= now)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/** Remove an op after a successful flush. */
export function markSuccess(outbox, id) {
  return normalizeOutbox(outbox).filter(op => op.id !== id);
}

/**
 * Exponential backoff for the Nth failure (failCount >= 1):
 *   delay = min(maxDelay, baseDelay * 2^(failCount - 1))
 * failCount <= 0 → 0 (flush immediately).
 */
export function computeBackoff(failCount, baseDelayMs = DEFAULT_BASE_DELAY_MS, maxDelayMs = DEFAULT_MAX_DELAY_MS) {
  if (!Number.isFinite(failCount) || failCount <= 0) return 0;
  const raw = baseDelayMs * Math.pow(2, failCount - 1);
  return Math.min(maxDelayMs, raw);
}

/**
 * Record a failed flush attempt. Increments attempts and either reschedules
 * with backoff, or — once attempts reaches maxAttempts — drops the op (gives
 * up) so a permanently-poisoned write can't wedge the queue forever.
 *
 * Returns { outbox, op, gaveUp }.
 */
export function markFailure(outbox, id, {
  now = Date.now(),
  error = null,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS
} = {}) {
  const ops = normalizeOutbox(outbox);
  const idx = ops.findIndex(op => op.id === id);
  if (idx < 0) return { outbox: ops, op: null, gaveUp: false };

  const existing = ops[idx];
  const attempts = (existing.attempts || 0) + 1;
  const errMsg = error == null ? null : (typeof error === 'string' ? error : (error.message || String(error)));

  if (attempts >= maxAttempts) {
    const next = ops.filter(op => op.id !== id);
    return { outbox: next, op: { ...existing, attempts, lastError: errMsg }, gaveUp: true };
  }

  const updated = {
    ...existing,
    attempts,
    updatedAt: now,
    nextAttemptAt: now + computeBackoff(attempts, baseDelayMs, maxDelayMs),
    lastError: errMsg
  };
  const next = ops.slice();
  next[idx] = updated;
  return { outbox: next, op: updated, gaveUp: false };
}

/** Earliest time any queued op wants to run again, or null when empty. */
export function nextWakeAt(outbox) {
  const ops = normalizeOutbox(outbox);
  if (ops.length === 0) return null;
  return ops.reduce((min, op) => {
    const t = op.nextAttemptAt || 0;
    return min === null ? t : Math.min(min, t);
  }, null);
}

/** Number of queued ops. */
export function size(outbox) {
  return normalizeOutbox(outbox).length;
}

/** Look up a single queued op by its idempotency key (or null). */
export function peekByKey(outbox, key) {
  if (!key) return null;
  return normalizeOutbox(outbox).find(op => op.key === key) || null;
}

function makeOpId(key, now) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${key || 'op'}#${now}#${rand}`;
}
