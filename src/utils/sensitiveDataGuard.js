// ============================================================
// Cortex C2 — Sensitive-Data Guard: pure capture gating + redaction.
// No chrome / DOM / supabase deps — unit-tested in isolation.
//
// Given the FOCUSED capture target (the tab/window about to be captured) and a
// list of user/org rules, decide whether to SKIP the frame entirely (suppress)
// and/or which regions to REDACT before the frame is written to disk.
//
// The privacy risk is client-identity + client-private-info captured TOGETHER —
// so redaction can blur (e.g.) the bottom 80% of a QuickBooks tab while keeping
// the page/client label. Suppression drops the frame outright.
//
// This function evaluates the target that IS being captured. The "don't suppress
// other tabs when QuickBooks isn't focused" nuance lives in the caller, which
// only invokes this for the frame actually being taken.
// ============================================================

/**
 * @param {object} target { surface, host?, url?, appName?, title? }
 * @param {Array} rules   [{ when: {host?, hostContains?, appName?, appNameContains?},
 *                           action: 'suppress'|'redact', redact?: {region, percent} }]
 * @returns {{suppress: boolean, redactions: Array, reason: string}}
 */
export function evaluateCapture(target, rules) {
  const matched = (rules || []).filter((rule) => matchesTarget(target, rule.when));

  if (matched.some((r) => r.action === 'suppress')) {
    return { suppress: true, redactions: [], reason: 'suppressed' };
  }

  const redactions = matched
    .filter((r) => r.action === 'redact' && r.redact)
    .map((r) => r.redact);

  if (redactions.length) {
    return { suppress: false, redactions, reason: 'redacted' };
  }

  return { suppress: false, redactions: [], reason: 'clear' };
}

/** Every provided key in `when` must match the target (AND semantics). */
function matchesTarget(target, when) {
  if (!when || Object.keys(when).length === 0) return false;
  const host = target.host || '';
  const appName = (target.appName || '').toLowerCase();

  if ('host' in when && host !== when.host) return false;
  if ('hostContains' in when && !host.includes(when.hostContains)) return false;
  if ('appName' in when && appName !== String(when.appName).toLowerCase()) return false;
  if ('appNameContains' in when &&
      !appName.includes(String(when.appNameContains).toLowerCase())) return false;
  return true;
}
