// Tests for the pure cloud outbox queue (background-routed cloud writes).
// enqueue / dedupe / backoff / flush-ordering, with no chrome / supabase / DOM
// dependencies.
// Run: node --test test/cloudOutbox.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOutbox,
  normalizeOutbox,
  enqueue,
  dueOps,
  markSuccess,
  markFailure,
  computeBackoff,
  nextWakeAt,
  size,
  peekByKey,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS
} from '../src/utils/cloudOutbox.js';

const T0 = 1_700_000_000_000;

// ── construction / normalization ─────────────────────────────────
test('createOutbox: empty array', () => {
  assert.deepEqual(createOutbox(), []);
  assert.equal(size(createOutbox()), 0);
});

test('normalizeOutbox: drops non-array + malformed ops', () => {
  assert.deepEqual(normalizeOutbox(null), []);
  assert.deepEqual(normalizeOutbox('nope'), []);
  const cleaned = normalizeOutbox([
    { id: 'a', type: 'x' },
    null,
    { id: 'b' },        // missing type
    { type: 'y' },      // missing id
    { id: 'c', type: 'z' }
  ]);
  assert.deepEqual(cleaned.map(o => o.id), ['a', 'c']);
});

// ── enqueue ──────────────────────────────────────────────────────
test('enqueue: appends a new op with immediate schedule', () => {
  const { outbox, op } = enqueue(createOutbox(), {
    type: 'cloud_profile_name',
    key: 'profile_name:p1',
    payload: { displayName: 'Alice' },
    now: T0
  });
  assert.equal(size(outbox), 1);
  assert.equal(op.type, 'cloud_profile_name');
  assert.equal(op.key, 'profile_name:p1');
  assert.equal(op.attempts, 0);
  assert.equal(op.createdAt, T0);
  assert.equal(op.nextAttemptAt, T0); // due immediately
  assert.deepEqual(op.payload, { displayName: 'Alice' });
});

test('enqueue: dedupe latest-wins per key (single pending write)', () => {
  let box = createOutbox();
  ({ outbox: box } = enqueue(box, { type: 't', key: 'k', payload: { v: 'A' }, now: T0 }));
  ({ outbox: box } = enqueue(box, { type: 't', key: 'k', payload: { v: 'B' }, now: T0 + 10 }));
  const res = enqueue(box, { type: 't', key: 'k', payload: { v: 'C' }, now: T0 + 20 });
  box = res.outbox;

  assert.equal(size(box), 1, 'still a single op for the key');
  const op = peekByKey(box, 'k');
  assert.deepEqual(op.payload, { v: 'C' }, 'latest payload wins');
  assert.equal(op.createdAt, T0, 'original createdAt preserved (FIFO stable)');
  assert.equal(op.updatedAt, T0 + 20);
});

test('enqueue: dedupe resets attempts + reschedules immediately', () => {
  let box = createOutbox();
  ({ outbox: box } = enqueue(box, { type: 't', key: 'k', payload: { v: 'A' }, now: T0 }));
  // simulate two failures pushing it into backoff
  ({ outbox: box } = markFailure(box, peekByKey(box, 'k').id, { now: T0, error: 'net' }));
  ({ outbox: box } = markFailure(box, peekByKey(box, 'k').id, { now: T0, error: 'net' }));
  assert.ok(peekByKey(box, 'k').nextAttemptAt > T0, 'is backed off');

  ({ outbox: box } = enqueue(box, { type: 't', key: 'k', payload: { v: 'B' }, now: T0 + 500 }));
  const op = peekByKey(box, 'k');
  assert.equal(op.attempts, 0, 'attempts reset on new enqueue');
  assert.equal(op.nextAttemptAt, T0 + 500, 'rescheduled to now');
});

test('enqueue: ops without a key are never deduped together', () => {
  let box = createOutbox();
  ({ outbox: box } = enqueue(box, { type: 't', payload: { v: 1 }, now: T0 }));
  ({ outbox: box } = enqueue(box, { type: 't', payload: { v: 2 }, now: T0 + 1 }));
  assert.equal(size(box), 2);
});

// ── dueOps ordering / filtering ──────────────────────────────────
test('dueOps: only elapsed ops, FIFO by createdAt', () => {
  let box = createOutbox();
  ({ outbox: box } = enqueue(box, { type: 't', key: 'a', now: T0 }));
  ({ outbox: box } = enqueue(box, { type: 't', key: 'b', now: T0 + 100 }));
  ({ outbox: box } = enqueue(box, { type: 't', key: 'c', now: T0 + 200 }));
  // Back off 'b' into the future.
  ({ outbox: box } = markFailure(box, peekByKey(box, 'b').id, { now: T0 + 200, error: 'x' }));

  const due = dueOps(box, T0 + 300);
  assert.deepEqual(due.map(o => o.key), ['a', 'c'], 'b is not yet due; a before c');
});

test('dueOps: nothing due when all backed off', () => {
  let box = createOutbox();
  ({ outbox: box } = enqueue(box, { type: 't', key: 'a', now: T0 }));
  ({ outbox: box } = markFailure(box, peekByKey(box, 'a').id, { now: T0, error: 'x' }));
  assert.equal(dueOps(box, T0 + 1).length, 0);
  assert.equal(dueOps(box, T0 + DEFAULT_BASE_DELAY_MS).length, 1, 'due once backoff elapses');
});

// ── backoff math ─────────────────────────────────────────────────
test('computeBackoff: doubles each failure, capped at max', () => {
  assert.equal(computeBackoff(0, 1000, 60000), 0);
  assert.equal(computeBackoff(1, 1000, 60000), 1000);
  assert.equal(computeBackoff(2, 1000, 60000), 2000);
  assert.equal(computeBackoff(3, 1000, 60000), 4000);
  assert.equal(computeBackoff(10, 1000, 60000), 60000, 'capped at max');
  assert.equal(computeBackoff(-1, 1000, 60000), 0);
});

test('computeBackoff: uses module defaults', () => {
  assert.equal(computeBackoff(1), DEFAULT_BASE_DELAY_MS);
  assert.ok(computeBackoff(999) <= DEFAULT_MAX_DELAY_MS);
});

// ── markFailure / markSuccess ────────────────────────────────────
test('markFailure: increments attempts + reschedules with backoff', () => {
  let box = createOutbox();
  ({ outbox: box } = enqueue(box, { type: 't', key: 'a', now: T0 }));
  const id = peekByKey(box, 'a').id;

  const r1 = markFailure(box, id, { now: T0, error: new Error('boom'), baseDelayMs: 1000, maxDelayMs: 60000 });
  assert.equal(r1.gaveUp, false);
  assert.equal(r1.op.attempts, 1);
  assert.equal(r1.op.nextAttemptAt, T0 + 1000);
  assert.equal(r1.op.lastError, 'boom');
});

test('markFailure: gives up + drops op at maxAttempts', () => {
  let box = createOutbox();
  ({ outbox: box } = enqueue(box, { type: 't', key: 'a', now: T0 }));
  const id = peekByKey(box, 'a').id;
  let gaveUp = false;
  for (let i = 0; i < 3; i++) {
    const r = markFailure(box, id, { now: T0, error: 'x', maxAttempts: 3 });
    box = r.outbox;
    gaveUp = r.gaveUp;
  }
  assert.equal(gaveUp, true);
  assert.equal(size(box), 0, 'poisoned op removed so it cannot wedge the queue');
});

test('markFailure: unknown id is a no-op', () => {
  let box = createOutbox();
  ({ outbox: box } = enqueue(box, { type: 't', key: 'a', now: T0 }));
  const r = markFailure(box, 'nope', { now: T0 });
  assert.equal(r.op, null);
  assert.equal(size(r.outbox), 1);
});

test('markSuccess: removes exactly the flushed op', () => {
  let box = createOutbox();
  ({ outbox: box } = enqueue(box, { type: 't', key: 'a', now: T0 }));
  ({ outbox: box } = enqueue(box, { type: 't', key: 'b', now: T0 + 1 }));
  const id = peekByKey(box, 'a').id;
  box = markSuccess(box, id);
  assert.equal(size(box), 1);
  assert.equal(peekByKey(box, 'a'), null);
  assert.ok(peekByKey(box, 'b'));
});

// ── nextWakeAt ───────────────────────────────────────────────────
test('nextWakeAt: earliest scheduled op, null when empty', () => {
  assert.equal(nextWakeAt(createOutbox()), null);
  let box = createOutbox();
  ({ outbox: box } = enqueue(box, { type: 't', key: 'a', now: T0 }));
  ({ outbox: box } = enqueue(box, { type: 't', key: 'b', now: T0 + 5 }));
  ({ outbox: box } = markFailure(box, peekByKey(box, 'a').id, { now: T0, error: 'x', baseDelayMs: 1000 }));
  // 'a' now at T0+1000, 'b' still at T0+5 → earliest is b.
  assert.equal(nextWakeAt(box), T0 + 5);
});

// ── end-to-end flush ordering ────────────────────────────────────
test('flush lifecycle: due → fail → backoff → retry → success', () => {
  let box = createOutbox();
  ({ outbox: box } = enqueue(box, { type: 'cloud_profile_name', key: 'n', payload: { displayName: 'X' }, now: T0 }));
  const id = peekByKey(box, 'n').id;

  // First flush attempt is due.
  assert.equal(dueOps(box, T0).length, 1);
  // It fails → backoff.
  ({ outbox: box } = markFailure(box, id, { now: T0, error: 'offline', baseDelayMs: 2000 }));
  assert.equal(dueOps(box, T0 + 1).length, 0, 'not retried during backoff');
  // After backoff it is due again.
  assert.equal(dueOps(box, T0 + 2000).length, 1);
  // Succeeds → gone.
  box = markSuccess(box, id);
  assert.equal(size(box), 0);
});
