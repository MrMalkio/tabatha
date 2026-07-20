// TV sign-in-with-a-code flow — pure helper unit tests (node:test, no new
// deps). Same mirror convention as timer-math.test.mjs / invite-code.test.mjs:
// sidecar/src/lib/codeSignIn.ts has no RN/supabase imports of its own, but
// this repo's plain `node --test` has no TS loader, so the pure functions
// are mirrored here verbatim with their source noted:
//
//   normalizePairingCode / isValidPairingCode / isValidRedeemSession
//     <- sidecar/src/lib/codeSignIn.ts (verbatim copies)
//
// If any source function changes, update the mirror + re-run this file.

import test from 'node:test';
import assert from 'node:assert/strict';

// ── mirror: sidecar/src/lib/codeSignIn.ts ──────────────────────────────
function normalizePairingCode(raw) {
  return (raw || '').replace(/\s+/g, '');
}

function isValidPairingCode(raw) {
  return /^\d{6}$/.test(normalizePairingCode(raw));
}

function isValidRedeemSession(body) {
  if (!body || typeof body !== 'object') return false;
  const b = body;
  return (
    typeof b.access_token === 'string' &&
    b.access_token.length > 0 &&
    typeof b.refresh_token === 'string' &&
    b.refresh_token.length > 0
  );
}
// ── end mirror ──────────────────────────────────────────────────────────

test('normalizePairingCode strips all whitespace, including PairWatchCard\'s own "123 456" display format', () => {
  assert.equal(normalizePairingCode('123 456'), '123456');
  assert.equal(normalizePairingCode('  123456  '), '123456');
  assert.equal(normalizePairingCode('1 2 3 4 5 6'), '123456');
  assert.equal(normalizePairingCode(''), '');
  assert.equal(normalizePairingCode(undefined), '');
});

test('isValidPairingCode accepts exactly 6 digits after normalization', () => {
  assert.equal(isValidPairingCode('123456'), true);
  assert.equal(isValidPairingCode('123 456'), true);
  assert.equal(isValidPairingCode('  000000  '), true);
});

test('isValidPairingCode rejects non-6-digit input', () => {
  assert.equal(isValidPairingCode(''), false);
  assert.equal(isValidPairingCode('12345'), false); // too short
  assert.equal(isValidPairingCode('1234567'), false); // too long
  assert.equal(isValidPairingCode('12a456'), false); // non-digit
  assert.equal(isValidPairingCode('abcdef'), false);
  assert.equal(isValidPairingCode(undefined), false);
});

test('isValidRedeemSession accepts a well-formed pair-watch success body', () => {
  assert.equal(
    isValidRedeemSession({
      access_token: 'a.b.c',
      refresh_token: 'r-token',
      expires_at: 1234567890,
    }),
    true
  );
});

test('isValidRedeemSession rejects a missing refresh_token', () => {
  assert.equal(isValidRedeemSession({ access_token: 'a.b.c' }), false);
});

test('isValidRedeemSession rejects a missing access_token', () => {
  assert.equal(isValidRedeemSession({ refresh_token: 'r-token' }), false);
});

test('isValidRedeemSession rejects the pair-watch error shape', () => {
  assert.equal(isValidRedeemSession({ error: 'invalid code' }), false);
});

test('isValidRedeemSession rejects empty-string tokens', () => {
  assert.equal(isValidRedeemSession({ access_token: '', refresh_token: '' }), false);
  assert.equal(isValidRedeemSession({ access_token: 'a', refresh_token: '' }), false);
});

test('isValidRedeemSession still accepts a body carrying device_label (migration 045 addition, ignored by this guard)', () => {
  assert.equal(
    isValidRedeemSession({ access_token: 'a.b.c', refresh_token: 'r-token', device_label: 'Living-room TV' }),
    true
  );
  assert.equal(
    isValidRedeemSession({ access_token: 'a.b.c', refresh_token: 'r-token', device_label: null }),
    true
  );
});

test('isValidRedeemSession rejects non-string tokens and non-object bodies', () => {
  assert.equal(isValidRedeemSession({ access_token: 123, refresh_token: 'r' }), false);
  assert.equal(isValidRedeemSession(null), false);
  assert.equal(isValidRedeemSession(undefined), false);
  assert.equal(isValidRedeemSession('a.b.c'), false);
  assert.equal(isValidRedeemSession({}), false);
});
