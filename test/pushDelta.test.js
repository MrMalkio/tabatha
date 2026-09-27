// Regression guard for the 2026-09-27 Flux database outage.
//
// ROOT CAUSE: every sync cycle (5-min alarm + debounced syncs after each
// mutation) upserted EVERY focus row — active and history — plus every
// registry row, whether or not anything changed. An UPDATE with identical
// values still writes a new tuple, index entries, WAL, a realtime event, and
// later vacuum work. On the free-tier nano instance that steadily drained the
// project's Disk IO budget (Supabase warned 09-01, 09-09, 09-21) until the
// database became unresponsive ("Failed to connect to database").
// The fix pushes only rows whose content changed since the last successful
// push, with a periodic full resync as a convergence safety net.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rowFingerprint, rowKey, selectChangedRows, FULL_RESYNC_MS, MAX_TRACKED_KEYS
} from '../src/utils/pushDelta.js';

const T0 = Date.parse('2026-09-27T12:00:00Z');
const row = (id, extra = {}) => ({ profile_id: 'p', client_id: id, label: 'L' + id, tags: { a: 1, b: [1, 2] }, ...extra });

test('fingerprint ignores volatile timestamps and key order', () => {
  const a = rowFingerprint({ x: 1, y: { p: 1, q: 2 }, synced_at: 'A', updated_at: 'B', last_seen_at: 'C' });
  const b = rowFingerprint({ y: { q: 2, p: 1 }, synced_at: 'Z', x: 1 });
  assert.equal(a, b);
  assert.notEqual(rowFingerprint({ x: 1 }), rowFingerprint({ x: 2 }));
});

test('rowKey uses the onConflict columns', () => {
  assert.equal(rowKey(row('f1'), 'profile_id, client_id'), 'p|f1');
  assert.equal(rowKey({ profile_id: 'p', calendar_id: 'c' }, 'profile_id,calendar_id'), 'p|c');
});

test('first push sends everything and records a full resync', () => {
  const rows = [row('f1'), row('f2')];
  const { rows: out, nextState } = selectChangedRows(rows, 'profile_id, client_id', undefined, T0);
  assert.equal(out.length, 2);
  assert.equal(nextState.fullAt, new Date(T0).toISOString());
  assert.equal(Object.keys(nextState.hashes).length, 2);
});

test('an unchanged cycle sends nothing — even when synced_at moved', () => {
  const first = selectChangedRows([row('f1'), row('f2')], 'profile_id, client_id', undefined, T0);
  const again = [row('f1', { synced_at: 'later' }), row('f2', { synced_at: 'later' })];
  const { rows: out } = selectChangedRows(again, 'profile_id, client_id', first.nextState, T0 + 5 * 60000);
  assert.equal(out.length, 0);
});

test('only the changed row is sent', () => {
  const first = selectChangedRows([row('f1'), row('f2')], 'profile_id, client_id', undefined, T0);
  const { rows: out } = selectChangedRows([row('f1'), row('f2', { label: 'renamed' })], 'profile_id, client_id', first.nextState, T0 + 60000);
  assert.deepEqual(out.map((r) => r.client_id), ['f2']);
});

test('a new row is sent', () => {
  const first = selectChangedRows([row('f1')], 'profile_id, client_id', undefined, T0);
  const { rows: out } = selectChangedRows([row('f1'), row('f3')], 'profile_id, client_id', first.nextState, T0 + 60000);
  assert.deepEqual(out.map((r) => r.client_id), ['f3']);
});

test('after FULL_RESYNC_MS everything is sent again (convergence safety net)', () => {
  const first = selectChangedRows([row('f1'), row('f2')], 'profile_id, client_id', undefined, T0);
  const { rows: out, nextState } = selectChangedRows([row('f1'), row('f2')], 'profile_id, client_id', first.nextState, T0 + FULL_RESYNC_MS);
  assert.equal(out.length, 2);
  assert.equal(nextState.fullAt, new Date(T0 + FULL_RESYNC_MS).toISOString());
});

test('a corrupt or foreign stored state degrades to a full push, never a crash', () => {
  for (const bad of [null, 'x', { hashes: 'nope' }, { fullAt: 'not-a-date', hashes: {} }]) {
    const { rows: out } = selectChangedRows([row('f1')], 'profile_id, client_id', bad, T0);
    assert.equal(out.length, 1);
  }
});

test('tracked keys are capped so the local map cannot grow without bound', () => {
  const many = Array.from({ length: MAX_TRACKED_KEYS + 50 }, (_, i) => row('f' + i));
  const { nextState } = selectChangedRows(many, 'profile_id, client_id', undefined, T0);
  assert.equal(Object.keys(nextState.hashes).length, MAX_TRACKED_KEYS);
});
