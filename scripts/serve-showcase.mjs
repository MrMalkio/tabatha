#!/usr/bin/env node
/**
 * serve-showcase.mjs — serve `showcase/` over http for local development.
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'showcase');
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
  // Mirror the unconfigured Pages Function so the fallback can be tested.
  if (req.url.split('?')[0] === '/api/feedback') {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      return res.end('Method Not Allowed');
    }
    res.writeHead(501, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'not_configured',
      message: 'Local dev server: no backend. The client should fall back to GitHub.',
    }));
  }

  let pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname === '/') pathname = '/index.html';

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
  console.log(`showcase → http://localhost:${PORT}/`);
  console.log(`  roadmap → http://localhost:${PORT}/roadmap.html`);
  console.log('  /api/feedback stubbed at 501 (exercises the GitHub fallback)');
});
