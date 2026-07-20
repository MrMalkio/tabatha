#!/usr/bin/env node
// Tabatha self-hosted update-channel publisher.
//
// WHY: Chrome Web Store review is days out. Staff need a GUARANTEED remote
// update path for the unpacked extension that does NOT depend on CWS at all.
// This script cuts that channel end-to-end from the current git tree:
//
//   1. Runs the normal store-style build — WITH the pinned `key` (this is the
//      unpacked-staff channel, distinct from the CWS key-stripped zip built by
//      build-store-zip.mjs). Keeping the key means every staff install keeps
//      the SAME extension id (hoknmoclnhccpgofpdihmiadmnmejjod) release over
//      release, so Cloud Sync / local storage never gets orphaned by an id
//      change.
//   2. Zips dist/ -> tabatha-<version>.zip and computes its sha256.
//   3. Publishes (or reuses) a GitHub Release tagged `ext-v<version>` — NOT
//      `v<version>`, which is reserved for the project's own release-tag
//      scheme (v6.5.0, v6.6.0, ...) — with the zip attached.
//   4. Writes/updates `latest.json` { version, zipUrl, sha256, published } and
//      commits it to the dedicated `update-channel` branch, which is served
//      forever at a stable, cache-light URL via raw.githubusercontent.com:
//
//        https://raw.githubusercontent.com/MrMalkio/tabatha/update-channel/latest.json
//
//      (raw.githubusercontent.com is picked over GitHub Pages because it
//      needs zero setup, has no build step, and updates the instant the
//      branch commit lands — Pages would add a CDN publish delay that works
//      against "guaranteed update the moment it's cut".)
//
// Usage:
//   node scripts/publish-update.mjs                 (build + zip + release + latest.json)
//   node scripts/publish-update.mjs --no-build       (package the existing dist/)
//   node scripts/publish-update.mjs --notes "..."    (custom release notes)
//
// Requires: gh CLI authenticated with push access to the repo.

import { execSync } from 'node:child_process';
import {
  existsSync, rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, createReadStream,
} from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT_DIR = join(ROOT, 'store-assets');
const REPO = 'MrMalkio/tabatha';
const CHANNEL_BRANCH = 'update-channel';

const fail = (msg) => { console.error(`✘ publish-update: ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`✓ ${msg}`);
const args = process.argv.slice(2);
const notesArg = (() => {
  const i = args.indexOf('--notes');
  return i >= 0 ? args[i + 1] : null;
})();

// ---------------------------------------------------------------- 1. build
if (!args.includes('--no-build')) {
  console.log('> npm run build');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit', shell: true });
}
if (!existsSync(join(DIST, 'manifest.json'))) fail('dist/manifest.json missing — build failed?');

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
const version = manifest.version;
if (!version || !/^\d+(\.\d+){1,3}$/.test(version)) fail(`invalid dist version: ${JSON.stringify(version)}`);
if (!manifest.key) fail('dist/manifest.json has no "key" — this channel requires the pinned key (staff installs must keep a stable extension id). Did build:store run instead of build?');
ok(`building unpacked-staff update package for v${version} (key present, id stable)`);

// ---------------------------------------------------------------- 2. zip + sha256
mkdirSync(OUT_DIR, { recursive: true });
const zipName = `tabatha-${version}.zip`;
const zipPath = join(OUT_DIR, zipName);
rmSync(zipPath, { force: true });

const bsdtar = 'C:\\Windows\\System32\\tar.exe';
try {
  if (process.platform === 'win32' && existsSync(bsdtar)) {
    execSync(`"${bsdtar}" -a -c -f "${zipPath}" *`, { cwd: DIST, stdio: 'inherit', shell: true });
  } else if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${DIST}\\*' -DestinationPath '${zipPath}' -Force"`,
      { stdio: 'inherit' },
    );
  } else {
    execSync(`zip -r "${zipPath}" .`, { cwd: DIST, stdio: 'inherit', shell: true });
  }
} catch (e) {
  fail(`zip step failed: ${e.message}`);
}
if (!existsSync(zipPath)) fail('zip file was not created');
ok(`zipped: ${relative(ROOT, zipPath)}`);

const sha256 = await new Promise((resolvePromise, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(zipPath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolvePromise(hash.digest('hex')));
  stream.on('error', reject);
});
ok(`sha256: ${sha256}`);

// ---------------------------------------------------------------- 3. GitHub release
const tag = `ext-v${version}`;
const notes = notesArg || `Self-hosted unpacked update-channel build for staff installs.\n\nExtension id: ${manifest.key ? 'hoknmoclnhccpgofpdihmiadmnmejjod (pinned key)' : 'unpinned'}\nVersion: ${version}\nSHA256: ${sha256}`;

let releaseExists = false;
try {
  execSync(`gh release view ${tag} --repo ${REPO}`, { cwd: ROOT, stdio: 'ignore' });
  releaseExists = true;
} catch { /* not found, will create */ }

if (releaseExists) {
  console.log(`> gh release upload ${tag} (asset already tagged — replacing)`);
  execSync(`gh release upload ${tag} "${zipPath}" --repo ${REPO} --clobber`, { cwd: ROOT, stdio: 'inherit', shell: true });
} else {
  console.log(`> gh release create ${tag}`);
  const notesFile = join(ROOT, `.release-notes-${tag}.txt`);
  writeFileSync(notesFile, notes);
  try {
    execSync(
      `gh release create ${tag} "${zipPath}" --repo ${REPO} --title "Tabatha ${version} (staff update channel)" --notes-file "${notesFile}"`,
      { cwd: ROOT, stdio: 'inherit', shell: true },
    );
  } finally {
    rmSync(notesFile, { force: true });
  }
}
ok(`release ready: https://github.com/${REPO}/releases/tag/${tag}`);

// Resolve the actual browser_download_url GitHub assigned the asset.
const assetJson = execSync(`gh release view ${tag} --repo ${REPO} --json assets`, { cwd: ROOT }).toString();
const assets = JSON.parse(assetJson).assets;
const asset = assets.find((a) => a.name === zipName);
if (!asset) fail(`could not find uploaded asset "${zipName}" on release ${tag}`);
const zipUrl = asset.url;
ok(`zipUrl: ${zipUrl}`);

// ---------------------------------------------------------------- 4. latest.json on update-channel branch
const published = args.includes('--published-at')
  ? args[args.indexOf('--published-at') + 1]
  : new Date().toISOString();

const latest = { version, zipUrl, sha256, published };

const CHANNEL_DIR = join(ROOT, '.update-channel-work');
rmSync(CHANNEL_DIR, { recursive: true, force: true });
mkdirSync(CHANNEL_DIR, { recursive: true });

console.log(`> preparing '${CHANNEL_BRANCH}' branch worktree`);
// Fetch the branch if it exists remotely; otherwise this will be a fresh orphan branch.
let branchExistsRemote = false;
try {
  execSync(`git ls-remote --exit-code --heads origin ${CHANNEL_BRANCH}`, { cwd: ROOT, stdio: 'ignore' });
  branchExistsRemote = true;
} catch { /* doesn't exist yet */ }

try {
  if (branchExistsRemote) {
    execSync(`git fetch origin ${CHANNEL_BRANCH}`, { cwd: ROOT, stdio: 'inherit' });
    execSync(`git worktree add "${CHANNEL_DIR}" origin/${CHANNEL_BRANCH} --detach`, { cwd: ROOT, stdio: 'inherit' });
    // put it on a local tracking branch for the commit
    execSync(`git checkout -B ${CHANNEL_BRANCH}`, { cwd: CHANNEL_DIR, stdio: 'inherit' });
  } else {
    execSync(`git worktree add --detach "${CHANNEL_DIR}"`, { cwd: ROOT, stdio: 'inherit' });
    execSync(`git checkout --orphan ${CHANNEL_BRANCH}`, { cwd: CHANNEL_DIR, stdio: 'inherit' });
    execSync(`git rm -rf --quiet .`, { cwd: CHANNEL_DIR, stdio: 'inherit' });
  }

  writeFileSync(join(CHANNEL_DIR, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');
  execSync(`git add latest.json`, { cwd: CHANNEL_DIR, stdio: 'inherit' });
  const hasChanges = (() => {
    try {
      execSync(`git diff --cached --quiet`, { cwd: CHANNEL_DIR });
      return false;
    } catch { return true; }
  })();
  if (hasChanges) {
    // --no-verify: this orphan branch holds ONLY latest.json (no package.json,
    // no scripts/) by design — it is a pure data feed, not a code checkout — so
    // the repo's shared pre-commit hook (node scripts/sync-version.mjs --check)
    // cannot even resolve its target here and would fail every commit.
    execSync(`git commit --no-verify -m "chore(update-channel): latest.json -> v${version}"`, { cwd: CHANNEL_DIR, stdio: 'inherit' });
    execSync(`git push origin HEAD:${CHANNEL_BRANCH}`, { cwd: CHANNEL_DIR, stdio: 'inherit' });
    ok(`latest.json published on '${CHANNEL_BRANCH}' branch (v${version})`);
  } else {
    ok(`latest.json unchanged (already v${version}) — nothing to push`);
  }
} finally {
  execSync(`git worktree remove "${CHANNEL_DIR}" --force`, { cwd: ROOT, stdio: 'ignore' });
}

const rawUrl = `https://raw.githubusercontent.com/${REPO}/${CHANNEL_BRANCH}/latest.json`;
console.log('');
console.log('========================================================================');
console.log(` Tabatha self-hosted update channel published.`);
console.log(` Version:       ${version}`);
console.log(` Release:       https://github.com/${REPO}/releases/tag/${tag}`);
console.log(` Zip:           ${zipName}  (sha256 ${sha256})`);
console.log(` latest.json:   ${rawUrl}`);
console.log('========================================================================');
