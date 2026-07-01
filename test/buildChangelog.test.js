// FIX-11 — changelog parser (scripts/build-changelog.mjs).
// Guards the Keep-a-Changelog → structured JSON transform the build depends on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChangelog } from '../scripts/build-changelog.mjs';

const SAMPLE = `# Tabatha Changelog

Some preamble that must be ignored.

---

## [v6.5.0] - Fancy release - _2026-07-01_

### Added

- **Thing one**: does stuff.
- Plain bullet.

### Fixed

- Fixed \`someBug\`.

---

## [v6.4.0] - Older release - _2026-06-04_

Intro paragraph for this release.

### Changed

- Changed a thing.
`;

test('parses release headings: version, title, date', () => {
  const releases = parseChangelog(SAMPLE);
  assert.equal(releases.length, 2);
  assert.equal(releases[0].version, '6.5.0');
  assert.equal(releases[0].title, 'Fancy release');
  assert.equal(releases[0].date, '2026-07-01');
});

test('groups list items under their sections', () => {
  const [r0] = parseChangelog(SAMPLE);
  const added = r0.sections.find((s) => s.label === 'Added');
  assert.ok(added, 'Added section present');
  assert.match(added.body, /\*\*Thing one\*\*/);
  assert.match(added.body, /Plain bullet/);
  const fixed = r0.sections.find((s) => s.label === 'Fixed');
  assert.match(fixed.body, /someBug/);
});

test('captures a release intro paragraph before the first section', () => {
  const releases = parseChangelog(SAMPLE);
  const r1 = releases[1];
  assert.equal(r1.version, '6.4.0');
  assert.match(r1.intro, /Intro paragraph/);
});

test('drops file-level preamble and horizontal rules', () => {
  const releases = parseChangelog(SAMPLE);
  // Preamble ("Some preamble…") lives before any heading → not attached to any release.
  for (const r of releases) {
    assert.doesNotMatch(r.intro || '', /Some preamble/);
    assert.doesNotMatch(JSON.stringify(r.sections), /^---$/m);
  }
});

test('handles the real changelog without throwing and finds the current version', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const md = readFileSync(resolve(root, 'Tabatha_Changelog.md'), 'utf8');
  const releases = parseChangelog(md);
  assert.ok(releases.length > 5, 'parses many releases');
  assert.ok(releases.every((r) => r.version), 'every release has a version');
  assert.ok(releases.some((r) => r.version === '6.4.0'), 'includes v6.4.0');
});
