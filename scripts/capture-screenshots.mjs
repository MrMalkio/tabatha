#!/usr/bin/env node
/**
 * Capture the five Chrome-Web-Store screenshots from the static showcase pages.
 *
 * Deterministic: each showcase shot page renders a `.shot` container of exactly
 * 1280x800 as the whole viewport, so a 1280x800 headless window screenshot is a
 * pixel-exact CWS asset. No live extension, no flakiness.
 *
 * Usage:  node scripts/capture-screenshots.mjs
 * Output: store-assets/screenshots/0N-<name>.png  (each validated 1280x800, non-blank)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const showcaseDir = join(root, 'showcase');
const outDir = join(root, 'store-assets', 'screenshots');
mkdirSync(outDir, { recursive: true });

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_PATH || '',
].filter(Boolean);
const chrome = CHROME_CANDIDATES.find(existsSync);
if (!chrome) {
  console.error('Chrome not found. Set CHROME_PATH env var.');
  process.exit(1);
}

const SHOTS = [
  { page: 'gatekeeper.html', out: '01-gatekeeper.png' },
  { page: 'sidebar.html',    out: '02-sidebar.png' },
  { page: 'home.html',       out: '03-home.png' },
  { page: 'settings.html',   out: '04-settings.png' },
  { page: 'backdating.html', out: '05-backdating.png' },
];

/** Read width/height from a PNG's IHDR chunk (bytes 16-24). */
function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const tmpProfile = join(root, '.cap-profile');
let failed = 0;

for (const { page, out } of SHOTS) {
  const src = join(showcaseDir, page);
  const dest = join(outDir, out);
  if (existsSync(dest)) rmSync(dest);
  const url = pathToFileURL(src).href;
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--force-device-scale-factor=1',
    `--user-data-dir=${tmpProfile}`,
    '--window-size=1280,800',
    '--virtual-time-budget=1200',
    `--screenshot=${dest}`,
    url,
  ];
  spawnSync(chrome, args, { stdio: 'ignore' });

  if (!existsSync(dest)) { console.error(`FAIL ${out}: no file produced`); failed++; continue; }
  const buf = readFileSync(dest);
  const size = pngSize(buf);
  const bytes = statSync(dest).size;
  const okDim = size && size.w === 1280 && size.h === 800;
  const okBlank = bytes > 8000; // a blank 1280x800 PNG is a few hundred bytes
  const status = okDim && okBlank ? 'OK  ' : 'BAD ';
  if (!(okDim && okBlank)) failed++;
  console.log(`${status}${out}  ${size ? size.w + 'x' + size.h : '??'}  ${(bytes / 1024).toFixed(0)}KB`);
}

try { rmSync(tmpProfile, { recursive: true, force: true }); } catch {}

if (failed) { console.error(`\n${failed} screenshot(s) failed validation.`); process.exit(1); }
console.log('\nAll 5 screenshots captured at exactly 1280x800.');
