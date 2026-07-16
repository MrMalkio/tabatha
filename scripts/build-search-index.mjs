#!/usr/bin/env node
/**
 * build-search-index.mjs — generate `site/show/search-index.json`.
 *
 * The showcase is a static site, so search is a client-side query over a
 * prebuilt index. This script is the single source of that index: it PARSES
 * the real page markup rather than keeping a hand-maintained list, so a card
 * renamed in HTML can never drift out of sync with what search returns.
 *
 * What it indexes, in one flat array of records:
 *   - `component` — every `.libcard[id]` on the 6 category pages. Name comes
 *     from `.libcap .t`, purpose from `.libcap .d`, source path from `.libcap
 *     .src`. The card's `id` doubles as its deep-link anchor and as the
 *     component id the feedback form reports against.
 *   - `section`   — every `<section id>`'s heading plus its purpose paragraph.
 *   - `surface`   — the 8 full-page frames, from the hub's shot cards
 *     (`data-k` keywords + caption).
 *   - `page`      — each page itself, from its `.phead`/hero copy.
 *   - `roadmap`   — every item in the curated roadmap.json.
 *
 * Usage:  node scripts/build-search-index.mjs [--check]
 *   --check  exit 1 if the on-disk index differs from freshly generated output
 *            (for CI / prebuild), without writing.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const showcase = join(root, 'site', 'show');
const OUT = join(showcase, 'search-index.json');
const CHECK = process.argv.includes('--check');

const CATEGORY_PAGES = [
  { file: 'components-overlays.html',   label: 'Overlays & Content Scripts', icon: '🪟' },
  { file: 'components-focus.html',      label: 'Focus & Time',               icon: '🎯' },
  { file: 'components-data.html',       label: 'Data & Analytics',           icon: '📈' },
  { file: 'components-org.html',        label: 'Org & Team',                 icon: '🏛️' },
  { file: 'components-settings.html',   label: 'Settings',                   icon: '⚙️' },
  { file: 'components-primitives.html', label: 'Primitives & Panels',        icon: '🧱' },
  // The other two products in the family. Same card contract, so they index
  // through the identical path — a search for "categorizer" should surface the
  // extension's, the companion's and the mobile one together.
  { file: 'components-companion.html',  label: 'Desktop Companion',          icon: '🖥️' },
  { file: 'components-mobile.html',     label: 'Mobile App',                 icon: '📱' },
];

/** Component-card total across every category page above. Update deliberately. */
const EXPECTED_CARDS = 120;

/** Named entities that appear in the showcase markup. */
const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  times: '×', hellip: '…', mdash: '—', ndash: '–', middot: '·',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', deg: '°', rarr: '→', larr: '←',
};

/**
 * Strip tags and decode entities down to readable plain text.
 * Entities must be decoded, not passed through: the index feeds both the
 * result list and the match haystack, so a stray `&mdash;` would render
 * literally AND make "gatekeeper agent" fail to match.
 */
function text(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const k = ENTITIES[name] ?? ENTITIES[name.toLowerCase()];
      return k === undefined ? m : k;
    })
    // &amp; last would double-decode; the map above already handled it in one pass.
    .replace(/\s+/g, ' ')
    .trim();
}

/** First capture group of `re` against `src`, as plain text, or ''. */
function grab(src, re) {
  const m = src.match(re);
  return m ? text(m[1]) : '';
}

/**
 * Status/CWS badges live INSIDE the `.t` caption so they sit on the same line
 * as the title. They are metadata, not part of the name: left in, they produced
 * records literally called "The Gatekeeper Store shot" and would now yield
 * "Dashboard In development". So strip them from the name and fold their text
 * into the keywords instead, where "in development" is genuinely worth matching.
 */
const BADGE_RE = /<span class="(?:statusflag|cwsflag|substatus)[^"]*">([\s\S]*?)<\/span>/g;
const stripBadges = (html) => String(html || '').replace(BADGE_RE, ' ');
const badgeText = (html) =>
  [...String(html || '').matchAll(BADGE_RE)].map((m) => text(m[1])).join(' ');

/**
 * Slice out each `.libcard` block. The cards are flat siblings inside
 * `.lib`, and every one carries an id, so we can split on the opening tag
 * and read up to the next card (or the end of the container).
 */
function libcards(html) {
  const out = [];
  const re = /<div class="libcard[^"]*"\s+id="([^"]+)"\s*>/g;
  let m;
  const starts = [];
  while ((m = re.exec(html))) starts.push({ id: m[1], at: m.index });
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].at : html.length;
    out.push({ id: s.id, block: html.slice(s.at, end) });
  });
  return out;
}

const records = [];
let cardCount = 0;

// ── components + per-page sections ───────────────────────────────────────────
for (const cat of CATEGORY_PAGES) {
  const path = join(showcase, cat.file);
  if (!existsSync(path)) {
    console.error(`  MISS ${cat.file} — skipped`);
    continue;
  }
  const html = readFileSync(path, 'utf8');

  // The page itself. The `<h1>` can carry a status badge (the companion and
  // mobile pages do), so it gets the same strip-to-name / fold-to-keywords
  // treatment as the cards rather than becoming "Mobile App In development".
  const h1 = (html.match(/<header class="phead">[\s\S]*?<h1>([\s\S]*?)<\/h1>/) || [])[1] || '';
  records.push({
    type: 'page',
    id: cat.file.replace(/\.html$/, ''),
    name: text(stripBadges(h1)) || cat.label,
    purpose: grab(html, /<header class="phead">[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/),
    icon: cat.icon,
    page: cat.file,
    url: cat.file,
    keywords: badgeText(h1),
  });

  // Section purpose copy (`.sec-purpose`, added by the site build).
  const secRe = /<section id="([^"]+)"[^>]*>[\s\S]*?<h2>([\s\S]*?)<\/h2>([\s\S]*?)(?=<div class="lib|<\/section>)/g;
  let sm;
  while ((sm = secRe.exec(html))) {
    const purpose = grab(sm[3], /<p class="sec-purpose">([\s\S]*?)<\/p>/);
    if (!purpose) continue;
    records.push({
      type: 'section', id: `${cat.file.replace(/\.html$/, '')}#${sm[1]}`,
      name: `${text(sm[2])} · ${cat.label}`, purpose, icon: cat.icon,
      page: cat.file, url: `${cat.file}#${sm[1]}`, keywords: '',
    });
  }

  // Every component card.
  for (const { id, block } of libcards(html)) {
    const name = grab(stripBadges(block), /<div class="t">([\s\S]*?)<\/div>/);
    if (!name) { console.error(`  WARN ${cat.file}#${id} — no .t caption`); continue; }
    records.push({
      type: 'component', id,
      name,
      purpose: grab(block, /<div class="d">([\s\S]*?)<\/div>/),
      src: grab(block, /<div class="src">([\s\S]*?)<\/div>/),
      icon: grab(block, /<span class="e">([\s\S]*?)<\/span>/) || cat.icon,
      page: cat.file,
      category: cat.label,
      url: `${cat.file}#${id}`,
      // Variant labels are strong search terms ("paused", "empty", "strict"),
      // and so is a status badge ("in development", "planned", "shipped").
      keywords: [
        ...[...block.matchAll(/<div class="vlabel">([\s\S]*?)<\/div>/g)].map((v) => text(v[1])),
        badgeText(block),
      ].filter(Boolean).join(' '),
    });
    cardCount++;
  }
}

// ── hub: surfaces + top-level sections ───────────────────────────────────────
const hubPath = join(showcase, 'index.html');
if (existsSync(hubPath)) {
  const hub = readFileSync(hubPath, 'utf8');

  const shotRe = /<a class="shotcard[^"]*" href="([^"]+)"[^>]*data-k="([^"]*)"[\s\S]*?<div class="t">([\s\S]*?)<\/div><div class="d">([\s\S]*?)<\/div>/g;
  let s;
  while ((s = shotRe.exec(hub))) {
    records.push({
      type: 'surface', id: s[1].replace(/\.html$/, ''),
      name: text(stripBadges(s[3])), purpose: text(s[4]), icon: '🖼️',
      page: 'index.html', url: s[1],
      keywords: [s[2], badgeText(s[3])].filter(Boolean).join(' '),
    });
  }

  // The family cards: the only route to the companion and mobile pages, so
  // they must be findable by product name rather than only by component.
  const famRe = /<a class="cat" href="([^"]+)" data-k="([^"]*)"[\s\S]*?<span class="e">([\s\S]*?)<\/span>\s*<div class="t">([\s\S]*?)<\/div>\s*<div class="d">([\s\S]*?)<\/div>/g;
  let f;
  while ((f = famRe.exec(hub.slice(hub.indexOf('id="famgrid"'), hub.indexOf('id="shotgrid"'))))) {
    records.push({
      type: 'page', id: `family-${f[1].replace(/\.html$|^#/, '')}`,
      name: text(stripBadges(f[4])), purpose: text(f[5]), icon: text(f[3]) || '🧩',
      page: 'index.html', url: f[1].startsWith('#') ? `index.html${f[1]}` : f[1],
      keywords: [f[2], badgeText(f[4]), 'product family'].filter(Boolean).join(' '),
    });
  }

  const hsecRe = /<section id="([^"]+)"[^>]*>[\s\S]*?<h2>([\s\S]*?)<\/h2>([\s\S]*?)(?=<div class="shots|<div class="cats|<\/section>)/g;
  let h;
  while ((h = hsecRe.exec(hub))) {
    const purpose = grab(h[3], /<p class="sec-purpose">([\s\S]*?)<\/p>/);
    if (!purpose) continue;
    records.push({
      type: 'section', id: `index#${h[1]}`, name: text(h[2]),
      purpose, icon: '🧭', page: 'index.html', url: `index.html#${h[1]}`, keywords: '',
    });
  }
}

// ── roadmap ──────────────────────────────────────────────────────────────────
const rmPath = join(showcase, 'roadmap.json');
if (existsSync(rmPath)) {
  const rm = JSON.parse(readFileSync(rmPath, 'utf8'));
  const stageLabel = Object.fromEntries((rm.stages || []).map((st) => [st.id, st.label]));
  for (const it of rm.items || []) {
    records.push({
      type: 'roadmap', id: `roadmap-${it.id}`, name: it.title, purpose: it.blurb,
      icon: (rm.stages.find((st) => st.id === it.stage) || {}).icon || '🗺️',
      page: 'roadmap.html', url: `roadmap.html#${it.id}`,
      keywords: [stageLabel[it.stage] || it.stage, it.version ? `v${it.version}` : '', 'roadmap']
        .filter(Boolean).join(' '),
    });
  }
}

const json = JSON.stringify(
  { generated: new Date().toISOString().slice(0, 10), count: records.length, records },
  null, 0,
) + '\n';

if (CHECK) {
  const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  // Ignore the `generated` date so a stale date alone is not a CI failure.
  const norm = (s) => s.replace(/"generated":"[^"]*",/, '');
  if (norm(cur) !== norm(json)) {
    console.error('search-index.json is stale. Run: npm run build:search-index');
    process.exit(1);
  }
  console.log(`search-index.json up to date (${records.length} records).`);
} else {
  writeFileSync(OUT, json);
  const byType = records.reduce((a, r) => ((a[r.type] = (a[r.type] || 0) + 1), a), {});
  console.log(`Wrote site/show/search-index.json — ${records.length} records ` +
    `(${Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(', ')}), ` +
    `${(json.length / 1024).toFixed(1)} kB`);
  if (cardCount !== EXPECTED_CARDS) {
    console.error(`  NOTE expected ${EXPECTED_CARDS} component cards, indexed ${cardCount}`);
  }
}
