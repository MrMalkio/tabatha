// ============================================================
// Pure helpers for Cortex C10 — Passive Self-Correction (Plan 042 T7).
//
// Tabatha assumes the human is "always behind" on bookkeeping — links a tab
// to the wrong focus, lets an intent label drift, or leaves a stint frozen at
// a stale duration when the SW is suspended. These detectors run the same
// evidence classes autoFocusService already assembles for LIVE drift, but
// RETROACTIVELY over already-written records, and emit PROPOSALS. They never
// mutate their inputs; the service shell decides what to apply, audit, or
// queue. No chrome / supabase / DOM dependencies — unit-tested in isolation.
//
// Confidence reuses the autoFocusService ladder verbatim
// (`CONFIDENCE_ORDER = ['low','medium','high','explicit']`) so a correction's
// confidence and the settings floor speak the same language as the live
// drift detector.
// ============================================================

// Verbatim from autoFocusService.js:19 — higher index = more confident.
export const CONFIDENCE_ORDER = ['low', 'medium', 'high', 'explicit'];

export function confidenceRank(confidence) {
  return CONFIDENCE_ORDER.indexOf(confidence);
}

/**
 * Map a set of independent evidence signals to a confidence tier, following
 * the C10 spec's scoring rule: an explicit rule match wins outright; ≥2
 * independent signals corroborate to `high`; a single signal is `medium`;
 * nothing is `low`. Duplicate signals collapse (distinct count only).
 *
 * @param {Array<string>} signals  e.g. ['host-run','category'] or ['explicit']
 * @returns {'low'|'medium'|'high'|'explicit'}
 */
export function scoreCorrectionConfidence(signals = []) {
  const set = new Set((signals || []).filter(Boolean));
  if (set.has('explicit')) return 'explicit';
  if (set.size >= 2) return 'high';
  if (set.size === 1) return 'medium';
  return 'low';
}

/**
 * Filter corrections to those AT OR ABOVE the confidence floor. Corrections
 * that meet the floor are auto-applied by the service; the rest are queued as
 * suggestions. An unrecognized floor defaults to 'high' (the safe posture).
 *
 * @param {Array<{confidence:string}>} corrections
 * @param {string} floor  'low' | 'medium' | 'high' | 'explicit'
 * @returns {Array}
 */
export function applyConfidenceFloor(corrections = [], floor = 'high') {
  const floorRank = confidenceRank(floor);
  const min = floorRank < 0 ? confidenceRank('high') : floorRank;
  return (corrections || []).filter(c => confidenceRank(c && c.confidence) >= min);
}

function toMs(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

// Normalize a tabs argument (array OR object map keyed by tabId) into a flat
// array of { tabId, host, intentId, title }. Callers may express the recorded
// intent as `intentId` or (as the real tab store does) `.intent`.
function normalizeTabs(tabs) {
  if (!tabs) return [];
  const entries = Array.isArray(tabs)
    ? tabs.map(t => [t.tabId ?? t.id, t])
    : Object.entries(tabs);
  return entries
    .filter(([, t]) => t && typeof t === 'object')
    .map(([id, t]) => ({
      tabId: typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : (t.tabId ?? t.id ?? id),
      host: t.host ? String(t.host).toLowerCase() : null,
      intentId: t.intentId ?? t.intent ?? null,
      title: t.title ?? null
    }));
}

/**
 * Detect tabs whose RECORDED intent link disagrees with the intent context
 * actually observed on that tab's host. Walks the tab's host-matched
 * observations for the longest CONSECUTIVE run of a single differing intent;
 * a run of ≥ `minRun` proposes relinking the tab to that observed intent.
 *
 * A null-intent observation (idle / no active focus) breaks a run — we only
 * corroborate from observations that carry a positive intent context.
 *
 * Confidence: `host-run` is always one signal (→ medium). Category agreement
 * across the run adds a second signal (→ high). An explicit-source observation
 * (`source:'url_rule'` / `explicit:true`) forces `explicit` (silent auto-apply).
 *
 * @param {Array} observations  normalized ledger records (ts, host, intentId, …)
 * @param {Array|object} tabs   tab records (array or map keyed by tabId)
 * @param {{minRun?:number}} [opts]
 * @returns {Array<{type:'tab-intent-link',tabId,from,to,confidence,evidence:Array}>}
 */
export function detectTabIntentMismatches(observations = [], tabs = [], opts = {}) {
  const minRun = opts.minRun ?? 3;
  const obs = Array.isArray(observations) ? observations : [];
  const tabList = normalizeTabs(tabs);
  if (obs.length === 0 || tabList.length === 0) return [];

  // Chronological order — the ledger appends in order, but sort defensively.
  const sorted = [...obs].sort((a, b) => (toMs(a.ts) ?? 0) - (toMs(b.ts) ?? 0));
  const corrections = [];

  for (const tab of tabList) {
    if (!tab.host) continue;
    const matched = sorted.filter(o => o.host && String(o.host).toLowerCase() === tab.host);
    if (matched.length < minRun) continue;

    // Longest consecutive run of a single intent that DIFFERS from the record.
    let best = { intentId: null, obs: [] };
    let runId = null;
    let runObs = [];
    for (const o of matched) {
      const id = o.intentId ?? null;
      if (id != null && id !== tab.intentId) {
        if (id === runId) {
          runObs.push(o);
        } else {
          runId = id;
          runObs = [o];
        }
        if (runObs.length > best.obs.length) best = { intentId: runId, obs: runObs.slice() };
      } else {
        runId = null;
        runObs = [];
      }
    }

    if (best.obs.length < minRun) continue;

    // Evidence signals.
    const signals = ['host-run'];
    const categories = best.obs.map(o => o.category).filter(Boolean);
    const sharedCategory = categories.length === best.obs.length &&
      categories.every(c => c === categories[0]) ? categories[0] : null;
    if (sharedCategory) signals.push('category');
    if (best.obs.some(o => o.source === 'url_rule' || o.explicit === true)) signals.push('explicit');

    corrections.push({
      type: 'tab-intent-link',
      tabId: tab.tabId,
      from: tab.intentId ?? null,
      to: best.intentId,
      confidence: scoreCorrectionConfidence(signals),
      evidence: [
        { kind: 'host-run', host: tab.host, count: best.obs.length,
          firstTs: best.obs[0].ts, lastTs: best.obs[best.obs.length - 1].ts },
        ...(sharedCategory ? [{ kind: 'category', category: sharedCategory }] : [])
      ]
    });
  }

  return corrections;
}

// Attribute an observation to a focus session. Prefer an explicit focusId
// match when BOTH the session and the observation carry one; otherwise fall
// back to the session's [startedAt, endedAt] time window (endedAt → now).
// Only one focus is active at a time, so time-window attribution is sound and
// works even when the ledger doesn't stamp focusId (the common case today).
function belongsToSession(o, resolvedId, session, now) {
  if (resolvedId != null && o.focusId != null) return o.focusId === resolvedId;
  const start = toMs(session.startedAt);
  if (start == null) return false;
  const end = session.endedAt ? toMs(session.endedAt) : now;
  const t = toMs(o.ts);
  return t != null && t >= start && t <= (end ?? now);
}

/**
 * Recompute a focus's ACTUALLY-observed active time and, when it diverges far
 * enough from the recorded value, propose a `focus-time` correction. This
 * generalizes the reconstruct-from-frozen-state pattern already shipped for
 * clock stints (`stintReconciliation.reconstructStintFromStatus`) to focus
 * duration: rather than trusting an `elapsedMs` that stopped advancing (SW
 * suspend, crash, forgotten stop), we sum the gaps between consecutive
 * observations attributed to the focus, capping each gap at `maxGapMs` so a
 * walk-away idle window isn't over-credited.
 *
 * A correction is proposed only when |delta| exceeds BOTH a relative and an
 * absolute floor (default 20% of recorded AND ≥5min) and the focus has at
 * least `minObservations` supporting observations.
 *
 * Confidence: distinct evidence classes among the supporting observations —
 * capture frames, browser context, desktop/companion signal — corroborate;
 * ≥2 → high, 1 → medium.
 *
 * @param {Array} observations   normalized ledger records
 * @param {Array} focusSessions  [{ focusId|id, recordedMs|elapsedMs, startedAt?, endedAt? }]
 * @param {{maxGapMs?:number,minDeltaMs?:number,deltaPct?:number,minObservations?:number,now?:number}} [opts]
 * @returns {Array<{type:'focus-time',focusId,recordedMs,observedMs,deltaMs,confidence,evidence:Array}>}
 */
export function recomputeActualWorkTime(observations = [], focusSessions = [], opts = {}) {
  const maxGapMs = opts.maxGapMs ?? 300000;      // 5min idle cap per gap
  const minDeltaMs = opts.minDeltaMs ?? 300000;  // absolute floor: 5min
  const deltaPct = opts.deltaPct ?? 0.2;         // relative floor: 20%
  const minObservations = opts.minObservations ?? 2;
  const now = opts.now ?? Date.now();

  const obs = Array.isArray(observations) ? observations : [];
  const sessions = Array.isArray(focusSessions) ? focusSessions : [];
  if (obs.length === 0 || sessions.length === 0) return [];

  const sorted = [...obs].sort((a, b) => (toMs(a.ts) ?? 0) - (toMs(b.ts) ?? 0));
  const corrections = [];

  for (const session of sessions) {
    const focusId = session.focusId ?? session.id ?? null;
    if (focusId == null) continue;
    const recordedMs = Number(session.recordedMs ?? session.elapsedMs ?? 0) || 0;

    const matched = sorted.filter(o => belongsToSession(o, focusId, session, now));
    if (matched.length < minObservations) continue;

    let observedMs = 0;
    for (let i = 1; i < matched.length; i++) {
      const gap = (toMs(matched[i].ts) ?? 0) - (toMs(matched[i - 1].ts) ?? 0);
      if (gap > 0) observedMs += Math.min(gap, maxGapMs);
    }

    const deltaMs = observedMs - recordedMs;
    const threshold = Math.max(minDeltaMs, recordedMs * deltaPct);
    if (Math.abs(deltaMs) < threshold) continue;

    const signals = [];
    if (matched.some(o => o.kind === 'capture' || o.captureRef)) signals.push('capture');
    if (matched.some(o => o.surface === 'desktop' || o.app)) signals.push('companion');
    if (matched.some(o => o.surface === 'browser')) signals.push('browser');

    corrections.push({
      type: 'focus-time',
      focusId,
      recordedMs,
      observedMs,
      deltaMs,
      confidence: scoreCorrectionConfidence(signals),
      evidence: [{
        kind: 'observed-span',
        sampleCount: matched.length,
        firstTs: matched[0].ts,
        lastTs: matched[matched.length - 1].ts,
        surfaces: [...new Set(matched.map(o => o.surface).filter(Boolean))],
        kinds: [...new Set(matched.map(o => o.kind).filter(Boolean))]
      }]
    });
  }

  return corrections;
}
