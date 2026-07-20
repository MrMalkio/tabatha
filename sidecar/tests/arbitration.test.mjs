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

function pickMostRecentActive(items) {
  const actives = items.filter((f) => f.focus_state === 'active');
  if (!actives.length) return null;
  return actives.slice().sort((a, b) => startedAtOf(b) - startedAtOf(a))[0];
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
