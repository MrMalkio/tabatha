// NB-08 — Settings fuzzy search tests.
// 1) Pure matcher tests (fuzzyMatch/fuzzyScore extracted from CommandPalette,
//    plus token-AND scoring for multi-word queries).
// 2) Index-integrity test: every data-search-id literal in
//    src/settings/**/*.jsx has a SETTINGS_SEARCH_INDEX entry, and vice versa.
// Run: node --test test/settingsSearch.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fuzzyMatch,
  fuzzyScore,
  tokenize,
  tokenAndMatch,
  tokenAndScore,
  scoreIndexEntry,
  searchSettings,
  sectionLabelFor,
  SETTINGS_SEARCH_INDEX,
} from '../src/utils/settingsSearch.js';

// ── fuzzyMatch (behavior must match the old CommandPalette inline version) ──
test('fuzzyMatch: empty query matches anything', () => {
  assert.equal(fuzzyMatch('Break reminder', ''), true);
});

test('fuzzyMatch: case-insensitive substring', () => {
  assert.equal(fuzzyMatch('Break reminder (min)', 'REMIND'), true);
});

test('fuzzyMatch: in-order subsequence matches', () => {
  // b..k..r..d..r appear in order in "Break reminder"
  assert.equal(fuzzyMatch('Break reminder', 'bkrdr'), true);
});

test('fuzzyMatch: out-of-order characters do not match', () => {
  assert.equal(fuzzyMatch('abc', 'cba'), false);
});

test('fuzzyMatch: query longer than any subsequence fails', () => {
  assert.equal(fuzzyMatch('sync', 'syncing'), false);
});

// ── fuzzyScore ──
test('fuzzyScore: exact > prefix > substring > subsequence', () => {
  assert.equal(fuzzyScore('theme', 'theme'), 100);
  assert.equal(fuzzyScore('theme picker', 'theme'), 90);
  assert.equal(fuzzyScore('dark theme', 'theme'), 70);
  assert.equal(fuzzyScore('the me', 'theme'), 30); // subsequence only
});

test('fuzzyScore: empty query scores 0', () => {
  assert.equal(fuzzyScore('anything', ''), 0);
});

// ── tokenize ──
test('tokenize: splits on whitespace and drops empties', () => {
  assert.deepEqual(tokenize('  desktop   retention '), ['desktop', 'retention']);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
});

// ── token-AND matching ──
test('tokenAndMatch: all tokens must match (AND)', () => {
  assert.equal(tokenAndMatch('Desktop data retention (days)', 'desktop retention'), true);
  assert.equal(tokenAndMatch('Desktop data retention (days)', 'retention desktop'), true); // order-free
  assert.equal(tokenAndMatch('Desktop data retention (days)', 'desktop webhook'), false); // one miss kills it
});

test('tokenAndMatch: single token behaves like fuzzyMatch', () => {
  assert.equal(tokenAndMatch('Break reminder', 'reminder'), fuzzyMatch('Break reminder', 'reminder'));
});

test('tokenAndScore: zero when any token misses, mean of per-token scores otherwise', () => {
  assert.equal(tokenAndScore('Desktop data retention', 'desktop nomatchxyz'), 0);
  const s = tokenAndScore('Desktop data retention', 'desktop retention');
  // 'desktop' is a prefix (90), 'retention' a substring (70) → mean 80
  assert.equal(s, 80);
});

// ── entry scoring (token-AND across entry, token-OR across haystacks) ──
test('scoreIndexEntry: tokens can match across label and keywords', () => {
  const entry = { id: 'x', section: 's', label: 'Break reminder (min)', keywords: ['notification', 'rest'] };
  assert.ok(scoreIndexEntry(entry, 'break notification') > 0);
});

test('scoreIndexEntry: AND semantics — one unmatched token zeroes the entry', () => {
  const entry = { id: 'x', section: 's', label: 'Break reminder (min)', keywords: ['notification'] };
  assert.equal(scoreIndexEntry(entry, 'break zzzqqq'), 0);
});

// ── searchSettings ranking ──
test('searchSettings: empty/blank query returns []', () => {
  assert.deepEqual(searchSettings(''), []);
  assert.deepEqual(searchSettings('   '), []);
});

test('searchSettings: finds the invite token entry via "invite" synonym', () => {
  const results = searchSettings('invite');
  assert.ok(results.some(r => r.id === 'sync-invite-token'));
});

test('searchSettings: finds the invite token entry via "token" synonym', () => {
  const results = searchSettings('token');
  assert.ok(results.some(r => r.id === 'sync-invite-token'));
});

test('searchSettings: "tracking" surfaces Time Tracking entries', () => {
  const results = searchSettings('tracking');
  assert.ok(results.some(r => r.section === 'time'));
});

test('searchSettings: multi-word "break reminder" ranks the work-clock row first', () => {
  const results = searchSettings('break reminder');
  assert.ok(results.length > 0);
  assert.equal(results[0].id, 'workclock-break-reminder');
});

test('searchSettings: respects limit and returns entries, not scores', () => {
  const results = searchSettings('e', SETTINGS_SEARCH_INDEX, 5);
  assert.ok(results.length <= 5);
  for (const r of results) {
    assert.ok(typeof r.id === 'string' && typeof r.section === 'string');
  }
});

test('sectionLabelFor: resolves labels from section entries', () => {
  assert.equal(sectionLabelFor('sync'), 'Sync & Account');
  assert.equal(sectionLabelFor('nope-not-real'), 'nope-not-real');
});

// ── Index shape ──
test('index: ids are unique and every entry has id/section/label/keywords', () => {
  const seen = new Set();
  for (const e of SETTINGS_SEARCH_INDEX) {
    assert.ok(e.id && !seen.has(e.id), `duplicate or missing id: ${e.id}`);
    seen.add(e.id);
    assert.ok(typeof e.section === 'string' && e.section.length > 0, `${e.id}: missing section`);
    assert.ok(typeof e.label === 'string' && e.label.length > 0, `${e.id}: missing label`);
    assert.ok(Array.isArray(e.keywords), `${e.id}: keywords must be an array`);
  }
});

// ── Index integrity vs data-search-id anchors ──────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_DIR = path.join(__dirname, '..', 'src', 'settings');

function collectJsxFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...collectJsxFiles(full));
    else if (name.endsWith('.jsx')) out.push(full);
  }
  return out;
}

function collectAnchorIds() {
  // Tolerates both attribute forms:
  //   data-search-id="x"      and      data-search-id={'x'} / data-search-id={"x"}
  const re = /data-search-id=(?:"([^"]+)"|\{\s*'([^']+)'\s*\}|\{\s*"([^"]+)"\s*\})/g;
  const ids = new Set();
  for (const file of collectJsxFiles(SETTINGS_DIR)) {
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(src)) !== null) {
      const id = m[1] || m[2] || m[3];
      // Skip template interpolations (e.g. querySelector(`[data-search-id="${entry.id}"]`))
      if (id.includes('${')) continue;
      ids.add(id);
    }
  }
  return ids;
}

test('index integrity: every data-search-id anchor has an index entry', () => {
  const anchors = collectAnchorIds();
  const indexIds = new Set(SETTINGS_SEARCH_INDEX.map(e => e.id));
  const orphanAnchors = [...anchors].filter(id => !indexIds.has(id));
  assert.deepEqual(orphanAnchors, [], `anchors missing from SETTINGS_SEARCH_INDEX: ${orphanAnchors.join(', ')}`);
});

test('index integrity: every index entry has a data-search-id anchor', () => {
  const anchors = collectAnchorIds();
  const orphanEntries = SETTINGS_SEARCH_INDEX.map(e => e.id).filter(id => !anchors.has(id));
  assert.deepEqual(orphanEntries, [], `index entries with no anchor in src/settings/**/*.jsx: ${orphanEntries.join(', ')}`);
});

test('index integrity: anchors were found at all (regex sanity check)', () => {
  const anchors = collectAnchorIds();
  assert.ok(anchors.size >= 22, `expected at least one anchor per section, found ${anchors.size}`);
});
