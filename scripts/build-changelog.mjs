#!/usr/bin/env node
// ============================================================
// Tabatha — changelog builder (FIX-11 "What's New" layer).
// Parses Tabatha_Changelog.md (Keep-a-Changelog format) into a structured
// public/changelog.json that Vite copies into dist/. The newtab "What's New"
// modal and Settings → About changelog view both read that JSON.
//
// Usage:
//   node scripts/build-changelog.mjs           → (re)generate public/changelog.json
//   node scripts/build-changelog.mjs --check    → exit non-zero if the JSON is
//                                                 stale vs the MD (drift guard,
//                                                 wired into `prebuild`).
// ============================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

const SRC = resolve(ROOT, 'Tabatha_Changelog.md');
const OUT = resolve(ROOT, 'public/changelog.json');

// Release heading, e.g.
//   ## [v6.4.0] - Ghost-stint fix: durable install identity - _2026-06-04_
// The version keeps its raw form from the MD (may carry an `-alpha` suffix);
// title and date are optional so a bare `## [vX] - Title` still parses.
const HEADING_RE = /^##\s*\[v?([^\]]+)\]\s*(?:-\s*(.*?))?\s*(?:-\s*_([^_]+)_)?\s*$/;
// Section sub-heading, e.g. `### Added`, `### Fixed`, `### 🚀 Added — …`.
const SECTION_RE = /^###\s+(.*)$/;

// Normalise a `### 🚀 Added — Major features` heading down to a canonical
// bucket name where possible, but always keep the full label too so custom
// sections (Migration, Schema notes, etc.) survive.
function sectionLabel(raw) {
  return raw.trim();
}

export function parseChangelog(md) {
  const lines = md.split(/\r?\n/);
  const releases = [];
  let current = null;
  let section = null;

  const pushSectionBody = (text) => {
    if (!current) return;
    if (!section) {
      // Preamble text before any `###` — keep it as an intro blob.
      current.intro = (current.intro ? current.intro + '\n' : '') + text;
      return;
    }
    section.body.push(text);
  };

  for (const line of lines) {
    const heading = line.match(HEADING_RE);
    if (heading) {
      current = {
        version: heading[1].trim(),
        title: (heading[2] || '').trim(),
        date: (heading[3] || '').trim(),
        intro: '',
        sections: []
      };
      section = null;
      releases.push(current);
      continue;
    }

    if (!current) continue; // skip file-level preamble / title

    const sec = line.match(SECTION_RE);
    if (sec) {
      section = { label: sectionLabel(sec[1]), body: [] };
      current.sections.push(section);
      continue;
    }

    // Horizontal rules separate releases in the MD — ignore them.
    if (/^---\s*$/.test(line)) continue;

    // Preserve line content (including blanks) so multi-line list items and
    // code fences render faithfully; we trim trailing whitespace only.
    pushSectionBody(line.replace(/\s+$/, ''));
  }

  // Collapse each section body array into a single trimmed string, and drop
  // fully-empty sections.
  for (const r of releases) {
    r.intro = r.intro.trim();
    r.sections = r.sections
      .map((s) => ({ label: s.label, body: s.body.join('\n').trim() }))
      .filter((s) => s.body.length > 0);
  }

  return releases;
}

function build() {
  if (!existsSync(SRC)) {
    console.error(`✘ ${SRC} not found`);
    process.exit(2);
  }
  const md = readFileSync(SRC, 'utf8');
  const releases = parseChangelog(md);
  const payload = { generatedAt: null, releases };
  // Stable, deterministic serialisation (no timestamp) so the drift check is
  // purely content-driven — regenerating without an MD change is a no-op.
  return JSON.stringify(payload, null, 2) + '\n';
}

const next = build();

if (CHECK_ONLY) {
  const existing = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (existing !== next) {
    console.error('✘ public/changelog.json is stale vs Tabatha_Changelog.md');
    console.error('  Run: node scripts/build-changelog.mjs');
    process.exit(1);
  }
  console.log('✓ changelog.json is in sync with the changelog MD');
  process.exit(0);
}

writeFileSync(OUT, next);
const count = JSON.parse(next).releases.length;
console.log(`✓ Wrote public/changelog.json (${count} releases)`);
