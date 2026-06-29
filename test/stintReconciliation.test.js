// Tests for the pure stint-reconciliation helpers used by the Live Stints
// panel, the concurrency warning, and orphan cleanup.
// Run: node --test test/stintReconciliation.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLiveConcurrent,
  reconstructStintFromStatus,
  resolveAttributionTarget,
  classifyInstallForCleanup
} from '../src/utils/stintReconciliation.js';

const iso = (ms) => new Date(ms).toISOString();
const H = 3600000;
const M = 60000;

// ── isLiveConcurrent ─────────────────────────────────────────────
test('isLiveConcurrent: live same-class clocked_in is a conflict', () => {
  const row = { online: true, stale: false, clock_state: 'clocked_in', classification: 'professional' };
  assert.equal(isLiveConcurrent(row, 'professional'), true);
});

test('isLiveConcurrent: live same-class on_break is a conflict', () => {
  const row = { online: true, stale: false, clock_state: 'on_break', classification: 'professional' };
  assert.equal(isLiveConcurrent(row, 'professional'), true);
});

test('isLiveConcurrent: stale row is never a conflict', () => {
  const row = { online: true, stale: true, clock_state: 'clocked_in', classification: 'professional' };
  assert.equal(isLiveConcurrent(row, 'professional'), false);
});

test('isLiveConcurrent: offline row is never a conflict', () => {
  const row = { online: false, stale: false, clock_state: 'clocked_in', classification: 'professional' };
  assert.equal(isLiveConcurrent(row, 'professional'), false);
});

test('isLiveConcurrent: clocked_out row is never a conflict', () => {
  const row = { online: true, stale: false, clock_state: 'clocked_out', classification: 'professional' };
  assert.equal(isLiveConcurrent(row, 'professional'), false);
});

test('isLiveConcurrent: different classification is legitimate (no conflict)', () => {
  const row = { online: true, stale: false, clock_state: 'clocked_in', classification: 'personal' };
  assert.equal(isLiveConcurrent(row, 'professional'), false);
});

test('isLiveConcurrent: two personal clocks never conflict', () => {
  const row = { online: true, stale: false, clock_state: 'clocked_in', classification: 'personal' };
  assert.equal(isLiveConcurrent(row, 'personal'), false);
});

test('isLiveConcurrent: different business classes are legitimate', () => {
  const row = { online: true, stale: false, clock_state: 'clocked_in', classification: 'business' };
  assert.equal(isLiveConcurrent(row, 'professional'), false);
});

test('isLiveConcurrent: missing fields → false', () => {
  assert.equal(isLiveConcurrent({}, 'professional'), false);
  assert.equal(isLiveConcurrent(null, 'professional'), false);
});

// ── reconstructStintFromStatus ───────────────────────────────────
test('reconstructStintFromStatus: simple 2h stint, no break', () => {
  const start = 1_000_000_000_000;
  const end = start + 2 * H;
  const row = { clocked_in_at: iso(start), clock_state: 'clocked_in', last_heartbeat_at: iso(end) };
  const r = reconstructStintFromStatus(row, iso(end), end + M);
  assert.equal(r.clocked_in_at, iso(start));
  assert.equal(r.clocked_out_at, iso(end));
  assert.equal(r.total_ms, 2 * H);
  assert.equal(r.break_ms, 0);
  assert.equal(r.work_ms, 2 * H);
  assert.deepEqual(r.breaks, []);
});

test('reconstructStintFromStatus: died on break includes one break', () => {
  const start = 1_000_000_000_000;
  const breakStart = start + 90 * M;
  const end = start + 2 * H;
  const row = {
    clocked_in_at: iso(start),
    clock_state: 'on_break',
    on_break_since: iso(breakStart),
    last_heartbeat_at: iso(end)
  };
  const r = reconstructStintFromStatus(row, iso(end), end + M);
  assert.equal(r.break_ms, 30 * M);
  assert.equal(r.work_ms, 90 * M);
  assert.deepEqual(r.breaks, [{ start: iso(breakStart), end: iso(end) }]);
});

test('reconstructStintFromStatus: endTime before start clamps to start (zero-length)', () => {
  const start = 1_000_000_000_000;
  const row = { clocked_in_at: iso(start), clock_state: 'clocked_in', last_heartbeat_at: iso(start) };
  const r = reconstructStintFromStatus(row, iso(start - H), start + M);
  assert.equal(r.clocked_out_at, iso(start));
  assert.equal(r.total_ms, 0);
});

test('reconstructStintFromStatus: endTime in the future clamps to now', () => {
  const start = 1_000_000_000_000;
  const now = start + 1 * H;
  const row = { clocked_in_at: iso(start), clock_state: 'clocked_in', last_heartbeat_at: iso(now) };
  const r = reconstructStintFromStatus(row, iso(start + 10 * H), now);
  assert.equal(r.clocked_out_at, iso(now));
  assert.equal(r.total_ms, 1 * H);
});

test('reconstructStintFromStatus: missing endTime defaults to last_heartbeat_at', () => {
  const start = 1_000_000_000_000;
  const beat = start + 45 * M;
  const row = { clocked_in_at: iso(start), clock_state: 'clocked_in', last_heartbeat_at: iso(beat) };
  const r = reconstructStintFromStatus(row, null, beat + H);
  assert.equal(r.clocked_out_at, iso(beat));
  assert.equal(r.total_ms, 45 * M);
});

// ── resolveAttributionTarget ─────────────────────────────────────
test('resolveAttributionTarget: same class + same machine wins', () => {
  const orphan = { browser_profile_id: 'ghost', classification: 'professional', machine_id: 'mach-1' };
  const reals = [
    { browser_profile_id: 'realA', classification: 'professional', machine_id: 'mach-2' },
    { browser_profile_id: 'realB', classification: 'professional', machine_id: 'mach-1' }
  ];
  assert.equal(resolveAttributionTarget(orphan, reals), 'realB');
});

test('resolveAttributionTarget: same class, no machine match → same-class profile', () => {
  const orphan = { browser_profile_id: 'ghost', classification: 'professional', machine_id: null };
  const reals = [{ browser_profile_id: 'realA', classification: 'professional', machine_id: 'mach-9' }];
  assert.equal(resolveAttributionTarget(orphan, reals), 'realA');
});

test('resolveAttributionTarget: no same-class profile → falls back to orphan id', () => {
  const orphan = { browser_profile_id: 'ghost', classification: 'professional', machine_id: null };
  const reals = [{ browser_profile_id: 'realP', classification: 'personal', machine_id: null }];
  assert.equal(resolveAttributionTarget(orphan, reals), 'ghost');
});

test('resolveAttributionTarget: empty real list → orphan id', () => {
  const orphan = { browser_profile_id: 'ghost', classification: 'professional', machine_id: 'mach-1' };
  assert.equal(resolveAttributionTarget(orphan, []), 'ghost');
});

// ── classifyInstallForCleanup ────────────────────────────────────
test('classifyInstallForCleanup: self is never auto-cleaned', () => {
  assert.equal(classifyInstallForCleanup({ browser_profile_id: 'me', clock_state: 'clocked_in', stale: true }, 'me'), 'self');
});

test('classifyInstallForCleanup: live active install is left alone', () => {
  assert.equal(classifyInstallForCleanup({ browser_profile_id: 'a', clock_state: 'clocked_in', online: true, stale: false }, 'me'), 'live');
});

test('classifyInstallForCleanup: stale clocked_in → reconcile (reconstruct a stint)', () => {
  assert.equal(classifyInstallForCleanup({ browser_profile_id: 'a', clock_state: 'clocked_in', stale: true }, 'me'), 'reconcile');
});

test('classifyInstallForCleanup: stale on_break → reconcile', () => {
  assert.equal(classifyInstallForCleanup({ browser_profile_id: 'a', clock_state: 'on_break', stale: true }, 'me'), 'reconcile');
});

test('classifyInstallForCleanup: stale focus-only ghost (no clock) → dismiss', () => {
  assert.equal(classifyInstallForCleanup({ browser_profile_id: 'a', clock_state: null, focus_state: 'drifted', stale: true }, 'me'), 'dismiss');
});

test('classifyInstallForCleanup: stale clocked_out → dismiss', () => {
  assert.equal(classifyInstallForCleanup({ browser_profile_id: 'a', clock_state: 'clocked_out', stale: true }, 'me'), 'dismiss');
});

test('classifyInstallForCleanup: online idle install → skip', () => {
  assert.equal(classifyInstallForCleanup({ browser_profile_id: 'a', clock_state: null, online: true, stale: false }, 'me'), 'skip');
});

test('classifyInstallForCleanup: null row → skip', () => {
  assert.equal(classifyInstallForCleanup(null, 'me'), 'skip');
});
