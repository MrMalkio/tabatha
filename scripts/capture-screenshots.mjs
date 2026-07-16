#!/usr/bin/env node
/**
 * Capture every showcase asset from the static display pages.
 *
 * Two tiers:
 *
 *  1. SHOT FRAMES — each showcase shot page renders a `.shot` container of
 *     exactly 1280x800 as the whole viewport, so a 1280x800 headless window
 *     screenshot is a pixel-exact asset. The first five are the Chrome Web
 *     Store screenshots and their names + dimensions are CONTRACTUAL: the
 *     store listing points at `01-gatekeeper.png` … `05-backdating.png`, each
 *     exactly 1280x800. Do not rename or resize them.
 *
 *  2. COMPONENT CARDS — every `.libcard` on the category pages, captured at
 *     its natural size via CDP `Page.captureScreenshot` with a clip rect.
 *     Names are kebab-case, derived from each card's `id`.
 *
 * Deterministic: the pages are static, so capture needs no live extension.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs            → everything
 *   node scripts/capture-screenshots.mjs --shots    → shot frames only
 *   node scripts/capture-screenshots.mjs --cards    → component cards only
 * Output:
 *   store-assets/screenshots/0N-<name>.png          (validated 1280x800)
 *   store-assets/screenshots/components/<page>--<card>.png
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const showcaseDir = join(root, 'showcase');
const outDir = join(root, 'store-assets', 'screenshots');
const cardDir = join(outDir, 'components');

const ONLY_SHOTS = process.argv.includes('--shots');
const ONLY_CARDS = process.argv.includes('--cards');
const doShots = !ONLY_CARDS;
const doCards = !ONLY_SHOTS;

mkdirSync(outDir, { recursive: true });
if (doCards) mkdirSync(cardDir, { recursive: true });

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

/**
 * The five CWS shots. `cws: true` marks the filenames the published store
 * listing links — never rename these, and never let them drift off 1280x800.
 */
const SHOTS = [
  { page: 'gatekeeper.html',        out: '01-gatekeeper.png', cws: true },
  { page: 'sidebar.html',           out: '02-sidebar.png',    cws: true },
  { page: 'home.html',              out: '03-home.png',       cws: true },
  { page: 'settings.html',          out: '04-settings.png',   cws: true },
  { page: 'backdating.html',        out: '05-backdating.png', cws: true },
  // Additional surfaces — same exact frame, not part of the store listing.
  { page: 'popup.html',             out: '06-popup.png' },
  { page: 'workshifts.html',        out: '07-workshifts.png' },
  { page: 'settings-sections.html', out: '08-settings-sections.png' },
];

/** Category pages whose `.libcard`s are captured individually. */
const CARD_PAGES = [
  'components-overlays.html',
  'components-focus.html',
  'components-data.html',
  'components-org.html',
  'components-settings.html',
  'components-primitives.html',
];

/** Read width/height from a PNG's IHDR chunk (bytes 16-24). */
function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const tmpProfile = join(root, '.cap-profile');
/** Card-capture window height. Clips use `captureBeyondViewport`, so this is
 *  only the launch size, not a cap on how tall a card may be. */
const VIEW_H = 1400;
let failed = 0;
let captured = 0;

// ── Tier 1: full 1280x800 shot frames ────────────────────────────────────────
if (doShots) {
  console.log('Shot frames (1280x800)');
  for (const { page, out, cws } of SHOTS) {
    const src = join(showcaseDir, page);
    if (!existsSync(src)) { console.error(`  FAIL ${out}: ${page} missing`); failed++; continue; }
    const dest = join(outDir, out);
    if (existsSync(dest)) rmSync(dest);
    const args = [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--no-default-browser-check', '--force-device-scale-factor=1',
      `--user-data-dir=${tmpProfile}`,
      '--window-size=1280,800',
      '--virtual-time-budget=1500',
      `--screenshot=${dest}`,
      pathToFileURL(src).href,
    ];
    spawnSync(chrome, args, { stdio: 'ignore' });

    if (!existsSync(dest)) { console.error(`  FAIL ${out}: no file produced`); failed++; continue; }
    const buf = readFileSync(dest);
    const size = pngSize(buf);
    const bytes = statSync(dest).size;
    const okDim = size && size.w === 1280 && size.h === 800;
    const okBlank = bytes > 8000; // a blank 1280x800 PNG is a few hundred bytes
    const ok = okDim && okBlank;
    if (!ok) failed++; else captured++;
    console.log(`  ${ok ? 'OK  ' : 'BAD '}${out.padEnd(26)} ${size ? size.w + 'x' + size.h : '??'}  ${(bytes / 1024).toFixed(0)}KB${cws ? '  [CWS]' : ''}`);
  }
}

// ── Tier 2: per-card captures via CDP ────────────────────────────────────────

/** Minimal CDP client over the DevTools WebSocket (no deps). */
async function withCdp(fn) {
  // Let Chrome pick a free port and report it back via DevToolsActivePort.
  // A fixed port is a trap: an orphaned headless Chrome (e.g. from an
  // interrupted run) still holding it means we silently attach to the WRONG
  // browser, and every navigate/screenshot then targets a stale page.
  const profile = `${tmpProfile}-cdp`;
  rmSync(profile, { recursive: true, force: true });
  const portFile = join(profile, 'DevToolsActivePort');

  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    `--window-size=1280,${VIEW_H}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let port = null;
  for (let i = 0; i < 80; i++) {
    if (existsSync(portFile)) {
      const first = readFileSync(portFile, 'utf8').split('\n')[0].trim();
      if (first) { port = Number(first); break; }
    }
    await new Promise(r => setTimeout(r, 250));
  }
  if (!port) { proc.kill(); throw new Error('Chrome never reported a DevTools port'); }

  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      wsUrl = (await res.json()).webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  if (!wsUrl) { proc.kill(); throw new Error('CDP endpoint never came up'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = () => err(new Error('CDP socket failed')); });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, err } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? err(new Error(msg.error.message)) : ok(msg.result);
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, err) => {
      const mid = ++id;
      pending.set(mid, { ok, err });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });

  // Attach to the page target.
  const { targetInfos } = await send('Target.getTargets');
  const pageTarget = targetInfos.find(t => t.type === 'page');
  const { sessionId } = await send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);
  await call('Page.enable');
  await call('Runtime.enable');

  try {
    await fn(call);
  } finally {
    try { ws.close(); } catch {}
    proc.kill();
  }
}

if (doCards) {
  console.log('\nComponent cards (natural size)');
  try {
    await withCdp(async (call) => {
      for (const page of CARD_PAGES) {
        const src = join(showcaseDir, page);
        if (!existsSync(src)) { console.error(`  FAIL ${page}: missing`); failed++; continue; }
        const slug = page.replace(/^components-/, '').replace(/\.html$/, '');

        await call('Page.navigate', { url: pathToFileURL(src).href });
        await new Promise(r => setTimeout(r, 900)); // let layout + fonts settle

        // Clip rects are CSS pixels; the PNG comes back in device pixels. On a
        // scaled display that makes the output a crisp DPR multiple of the card
        // (e.g. 540px CSS -> 867px at 1.6x), which is fine for a gallery asset,
        // but validation has to expect it rather than call it a bad capture.
        const { result: dprRes } = await call('Runtime.evaluate', {
          expression: 'window.devicePixelRatio', returnByValue: true,
        });
        const dpr = dprRes.value || 1;

        const { result } = await call('Runtime.evaluate', {
          expression: `JSON.stringify(
            Array.from(document.querySelectorAll('.libcard')).map(function (el) {
              var r = el.getBoundingClientRect();
              return {
                id: el.id || '',
                y: r.y + window.scrollY,
                x: r.x, w: r.width, h: r.height
              };
            })
          )`,
          returnByValue: true,
        });
        const cards = JSON.parse(result.value);
        if (!cards.length) { console.error(`  FAIL ${page}: no .libcard found`); failed++; continue; }

        let pageBad = 0;
        for (const c of cards) {
          const name = c.id || 'card';
          const out = `${slug}--${name}.png`;
          const dest = join(cardDir, out);
          if (c.w < 40 || c.h < 40) {
            console.error(`  BAD  ${out}: degenerate ${Math.round(c.w)}x${Math.round(c.h)}`);
            failed++; pageBad++; continue;
          }

          // `captureBeyondViewport` clips in DOCUMENT space, so no scrolling is
          // involved and there is no compositor race to lose. Scroll-then-clip
          // looks cheaper but is flaky: it intermittently captured blank cards
          // (a different subset each run) because the clip can beat the paint.
          const shot = await call('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
            clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 },
          });
          writeFileSync(dest, Buffer.from(shot.data, 'base64'));

          const buf = readFileSync(dest);
          const size = pngSize(buf);
          const bytes = statSync(dest).size;
          // Cards vary in size; validate the clip landed square on the card
          // (allowing for the device-pixel-ratio multiple) and is not blank.
          const okDim = size && size.w >= 40 && size.h >= 40
            && Math.abs(size.w - Math.round(c.w * dpr)) <= 2
            && Math.abs(size.h - Math.round(c.h * dpr)) <= 2;
          const okBlank = bytes > 1200;
          const ok = okDim && okBlank;
          if (!ok) {
            console.log(`  BAD  ${out.padEnd(44)} ${size ? size.w + 'x' + size.h : '??'}  ${(bytes / 1024).toFixed(0)}KB`);
            failed++; pageBad++;
          } else {
            captured++;
          }
        }
        if (!pageBad) console.log(`  OK   ${page.padEnd(30)} ${String(cards.length).padStart(2)} cards`);
      }
    });
  } catch (e) {
    console.error(`  FAIL card capture: ${e.message}`);
    failed++;
  }
}

for (const dir of [tmpProfile, `${tmpProfile}-cdp`]) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

console.log(`\n${captured} asset(s) captured.`);
if (failed) { console.error(`${failed} capture(s) failed validation.`); process.exit(1); }
console.log('All captures passed validation (CWS shots pinned at exactly 1280x800).');
