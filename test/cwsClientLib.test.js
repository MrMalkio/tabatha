// scripts/lib/cws-client.mjs — client_secret_*.json discovery/parsing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickNewestClientSecret, parseClientSecretJson, findNewestClientSecretPath,
} from '../scripts/lib/cws-client.mjs';

test('pickNewestClientSecret ignores non-matching files', () => {
  const entries = [
    { name: 'random.json', mtimeMs: 100 },
    { name: 'notes.txt', mtimeMs: 200 },
  ];
  assert.equal(pickNewestClientSecret(entries), null);
});

test('pickNewestClientSecret picks the newest by mtime when no preference', () => {
  const entries = [
    { name: 'client_secret_old_12345.json', mtimeMs: 100 },
    { name: 'client_secret_new_67890.json', mtimeMs: 500 },
  ];
  const picked = pickNewestClientSecret(entries);
  assert.equal(picked.name, 'client_secret_new_67890.json');
});

test('pickNewestClientSecret prefers files matching preferredFragment', () => {
  const entries = [
    { name: 'client_secret_999_other-app.json', mtimeMs: 900 }, // newest but wrong app
    { name: 'client_secret_1006989794983-abc.json', mtimeMs: 100 },
  ];
  const picked = pickNewestClientSecret(entries, { preferredFragment: '1006989794983' });
  assert.equal(picked.name, 'client_secret_1006989794983-abc.json');
});

test('pickNewestClientSecret falls back to any client_secret file if preferred fragment absent', () => {
  const entries = [
    { name: 'client_secret_555_unrelated.json', mtimeMs: 300 },
  ];
  const picked = pickNewestClientSecret(entries, { preferredFragment: '1006989794983' });
  assert.equal(picked.name, 'client_secret_555_unrelated.json');
});

test('parseClientSecretJson extracts client_id/client_secret from "installed" block', () => {
  const json = JSON.stringify({
    installed: {
      client_id: 'fake-client-id.apps.googleusercontent.com',
      client_secret: 'fake-secret-value',
      redirect_uris: ['http://localhost'],
    },
  });
  const { clientId, clientSecret } = parseClientSecretJson(json);
  assert.equal(clientId, 'fake-client-id.apps.googleusercontent.com');
  assert.equal(clientSecret, 'fake-secret-value');
});

test('parseClientSecretJson throws on invalid JSON', () => {
  assert.throws(() => parseClientSecretJson('not json'), /not valid JSON/);
});

test('parseClientSecretJson throws when installed/web block missing', () => {
  assert.throws(() => parseClientSecretJson('{}'), /installed.*web/);
});

test('parseClientSecretJson throws when client_id/client_secret missing', () => {
  const json = JSON.stringify({ installed: { client_id: 'only-id' } });
  assert.throws(() => parseClientSecretJson(json), /missing client_id/);
});

test('findNewestClientSecretPath uses injected fs to avoid touching real Downloads', () => {
  const fakeFs = {
    readdirSync: () => ['client_secret_1006989794983-x.json', 'other.json'],
    statSync: (p) => ({ mtimeMs: p.includes('1006989794983') ? 500 : 100 }),
  };
  const path = findNewestClientSecretPath('/fake/Downloads', fakeFs, { preferredFragment: '1006989794983' });
  assert.equal(path, '/fake/Downloads/client_secret_1006989794983-x.json');
});

test('findNewestClientSecretPath returns null when directory unreadable', () => {
  const fakeFs = {
    readdirSync: () => { throw new Error('ENOENT'); },
    statSync: () => ({ mtimeMs: 0 }),
  };
  assert.equal(findNewestClientSecretPath('/nope', fakeFs), null);
});
