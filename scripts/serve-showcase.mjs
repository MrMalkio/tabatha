#!/usr/bin/env node
/**
 * serve-showcase.mjs — serve `site/` over http for local development.
 *
 * The site is static and Cloudflare Pages serves it directly, but two features
 * need a real origin and will not work from a `file://` page: the search index
 * fetch and the roadmap board fetch. This is the smallest thing that makes
 * them work locally. Zero dependencies, no framework.
 *
 * It also stubs `POST /api/feedback` with a 501, which is exactly what the
 * deployed Pages Function returns before `ASANA_TOKEN` is configured, so the
 * GitHub-issue fallback path can be exercised locally.
 *
 * Usage:  npm run site:serve  [-- --port 8788]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serve the whole deploy root, not just the showcase: `/` is the teaser and
// `/show/` is the showcase, exactly as Pages serves them in production.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const argPort = process.argv.indexOf('--port');
const PORT = argPort !== -1 ? Number(process.argv[argPort + 1]) : 8788;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  // Mirror the unconfigured Pages Functions so both fallback paths can be
  // tested locally: feedback degrades to the GitHub issue, waitlist degrades
  // to its "not open yet" message.
  const route = req.url.split('?')[0];
  if (route === '/api/feedback' || route === '/api/waitlist') {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      return res.end('Method Not Allowed');
    }
    res.writeHead(501, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'not_configured',
      message: 'Local dev server: no backend. The client should fall back.',
    }));
  }

  let pathname = decodeURIComponent(route);
  // Pages resolves a directory request to its index.html. Do the same, or
  // `/show/` would 404 locally while working in production.
  if (pathname.endsWith('/')) pathname += 'index.html';
  // Pages also serves `foo.html` at the clean URL `/foo`. The teaser links
  // /privacy, so without this the footer 404s locally but works deployed,
  // which is the worst way round to find out.
  else if (!extname(pathname)) {
    try {
      const cand = join(root, normalize(pathname).replace(/^([/\\])+/, '') + '.html');
      if (cand.startsWith(root) && (await stat(cand)).isFile()) pathname += '.html';
    } catch { /* no such page; fall through to the normal 404 */ }
  }

  // Contain to root: reject any path that escapes after normalisation.
  const rel = normalize(pathname).replace(/^([/\\])+/, '');
  const file = join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const st = await stat(file);
    if (st.isDirectory()) throw new Error('dir');
    const buf = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found: ' + rel);
  }
});

server.listen(PORT, () => {
  console.log(`site     → http://localhost:${PORT}/`);
  console.log(`  showcase → http://localhost:${PORT}/show/`);
  console.log(`  roadmap  → http://localhost:${PORT}/show/roadmap.html`);
  console.log('  /api/feedback + /api/waitlist stubbed at 501 (exercises the fallbacks)');
});
