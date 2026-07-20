// Invite-signup gate — invite-code format helper unit tests (node:test, no
// new deps). Same mirror convention as timer-math.test.mjs / voice-parse.
// test.mjs: sidecar/src/lib/inviteCode.ts has no RN/supabase imports of its
// own, but this repo's plain `node --test` has no TS loader, so the pure
// functions are mirrored here verbatim with their source noted:
//
//   normalizeInviteCode / isPlausibleInviteCode / matchesKnownMintFormat
//     <- sidecar/src/lib/inviteCode.ts (verbatim copies)
//
// If any source function changes, update the mirror + re-run this file.

import test from 'node:test';
import assert from 'node:assert/strict';

// ── mirror: sidecar/src/lib/inviteCode.ts ──────────────────────────────
const INVITE_TOKEN_FORMAT_RE = /^[0-9a-f]{24}-[0-9a-f]{8}$/i;

function normalizeInviteCode(raw) {
  return (raw || '').trim();
}

function isPlausibleInviteCode(raw) {
  return normalizeInviteCode(raw).length >= 6;
}

function matchesKnownMintFormat(raw) {
  return INVITE_TOKEN_FORMAT_RE.test(normalizeInviteCode(raw));
}
// ── end mirror ──────────────────────────────────────────────────────────

test('normalizeInviteCode trims whitespace', () => {
  assert.equal(normalizeInviteCode('  abc123  '), 'abc123');
  assert.equal(normalizeInviteCode(''), '');
  assert.equal(normalizeInviteCode(undefined), '');
});

test('isPlausibleInviteCode rejects empty/short input', () => {
  assert.equal(isPlausibleInviteCode(''), false);
  assert.equal(isPlausibleInviteCode('   '), false);
  assert.equal(isPlausibleInviteCode('ab'), false);
  assert.equal(isPlausibleInviteCode('abcde'), false); // 5 chars, one short
});

test('isPlausibleInviteCode accepts 6+ char input, trimmed', () => {
  assert.equal(isPlausibleInviteCode('abcdef'), true);
  assert.equal(isPlausibleInviteCode('  abcdef  '), true);
  assert.equal(isPlausibleInviteCode('a1b2c3d4e5f6a1b2c3d4e5f6-a1b2c3d4'), true);
});

test('matchesKnownMintFormat matches the real mint RPC output shape', () => {
  // 24 hex + '-' + 8 hex, per tabatha.create_invite_token (migration 012):
  // encode(gen_random_bytes(12),'hex') || '-' || encode(gen_random_bytes(4),'hex')
  assert.equal(matchesKnownMintFormat('a1b2c3d4e5f60123456789ab-c0ffee12'), true);
  assert.equal(matchesKnownMintFormat('A1B2C3D4E5F60123456789AB-C0FFEE12'), true); // case-insensitive
});

test('matchesKnownMintFormat rejects malformed input', () => {
  assert.equal(matchesKnownMintFormat('too-short'), false);
  assert.equal(matchesKnownMintFormat(''), false);
  assert.equal(matchesKnownMintFormat('not-hex-at-all-not-hex-at-all-zz'), false);
  assert.equal(matchesKnownMintFormat('a1b2c3d4e5f60123456789abc0ffee12'), false); // missing dash
});
