// ============================================================
// Cortex C1/C2/C3 — pure capture-artifact helpers (Phase 1 T4).
// Redaction-rect math + partition-aware filename/path building.
// No chrome / DOM / supabase deps — unit-tested in isolation.
//
// The extension cannot write to arbitrary filesystem paths under MV3; frames
// are written via chrome.downloads relative to the user's Downloads folder.
// `captureStoragePath` is therefore a Downloads-relative root. The desktop
// companion is the future home of true arbitrary-path writes (C3).
// ============================================================

const DEFAULT_ROOT = 'Tabatha/Cortex/captures';
const DEFAULT_TITLE_SLUG_LEN = 40;

/**
 * Filesystem-safe slug of a tab/window title: lowercased, non-alphanumerics →
 * '-', collapsed dashes, trimmed, capped. Returns '' for empty/undefined so
 * callers can drop the segment entirely.
 */
export function slugifyTitle(title, maxLen = DEFAULT_TITLE_SLUG_LEN) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '');
}

/**
 * Convert C2 guard redaction rules into integer pixel rects for the canvas
 * pass that blacks/blurs regions BEFORE the frame is persisted.
 *
 * @param {Array} redactions [{ region: 'top'|'bottom'|'left'|'right'|'full', percent }]
 * @param {object} dims      { width, height } of the captured bitmap
 * @returns {Array<{x:number,y:number,w:number,h:number}>}
 */
export function computeRedactionRects(redactions, { width, height }) {
  const rects = [];
  for (const rule of redactions || []) {
    const pct = Math.min(100, Math.max(0, Number(rule?.percent) || 0));
    if (rule?.region === 'full') {
      rects.push({ x: 0, y: 0, w: width, h: height });
      continue;
    }
    if (pct === 0) continue;
    switch (rule?.region) {
      case 'bottom': {
        const h = Math.round((height * pct) / 100);
        rects.push({ x: 0, y: height - h, w: width, h });
        break;
      }
      case 'top':
        rects.push({ x: 0, y: 0, w: width, h: Math.round((height * pct) / 100) });
        break;
      case 'left':
        rects.push({ x: 0, y: 0, w: Math.round((width * pct) / 100), h: height });
        break;
      case 'right': {
        const w = Math.round((width * pct) / 100);
        rects.push({ x: width - w, y: 0, w, h: height });
        break;
      }
      default:
        break; // unknown region → ignore (fail open on geometry, not on privacy:
               // suppression already happened upstream if the rule demanded it)
    }
  }
  return rects;
}

/**
 * Filesystem-safe frame filename: ISO timestamp + surface + partition + an
 * optional tab-title slug, with an optional screen index so multi-monitor sets
 * share one timestamp (C1). The title slug (from rec.title) is dropped when
 * empty so context-only records stay compact.
 * e.g. 2026-07-10T03-12-45-123Z_browser_personal_github-pull-request_s2.jpg
 */
export function buildCaptureFilename(rec, { screenIndex, ext = 'jpg' } = {}) {
  const ts = String(rec?.ts || '').replace(/[:.]/g, '-');
  const surface = rec?.surface || 'unknown';
  const partition = rec?.partition || 'personal';
  const slug = slugifyTitle(rec?.title);
  const titlePart = slug ? `_${slug}` : '';
  const screen = screenIndex != null ? `_s${screenIndex}` : '';
  return `${ts}_${surface}_${partition}${titlePart}${screen}.${ext}`;
}

/**
 * Root-relative path for a frame: partition/YYYY-MM/filename. This is the path
 * the desktop companion (which owns the real base dir) and the OPFS fallback
 * tree use — NO Downloads root prefix. Personal and org frames live in disjoint
 * subtrees (C3 partition rule).
 */
export function buildCaptureRelPath(rec, filename) {
  const partition = rec?.partition || 'personal';
  const month = String(rec?.ts || '').slice(0, 7) || 'unknown';
  return `${partition}/${month}/${filename}`;
}

/**
 * Downloads-relative path for a frame: root/partition/YYYY-MM/filename.
 * Prepends the configured root to the root-relative path.
 */
export function buildCapturePath(root, rec, filename) {
  const cleanRoot = sanitizeRelPath(root) || DEFAULT_ROOT;
  return `${cleanRoot}/${buildCaptureRelPath(rec, filename)}`;
}

/** Normalize a user-configured relative path: forward slashes, no dupes/traversal. */
export function sanitizeRelPath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((seg) => seg.trim())
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
}
