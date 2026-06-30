// Workstream A2 — pinned manifest key.
// A top-level base64 SPKI "key" gives the unpacked extension a STABLE ID
// across machines and reloads (so chrome.storage survives, the OAuth redirect
// URL is stable, and edge-function CORS is fixed). This guards that the key is
// present and well-formed without depending on Chrome's loader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const manifestPath = fileURLToPath(new URL('../public/manifest.json', import.meta.url));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

test('manifest is MV3', () => {
  assert.equal(manifest.manifest_version, 3);
});

test('manifest has a top-level pinned key (base64 SPKI, >100 chars)', () => {
  assert.equal(typeof manifest.key, 'string', 'manifest.key must be a string');
  assert.ok(manifest.key.length > 100, `expected >100 chars, got ${manifest.key.length}`);
  // Valid base64 — round-trips and decodes to a plausible RSA-2048 SPKI (~294 bytes).
  assert.match(manifest.key, /^[A-Za-z0-9+/]+={0,2}$/, 'must be plain base64');
  const der = Buffer.from(manifest.key, 'base64');
  assert.ok(der.length > 200, `decoded SPKI should be >200 bytes, got ${der.length}`);
  assert.equal(der.toString('base64'), manifest.key, 'must round-trip as base64');
});
