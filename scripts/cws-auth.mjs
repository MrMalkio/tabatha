#!/usr/bin/env node
/**
 * Chrome Web Store API — one-time OAuth setup.
 *
 * Mints a long-lived refresh token so `npm run cws:publish` can upload and
 * publish without any browser clicking.
 *
 * PRIVACY BY DESIGN: this script runs entirely on your machine. The auth code
 * and the resulting refresh token are never printed to the terminal and never
 * leave this process except into deploy-creds.local (which is gitignored).
 * Paste the code into THIS prompt only — never into a chat.
 *
 * Prereqs (created in the Google Cloud console):
 *   - a project with the "Chrome Web Store API" enabled
 *   - an OAuth client of type "Desktop app"
 * Put its values in deploy-creds.local as:
 *   CWS_CLIENT_ID=...
 *   CWS_CLIENT_SECRET=...
 *
 * Usage:  node scripts/cws-auth.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CREDS = resolve(ROOT, 'deploy-creds.local');
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
// Google's out-of-band flow for installed apps: the code is shown in the
// browser for you to copy, so no local listener / redirect server is needed.
const REDIRECT = 'urn:ietf:wg:oauth:2.0:oob';

function readCreds() {
  if (!existsSync(CREDS)) throw new Error(`Missing ${CREDS}`);
  const out = {};
  for (const line of readFileSync(CREDS, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function upsertCred(key, value) {
  const raw = existsSync(CREDS) ? readFileSync(CREDS, 'utf8') : '';
  const lines = raw.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else {
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(`${key}=${value}`, '');
  }
  writeFileSync(CREDS, lines.join('\n'), 'utf8');
}

const creds = readCreds();
const clientId = creds.CWS_CLIENT_ID;
const clientSecret = creds.CWS_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    '\n✗ CWS_CLIENT_ID / CWS_CLIENT_SECRET not found in deploy-creds.local.\n' +
      '  Create an OAuth client (type: Desktop app) in the Google Cloud console,\n' +
      '  then add both values to deploy-creds.local and re-run.\n'
  );
  process.exit(1);
}

const authUrl =
  'https://accounts.google.com/o/oauth2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });

console.log(`
========================================================================
 Chrome Web Store API — one-time authorization
========================================================================

 1. Open this URL in the browser where you're signed in as the Web Store
    developer account:

${authUrl}

 2. Approve the access request.
 3. Google will show you an authorization code. Copy it.
 4. Paste it below. (It stays on this machine — nothing is echoed.)
`);

const rl = createInterface({ input: stdin, output: stdout, terminal: true });
const code = (await rl.question('Authorization code: ')).trim();
rl.close();

if (!code) {
  console.error('\n✗ No code entered. Aborted — nothing was written.\n');
  process.exit(1);
}

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT,
  }),
});

const json = await res.json();

if (!res.ok || !json.refresh_token) {
  // Print Google's error label only — never the response body, which can
  // contain token material.
  console.error(
    `\n✗ Token exchange failed (${res.status} ${json.error ?? 'unknown'}).` +
      `\n  ${json.error_description ?? ''}` +
      '\n  Codes are single-use and expire quickly — re-run and paste a fresh one.\n'
  );
  process.exit(1);
}

upsertCred('CWS_REFRESH_TOKEN', json.refresh_token);

console.log(`
✓ Authorized. Refresh token written to deploy-creds.local (gitignored).
  It was not printed here and does not need to be shared with anyone.

  Next:  npm run cws:publish
`);
