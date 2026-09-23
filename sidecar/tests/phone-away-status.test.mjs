// Fix Wave 3, item 5a (2026-07-20 spec) — "away vs gone" phone-status
// classification. Same mirror convention as the other tests/* files:
// sidecar/src/screens/ContextView.tsx can't be `import`ed under plain
// `node --test` (it pulls in react-native / expo / supabase at module
// scope), so `classifyPhoneAwayStatus` is mirrored here verbatim.
//
//   classifyPhoneAwayStatus <- sidecar/src/screens/ContextView.tsx
//     (exported, pure — no RN/supabase dependency of its own)
//
// If the source changes, update the mirror + re-run this file.

import test from 'node:test';
import assert from 'node:assert/strict';

// ── mirror: sidecar/src/screens/ContextView.tsx classifyPhoneAwayStatus ──
function classifyPhoneAwayStatus(candidates, awayGraceMinMs, now) {
  let status = 'active';
  for (const r of candidates) {
    const ref = r.metadata?.lastHeartbeatAt || r.metadata?.awaySince;
    const ageMs = ref ? now - new Date(ref).getTime() : Infinity;
    if (ageMs < awayGraceMinMs) return 'away';
    status = 'gone';
  }
  return status;
}
// ── end mirror ──────────────────────────────────────────────────────────

const MIN = 60000;

test('no candidates (nobody flagged away) -> active', () => {
  assert.equal(classifyPhoneAwayStatus([], 3 * MIN, Date.now()), 'active');
});

test('a candidate with a fresh heartbeat (well inside the grace window) -> away', () => {
  const now = Date.now();
  const candidates = [{ metadata: { lastHeartbeatAt: new Date(now - 30000).toISOString() } }]; // 30s old
  assert.equal(classifyPhoneAwayStatus(candidates, 3 * MIN, now), 'away');
});

test('a candidate whose heartbeat is older than the grace window -> gone (not away)', () => {
  const now = Date.now();
  const candidates = [{ metadata: { lastHeartbeatAt: new Date(now - 10 * MIN).toISOString() } }]; // 10 min old, grace=3min
  assert.equal(classifyPhoneAwayStatus(candidates, 3 * MIN, now), 'gone');
});

test('exactly at the grace boundary is NOT away (strict <, matches the fresh-heartbeat framing)', () => {
  const now = Date.now();
  const candidates = [{ metadata: { lastHeartbeatAt: new Date(now - 3 * MIN).toISOString() } }];
  assert.equal(classifyPhoneAwayStatus(candidates, 3 * MIN, now), 'gone');
});

test('missing lastHeartbeatAt falls back to the legacy awaySince field', () => {
  const now = Date.now();
  const fresh = [{ metadata: { awaySince: new Date(now - 60000).toISOString() } }]; // 1 min old, no lastHeartbeatAt
  assert.equal(classifyPhoneAwayStatus(fresh, 3 * MIN, now), 'away');

  const stale = [{ metadata: { awaySince: new Date(now - 45 * MIN).toISOString() } }];
  assert.equal(classifyPhoneAwayStatus(stale, 3 * MIN, now), 'gone');
});

test('a candidate with NEITHER lastHeartbeatAt nor awaySince is treated as infinitely stale -> gone', () => {
  const now = Date.now();
  const candidates = [{ metadata: {} }, { metadata: null }, {}];
  assert.equal(classifyPhoneAwayStatus(candidates, 3 * MIN, now), 'gone');
});

test('one stale + one fresh candidate -> away wins (any fresh signal wins immediately)', () => {
  const now = Date.now();
  const candidates = [
    { metadata: { lastHeartbeatAt: new Date(now - 20 * MIN).toISOString() } }, // stale
    { metadata: { lastHeartbeatAt: new Date(now - 10000).toISOString() } }, // fresh
  ];
  assert.equal(classifyPhoneAwayStatus(candidates, 3 * MIN, now), 'away');
});

test('order independence: fresh-then-stale gives the same result as stale-then-fresh', () => {
  const now = Date.now();
  const fresh = { metadata: { lastHeartbeatAt: new Date(now - 5000).toISOString() } };
  const stale = { metadata: { lastHeartbeatAt: new Date(now - 20 * MIN).toISOString() } };
  assert.equal(classifyPhoneAwayStatus([fresh, stale], 3 * MIN, now), 'away');
  assert.equal(classifyPhoneAwayStatus([stale, fresh], 3 * MIN, now), 'away');
});

test('awayGraceMin is configurable — a longer grace window keeps an older heartbeat as away', () => {
  const now = Date.now();
  const candidates = [{ metadata: { lastHeartbeatAt: new Date(now - 8 * MIN).toISOString() } }];
  assert.equal(classifyPhoneAwayStatus(candidates, 3 * MIN, now), 'gone', 'default 3min grace -> gone');
  assert.equal(classifyPhoneAwayStatus(candidates, 10 * MIN, now), 'away', 'wider 10min grace -> still away');
});

test('multiple all-stale candidates -> gone, not active', () => {
  const now = Date.now();
  const candidates = [
    { metadata: { lastHeartbeatAt: new Date(now - 10 * MIN).toISOString() } },
    { metadata: { lastHeartbeatAt: new Date(now - 15 * MIN).toISOString() } },
  ];
  assert.equal(classifyPhoneAwayStatus(candidates, 3 * MIN, now), 'gone');
});
