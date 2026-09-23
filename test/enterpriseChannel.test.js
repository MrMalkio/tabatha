import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const scriptUrl = new URL('../scripts/check-enterprise-channel.mjs', import.meta.url);
const channelXml = readFileSync(new URL('../site/enterprise/update.xml', import.meta.url), 'utf8');
const localVersion = channelXml.match(/<updatecheck\b[^>]*\sversion=['"]([^'"]+)['"]/)?.[1];
assert.ok(localVersion, 'The release channel must advertise a version');
const parts = localVersion.split('.').map(Number);
const newerVersion = [parts[0] + 1, ...parts.slice(1)].join('.');
const olderVersion = [parts[0] - 1, ...parts.slice(1)].join('.');

// Run the actual CLI against the real release XML/CRX, replacing only the
// network boundary. No fixture can accidentally bypass the local artifact gate.
function runGuard({ body = channelXml, status = 200, networkError = false, offline = false } = {}) {
  const source = `
    globalThis.fetch = async () => {
      ${networkError ? 'throw new Error("simulated network outage");' : `return new Response(${JSON.stringify(body)}, { status: ${status} });`}
    };
    await import(${JSON.stringify(scriptUrl.href)});
  `;
  const result = spawnSync(process.execPath,
    ['--input-type=module', '--eval', source, '--', ...(offline ? ['--offline'] : [])],
    { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

function xmlWithVersion(version) {
  return channelXml.replace(/(<updatecheck\b[^>]*\sversion=)(['"])[^'"]+\2/,
    (_match, prefix, quote) => `${prefix}${quote}${version}${quote}`);
}

test('enterprise guard accepts the current live version after checking the real artifact', () => {
  const result = runGuard();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /inner manifest version .* matches update.xml/);
  assert.match(result.output, /no rollback/);
});

test('enterprise guard accepts a release newer than the live channel', () => {
  const result = runGuard({ body: xmlWithVersion(olderVersion) });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /no rollback/);
});

test('enterprise guard rejects publishing an older release than the live channel', () => {
  const result = runGuard({ body: xmlWithVersion(newerVersion) });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /ROLLBACK/);
});

test('enterprise guard rejects a non-success HTTP response even if its body has a valid version', () => {
  const result = runGuard({ status: 503 });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /503/);
  assert.doesNotMatch(result.output, /preflight passed/);
});

test('enterprise guard rejects a successful response with no channel version', () => {
  const result = runGuard({ body: '<html>maintenance</html>' });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /live channel version/);
});

for (const version of ['6..7', '6.7beta', '65536.1', '0.0.0', '6.7.1.2.3']) {
  test(`enterprise guard rejects malformed live version ${version}`, () => {
    const result = runGuard({ body: xmlWithVersion(version) });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /live channel version/);
  });
}

test('enterprise guard rejects network failure', () => {
  const result = runGuard({ networkError: true });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /simulated network outage/);
  assert.doesNotMatch(result.output, /preflight passed/);
});

test('explicit offline mode validates the local artifact without calling fetch', () => {
  const result = runGuard({ networkError: true, offline: true });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /inner manifest version .* matches update.xml/);
  assert.match(result.output, /local-only/);
});

test('enterprise guard accepts standard double-quoted XML attributes', () => {
  const result = runGuard({ body: channelXml.replaceAll("'", '"') });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /no rollback/);
});
