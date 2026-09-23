#!/usr/bin/env node
// Tabatha site version stamper — reads manifest.json and stamps the nav-chrome
// version badge on every page in site/docs/*.html AND site/show/*.html.
//
// History: this only ever touched site/docs/index.html, so the 2026-07-24
// live-web-e2e audit found 15/16 doc pages stuck at stale hardcoded versions.
// site/show was still hand-maintained after that (commit 9ee9039 hand-synced
// 19 badges to v6.7.73 on 2026-07-24, and they were stale again within a day),
// so it is covered here too.
//
// Scope: ONLY the marked nav-chrome badge is stamped. Version strings that are
// deliberate mock UI content inside the showcase demos — "Tabatha v6.7.16-α",
// the release-notes overlay, the version-history list — are period-accurate
// fixtures and are intentionally left alone. So is the "brand-faithful to vX"
// footer, which is a curated claim about which release the mockups reproduce;
// it should only move when the mockups are actually refreshed.
//
// Usage:
//   node scripts/stamp-docs-version.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'public/manifest.json');
const PAGE_DIRS = ['site/docs', 'site/show'];

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const version = manifest.version;

if (!version) {
  console.error('✘ manifest.json has no "version" field');
  process.exit(2);
}

const versionBadge = `v${version}`;

const pages = PAGE_DIRS.flatMap((dir) =>
  readdirSync(resolve(ROOT, dir))
    .filter((f) => f.endsWith('.html'))
    .map((f) => ({ label: `${dir}/${f}`, path: resolve(ROOT, dir, f) }))
);

let stampedCount = 0;
let alreadyCount = 0;
let unmarkedCount = 0;

for (const { label, path } of pages) {
  const html = readFileSync(path, 'utf8');

  // Replace the placeholder marker with the real version badge
  // Pattern matches: <!-- DOCS_VERSION_PLACEHOLDER -->v<old-version>
  const updated = html.replace(
    /<!-- DOCS_VERSION_PLACEHOLDER -->v[\d.]+/g,
    `<!-- DOCS_VERSION_PLACEHOLDER -->${versionBadge}`
  );

  // A page carrying a nav-chrome badge but no marker would silently drift —
  // that is exactly how site/docs and site/show each went stale. Surface it.
  if (/class="verbadge"/.test(html) && !/<!-- DOCS_VERSION_PLACEHOLDER -->/.test(html)) {
    unmarkedCount += 1;
    console.warn(`⚠ ${label} has a verbadge but no DOCS_VERSION_PLACEHOLDER marker — not stamped`);
  }

  if (updated === html) {
    alreadyCount += 1;
    continue;
  }

  writeFileSync(path, updated);
  stampedCount += 1;
  console.log(`✓ Stamped ${label} with ${versionBadge}`);
}

if (stampedCount === 0) {
  console.log(`✓ Already stamped: all ${pages.length} site pages are at ${versionBadge}`);
} else {
  console.log(`✓ Stamped ${stampedCount} page(s), ${alreadyCount} already current (${versionBadge})`);
}

if (unmarkedCount > 0) {
  console.error(`✘ ${unmarkedCount} page(s) carry an unmarked version badge — add the marker so they stamp automatically`);
  process.exit(1);
}
