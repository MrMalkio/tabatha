// Workstream A4 — useSyncStatus state derivation.
// Extracts the fresh/stale/error/never/signed_out branch logic so both
// Settings and the sidebar chip share one source of truth. The pure
// `deriveSyncState` helper is what we test (no React render needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSyncState } from '../src/hooks/useSyncStatus.js';

const now = Date.now();
const isoAgo = (ms) => new Date(now - ms).toISOString();

test('signed_out when not signed in (overrides everything)', () => {
  const s = deriveSyncState({ isSignedIn: false, lastSyncSuccess: isoAgo(1000), syncDiagnostics: [], now });
  assert.equal(s.state, 'signed_out');
});

test('fresh when last success is under 10 minutes ago', () => {
  const s = deriveSyncState({ isSignedIn: true, lastSyncSuccess: isoAgo(5 * 60 * 1000), syncDiagnostics: [], now });
  assert.equal(s.state, 'fresh');
});

test('stale when last success is over 10 minutes ago', () => {
  const s = deriveSyncState({ isSignedIn: true, lastSyncSuccess: isoAgo(20 * 60 * 1000), syncDiagnostics: [], now });
  assert.equal(s.state, 'stale');
});

test('never when signed in but no success recorded', () => {
  const s = deriveSyncState({ isSignedIn: true, lastSyncSuccess: null, syncDiagnostics: [], now });
  assert.equal(s.state, 'never');
});

test('error when a failure diagnostic is newer than the last success', () => {
  const s = deriveSyncState({
    isSignedIn: true,
    lastSyncSuccess: isoAgo(60 * 1000),
    syncDiagnostics: [{ kind: 'clock_sessions_upsert_failed', detail: 'boom', at: isoAgo(1000) }],
    now,
  });
  assert.equal(s.state, 'error');
  assert.ok(s.detail);
});

test('a failure OLDER than the last success does not flip to error', () => {
  const s = deriveSyncState({
    isSignedIn: true,
    lastSyncSuccess: isoAgo(1000),
    syncDiagnostics: [{ kind: 'clock_sessions_upsert_failed', detail: 'old', at: isoAgo(60 * 1000) }],
    now,
  });
  assert.equal(s.state, 'fresh');
});

test('no_* diagnostics also count as failures (e.g. no_auth_session)', () => {
  const s = deriveSyncState({
    isSignedIn: true,
    lastSyncSuccess: isoAgo(60 * 1000),
    syncDiagnostics: [{ kind: 'no_profile_row', detail: 'no profile', at: isoAgo(1000) }],
    now,
  });
  assert.equal(s.state, 'error');
});

test('every state carries a label + color for the chip', () => {
  for (const isSignedIn of [false, true]) {
    const s = deriveSyncState({ isSignedIn, lastSyncSuccess: null, syncDiagnostics: [], now });
    assert.equal(typeof s.label, 'string');
    assert.ok(s.label.length > 0);
    assert.equal(typeof s.color, 'string');
  }
});
