#!/usr/bin/env node
// Tabatha atomic dist swap.
//
// WHY: Chrome loads the unpacked extension from `dist/`. Vite's build empties
// its output directory before writing new files (`emptyOutDir`), so if Chrome
// (re)starts or its startup extension garbage-collector runs while `dist/` is
// empty or half-written, Chrome sees an invalid extension directory and SILENTLY
// DROPS the unpacked entry — you then have to "Load unpacked" again by hand.
//
// FIX: Vite now builds into a staging dir (`.dist-build/`). This script swaps it
// into place with directory renames, so `dist/` is only ever absent for the
// microseconds between two renames instead of the multiple seconds of a full
// build. Mirrors the desktop companion's atomic installer swap.
//
// Usage: node scripts/swap-dist.mjs   (run automatically after `vite build`)

import { existsSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAGE = resolve(ROOT, '.dist-build');
const LIVE = resolve(ROOT, 'dist');

function fail(msg) {
  console.error(`✘ swap-dist: ${msg}`);
  process.exit(1);
}

// 1. Sanity: never swap in an empty/absent build — that would recreate the very
//    "invalid dist" state we are trying to prevent.
if (!existsSync(STAGE)) {
  fail(`staging dir missing: ${STAGE} (did "vite build" run and emit outDir=.dist-build?)`);
}
if (!existsSync(resolve(STAGE, 'manifest.json'))) {
  fail(`staging dir has no manifest.json: ${STAGE} — refusing to swap a broken build`);
}
if (readdirSync(STAGE).length === 0) {
  fail(`staging dir is empty: ${STAGE} — refusing to swap`);
}

const OLD = resolve(ROOT, `dist.old-${process.pid}-${Date.now()}`);

try {
  // 2. Move the current live dist aside (microsecond gap starts here).
  if (existsSync(LIVE)) {
    renameSync(LIVE, OLD);
  }
  // 3. Promote the freshly-built staging dir to live (gap ends here).
  renameSync(STAGE, LIVE);
} catch (err) {
  // Best-effort rollback so we never leave the user with no dist at all.
  if (!existsSync(LIVE) && existsSync(OLD)) {
    try {
      renameSync(OLD, LIVE);
    } catch { /* leave OLD in place for manual recovery */ }
  }
  fail(
    `atomic swap failed: ${err.code || ''} ${err.message}\n` +
    `  Likely cause: a file under dist/ is locked (Chrome reading it, or a shell cwd inside dist).\n` +
    `  The new build is intact in ${STAGE}; your previous dist is preserved. ` +
    `Close handles to dist/ and re-run: node scripts/swap-dist.mjs`
  );
}

// 4. Remove the previous dist (best-effort; it is git-ignored so leftovers are harmless).
if (existsSync(OLD)) {
  try {
    rmSync(OLD, { recursive: true, force: true });
  } catch {
    console.warn(`⚠ swap-dist: could not delete ${OLD} (locked). Safe to remove later.`);
  }
}

console.log('✓ swap-dist: dist/ updated atomically (never emptied mid-build)');
