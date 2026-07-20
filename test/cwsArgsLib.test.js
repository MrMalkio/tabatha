// scripts/lib/cws-args.mjs + scripts/lib/cws-zip.mjs — argv/path pure helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthArgs, parsePublishArgs } from '../scripts/lib/cws-args.mjs';
import { resolveStoreZipPath } from '../scripts/lib/cws-zip.mjs';

test('parseAuthArgs with no flags', () => {
  assert.deepEqual(parseAuthArgs([]), { client: null });
});

test('parseAuthArgs with --client', () => {
  assert.deepEqual(parseAuthArgs(['--client', 'C:/foo/bar.json']), { client: 'C:/foo/bar.json' });
});

test('parsePublishArgs defaults target to trustedTesters and flags help when no action given', () => {
  const out = parsePublishArgs([]);
  assert.equal(out.target, 'trustedTesters');
  assert.equal(out.help, true);
});

test('parsePublishArgs recognizes --upload --new', () => {
  const out = parsePublishArgs(['--upload', '--new']);
  assert.equal(out.upload, true);
  assert.equal(out.isNew, true);
  assert.equal(out.help, undefined);
});

test('parsePublishArgs recognizes --publish --target default', () => {
  const out = parsePublishArgs(['--publish', '--target', 'default']);
  assert.equal(out.publish, true);
  assert.equal(out.target, 'default');
});

test('parsePublishArgs recognizes --status', () => {
  const out = parsePublishArgs(['--status']);
  assert.equal(out.status, true);
});

test('parsePublishArgs rejects an invalid --target', () => {
  assert.throws(() => parsePublishArgs(['--publish', '--target', 'bogus']), /invalid --target/);
});

test('resolveStoreZipPath builds the expected path and reports existence', () => {
  const { zipPath, exists } = resolveStoreZipPath('C:\\repo', '6.7.17', (p) => p.endsWith('6.7.17.zip'));
  assert.equal(zipPath, 'C:\\repo/store-assets/tabatha-store-v6.7.17.zip');
  assert.equal(exists, true);
});

test('resolveStoreZipPath rejects an invalid version', () => {
  assert.throws(() => resolveStoreZipPath('C:\\repo', 'not-a-version', () => false), /invalid version/);
});
