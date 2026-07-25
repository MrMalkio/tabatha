// Fix batch (2026-07-20, Dex) — cross-surface current-focus arbitration.
//
// Same constraint as tests/timer-math.test.mjs: `focus.ts` imports
// react-native / @react-native-async-storage / supabase at module scope, so
// it can't be `import`-ed directly under plain `node --test`. The pure
// comparator is mirrored here verbatim instead.
//
//   pickMostRecentActive  <- sidecar/src/data/focus.ts (exported, ~line 66)
//   startedAtOf           <- sidecar/src/data/focus.ts (exported, ~line 38)
//
// If `pickMostRecentActive` changes in the source, update the mirror below
// and re-run this file.

import test from 'node:test';
import assert from 'node:assert/strict';

// ── mirror: sidecar/src/data/focus.ts ──────────────────────────────────
function startedAtOf(f) {
  const iso = f.tags?._startedAt || f.created_at;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

// 0.13.10 (sync forensics S2): `drifted` is a RUNNING state in the extension
// (focusService.js treats 'active' || 'drifted' as running in eight places),
// so it must be in the Sidecar's running tier too. Previously it was in
// neither tier — a drifted focus vanished from the phone / Context View and
// they fell back to an older paused intent.
const RUNNING_STATES = ['active', 'drifted'];
const isRunning = (f) => RUNNING_STATES.includes(f.focus_state);

function pickMostRecentActive(items) {
  const actives = items.filter(isRunning);
  if (!actives.length) return null;
  return actives.slice().sort((a, b) => startedAtOf(b) - startedAtOf(a))[0];
}

// mirror: elapsedMsOf <- sidecar/src/data/focus.ts (exported, ~line 45)
function elapsedMsOf(f, now) {
  if (isRunning(f)) return Math.max(0, now - startedAtOf(f));
  const frozen = f.tags?._elapsedMs;
  return Number.isFinite(frozen) ? Math.max(0, frozen) : Math.max(0, now - startedAtOf(f));
}

const MIN = 60000;

function item(id, { state = 'active', src = 'sidecar', startedAgoMin = 0, elapsedMs } = {}) {
  const startedAt = new Date(Date.now() - startedAgoMin * MIN).toISOString();
  return {
    id,
    client_id: `${src}-${id}`,
    label: id,
    focus_state: state,
    created_at: startedAt,
    tags: {
      _src: src,
      _startedAt: startedAt,
      ...(elapsedMs != null ? { _elapsedMs: elapsedMs } : {}),
    },
  };
}

test('pickMostRecentActive: single active row wins trivially', () => {
  const a = item('a', { startedAgoMin: 5 });
  const winner = pickMostRecentActive([a]);
  assert.equal(winner?.id, 'a');
});

test('pickMostRecentActive: returns null when there are no active rows', () => {
  const a = item('a', { state: 'paused', elapsedMs: 1000 });
  const b = item('b', { state: 'completed' });
  assert.equal(pickMostRecentActive([a, b]), null);
});

test('pickMostRecentActive: among two actives, the one with the LATEST _startedAt wins — regardless of source', () => {
  // "sidecar" started 20 minutes ago, "extension" started 2 minutes ago.
  // The extension-sourced row is more recent, so it must win even though
  // the old (pre-fix) logic only ever considered sidecar-sourced rows.
  const older = item('sidecar-focus', { src: 'sidecar', startedAgoMin: 20 });
  const newer = item('ext-focus', { src: 'extension', startedAgoMin: 2 });
  const winner = pickMostRecentActive([older, newer]);
  assert.equal(winner?.id, 'ext-focus', 'the more-recently-started active must win regardless of source');
});

test('pickMostRecentActive: extension-sourced active beats an older sidecar-sourced active (the exact cross-device repro)', () => {
  // Malkio's repro: phone starts a sidecar focus, then the extension starts
  // a DIFFERENT focus later without the sidecar tab knowing. Both `useFocus`
  // hooks (phone + Context View) read the same rows from Supabase and must
  // agree the extension's is now current.
  const phoneFocus = item('phone-focus', { src: 'sidecar', startedAgoMin: 30 });
  const extFocus = item('ext-focus', { src: 'extension', startedAgoMin: 1 });
  const winner = pickMostRecentActive([phoneFocus, extFocus]);
  assert.equal(winner?.id, 'ext-focus');
});

test('pickMostRecentActive: ignores paused/completed rows entirely, even if they started more recently than the active one', () => {
  const activeOld = item('active-old', { state: 'active', startedAgoMin: 40 });
  const pausedNew = item('paused-new', { state: 'paused', startedAgoMin: 1, elapsedMs: 500 });
  const winner = pickMostRecentActive([activeOld, pausedNew]);
  assert.equal(winner?.id, 'active-old', 'a paused row must never win over an active row regardless of recency');
});

test('pickMostRecentActive: three-way tie-break by recency picks the single latest across mixed sources', () => {
  const a = item('a', { src: 'sidecar', startedAgoMin: 10 });
  const b = item('b', { src: 'extension', startedAgoMin: 3 });
  const c = item('c', { src: 'sidecar', startedAgoMin: 15 });
  const winner = pickMostRecentActive([a, b, c]);
  assert.equal(winner?.id, 'b');
});

test('pickMostRecentActive: is a pure function — does not mutate the input array or its order', () => {
  const a = item('a', { startedAgoMin: 10 });
  const b = item('b', { startedAgoMin: 2 });
  const input = [a, b];
  const snapshot = [...input];
  pickMostRecentActive(input);
  assert.deepEqual(input, snapshot, 'input array identity/order must be unchanged (no in-place sort)');
});

// ── 0.13.10: `drifted` counts as running (sync forensics S2) ───────────

test('pickMostRecentActive: a DRIFTED focus is selectable as current (was in neither tier)', () => {
  const drifted = item('drifted-focus', { state: 'drifted', src: 'extension', startedAgoMin: 5 });
  assert.equal(pickMostRecentActive([drifted])?.id, 'drifted-focus',
    'the extension renders a drifted focus as THE current focus; the phone must agree');
});

test('pickMostRecentActive: a DRIFTED focus beats an older paused one instead of falling through to it', () => {
  // The exact "old intents in view" repro: the extension drifts today's
  // focus, and pre-0.13.10 the Sidecar dropped it from the running tier and
  // surfaced a week-old paused intent from the paused tier instead.
  const drifted = item('today-drifted', { state: 'drifted', startedAgoMin: 10 });
  const stalePaused = item('week-old', { state: 'paused', startedAgoMin: 60 * 24 * 7, elapsedMs: 1000 });
  assert.equal(pickMostRecentActive([stalePaused, drifted])?.id, 'today-drifted');
});

test('pickMostRecentActive: active vs drifted still resolves purely by recency', () => {
  const olderActive = item('older-active', { state: 'active', startedAgoMin: 20 });
  const newerDrifted = item('newer-drifted', { state: 'drifted', startedAgoMin: 2 });
  assert.equal(pickMostRecentActive([olderActive, newerDrifted])?.id, 'newer-drifted');

  const newerActive = item('newer-active', { state: 'active', startedAgoMin: 1 });
  const olderDrifted = item('older-drifted', { state: 'drifted', startedAgoMin: 30 });
  assert.equal(pickMostRecentActive([newerActive, olderDrifted])?.id, 'newer-active');
});

test('pickMostRecentActive: completed/paused are still excluded from the running tier', () => {
  const done = item('done', { state: 'completed' });
  const paused = item('paused', { state: 'paused', elapsedMs: 42 });
  assert.equal(pickMostRecentActive([done, paused]), null,
    'widening to drifted must not accidentally widen to paused/completed');
});

test('elapsedMsOf: a DRIFTED focus keeps ticking instead of freezing at _elapsedMs', () => {
  const now = Date.now();
  const drifted = item('d', { state: 'drifted', startedAgoMin: 7, elapsedMs: 1000 });
  assert.ok(Math.abs(elapsedMsOf(drifted, now) - 7 * MIN) < 1000,
    'drifted is running, so elapsed derives from _startedAt — not the stale frozen value');
});

test('elapsedMsOf: a PAUSED focus still freezes at _elapsedMs', () => {
  const now = Date.now();
  const paused = item('p', { state: 'paused', startedAgoMin: 90, elapsedMs: 12345 });
  assert.equal(elapsedMsOf(paused, now), 12345);
});

// ── mirror: the "pause all other actives, any source, freeze elapsed"
// half of the arbitration rule (sidecar/src/data/focus.ts
// useFocus().pauseOtherActives, ~line 189) ──
function pauseOtherActivesAt(items, excludeId, now) {
  return items.map((f) => {
    if (f.focus_state !== 'active' || f.id === excludeId) return f;
    const elapsed = Math.max(0, now - startedAtOf(f));
    return { ...f, focus_state: 'paused', tags: { ...f.tags, _elapsedMs: elapsed } };
  });
}

test('pauseOtherActives: pauses an EXTENSION-sourced active too (not just sidecar-sourced) — the core fix', () => {
  const extFocus = item('ext-focus', { src: 'extension', startedAgoMin: 12 });
  const now = Date.now();
  const [paused] = pauseOtherActivesAt([extFocus], 'some-new-id', now);
  assert.equal(paused.focus_state, 'paused');
  assert.ok(Math.abs(paused.tags._elapsedMs - 12 * MIN) < 1000, 'extension row must freeze elapsed the same way a sidecar row would');
});

test('pauseOtherActives: excluded id (the one being switched to) is left untouched', () => {
  const target = item('target', { src: 'sidecar', startedAgoMin: 5 });
  const other = item('other', { src: 'extension', startedAgoMin: 5 });
  const now = Date.now();
  const [t, o] = pauseOtherActivesAt([target, other], 'target', now);
  assert.equal(t.focus_state, 'active', 'the switch target must not be paused by its own switch');
  assert.equal(o.focus_state, 'paused');
});

test('pauseOtherActives: non-active rows (already paused/completed) are left untouched', () => {
  const alreadyPaused = item('p', { state: 'paused', elapsedMs: 999 });
  const now = Date.now();
  const [p] = pauseOtherActivesAt([alreadyPaused], null, now);
  assert.equal(p, alreadyPaused, 'a non-active row must pass through unchanged');
});

// ── mirror: pickPausedCurrent (0.13.1 stale-pin fix) ───────────────────
// <- sidecar/src/data/focus.ts (exported). Recency-first in the paused
// tier; the device-local pin only breaks a startedAt TIE. Added after the
// 2026-07-21 "old intents in view" report: with nothing active, a stale
// AsyncStorage pin outranked an intent started (and paused) the same day.
function pickPausedCurrent(tier, pinnedId) {
  if (!tier.length) return null;
  const sorted = tier.slice().sort((a, b) => startedAtOf(b) - startedAtOf(a));
  const winner = sorted[0];
  if (pinnedId) {
    const pinned = tier.find((f) => f.id === pinnedId);
    if (pinned && startedAtOf(pinned) === startedAtOf(winner)) return pinned;
  }
  return winner;
}

test('pickPausedCurrent: returns null on empty tier', () => {
  assert.equal(pickPausedCurrent([], 'x'), null);
});

test('pickPausedCurrent: most recently started paused item wins with no pin', () => {
  const old = item('old', { state: 'paused', startedAgoMin: 60 * 24 * 7 });
  const today = item('today', { state: 'paused', startedAgoMin: 30 });
  assert.equal(pickPausedCurrent([old, today], null)?.id, 'today');
});

test('pickPausedCurrent: a STALE pin must NOT outrank a more recently started paused item (2026-07-21 regression)', () => {
  const pinnedOld = item('pinned-old', { state: 'paused', startedAgoMin: 60 * 24 * 3 });
  const today = item('today', { state: 'paused', startedAgoMin: 45 });
  assert.equal(pickPausedCurrent([pinnedOld, today], 'pinned-old')?.id, 'today');
});

test('pickPausedCurrent: pin breaks an exact startedAt tie', () => {
  const now = new Date().toISOString();
  const mk = (id) => ({ id, focus_state: 'paused', created_at: now, tags: { _startedAt: now } });
  const a = mk('a');
  const b = mk('b');
  assert.equal(pickPausedCurrent([a, b], 'b')?.id, 'b');
});

test('pickPausedCurrent: pin pointing outside the tier is ignored (recency wins)', () => {
  const old = item('old', { state: 'paused', startedAgoMin: 600 });
  const recent = item('recent', { state: 'paused', startedAgoMin: 5 });
  assert.equal(pickPausedCurrent([old, recent], 'not-here')?.id, 'recent');
});

// ── 0.13.10 regression: `drifted` must be a RUNNING state ──────────────
// Sync forensics (docs/audits/2026-07-24-sync-forensics.md, S2) traced the
// long-running "old intents in view" report to this: the extension treats
// 'drifted' as running, the Sidecar recognised only 'active' in the running
// tier and only 'paused' in the paused tier, so a drifted focus fell through
// BOTH — the phone and Context View silently dropped the real current focus
// and surfaced an older paused intent instead. Two earlier fixes (0.13.1's
// pin re-ranking, 0.13.5's session-aware reclaim) treated symptoms because
// nobody asked why the running tier had gone empty. These cases exist so the
// running tier can never quietly lose a state the extension considers live.

test('drift regression: a drifted focus is RUNNING and wins over an older paused one', () => {
  const drifted = item('drifted-now', { state: 'drifted', startedAgoMin: 5 });
  const oldPaused = item('paused-old', { state: 'paused', startedAgoMin: 60 * 24 * 3 });
  assert.equal(pickMostRecentActive([drifted, oldPaused])?.id, 'drifted-now');
});

test('drift regression: drifted competes with active on recency, not state rank', () => {
  const olderActive = item('active-older', { state: 'active', startedAgoMin: 90 });
  const newerDrift = item('drift-newer', { state: 'drifted', startedAgoMin: 10 });
  assert.equal(pickMostRecentActive([olderActive, newerDrift])?.id, 'drift-newer');
  const newerActive = item('active-newer', { state: 'active', startedAgoMin: 2 });
  assert.equal(pickMostRecentActive([newerActive, newerDrift])?.id, 'active-newer');
});

test('drift regression: a lone drifted focus never falls through to the paused tier', () => {
  const drifted = item('solo-drift', { state: 'drifted', startedAgoMin: 20 });
  // Running tier must claim it — if this returns null the paused-tier
  // fallback takes over and the stale-intent bug is back.
  assert.notEqual(pickMostRecentActive([drifted]), null);
  assert.equal(pickMostRecentActive([drifted])?.id, 'solo-drift');
});

test('drift regression: completed/resolved states are still NOT running', () => {
  const done = item('done', { state: 'completed' });
  const paused = item('paused', { state: 'paused', elapsedMs: 1000 });
  assert.equal(pickMostRecentActive([done, paused]), null);
});
