#!/usr/bin/env node
// Tabatha docs version stamper — reads manifest.json and stamps every page in
// site/docs/*.html (not just index.html — see 2026-07-24 live-web-e2e audit:
// 15/16 doc pages were found stuck at stale hardcoded versions because this
// script only ever touched index.html).
// Usage:
//   node scripts/stamp-docs-version.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'public/manifest.json');
const DOCS_DIR = resolve(ROOT, 'site/docs');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const version = manifest.version;

if (!version) {
  console.error('✘ manifest.json has no "version" field');
  process.exit(2);
}

const versionBadge = `v${version}`;
const docFiles = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.html'));

let stampedCount = 0;
let alreadyCount = 0;

for (const file of docFiles) {
  const path = resolve(DOCS_DIR, file);
  const docs = readFileSync(path, 'utf8');

  // Replace the placeholder marker with the real version badge
  // Pattern matches: <!-- DOCS_VERSION_PLACEHOLDER -->v<old-version>
  const updated = docs.replace(
    /<!-- DOCS_VERSION_PLACEHOLDER -->v[\d.]+/g,
    `<!-- DOCS_VERSION_PLACEHOLDER -->${versionBadge}`
  );

  if (updated === docs) {
    alreadyCount += 1;
    continue;
  }

  writeFileSync(path, updated);
  stampedCount += 1;
  console.log(`✓ Stamped ${file} with ${versionBadge}`);
}

if (stampedCount === 0) {
  console.log(`✓ Already stamped: all ${docFiles.length} docs pages are at ${versionBadge}`);
} else {
  console.log(`✓ Stamped ${stampedCount} page(s), ${alreadyCount} already current (${versionBadge})`);
}
