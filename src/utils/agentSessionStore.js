// ============================================================
// Cortex C11a — pure agent-session span store (Plan 044 T2).
// A "controller span" marks a tab, window, or the whole machine as
// agent-driven for a time range. All three C11a UI surfaces (InPop,
// InBar, home/sidebar) read/write the same span list through the
// agentSessionService; this module owns the open/close/resolve logic
// with no chrome / DOM / supabase deps — unit-tested in isolation.
//
// Span shape:
//   { id, agentName, scope:'tab'|'window'|'machine', tabId?, windowId?,
//     supervising, source:'manual'|'announced',
//     startedAt, endedAt|null, autoExpiresAt|null }
// ============================================================

const DEFAULT_CAP = 200;

function genId(now) {
  const t = (now ?? Date.now()).toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `agsess_${t}_${r}`;
}

// A span is "open at `at`" if it has no explicit end and has not passed its
// optional auto-expiry.
function isOpenAt(span, at) {
  if (!span || span.endedAt) return false;
  if (span.autoExpiresAt && Date.parse(span.autoExpiresAt) <= at) return false;
  return true;
}

/**
 * Open a new agent-controller span (returns a new, FIFO-capped array).
 * @param {Array} sessions existing spans
 * @param {object} opts { scope, tabId, windowId, agentName, supervising,
 *                        source, autoExpiresAt, id, now, cap }
 */
export function openSession(sessions, opts = {}) {
  const list = Array.isArray(sessions) ? sessions.slice() : [];
  const now = opts.now ?? Date.now();
  const scope = opts.scope || 'machine';
  const span = {
    id: opts.id || genId(now),
    agentName: opts.agentName ?? null,
    scope,
    tabId: scope === 'tab' ? (opts.tabId ?? null) : null,
    windowId: scope === 'window' ? (opts.windowId ?? null) : null,
    supervising: !!opts.supervising,
    source: opts.source === 'announced' ? 'announced' : 'manual',
    startedAt: new Date(now).toISOString(),
    endedAt: null,
    autoExpiresAt: opts.autoExpiresAt ?? null
  };
  list.push(span);
  const cap = opts.cap ?? DEFAULT_CAP;
  return list.length > cap ? list.slice(-cap) : list;
}

/**
 * Close a span by id (idempotent — leaves already-closed / unknown spans as-is).
 */
export function closeSession(sessions, id, now) {
  const ts = new Date(now ?? Date.now()).toISOString();
  return (Array.isArray(sessions) ? sessions : []).map((s) =>
    s.id === id && !s.endedAt ? { ...s, endedAt: ts } : s
  );
}

/**
 * The single active span covering the given target, honouring scope priority
 * (a more specific scope wins): tab > window > machine. Among equal scopes the
 * most-recently-started open span wins. Returns null when nothing covers it.
 */
export function findActiveSession(sessions, { tabId = null, windowId = null, now } = {}) {
  const at = now ?? Date.now();
  const matches = (Array.isArray(sessions) ? sessions : []).filter((s) => {
    if (!isOpenAt(s, at)) return false;
    if (s.scope === 'tab') return tabId != null && s.tabId === tabId;
    if (s.scope === 'window') return windowId != null && s.windowId === windowId;
    if (s.scope === 'machine') return true;
    return false;
  });
  if (!matches.length) return null;
  const rank = { tab: 0, window: 1, machine: 2 };
  matches.sort((a, b) => {
    const r = (rank[a.scope] ?? 3) - (rank[b.scope] ?? 3);
    if (r !== 0) return r;
    return Date.parse(b.startedAt) - Date.parse(a.startedAt);
  });
  return matches[0];
}

/**
 * Boolean resolver: is any agent span currently driving this target?
 */
export function isAgentSpanActive(spans, { tabId = null, windowId = null, at } = {}) {
  return findActiveSession(spans, { tabId, windowId, now: at }) !== null;
}

/**
 * Close any spans that have passed their optional auto-expiry (returns a new
 * array; open spans without an expiry are untouched).
 */
export function pruneExpired(sessions, now) {
  const at = now ?? Date.now();
  return (Array.isArray(sessions) ? sessions : []).map((s) => {
    if (!s.endedAt && s.autoExpiresAt && Date.parse(s.autoExpiresAt) <= at) {
      return { ...s, endedAt: s.autoExpiresAt };
    }
    return s;
  });
}

/**
 * The subset of spans that are currently open (used by the home/sidebar
 * visibility surfaces and the InBar initial-state read).
 */
export function openSessions(sessions, now) {
  const at = now ?? Date.now();
  return (Array.isArray(sessions) ? sessions : []).filter((s) => isOpenAt(s, at));
}
