#!/usr/bin/env node
// Tabatha docs version stamper — reads manifest.json and stamps docs/index.html.
// Usage:
//   node scripts/stamp-docs-version.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'public/manifest.json');
const DOCS_INDEX = resolve(ROOT, 'site/docs/index.html');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const version = manifest.version;

if (!version) {
  console.error('✘ manifest.json has no "version" field');
  process.exit(2);
}

const docs = readFileSync(DOCS_INDEX, 'utf8');
const versionBadge = `v${version}`;

// Replace the placeholder marker with the real version badge
// Pattern matches: <!-- DOCS_VERSION_PLACEHOLDER -->v<old-version>
const updated = docs.replace(
  /<!-- DOCS_VERSION_PLACEHOLDER -->v[\d.]+/g,
  `<!-- DOCS_VERSION_PLACEHOLDER -->${versionBadge}`
);

if (updated === docs) {
  console.log(`✓ Already stamped: docs/index.html is at v${version}`);
  process.exit(0);
}

writeFileSync(DOCS_INDEX, updated);
console.log(`✓ Stamped docs/index.html with v${version}`);
