#!/usr/bin/env node
/**
 * build-privacy.mjs — render `PRIVACY.md` to `site/privacy.html`.
 *
 * WHY THIS IS GENERATED, not hand-written.
 * `PRIVACY.md` is the source of truth for the policy and is what ships with
 * the extension. The teaser links /privacy from a page that collects email
 * addresses, so the published page and the repo's policy must be the same
 * document. A hand-maintained copy is a policy that silently drifts from the
 * one users are entitled to rely on, which is the single worst doc in this
 * repo to let rot. Generating it makes drift impossible.
 *
 * Cloudflare Pages serves `privacy.html` at the clean URL `/privacy`.
 *
 * This is a deliberately small renderer, NOT a general markdown engine: it
 * supports exactly the subset PRIVACY.md uses and throws on anything it does
 * not recognise, so an unhandled construct fails the build loudly rather than
 * publishing mangled legal text.
 *
 * Usage:  node scripts/build-privacy.mjs [--check]
 *   --check  exit 1 if the on-disk page differs from freshly generated output
 *            (for CI / prebuild), without writing.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'PRIVACY.md');
const OUT = join(root, 'site', 'privacy.html');
const CHECK = process.argv.includes('--check');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Inline spans: `**bold**`, `*italic*`, `` `code` ``, and autolinked emails.
 * Escaping happens FIRST and the markers are consumed from the escaped text,
 * so no source construct can inject markup into the output.
 */
function inline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // The policy lists a contact address as bare text; make it actionable.
  out = out.replace(
    /\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/gi,
    '<a href="mailto:$1">$1</a>',
  );
  return out;
}

const md = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

/**
 * Unfold soft-wrapped list items BEFORE any rendering.
 *
 * PRIVACY.md wraps at ~90 columns, so a single bullet routinely spans two
 * source lines and an inline span can straddle the break:
 *
 *     - **We store the address you type, and which page it came
 *       from.** That is the whole record.
 *
 * Rendering the halves separately leaves `**` unclosed on each, and the
 * markers survive into the published page as literal asterisks. Joining first
 * means inline() always sees a complete span. Found by the --check pass.
 */
const lines = [];
for (const raw of md.split('\n')) {
  const isCont =
    /^\s{2,}\S/.test(raw) &&
    lines.length &&
    /^[-*]\s+/.test(lines[lines.length - 1].trim());
  if (isCont) lines[lines.length - 1] += ' ' + raw.trim();
  else lines.push(raw);
}
const html = [];
let inList = false;
let para = [];

const flushPara = () => {
  if (para.length) {
    html.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  }
};
const closeList = () => {
  if (inList) {
    html.push('</ul>');
    inList = false;
  }
};

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  const line = raw.trimEnd();

  if (!line.trim()) { flushPara(); closeList(); continue; }

  if (/^#\s+/.test(line))      { flushPara(); closeList(); html.push(`<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`); continue; }
  if (/^##\s+/.test(line))     { flushPara(); closeList(); html.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`); continue; }
  if (/^---\s*$/.test(line))   { flushPara(); closeList(); html.push('<hr>'); continue; }
  if (/^[-*]\s+/.test(line)) {
    flushPara();
    if (!inList) { html.push('<ul>'); inList = true; }
    html.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
    continue;
  }
  if (/^\s*(#{3,})\s+/.test(line)) {
    throw new Error(`build-privacy: unsupported heading depth at line ${i + 1}: ${line}`);
  }
  if (/^\s*(>|\||```)/.test(line)) {
    throw new Error(`build-privacy: unsupported construct at line ${i + 1}: ${line}`);
  }

  // A paragraph continues across soft-wrapped source lines.
  if (inList) closeList();
  para.push(line.trim());
}
flushPara();
closeList();

const body = html.join('\n    ');

// Tokens mirror site/index.html so the policy is unmistakably the same site.
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy: Tabatha</title>
<meta name="description" content="What Tabatha collects, what it never collects, and where your data lives.">
<meta name="theme-color" content="#050505">
<meta name="robots" content="index, follow">
<!-- GENERATED FILE. Do not edit.
     Source: PRIVACY.md — run \`npm run site:privacy\` after changing it.
     Edits made here will be overwritten by the next build. -->
<style>
:root {
  --bg:#050505; --text:#F2F5F7; --muted:#9aa5b1; --dim:#4b5560;
  --border:rgba(255,255,255,.09); --cyan:#00F0FF;
  --sans:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,'Cascadia Code',Consolas,monospace;
  --r-sm:2px; --r-md:4px;
}
*,*::before,*::after { box-sizing:border-box; }
body {
  margin:0; background:var(--bg); color:var(--text);
  font-family:var(--sans); line-height:1.65;
  -webkit-font-smoothing:antialiased;
}
.wrap { max-width:760px; margin:0 auto; padding:0 24px 80px; }
.top {
  display:flex; align-items:center; justify-content:space-between;
  height:72px; gap:16px; margin-bottom:24px;
}
.brand {
  font:600 13px/1 var(--mono); letter-spacing:.42em; text-transform:uppercase;
  color:var(--text); text-decoration:none; white-space:nowrap;
}
.brand .dot { color:var(--cyan); }
.back { font:400 12px var(--sans); color:var(--muted); text-decoration:none; }
.back:hover { color:var(--text); }
main { border-top:1px solid var(--border); padding-top:40px; }
h1 {
  font:700 clamp(1.7rem,4vw,2.4rem)/1.15 var(--mono);
  letter-spacing:-.03em; margin:0 0 8px;
}
h2 {
  font:600 clamp(1.05rem,2vw,1.2rem)/1.35 var(--mono);
  letter-spacing:-.015em; margin:40px 0 12px; color:var(--text);
}
p { margin:0 0 16px; color:var(--muted); }
ul { margin:0 0 16px; padding-left:20px; color:var(--muted); }
li { margin-bottom:8px; }
strong { color:var(--text); font-weight:600; }
em { color:var(--text); font-style:italic; }
code {
  font:400 .88em var(--mono); background:rgba(255,255,255,.05);
  border:1px solid var(--border); border-radius:var(--r-sm); padding:1px 5px;
}
a { color:var(--cyan); text-decoration:none; border-bottom:1px solid rgba(0,240,255,.3); }
a:hover { border-bottom-color:var(--cyan); }
hr { border:0; border-top:1px solid var(--border); margin:36px 0 24px; }
hr + p { font-size:13px; color:var(--dim); }
:focus-visible { outline:2px solid var(--cyan); outline-offset:3px; border-radius:var(--r-sm); }
@media (max-width:560px) { .wrap { padding:0 18px 56px; } .top { height:64px; } }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="/">Tabatha<span class="dot">.</span></a>
    <a class="back" href="/">Back</a>
  </header>
  <main>
    ${body}
  </main>
</div>
</body>
</html>
`;

if (CHECK) {
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== page) {
    console.error('site/privacy.html is stale. Run: npm run site:privacy');
    process.exit(1);
  }
  console.log('site/privacy.html is up to date.');
} else {
  writeFileSync(OUT, page);
  console.log(`Wrote site/privacy.html from PRIVACY.md — ${html.length} blocks.`);
}
