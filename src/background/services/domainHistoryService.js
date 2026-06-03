// ════════════════════════════════════════════
// Tabatha — Domain History Service (Plan 038 Phase 1)
//
// Persistently remembers every domain (and its path variations) the user
// visits, independent of whether the tab is still open. This is the data
// backbone for URL Rules: users can build/dismiss/target rules for any domain
// they've ever seen, not just what's currently open.
//
// Storage key: `domainHistory` — { [domain]: DomainEntry }
//   DomainEntry = {
//     domain, firstSeen, lastSeen, visitCount,
//     paths: string[]  (capped),
//     observedIntents: string[] (capped),
//     status: 'active' | 'dismissed' | 'targeted'
//   }
// Capped at settings.domainHistoryMaxDomains (default 2000), LRU-evicted.
// ════════════════════════════════════════════

import { getStorage, setStorage, getSettings } from './storageService.js';

const KEY = 'domainHistory';
const MAX_PATHS = 50;
const MAX_INTENTS = 20;

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}
function pathOf(url) {
  try { return new URL(url).pathname || '/'; } catch { return null; }
}
function isInternal(url) {
  return !url || /^(chrome|chrome-extension|devtools|about|edge|view-source|file):/i.test(url);
}

// Upsert a single visit. Cheap; safe to call on every navigation. Dismissed
// domains still accrue visit counts so a later "target" decision has data.
export async function recordDomainVisit(url, intent) {
  const domain = domainOf(url);
  if (!domain || isInternal(url)) return;

  const { [KEY]: histRaw } = await getStorage(KEY);
  const hist = histRaw || {};
  const now = new Date().toISOString();
  const entry = hist[domain] || {
    domain, firstSeen: now, lastSeen: now, visitCount: 0,
    paths: [], observedIntents: [], status: 'active'
  };

  entry.lastSeen = now;
  entry.visitCount = (entry.visitCount || 0) + 1;

  const p = pathOf(url);
  if (p && !entry.paths.includes(p)) {
    entry.paths.push(p);
    if (entry.paths.length > MAX_PATHS) entry.paths = entry.paths.slice(-MAX_PATHS);
  }
  if (intent && !entry.observedIntents.includes(intent)) {
    entry.observedIntents.push(intent);
    if (entry.observedIntents.length > MAX_INTENTS) entry.observedIntents = entry.observedIntents.slice(-MAX_INTENTS);
  }

  hist[domain] = entry;

  // LRU cap.
  const settings = await getSettings();
  const max = settings.domainHistoryMaxDomains || 2000;
  const keys = Object.keys(hist);
  if (keys.length > max) {
    const sorted = keys
      .map(k => [k, new Date(hist[k].lastSeen || 0).getTime()])
      .sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < keys.length - max; i++) delete hist[sorted[i][0]];
  }

  await setStorage({ [KEY]: hist });
}

async function setDomainStatus(domain, status) {
  const { [KEY]: hist } = await getStorage(KEY);
  const h = hist || {};
  if (h[domain]) {
    h[domain].status = status;
    await setStorage({ [KEY]: h });
  }
  return { success: true, domain, status };
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_DOMAIN_HISTORY': {
      const { [KEY]: hist } = await getStorage(KEY);
      return { domains: Object.values(hist || {}) };
    }
    case 'DISMISS_DOMAIN':
      return setDomainStatus(message.domain, 'dismissed');
    case 'TARGET_DOMAIN':
      return setDomainStatus(message.domain, 'targeted');
    case 'RESTORE_DOMAIN':
      return setDomainStatus(message.domain, 'active');
    case 'REMOVE_DOMAIN': {
      const { [KEY]: hist } = await getStorage(KEY);
      const h = hist || {};
      delete h[message.domain];
      await setStorage({ [KEY]: h });
      return { success: true };
    }
    case 'CLEAR_DOMAIN_HISTORY':
      await setStorage({ [KEY]: {} });
      return { success: true };
    default:
      return undefined;
  }
}
