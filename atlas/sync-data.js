// Sync atlas-data.json into atlas.html (data + history blocks).
// Usage: node Caspera/anasa/atlas/sync-data.js
// Also maintains history/: a full snapshot per change, compacted into the TIME scrubber.
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const dataPath = path.join(dir, 'atlas-data.json');
// Instances scaffolded by init-instance.mjs use atlas.html; older/renamed ones use <name>-atlas.html.
// Resolve the same way update-instance.mjs does, so upgrading an instance can't orphan its sync.
const htmlPath = ['atlas.html', ...fs.readdirSync(dir).filter(f => f.endsWith('-atlas.html'))]
  .map(f => path.join(dir, f)).find(p => fs.existsSync(p));
if (!htmlPath) { console.error('no atlas html found in ' + dir); process.exit(1); }
const histDir = path.join(dir, 'history');

const raw = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(raw); // throws on invalid JSON — fix before syncing
data.updated = new Date().toISOString(); // stamp every sync — shown in the STATE panel

const ids = new Set(data.nodes.map(n => n.id));
const dangling = (data.edges || []).filter(e => !ids.has(e.from) || !ids.has(e.to));
if (dangling.length) {
  console.error('DANGLING EDGES (fix these — the engine would silently drop them):');
  dangling.forEach(e => console.error(`  ${e.from} -> ${e.to} (${e.kind})`));
  process.exit(1);
}
const orphanMembers = (data.clusters || []).flatMap(c => c.members.filter(m => !ids.has(m)));
if (orphanMembers.length) console.warn('WARN cluster members with no node:', orphanMembers.join(', '));

// ── link hygiene: a tracker permalink is not a label. The dossier renders the LABEL, so an
// unnamed Asana/GitHub link costs the reader the one thing they wanted — what it actually is.
const asList = v => (Array.isArray(v) ? v : v ? [v] : []);
const unlabeled = [];
for (const n of data.nodes) {
  for (const kind of ['asana', 'gh']) {
    for (const v of asList((n.links || {})[kind])) {
      if (typeof v === 'string' || !(v.label || v.title || v.name)) unlabeled.push(`${n.id} .links.${kind}`);
    }
  }
}
if (unlabeled.length) {
  console.warn(`WARN ${unlabeled.length} unlabeled tracker link(s) — give each a {url,label} with the item's real title:`);
  unlabeled.slice(0, 20).forEach(s => console.warn('  ' + s));
  if (unlabeled.length > 20) console.warn(`  ...and ${unlabeled.length - 20} more`);
}

// ── comment coverage: `comments` drives RECENCY, the activity arc, and the pulse rating. A node
// backed by a tracker item but carrying no count is silently scored as if nobody ever discussed it.
// An authored `comments: 0` is a FINDING, not a gap — plenty of real tracker items have never
// been discussed, and a repo that journals in PR descriptions legitimately has zero comments on
// most PRs. Only a missing field is unknown, so only a missing field warns.
const tracked = data.nodes.filter(n => asList((n.links || {}).asana).length || asList((n.links || {}).gh).length);
const noComments = tracked.filter(n => n.comments === undefined || n.comments === null);
if (noComments.length) {
  console.warn(`WARN ${noComments.length}/${tracked.length} tracker-backed node(s) have no "comments" count — RECENCY, the activity arc and pulse read them as silent:`);
  console.warn('  ' + noComments.slice(0, 20).map(n => n.id).join(', ') + (noComments.length > 20 ? `, ...+${noComments.length - 20}` : ''));
}

// ── history: snapshot the current data if its status-map differs from the newest snapshot
if (!fs.existsSync(histDir)) fs.mkdirSync(histDir);
const statusMap = d => Object.fromEntries(d.nodes.map(n => [n.id, n.status]));
// Order by the recorded `ts`, not by filename — legacy snapshots use a different naming scheme
// and a filename sort can put an old one last, which makes every sync look like a status change
// and fossilizes a new snapshot on every run.
const readSnap = f => { try { return JSON.parse(fs.readFileSync(path.join(histDir, f), 'utf8')); } catch { return null; } };
const snapTime = s => (s && Date.parse(s.ts)) || 0;
const histFiles = fs.readdirSync(histDir).filter(f => f.startsWith('atlas-') && f.endsWith('.json')).sort();
const newest = histFiles.map(readSnap).filter(Boolean).sort((a, b) => snapTime(a) - snapTime(b)).pop() || null;
const changed = !newest || JSON.stringify(statusMap(newest.data || newest)) !== JSON.stringify(statusMap(data));
if (changed) {
  const ts = new Date().toISOString().replace(/[:]/g, '').slice(0, 15); // YYYYMMDDTHHMMSS-ish
  fs.writeFileSync(path.join(histDir, `atlas-${ts}.json`), JSON.stringify({ ts: new Date().toISOString(), label: data.version || '', data }, null, 1));
}

// compact history for the TIME scrubber: every snapshot EXCEPT the one identical to current
const allFiles = fs.readdirSync(histDir).filter(f => f.startsWith('atlas-') && f.endsWith('.json')).sort();
const compact = [];
for (const f of allFiles) {
  const snap = JSON.parse(fs.readFileSync(path.join(histDir, f), 'utf8'));
  const d = snap.data || snap;
  const s = statusMap(d);
  if (JSON.stringify(s) === JSON.stringify(statusMap(data))) continue; // that's NOW
  compact.push({ ts: snap.ts || f.replace(/^atlas-|\.json$/g, ''), label: snap.label || '', s });
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 1)); // persist the stamp
let html = fs.readFileSync(htmlPath, 'utf8');
const reData = /(<script id="atlas-data" type="application\/json">)[\s\S]*?(<\/script>)/;
const reHist = /(<script id="atlas-history" type="application\/json">)[\s\S]*?(<\/script>)/;
if (!reData.test(html)) { console.error('atlas-data block not found in HTML'); process.exit(1); }
// Replace with a FUNCTION, never a template string. In a string replacement, `$` followed by a
// digit is a capture-group reference — so real data like "$497" or "$1,500" expands to the
// surrounding <script> tags and structurally corrupts the document. A function replacement is
// taken literally, so the payload is never re-scanned.
const inject = (open, close, payload) => `${open}\n${JSON.stringify(payload)}\n${close}`;
html = html.replace(reData, (_m, open, close) => inject(open, close, data));
if (reHist.test(html)) html = html.replace(reHist, (_m, open, close) => inject(open, close, compact));
fs.writeFileSync(htmlPath, html);
console.log(`synced: ${data.nodes.length} nodes, ${(data.edges || []).length} edges, ${(data.clusters || []).length} clusters, ${compact.length} history snapshot(s)${changed ? ' (+1 new snapshot)' : ''}`);
