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
  lastClockEventAt,
  clockEventMs,
  pickLatestClockCandidate,
  isFreshClockCandidate,
  CLOCK_CANDIDATE_MAX_STALENESS_MS,
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

// ── S5 / bug #5: break-end must not regress last_clock_event_at ───
//
// Pre-fix, `last_clock_event_at` was `breakStartedAt || clockedInAt`. Because
// clock.js nulls breakStartedAt on break-end, the published timestamp jumped
// BACKWARDS to the shift start, and a sibling row still reading `on_break`
// then won arbitration and dragged the just-resumed install back onto break.

test('S5: lastClockEventAt advances on every clock event, including break-end', () => {
  const shiftStart = iso(T0);              // 09:00
  const breakStart = iso(T0 + 60 * M);     // 10:00
  const breakEnd = iso(T0 + 90 * M);       // 10:30

  assert.equal(lastClockEventAt({ clockedInAt: shiftStart }), shiftStart);
  assert.equal(lastClockEventAt({ clockedInAt: shiftStart, breakStartedAt: breakStart }), breakStart);
  // The regression: breakStartedAt is nulled, breakEndedAt takes over.
  assert.equal(
    lastClockEventAt({ clockedInAt: shiftStart, breakStartedAt: null, breakEndedAt: breakEnd }),
    breakEnd,
    'break-end must advance the event time, not fall back to the shift start'
  );
});

test('S5: the exact 09:00/10:00/10:30 sequence is monotonic across the whole shift', () => {
  const session = { active: true, onBreak: false, clockedInAt: iso(T0), breakStartedAt: null, breakEndedAt: null, breaks: [] };
  const seen = [];

  seen.push(deriveLocalClockEvent(session).last_clock_event_at);            // clock in 09:00
  session.onBreak = true; session.breakStartedAt = iso(T0 + 60 * M);
  seen.push(deriveLocalClockEvent(session).last_clock_event_at);            // break start 10:00
  session.onBreak = false; session.breakStartedAt = null; session.breakEndedAt = iso(T0 + 90 * M);
  seen.push(deriveLocalClockEvent(session).last_clock_event_at);            // break end 10:30
  session.active = false; session.clockedOutAt = iso(T0 + 300 * M);
  seen.push(deriveLocalClockEvent(session).last_clock_event_at);            // clock out 14:00

  const ms = seen.map(s => new Date(s).getTime());
  for (let i = 1; i < ms.length; i++) {
    assert.ok(ms[i] > ms[i - 1],
      `event ${i} (${seen[i]}) must be strictly newer than event ${i - 1} (${seen[i - 1]})`);
  }
});

test('S5: a stale sibling on_break row can no longer drag a resumed install back onto break', () => {
  // The reported failure, end to end.
  // This install: shift 09:00, break 10:00, resumed 10:30.
  const resumed = {
    active: true, onBreak: false,
    clockedInAt: iso(T0), breakStartedAt: null, breakEndedAt: iso(T0 + 90 * M), breaks: []
  };
  const local = deriveLocalClockEvent(resumed);

  // Sibling row, never updated since the break started at 10:00.
  const staleSibling = {
    browser_profile_id: 'other', clock_state: 'on_break',
    clocked_in_at: iso(T0), on_break_since: iso(T0 + 60 * M),
    last_clock_event_at: iso(T0 + 60 * M)
  };

  // Pre-fix `local.last_clock_event_at` was iso(T0) = 09:00, strictly older
  // than the sibling's 10:00 → adopt → back onto break. Now it is 10:30.
  assert.equal(local.last_clock_event_at, iso(T0 + 90 * M));
  assert.equal(shouldAdoptClock({ local, remote: staleSibling }), false,
    'the install that just resumed must not be pulled back onto break');
});

test('S5: lastClockEventAt ignores nulls and malformed timestamps', () => {
  assert.equal(lastClockEventAt(null), null);
  assert.equal(lastClockEventAt({}), null);
  assert.equal(lastClockEventAt({ clockedInAt: 'not-a-date', breakEndedAt: iso(T0) }), iso(T0));
});

// ── Clock: pickLatestClockCandidate / shouldAdoptClock ────────────
test('pickLatestClockCandidate: picks the row with the latest last_clock_event_at', () => {
  const now = T0 + 10 * M;
  const rows = [
    { browser_profile_id: 'a', clock_state: 'clocked_in', last_clock_event_at: iso(T0), last_heartbeat_at: iso(now) },
    { browser_profile_id: 'b', clock_state: 'clocked_in', last_clock_event_at: iso(T0 + 5 * M), last_heartbeat_at: iso(now) }
  ];
  const winner = pickLatestClockCandidate(rows, now);
  assert.equal(winner.browser_profile_id, 'b');
});

// ── S7 / bug #7: dead devices must not win clock arbitration ──────
//
// The ingest had no freshness cutoff whatsoever, so a device that died months
// ago while `clocked_in` stayed a candidate forever and beat a fresh install
// automatically (an install with no local session scores clockEventMs = 0).

test('S7: a long-dead device claiming clocked_in is excluded from candidates', () => {
  const now = T0 + 400 * M;
  // Modelled on the real snapshot: a 371-minute-stale row still marked
  // online:true and clocked_in (audit §S7 / prod probe 2026-07-25).
  const corpse = {
    browser_profile_id: 'dead', clock_state: 'clocked_in', online: true,
    last_clock_event_at: iso(T0 + 200 * M), last_heartbeat_at: iso(now - 371 * M)
  };
  assert.equal(isFreshClockCandidate(corpse, now), false);
  assert.equal(pickLatestClockCandidate([corpse], now), null,
    'a corpse must not be adoptable at all');
});

test('S7: a live device wins over a dead device even with an OLDER clock event', () => {
  // This is the bug in one assertion: the corpse has the newer event time, so
  // pre-fix it won. Freshness has to gate candidacy BEFORE recency ranks it.
  const now = T0 + 400 * M;
  const corpse = {
    browser_profile_id: 'dead', clock_state: 'clocked_in',
    last_clock_event_at: iso(T0 + 300 * M),        // newer event…
    last_heartbeat_at: iso(now - 371 * M)          // …but long dead
  };
  const live = {
    browser_profile_id: 'live', clock_state: 'clocked_in',
    last_clock_event_at: iso(T0 + 100 * M),        // older event…
    last_heartbeat_at: iso(now - 20 * 1000)        // …but alive 20s ago
  };
  const winner = pickLatestClockCandidate([corpse, live], now);
  assert.equal(winner.browser_profile_id, 'live');
});

test('S7: a row with no heartbeat at all is rejected (liveness must be positively evidenced)', () => {
  const now = T0;
  const noHeartbeat = { browser_profile_id: 'x', clock_state: 'clocked_in', last_clock_event_at: iso(T0) };
  assert.equal(isFreshClockCandidate(noHeartbeat, now), false);
  assert.equal(pickLatestClockCandidate([noHeartbeat], now), null);
});

test('S7: the horizon is lenient enough to survive an MV3 service-worker eviction', () => {
  // The extension heartbeat is a plain setInterval with no chrome.alarms
  // backing, so an OPEN browser whose SW was evicted goes quiet while the
  // user is genuinely still working. Losing that install's real shift is the
  // expensive failure, so the horizon must clear a long eviction gap.
  const now = T0 + 200 * M;
  const evictedButWorking = {
    browser_profile_id: 'mv3', clock_state: 'clocked_in',
    last_clock_event_at: iso(T0), last_heartbeat_at: iso(now - 45 * M)
  };
  assert.equal(isFreshClockCandidate(evictedButWorking, now), true,
    '45 minutes of SW eviction must NOT invalidate a real shift');
  // …and the awareness UI's much tighter 5-minute rule must not be reused here.
  assert.ok(CLOCK_CANDIDATE_MAX_STALENESS_MS > 5 * 60 * 1000);
});

test('S7: the horizon lands inside the empty band separating live devices from corpses', () => {
  // Observed heartbeat ages (prod probe, 2026-07-25): 0.2, 0.3 | 370.9, 371.8,
  // 786.3, 6515.3 minutes. Guards the constant itself, not just its use.
  assert.ok(CLOCK_CANDIDATE_MAX_STALENESS_MS > 1 * M, 'must clear the live devices with room to spare');
  assert.ok(CLOCK_CANDIDATE_MAX_STALENESS_MS < 370 * M, 'must exclude the nearest corpse');
});

test('S7: the staleness boundary is inclusive', () => {
  const now = T0 + 1000 * M;
  const atEdge = { clock_state: 'clocked_in', last_heartbeat_at: iso(now - CLOCK_CANDIDATE_MAX_STALENESS_MS) };
  const overEdge = { clock_state: 'clocked_in', last_heartbeat_at: iso(now - CLOCK_CANDIDATE_MAX_STALENESS_MS - 1) };
  assert.equal(isFreshClockCandidate(atEdge, now), true);
  assert.equal(isFreshClockCandidate(overEdge, now), false);
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

// ── Koda P2: a stale clock-OUT must stay adoptable ────────────────
//
// The horizon exists to stop a corpse FABRICATING a shift. A stale clock-out
// can only ever END one, which is the conservative direction — and filtering
// it out recreates the ghost-stint class (a device that clocked out while
// another install never learned about it, leaving an open stint accruing).

test('P2: a long-dead clocked_out row is still a valid candidate', () => {
  const now = T0 + 10000 * M;
  const staleOut = {
    browser_profile_id: 'gone', clock_state: 'clocked_out',
    last_clock_event_at: iso(T0 + 100 * M), last_heartbeat_at: iso(now - 6515 * M)
  };
  assert.equal(isFreshClockCandidate(staleOut, now), true,
    'a stale clock-out can only end a shift, never invent one');
  assert.equal(pickLatestClockCandidate([staleOut], now).browser_profile_id, 'gone');
});

test('P2: a clocked_out row with NO heartbeat at all is still adoptable', () => {
  const now = T0;
  const row = { browser_profile_id: 'nohb', clock_state: 'clocked_out', last_clock_event_at: iso(T0) };
  assert.equal(isFreshClockCandidate(row, now), true);
});

test('P2: the exemption is only for clocked_out — a stale clocked_in is still rejected', () => {
  const now = T0 + 10000 * M;
  const staleIn = {
    browser_profile_id: 'zombie', clock_state: 'clocked_in',
    last_clock_event_at: iso(T0 + 100 * M), last_heartbeat_at: iso(now - 6515 * M)
  };
  const staleBreak = { ...staleIn, browser_profile_id: 'zombie2', clock_state: 'on_break' };
  assert.equal(isFreshClockCandidate(staleIn, now), false);
  assert.equal(isFreshClockCandidate(staleBreak, now), false);
});
