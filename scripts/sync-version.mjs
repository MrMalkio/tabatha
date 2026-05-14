#!/usr/bin/env node
// Tabatha version sync — manifest.json is the source of truth.
// Usage:
//   node scripts/sync-version.mjs           → propagate manifest version everywhere
//   node scripts/sync-version.mjs --check   → exit non-zero if any file is out of sync

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

const MANIFEST = resolve(ROOT, 'public/manifest.json');
const PKG = resolve(ROOT, 'package.json');
const AGENTS = resolve(ROOT, 'AGENTS.md');
const VENDOR_MIRRORS = ['CLAUDE.md', 'GEMINI.md', '.gemini/agent.md'].map((p) => resolve(ROOT, p));
const CHANGELOG = resolve(ROOT, 'Tabatha_Changelog.md');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const truth = manifest.version;
if (!truth) {
  console.error('✘ manifest.json has no "version" field');
  process.exit(2);
}

const drift = [];
const fixes = [];

function syncJson(path, label) {
  const raw = readFileSync(path, 'utf8');
  const obj = JSON.parse(raw);
  if (obj.version === truth) return;
  drift.push(`${label}: ${obj.version} → ${truth}`);
  if (!CHECK_ONLY) {
    obj.version = truth;
    writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
    fixes.push(label);
  }
}

function syncMarkdownLine(path, label, pattern, replacement) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  const match = raw.match(pattern);
  if (!match) return;
  if (match[0] === replacement) return;
  drift.push(`${label}: "${match[0].trim()}" → "${replacement.trim()}"`);
  if (!CHECK_ONLY) {
    writeFileSync(path, raw.replace(pattern, replacement));
    fixes.push(label);
  }
}

// 1. package.json
syncJson(PKG, 'package.json');

// 2. AGENTS.md Project State line
const versionLineRe = /\*\*Current version:\*\*\s*[^\n]+/;
const versionLineNew = `**Current version:** ${truth}`;
syncMarkdownLine(AGENTS, 'AGENTS.md', versionLineRe, versionLineNew);

// 3. Vendor mirrors (CLAUDE.md / GEMINI.md / .gemini/agent.md)
for (const mirror of VENDOR_MIRRORS) {
  syncMarkdownLine(mirror, mirror.replace(ROOT + '\\', '').replace(ROOT + '/', ''), versionLineRe, versionLineNew);
}

// 4. Changelog presence check (warn only — never auto-edit user-authored history)
if (existsSync(CHANGELOG)) {
  const log = readFileSync(CHANGELOG, 'utf8');
  if (!log.includes(truth)) {
    console.warn(`⚠ Tabatha_Changelog.md has no heading mentioning ${truth}`);
  }
}

if (drift.length === 0) {
  console.log(`✓ All files in sync at v${truth}`);
  process.exit(0);
}

if (CHECK_ONLY) {
  console.error(`✘ Version drift detected (truth = manifest.json @ ${truth}):`);
  for (const d of drift) console.error(`   - ${d}`);
  console.error('Run: npm run version:sync');
  process.exit(1);
}

console.log(`✓ Synced ${fixes.length} file(s) to v${truth}:`);
for (const f of fixes) console.log(`   - ${f}`);
