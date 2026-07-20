#!/usr/bin/env node
// Tabatha Chrome Web Store API — one-time OAuth bootstrap.
//
// WHY: publishing via the CWS API needs a refresh token for a Google OAuth
// "Desktop app" client. This script runs the full loopback flow LOCALLY so
// nobody has to paste an auth code by hand:
//   1. locate the downloaded client_secret_*.json (GCP project
//      tabatha-web-store-api, OAuth client "Tabatha CWS Publisher")
//   2. start a loopback HTTP listener on 127.0.0.1:<ephemeral port>
//   3. open the Google consent screen in the default browser
//      (scope: https://www.googleapis.com/auth/chromewebstore)
//   4. capture ?code= on the loopback redirect, exchange it for tokens
//   5. write CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN into
//      deploy-creds.local (existing keys in that file are preserved)
//
// Usage:
//   npm run cws:auth
//   npm run cws:auth -- --client "C:\Users\me\Downloads\client_secret_....json"
//
// SECURITY: this script never prints a secret value, only booleans/lengths.
// deploy-creds.local is gitignored (`*.local`) — never commit it.

import { createServer } from 'node:http';
import {
  readFileSync, existsSync, readdirSync, statSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

import { parseAuthArgs } from './lib/cws-args.mjs';
import { findNewestClientSecretPath, parseClientSecretJson } from './lib/cws-client.mjs';
import { writeCredsUpdate } from './lib/deploy-creds.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CREDS_PATH = join(ROOT, 'deploy-creds.local');
const DOWNLOADS_DIR = join(homedir(), 'Downloads');
const PREFERRED_FRAGMENT = '1006989794983'; // "Tabatha CWS Publisher" client id prefix
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

const fail = (msg) => { console.error(`\n✘ cws-auth: ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`✓ ${msg}`);
const info = (msg) => console.log(msg);

// ---------------------------------------------------------------- 1. locate client JSON
const args = parseAuthArgs(process.argv.slice(2));

let clientPath = args.client;
if (clientPath && !existsSync(clientPath)) {
  fail(`--client path does not exist: ${clientPath}`);
}
if (!clientPath) {
  clientPath = findNewestClientSecretPath(DOWNLOADS_DIR, { readdirSync, statSync }, { preferredFragment: PREFERRED_FRAGMENT });
}
if (!clientPath) {
  fail(
    `no client_secret_*.json found in ${DOWNLOADS_DIR}.\n`
    + '  Download the OAuth client JSON for "Tabatha CWS Publisher" from the GCP console\n'
    + '  (APIs & Services -> Credentials -> OAuth 2.0 Client IDs) and re-run this command,\n'
    + '  or pass --client <path> explicitly.',
  );
}
info(`> using client file: ${clientPath.replace(homedir(), '~')}`);

let clientId;
let clientSecret;
try {
  const raw = readFileSync(clientPath, 'utf8');
  ({ clientId, clientSecret } = parseClientSecretJson(raw));
} catch (e) {
  fail(`could not parse client JSON: ${e.message}`);
}
ok(`client parsed (client_id ${clientId.length} chars, client_secret ${clientSecret.length} chars)`);

// ---------------------------------------------------------------- 2. loopback listener
function startLoopbackServer() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/') {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (error) {
        res.end(`<html><body style="font-family:sans-serif;padding:2rem"><h2>Authorization denied</h2><p>${error}</p><p>You can close this tab.</p></body></html>`);
        server.emit('cws-result', { error });
      } else if (code) {
        res.end('<html><body style="font-family:sans-serif;padding:2rem"><h2>Tabatha CWS authorization complete</h2><p>You can close this tab.</p></body></html>');
        server.emit('cws-result', { code });
      } else {
        res.end('<html><body>No code or error in callback.</body></html>');
      }
    });
    server.on('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      resolvePromise(server);
    });
  });
}

function waitForResult(server, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for the browser consent flow`));
    }, timeoutMs);
    server.once('cws-result', (result) => {
      clearTimeout(timer);
      resolvePromise(result);
    });
  });
}

function openInBrowser(url) {
  try {
    if (process.platform === 'win32') {
      execSync(`start "" "${url}"`, { shell: 'cmd.exe' });
    } else if (process.platform === 'darwin') {
      execSync(`open "${url}"`);
    } else {
      execSync(`xdg-open "${url}"`);
    }
  } catch {
    info('  (could not auto-open a browser — open this URL manually:)');
    info(`  ${url}`);
  }
}

let server;
try {
  server = await startLoopbackServer();
} catch (e) {
  fail(`could not start loopback listener: ${e.message}`);
}
const port = server.address().port;
const redirectUri = `http://127.0.0.1:${port}`;
ok(`loopback listener started on ${redirectUri}`);

const consentUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
consentUrl.searchParams.set('client_id', clientId);
consentUrl.searchParams.set('redirect_uri', redirectUri);
consentUrl.searchParams.set('response_type', 'code');
consentUrl.searchParams.set('scope', SCOPE);
consentUrl.searchParams.set('access_type', 'offline');
consentUrl.searchParams.set('prompt', 'consent');

info('> opening consent screen in your default browser...');
info('  (sign in with the account that owns the CWS developer registration)');
openInBrowser(consentUrl.toString());

let result;
try {
  result = await waitForResult(server, TIMEOUT_MS);
} catch (e) {
  server.close();
  fail(e.message);
} finally {
  // give the response a moment to flush before closing
  await new Promise((r) => { setTimeout(r, 250); });
}
server.close();

if (result.error) {
  fail(`Google returned an error: ${result.error} (did you deny the consent request?)`);
}
ok('authorization code received');

// ---------------------------------------------------------------- 3. exchange code
info('> exchanging code for tokens...');
const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code: result.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }),
});

const tokenBody = await tokenResp.json().catch(() => null);
if (!tokenResp.ok) {
  const detail = tokenBody?.error_description || tokenBody?.error || `HTTP ${tokenResp.status}`;
  fail(`token exchange failed: ${detail}`);
}
if (!tokenBody?.refresh_token) {
  fail(
    'token exchange succeeded but no refresh_token was returned.\n'
    + '  This usually means the account already granted consent before without\n'
    + '  "prompt=consent" — revoke prior access at\n'
    + '  https://myaccount.google.com/permissions and re-run this command.',
  );
}
ok(`refresh token received (${tokenBody.refresh_token.length} chars)`);

// ---------------------------------------------------------------- 4. persist
writeCredsUpdate(CREDS_PATH, {
  CWS_CLIENT_ID: clientId,
  CWS_CLIENT_SECRET: clientSecret,
  CWS_REFRESH_TOKEN: tokenBody.refresh_token,
});
ok(`wrote CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN to ${CREDS_PATH.replace(ROOT, '.')}`);
info('\nDone. Next: npm run cws:upload -- --new   (first-time item) or --upload (subsequent releases)');
