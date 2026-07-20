// scripts/lib/deploy-creds.mjs — round-trip parse/merge for deploy-creds.local.
// Never asserts on real secret values; uses synthetic placeholders only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseCreds, mergeCreds, readCreds, writeCredsUpdate, readCredsValues,
} from '../scripts/lib/deploy-creds.mjs';

test('parseCreds extracts key=value pairs and preserves comments/blanks', () => {
  const text = '# header\nASANA_PAT=abc123\n\nSUPABASE_ACCESS_TOKEN=xyz\n';
  const parsed = parseCreds(text);
  assert.equal(parsed.values.ASANA_PAT, 'abc123');
  assert.equal(parsed.values.SUPABASE_ACCESS_TOKEN, 'xyz');
  assert.equal(parsed.lines.length, 5); // trailing newline produces a final empty "line"
  assert.equal(parsed.lines[0].key, null); // comment
  assert.equal(parsed.lines[2].key, null); // blank
});

test('parseCreds handles empty input', () => {
  const parsed = parseCreds('');
  assert.deepEqual(parsed.values, {});
});

test('mergeCreds updates an existing key in place, preserving order', () => {
  const parsed = parseCreds('FOO=1\nBAR=2\n');
  const out = mergeCreds(parsed, { FOO: '99' });
  assert.equal(out, 'FOO=99\nBAR=2\n');
});

test('mergeCreds appends new keys at the end', () => {
  const parsed = parseCreds('FOO=1\n');
  const out = mergeCreds(parsed, { NEW_KEY: 'hello' });
  assert.equal(out, 'FOO=1\nNEW_KEY=hello\n');
});

test('mergeCreds updates and appends together, preserving comments', () => {
  const parsed = parseCreds('# creds file\nFOO=1\n');
  const out = mergeCreds(parsed, { FOO: '2', BAR: '3' });
  assert.equal(out, '# creds file\nFOO=2\nBAR=3\n');
});

test('readCreds/writeCredsUpdate round-trip through a real temp file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cws-creds-'));
  const path = join(dir, 'deploy-creds.local');
  try {
    // first write: file does not exist yet
    writeCredsUpdate(path, { CWS_CLIENT_ID: 'id-1', CWS_CLIENT_SECRET: 'secret-1' });
    let values = readCredsValues(path);
    assert.equal(values.CWS_CLIENT_ID, 'id-1');
    assert.equal(values.CWS_CLIENT_SECRET, 'secret-1');

    // second write: preserves CWS_CLIENT_ID, updates CWS_CLIENT_SECRET, adds CWS_REFRESH_TOKEN
    writeCredsUpdate(path, { CWS_CLIENT_SECRET: 'secret-2', CWS_REFRESH_TOKEN: 'refresh-1' });
    values = readCredsValues(path);
    assert.equal(values.CWS_CLIENT_ID, 'id-1');
    assert.equal(values.CWS_CLIENT_SECRET, 'secret-2');
    assert.equal(values.CWS_REFRESH_TOKEN, 'refresh-1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readCreds on a missing file returns empty values (first-run case)', () => {
  const missing = join(tmpdir(), `cws-creds-missing-${Date.now()}.local`);
  const parsed = readCreds(missing);
  assert.deepEqual(parsed.values, {});
});
