#!/usr/bin/env node
// Build the Sidecar web bundle for Cloudflare:
//   1. expo export -p web  (assumes already run, or run with --export)
//   2. inject PWA <head> tags into dist/index.html (SPA output ignores +html.tsx)
//   3. mirror dist/ into deploy/public/sidecar/ (nested for the /sidecar base path)
// Then: cd deploy && npx wrangler deploy
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'deploy', 'public', 'sidecar');

if (process.argv.includes('--export')) {
  execSync('npx expo export -p web --clear', { cwd: root, stdio: 'inherit' });
  // --clear: the Metro cache lives in node_modules/.cache, which is SHARED
  // across worktrees via junctions -- a concurrent dev-server session can
  // poison it and yield a routeless 1.1MB skeleton bundle (2026-07-18
  // v0.6.1 incident: export "succeeded", metadata.fileMetadata empty).
  // Deploy builds must never trust that cache.
}

const HEAD = `
    <link rel="manifest" href="/sidecar/manifest.webmanifest"/>
    <meta name="theme-color" content="#0A0E14"/>
    <meta name="mobile-web-app-capable" content="yes"/>
    <meta name="apple-mobile-web-app-capable" content="yes"/>
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
    <meta name="apple-mobile-web-app-title" content="Tabby Sidecar"/>
    <link rel="apple-touch-icon" href="/sidecar/icons/icon-192.png"/>
  </head>`;

const indexPath = path.join(dist, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('manifest.webmanifest')) {
  html = html.replace('</head>', HEAD);
  fs.writeFileSync(indexPath, html);
  console.log('injected PWA head tags');
} else {
  console.log('PWA head tags already present');
}

fs.rmSync(path.join(root, 'deploy', 'public'), { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(dist, out, { recursive: true });
console.log('mirrored dist -> deploy/public/sidecar');
