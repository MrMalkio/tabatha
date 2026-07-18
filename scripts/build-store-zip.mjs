#!/usr/bin/env node
// Tabatha Chrome Web Store zip builder.
//
// Produces `store-assets/tabatha-store-v<version>.zip` from a fresh build:
//   1. runs the normal `npm run build` (prebuild syncs version + checks changelog)
//   2. copies `dist/` into a staging dir
//   3. DELETES the `key` field from the staged manifest.json — the Chrome Web
//      Store rejects uploads that carry a pinned key; the store assigns its own
//      key/ID. (Staff unpacked installs keep the key so their extension ID is
//      stable — see docs/CHROME-WEB-STORE-LISTING.md "Store zip / key-stripping".)
//   4. validates the staged payload (manifest parses, version present, entry
//      HTML pages + referenced icons exist, no *.map files, no dotfiles)
//   5. zips staging → store-assets/tabatha-store-v<version>.zip
//
// Usage: npm run build:store            (full: build + package)
//        node scripts/build-store-zip.mjs --no-build   (package existing dist)

import { execSync } from 'node:child_process';
import {
  existsSync, rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync,
} from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const STAGE = join(ROOT, '.store-build');
const OUT_DIR = join(ROOT, 'store-assets');

const fail = (msg) => { console.error(`✘ build-store-zip: ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`✓ ${msg}`);

// ---------------------------------------------------------------- 1. build
if (!process.argv.includes('--no-build')) {
  console.log('> npm run build');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit', shell: true });
}
if (!existsSync(join(DIST, 'manifest.json'))) fail('dist/manifest.json missing — build failed?');

// ---------------------------------------------------------------- 2. stage
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
cpSync(DIST, STAGE, { recursive: true });
ok('staged dist copy');

// ---------------------------------------------------------------- 3. strip key
const manifestPath = join(STAGE, 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  fail(`staged manifest.json does not parse: ${e.message}`);
}
if ('key' in manifest) {
  delete manifest.key;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 4) + '\n');
  ok('removed pinned "key" from staged manifest (store assigns its own ID)');
} else {
  console.log('  (no "key" field present — nothing to strip)');
}

// ---------------------------------------------------------------- 4. validate
if (!manifest.version || !/^\d+(\.\d+){1,3}$/.test(manifest.version)) {
  fail(`manifest version missing/invalid: ${JSON.stringify(manifest.version)}`);
}
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if ('key' in JSON.parse(readFileSync(manifestPath, 'utf8'))) fail('key still present after strip');

// entry pages referenced by the manifest must exist in the payload
const mustExist = new Set();
if (manifest.background?.service_worker) mustExist.add(manifest.background.service_worker);
if (manifest.action?.default_popup) mustExist.add(manifest.action.default_popup);
if (manifest.options_page) mustExist.add(manifest.options_page);
if (manifest.chrome_url_overrides?.newtab) mustExist.add(manifest.chrome_url_overrides.newtab);
if (manifest.side_panel?.default_path) mustExist.add(manifest.side_panel.default_path);
for (const cs of manifest.content_scripts ?? []) (cs.js ?? []).forEach((f) => mustExist.add(f));
for (const set of [manifest.icons ?? {}, manifest.action?.default_icon ?? {}]) {
  Object.values(set).forEach((f) => mustExist.add(f));
}
// known multi-page entry points (belt and suspenders)
for (const page of ['home.html', 'popup.html', 'sidebar.html', 'settings.html', 'index.html']) {
  if (existsSync(join(DIST, page))) mustExist.add(page);
}
for (const f of mustExist) {
  if (!existsSync(join(STAGE, f))) fail(`manifest references "${f}" but it is missing from the payload`);
}
ok(`all ${mustExist.size} manifest-referenced files present`);

// no sourcemaps, no dotfiles anywhere in the payload
const offenders = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const rel = relative(STAGE, p);
    if (entry.startsWith('.')) { offenders.push(`dotfile: ${rel}`); continue; }
    if (statSync(p).isDirectory()) walk(p);
    else if (entry.endsWith('.map')) offenders.push(`sourcemap: ${rel}`);
  }
})(STAGE);
if (offenders.length) fail(`payload contains disallowed files:\n  ${offenders.join('\n  ')}`);
ok('no *.map files, no dotfiles');

// ---------------------------------------------------------------- 5. zip
mkdirSync(OUT_DIR, { recursive: true });
const zipPath = join(OUT_DIR, `tabatha-store-v${manifest.version}.zip`);
rmSync(zipPath, { force: true });

// Prefer Windows bsdtar (produces standard zip with forward-slash entries);
// fall back to PowerShell Compress-Archive.
const bsdtar = 'C:\\Windows\\System32\\tar.exe';
try {
  if (process.platform === 'win32' && existsSync(bsdtar)) {
    execSync(`"${bsdtar}" -a -c -f "${zipPath}" *`, { cwd: STAGE, stdio: 'inherit', shell: true });
  } else if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${STAGE}\\*' -DestinationPath '${zipPath}' -Force"`,
      { stdio: 'inherit' },
    );
  } else {
    execSync(`zip -r "${zipPath}" .`, { cwd: STAGE, stdio: 'inherit', shell: true });
  }
} catch (e) {
  fail(`zip step failed: ${e.message}`);
}
if (!existsSync(zipPath)) fail('zip file was not created');

rmSync(STAGE, { recursive: true, force: true });
ok(`store zip ready: ${relative(ROOT, zipPath)} (v${manifest.version}, key stripped)`);
