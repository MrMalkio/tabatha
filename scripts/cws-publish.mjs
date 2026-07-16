#!/usr/bin/env node
// Tabatha Chrome Web Store API — release pipeline.
//
// Reads CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN from
// deploy-creds.local (written by `npm run cws:auth`), mints a short-lived
// access token, and drives the CWS Items API:
//
//   --upload            PUT the store zip to an existing item (CWS_APP_ID)
//   --upload --new      POST to create a brand-new item; writes CWS_APP_ID
//   --publish           POST .../publish?publishTarget=<target>
//     --target <trustedTesters|default>   (default: trustedTesters)
//   --status            GET .../items/<id>?projection=DRAFT
//
// Builds store-assets/tabatha-store-v<version>.zip first via `npm run
// build:store` if it doesn't already exist for the current manifest version.
//
// NOTE: CWS visibility (Public/Unlisted/Private) and first-time listing
// fields (description, screenshots, privacy policy URL, category) are set in
// the developer console UI, not via this API. See docs/cws-api-release.md.
//
// SECURITY: never prints access/refresh token values — only HTTP status and
// the API's own (non-secret) itemError messages.

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePublishArgs } from './lib/cws-args.mjs';
import { readCredsValues, writeCredsUpdate } from './lib/deploy-creds.mjs';
import { resolveStoreZipPath } from './lib/cws-zip.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CREDS_PATH = join(ROOT, 'deploy-creds.local');
const MANIFEST_PATH = join(ROOT, 'public', 'manifest.json');

const fail = (msg) => { console.error(`\n✘ cws-publish: ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`✓ ${msg}`);
const info = (msg) => console.log(msg);

const USAGE = `Usage:
  npm run cws:upload                first-release-or-not upload of the current store zip
  npm run cws:upload -- --new       create the CWS item for the FIRST TIME (writes CWS_APP_ID)
  npm run cws:publish               publish to trustedTesters (default) or --target default
  node scripts/cws-publish.mjs --status   show current draft item status
`;

let args;
try {
  args = parsePublishArgs(process.argv.slice(2));
} catch (e) {
  fail(e.message);
}
if (args.help) {
  info(USAGE);
  process.exit(0);
}

// ---------------------------------------------------------------- creds
const creds = readCredsValues(CREDS_PATH);
const missing = ['CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN'].filter((k) => !creds[k]);
if (missing.length) {
  fail(`missing ${missing.join(', ')} in deploy-creds.local — run "npm run cws:auth" first.`);
}
if (!args.isNew && !creds.CWS_APP_ID && (args.upload || args.publish || args.status)) {
  fail('no CWS_APP_ID in deploy-creds.local. First release? run: npm run cws:upload -- --new');
}

async function getAccessToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.CWS_CLIENT_ID,
      client_secret: creds.CWS_CLIENT_SECRET,
      refresh_token: creds.CWS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    const detail = body?.error_description || body?.error || `HTTP ${resp.status}`;
    fail(`could not mint access token: ${detail}`);
  }
  return body.access_token;
}

function reportItemErrors(body) {
  if (Array.isArray(body?.itemError) && body.itemError.length) {
    for (const e of body.itemError) {
      console.error(`  itemError: ${e.error_code ?? ''} ${e.error_detail ?? JSON.stringify(e)}`.trim());
    }
  }
}

// ---------------------------------------------------------------- version + zip
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const { version } = manifest;

async function ensureZip() {
  const { zipPath, exists } = resolveStoreZipPath(ROOT, version, existsSync);
  if (exists) {
    ok(`store zip already built: ${zipPath.replace(ROOT, '.')}`);
    return zipPath;
  }
  info('> store zip missing — running npm run build:store...');
  execSync('npm run build:store', { cwd: ROOT, stdio: 'inherit', shell: true });
  const check = resolveStoreZipPath(ROOT, version, existsSync);
  if (!check.exists) fail(`build:store ran but ${check.zipPath} still does not exist`);
  return check.zipPath;
}

// ---------------------------------------------------------------- actions
async function doUpload(accessToken) {
  const zipPath = await ensureZip();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'x-goog-api-version': '2',
  };

  if (args.isNew) {
    if (creds.CWS_APP_ID) {
      fail(`CWS_APP_ID already set (${creds.CWS_APP_ID.length} chars) — this item already exists. Drop --new to upload a new package to it.`);
    }
    info('> creating a NEW Chrome Web Store item (first-time listing)...');
    const resp = await fetch('https://www.googleapis.com/upload/chromewebstore/v1.1/items', {
      method: 'POST',
      headers,
      body: createReadStream(zipPath),
      duplex: 'half',
    });
    const body = await resp.json().catch(() => null);
    if (!resp.ok || body?.uploadState === 'FAILURE') {
      console.error(`HTTP ${resp.status}`);
      reportItemErrors(body);
      fail('item creation failed (see itemError above)');
    }
    if (!body?.id) fail('response did not include a new item id');
    writeCredsUpdate(CREDS_PATH, { CWS_APP_ID: body.id });
    ok(`new item created — id ${body.id.length} chars, uploadState=${body.uploadState}`);
    info('  CWS_APP_ID written to deploy-creds.local.');
    info('  Finish the listing (description, screenshots, category, Unlisted visibility,');
    info('  privacy policy URL) in the developer console before publishing.');
    return;
  }

  info(`> uploading ${zipPath.replace(ROOT, '.')} to existing item...`);
  const resp = await fetch(
    `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${creds.CWS_APP_ID}`,
    { method: 'PUT', headers, body: createReadStream(zipPath), duplex: 'half' },
  );
  const body = await resp.json().catch(() => null);
  if (!resp.ok || body?.uploadState === 'FAILURE') {
    console.error(`HTTP ${resp.status}`);
    reportItemErrors(body);
    fail('upload failed (see itemError above)');
  }
  ok(`upload accepted — uploadState=${body?.uploadState}`);
}

async function doPublish(accessToken) {
  info(`> publishing item to target "${args.target}"...`);
  const resp = await fetch(
    `https://www.googleapis.com/chromewebstore/v1.1/items/${creds.CWS_APP_ID}/publish?publishTarget=${args.target}`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'x-goog-api-version': '2' } },
  );
  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    console.error(`HTTP ${resp.status}`);
    reportItemErrors(body);
    fail('publish request failed (see itemError above)');
  }
  const status = Array.isArray(body?.status) ? body.status.join(', ') : body?.status;
  ok(`publish request accepted — status: ${status}`);
  if (status && String(status).includes('OK')) {
    info(`  Review latency note: items requesting broad host permissions (identity, <all_urls>)`);
    info('  typically take longer than the median CWS review time — see docs/cws-api-release.md.');
  }
}

async function doStatus(accessToken) {
  const resp = await fetch(
    `https://www.googleapis.com/chromewebstore/v1.1/items/${creds.CWS_APP_ID}?projection=DRAFT`,
    { headers: { Authorization: `Bearer ${accessToken}`, 'x-goog-api-version': '2' } },
  );
  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    console.error(`HTTP ${resp.status}`);
    reportItemErrors(body);
    fail('status request failed (see itemError above)');
  }
  ok(`item status — uploadState=${body?.uploadState}, publicKey=${body?.publicKey ? 'present' : 'absent'}`);
  reportItemErrors(body);
}

// ---------------------------------------------------------------- main
const accessToken = await getAccessToken();
ok(`access token minted (${accessToken.length} chars)`);

if (args.upload) await doUpload(accessToken);
if (args.publish) await doPublish(accessToken);
if (args.status) await doStatus(accessToken);
