// ════════════════════════════════════════════
// Tabatha — Background Helpers
// Pure, stateless utilities extracted from background.js.
// ════════════════════════════════════════════

export function patternToRegex(pattern) {
  try {
    // Split on wildcards first, escape each segment, then rejoin with .*
    const parts = pattern.split('*');
    const escaped = parts.map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp('^' + escaped.join('.*') + '$');
  } catch {
    return null;
  }
}

export function detectCategory(url, audible, categories) {
  if (!url) return 'unknown';

  for (const [catId, cat] of Object.entries(categories)) {
    if (catId === 'unknown' || catId === 'work') continue;
    if (!cat.rules?.autoDetect) continue;

    for (const pattern of cat.urlPatterns || []) {
      const regex = patternToRegex(pattern);
      if (regex && regex.test(url)) return catId;
    }
  }

  // Fallback: if tab is audible and matches video URLs, classify as media
  if (audible && url.match(/youtube\.com\/watch/)) return 'media';

  return 'unknown';
}

export function getUrlBase(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
