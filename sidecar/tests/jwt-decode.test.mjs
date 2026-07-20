// JWT payload decode — pure helper unit tests (node:test, no new deps).
// Same mirror convention as code-signin.test.mjs / timer-math.test.mjs:
// sidecar/src/lib/jwt.ts has no RN/supabase imports of its own, but this
// repo's plain `node --test` has no TS loader, so the pure functions are
// mirrored here verbatim.
//
//   decodeJwtPayload / sessionIdFromAccessToken <- sidecar/src/lib/jwt.ts
//     (verbatim copies)
//
// If any source function changes, update the mirror + re-run this file.
//
// Device management (migration 045) — this decoder pulls the GoTrue
// `session_id` claim out of a session's access token so AuthContext can
// persist it as browser_profiles.auth_session_id for device-signout to
// revoke later.

import test from 'node:test';
import assert from 'node:assert/strict';

// ── mirror: sidecar/src/lib/jwt.ts ─────────────────────────────────────
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64UrlDecode(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const rawChar of base64) {
    const idx = BASE64_CHARS.indexOf(rawChar);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const json = base64UrlDecode(parts[1]);
    const utf8 = decodeURIComponent(
      Array.from(json)
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    const parsed = JSON.parse(utf8);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function sessionIdFromAccessToken(token) {
  const payload = decodeJwtPayload(token);
  const sid = payload?.session_id;
  return typeof sid === 'string' && sid.length > 0 ? sid : null;
}
// ── end mirror ──────────────────────────────────────────────────────────

// Helper to build a fake JWT (unsigned — the decoder never checks the
// signature, it only reads the payload) with a base64url-encoded payload,
// exactly like a real GoTrue-issued token's middle segment.
function fakeJwt(payload) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${b64}.signature`;
}

test('decodeJwtPayload decodes a well-formed base64url payload', () => {
  const token = fakeJwt({ sub: 'user-123', session_id: 'sess-abc', exp: 1234567890 });
  assert.deepEqual(decodeJwtPayload(token), { sub: 'user-123', session_id: 'sess-abc', exp: 1234567890 });
});

test('decodeJwtPayload handles UTF-8 payload content correctly', () => {
  const token = fakeJwt({ name: 'Café Résumé 日本語' });
  assert.deepEqual(decodeJwtPayload(token), { name: 'Café Résumé 日本語' });
});

test('decodeJwtPayload returns null for malformed input', () => {
  assert.equal(decodeJwtPayload(''), null);
  assert.equal(decodeJwtPayload(null), null);
  assert.equal(decodeJwtPayload(undefined), null);
  assert.equal(decodeJwtPayload('not-a-jwt'), null);
  assert.equal(decodeJwtPayload('only.two'), null); // still 2 parts, passes length check, but garbage base64
});

test('decodeJwtPayload returns null when the payload segment is not valid JSON', () => {
  const garbageB64 = Buffer.from('not json{{{', 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(decodeJwtPayload(`header.${garbageB64}.sig`), null);
});

test('sessionIdFromAccessToken extracts the session_id claim', () => {
  const token = fakeJwt({ sub: 'user-1', session_id: 'sess-xyz-789' });
  assert.equal(sessionIdFromAccessToken(token), 'sess-xyz-789');
});

test('sessionIdFromAccessToken returns null when the claim is absent', () => {
  const token = fakeJwt({ sub: 'user-1' });
  assert.equal(sessionIdFromAccessToken(token), null);
});

test('sessionIdFromAccessToken returns null for a non-string session_id', () => {
  const token = fakeJwt({ session_id: 12345 });
  assert.equal(sessionIdFromAccessToken(token), null);
});

test('sessionIdFromAccessToken returns null for an empty-string session_id', () => {
  const token = fakeJwt({ session_id: '' });
  assert.equal(sessionIdFromAccessToken(token), null);
});

test('sessionIdFromAccessToken returns null for malformed/missing tokens', () => {
  assert.equal(sessionIdFromAccessToken(null), null);
  assert.equal(sessionIdFromAccessToken(undefined), null);
  assert.equal(sessionIdFromAccessToken('garbage'), null);
});
