// Tests for the pure comparator/reconcile helpers backing the extension's
// continuous live-ingest loop (feat/ext-live-ingest, v6.7.45) — focus
// cross-surface "current" arbitration and clock cross-surface "shift state"
// arbitration.
// Run: node --test test/liveIngestArbitration.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSidecarSourced,
  pickLatestByTime,
  focusRowStartedAtMs,
  localItemStartedAtMs,
  pickLatestActive,
  shouldAdoptFocus,
  reconcileKnownFocusRow,
  deriveLocalClockEvent,
  clockEventMs,
  pickLatestClockCandidate,
  shouldAdoptClock
} from '../src/utils/liveIngestArbitration.js';

const iso = (ms) => new Date(ms).toISOString();
const M = 60000;
const T0 = 1_800_000_000_000; // fixed epoch anchor for deterministic tests

// ── isSidecarSourced ─────────────────────────────────────────────
test('isSidecarSourced: true only when tags._src === "sidecar"', () => {
  assert.equal(isSidecarSourced({ _src: 'sidecar' }), true);
  assert.equal(isSidecarSourced({ _src: 'extension' }), false);
  assert.equal(isSidecarSourced({}), false);
  assert.equal(isSidecarSourced(null), false);
});

// ── pickLatestByTime ─────────────────────────────────────────────
test('pickLatestByTime: picks the strictly greatest ms', () => {
  const best = pickLatestByTime([{ id: 'a', ms: 100 }, { id: 'b', ms: 300 }, { id: 'c', ms: 200 }]);
  assert.equal(best.id, 'b');
});

test('pickLatestByTime: tie keeps the first-seen candidate (deterministic)', () => {
  const best = pickLatestByTime([{ id: 'a', ms: 100 }, { id: 'b', ms: 100 }]);
  assert.equal(best.id, 'a');
});

test('pickLatestByTime: empty/invalid → null', () => {
  assert.equal(pickLatestByTime([]), null);
  assert.equal(pickLatestByTime(null), null);
  assert.equal(pickLatestByTime([{ id: 'a', ms: NaN }]), null);
});

// ── focus effective-start ────────────────────────────────────────
test('focusRowStartedAtMs: prefers tags._startedAt over created_at', () => {
  const row = { tags: { _startedAt: iso(T0 + M) }, created_at: iso(T0) };
  assert.equal(focusRowStartedAtMs(row), T0 + M);
});

test('focusRowStartedAtMs: falls back to created_at when no tag', () => {
  const row = { tags: {}, created_at: iso(T0) };
  assert.equal(focusRowStartedAtMs(row), T0);
});

test('localItemStartedAtMs: prefers tags._startedAt, then lastResumedAt, then startedAt, then createdAt', () => {
  assert.equal(localItemStartedAtMs({ tags: { _startedAt: iso(T0 + 3 * M) }, lastResumedAt: iso(T0 + 2 * M), startedAt: iso(T0 + M), createdAt: iso(T0) }), T0 + 3 * M);
  assert.equal(localItemStartedAtMs({ tags: {}, lastResumedAt: iso(T0 + 2 * M), startedAt: iso(T0 + M), createdAt: iso(T0) }), T0 + 2 * M);
  assert.equal(localItemStartedAtMs({ tags: {}, startedAt: iso(T0 + M), createdAt: iso(T0) }), T0 + M);
  assert.equal(localItemStartedAtMs({ tags: {}, createdAt: iso(T0) }), T0);
});

// ── shouldAdoptFocus ──────────────────────────────────────────────
test('shouldAdoptFocus: adopts a strictly newer different id', () => {
  assert.equal(shouldAdoptFocus({ currentId: 'a', currentMs: T0, latestId: 'b', latestMs: T0 + M }), true);
});

test('shouldAdoptFocus: never adopts itself', () => {
  assert.equal(shouldAdoptFocus({ currentId: 'a', currentMs: T0, latestId: 'a', latestMs: T0 + M }), false);
});

test('shouldAdoptFocus: a tie does NOT adopt (prevents oscillation)', () => {
  assert.equal(shouldAdoptFocus({ currentId: 'a', currentMs: T0, latestId: 'b', latestMs: T0 }), false);
});

test('shouldAdoptFocus: an OLDER remote never adopts', () => {
  assert.equal(shouldAdoptFocus({ currentId: 'a', currentMs: T0, latestId: 'b', latestMs: T0 - M }), false);
});

test('shouldAdoptFocus: no current focus (null) still adopts a real candidate', () => {
  assert.equal(shouldAdoptFocus({ currentId: null, currentMs: -Infinity, latestId: 'b', latestMs: T0 }), true);
});

test('shouldAdoptFocus: no candidate at all → false', () => {
  assert.equal(shouldAdoptFocus({ currentId: 'a', currentMs: T0, latestId: null, latestMs: null }), false);
});

// ── pickLatestActive (thin focus-specific wrapper) ────────────────
test('pickLatestActive: account-wide winner across mixed local+remote candidates', () => {
  const winner = pickLatestActive([
    { id: 'local-1', ms: T0 },
    { id: 'sidecar-1', ms: T0 + 5 * M },
    { id: 'other-install-1', ms: T0 + 2 * M }
  ]);
  assert.equal(winner.id, 'sidecar-1');
});

// ── reconcileKnownFocusRow ─────────────────────────────────────────
test('reconcile: extension-sourced row (no _src tag) → local wins, no-op', () => {
  const localItem = { id: 'f1', focusState: 'active', label: 'Local label', timerMinutes: 15, tags: {} };
  const row = { client_id: 'f1', focus_state: 'paused', label: 'Server label', timer_minutes: 30, tags: {} };
  const { item, changed } = reconcileKnownFocusRow({ localItem, row });
  assert.equal(changed, false);
  assert.equal(item, localItem);
  assert.equal(item.focusState, 'active');
  assert.equal(item.label, 'Local label');
});

test('reconcile: sidecar-sourced row → cloud wins on focus_state/label/timer', () => {
  const localItem = { id: 'f1', focusState: 'active', label: 'Old label', timerMinutes: 15, tags: { _src: 'sidecar' } };
  const row = {
    client_id: 'f1',
    focus_state: 'paused',
    label: 'New label from sidecar',
    timer_minutes: 25,
    tags: { _src: 'sidecar', _startedAt: iso(T0), _elapsedMs: 12000 }
  };
  const { item, changed } = reconcileKnownFocusRow({ localItem, row });
  assert.equal(changed, true);
  assert.equal(item.focusState, 'paused');
  assert.equal(item.label, 'New label from sidecar');
  assert.equal(item.timerMinutes, 25);
  assert.equal(item.tags._startedAt, iso(T0));
  assert.equal(item.tags._elapsedMs, 12000);
});

test('reconcile: sidecar-sourced light-sweep row (focus_state + tags only) applies just those fields', () => {
  const localItem = { id: 'f1', focusState: 'active', label: 'Keep me', timerMinutes: 15, tags: { _src: 'sidecar', _startedAt: iso(T0) } };
  const row = { client_id: 'f1', focus_state: 'paused', tags: { _src: 'sidecar', _startedAt: iso(T0), _elapsedMs: 5000 } };
  const { item, changed } = reconcileKnownFocusRow({ localItem, row });
  assert.equal(changed, true);
  assert.equal(item.focusState, 'paused');
  assert.equal(item.label, 'Keep me'); // untouched — not present on the sweep row
  assert.equal(item.tags._elapsedMs, 5000);
});

test('reconcile: sidecar-sourced row mirrors tags._parent/_backburner into dedicated fields', () => {
  const localItem = { id: 'f1', focusState: 'active', label: 'x', timerMinutes: 15, tags: { _src: 'sidecar' }, parentFocusId: null, backburnered: false };
  const row = { client_id: 'f1', focus_state: 'paused', tags: { _src: 'sidecar', _parent: 'f0', _backburner: true } };
  const { item, changed } = reconcileKnownFocusRow({ localItem, row });
  assert.equal(changed, true);
  assert.equal(item.parentFocusId, 'f0');
  assert.equal(item.backburnered, true);
});

test('reconcile: no actual field differences → changed:false even for a sidecar row (idempotent re-pull)', () => {
  const localItem = { id: 'f1', focusState: 'paused', label: 'Same', timerMinutes: 15, tags: { _src: 'sidecar', _startedAt: iso(T0) } };
  const row = { client_id: 'f1', focus_state: 'paused', label: 'Same', timer_minutes: 15, tags: { _src: 'sidecar', _startedAt: iso(T0) } };
  const { changed } = reconcileKnownFocusRow({ localItem, row });
  assert.equal(changed, false);
});

test('reconcile: missing localItem or row → no-op', () => {
  assert.deepEqual(reconcileKnownFocusRow({ localItem: null, row: {} }), { item: null, changed: false });
  assert.equal(reconcileKnownFocusRow({ localItem: { id: 'f1' }, row: null }).changed, false);
});

// ── Clock: deriveLocalClockEvent ──────────────────────────────────
test('deriveLocalClockEvent: active + not on break → clocked_in, event = clockedInAt', () => {
  const evt = deriveLocalClockEvent({ active: true, onBreak: false, clockedInAt: iso(T0) });
  assert.deepEqual(evt, { clock_state: 'clocked_in', clocked_in_at: iso(T0), on_break_since: null, last_clock_event_at: iso(T0) });
});

test('deriveLocalClockEvent: active + on break → on_break, event = breakStartedAt', () => {
  const evt = deriveLocalClockEvent({ active: true, onBreak: true, clockedInAt: iso(T0), breakStartedAt: iso(T0 + M) });
  assert.equal(evt.clock_state, 'on_break');
  assert.equal(evt.on_break_since, iso(T0 + M));
  assert.equal(evt.last_clock_event_at, iso(T0 + M));
});

test('deriveLocalClockEvent: not active but has clockedOutAt → clocked_out', () => {
  const evt = deriveLocalClockEvent({ active: false, clockedOutAt: iso(T0 + 2 * M) });
  assert.equal(evt.clock_state, 'clocked_out');
  assert.equal(evt.last_clock_event_at, iso(T0 + 2 * M));
});

test('deriveLocalClockEvent: no session at all → all null', () => {
  const evt = deriveLocalClockEvent(null);
  assert.deepEqual(evt, { clock_state: null, clocked_in_at: null, on_break_since: null, last_clock_event_at: null });
});

// ── Clock: pickLatestClockCandidate / shouldAdoptClock ────────────
test('pickLatestClockCandidate: picks the row with the latest last_clock_event_at', () => {
  const rows = [
    { browser_profile_id: 'a', clock_state: 'clocked_in', last_clock_event_at: iso(T0) },
    { browser_profile_id: 'b', clock_state: 'clocked_in', last_clock_event_at: iso(T0 + 5 * M) }
  ];
  const winner = pickLatestClockCandidate(rows);
  assert.equal(winner.browser_profile_id, 'b');
});

test('shouldAdoptClock: adopts a strictly-newer, actually-different remote state', () => {
  const local = { clock_state: 'clocked_out', clocked_in_at: null, on_break_since: null, last_clock_event_at: iso(T0) };
  const remote = { clock_state: 'clocked_in', clocked_in_at: iso(T0 + M), on_break_since: null, last_clock_event_at: iso(T0 + M) };
  assert.equal(shouldAdoptClock({ local, remote }), true);
});

test('shouldAdoptClock: does NOT adopt when remote is not newer', () => {
  const local = { clock_state: 'clocked_in', clocked_in_at: iso(T0), on_break_since: null, last_clock_event_at: iso(T0) };
  const remote = { clock_state: 'clocked_out', last_clock_event_at: iso(T0 - M) };
  assert.equal(shouldAdoptClock({ local, remote }), false);
});

test('shouldAdoptClock: does NOT adopt a newer-timestamped but IDENTICAL state (no-op echo)', () => {
  // This is the ping-pong-prevention case: after this install adopts a remote
  // event, its own next heartbeat re-derives the identical event. A second
  // ingest cycle reading that echoed row back must not re-"adopt" it.
  const local = { clock_state: 'clocked_in', clocked_in_at: iso(T0), on_break_since: null, last_clock_event_at: iso(T0) };
  const remote = { clock_state: 'clocked_in', clocked_in_at: iso(T0), on_break_since: null, last_clock_event_at: iso(T0), ms: clockEventMs({ last_clock_event_at: iso(T0) }) };
  assert.equal(shouldAdoptClock({ local, remote }), false);
});

test('shouldAdoptClock: no remote candidate → false', () => {
  assert.equal(shouldAdoptClock({ local: {}, remote: null }), false);
});

// ── Non-ping-pong proof (T1 sidecar clock-in → T2 extension poll) ──
test('ping-pong proof: adopting a remote clock-in does not fabricate a newer local event on the next poll', () => {
  // T1: Sidecar clocks in.
  const sidecarRow = { browser_profile_id: 'phone', clock_state: 'clocked_in', clocked_in_at: iso(T0), on_break_since: null, last_clock_event_at: iso(T0) };

  // T2 (a minute later): extension polls, sees the sidecar row is newer, adopts.
  const localBefore = deriveLocalClockEvent(null); // extension was clocked_out/idle
  assert.equal(shouldAdoptClock({ local: localBefore, remote: sidecarRow }), true);

  // Adoption result: the extension's local clockSession mirrors the ORIGINAL
  // T1 timestamp, never Date.now() at T2 (this is exactly what
  // clockService.applyRemoteClockState does — see the mapping there).
  const adoptedSession = { active: true, onBreak: false, clockedInAt: sidecarRow.clocked_in_at, clockedOutAt: null, breakStartedAt: null, breaks: [] };
  const localAfter = deriveLocalClockEvent(adoptedSession);
  assert.equal(localAfter.last_clock_event_at, iso(T0)); // NOT iso(T2) — no new event was created

  // T3: a third install (or the extension's own next heartbeat) reads the
  // extension's row back, now carrying the same iso(T0) event. Comparing it
  // against the ORIGINAL sidecar row again must not signal "adopt" (no
  // strictly-newer timestamp exists), which is what breaks the ping-pong loop.
  assert.equal(shouldAdoptClock({ local: localAfter, remote: sidecarRow }), false);
});
