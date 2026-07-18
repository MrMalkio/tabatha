// ============================================================
// Cortex C8 — pure proactivity gate (Plan 043 T1).
// Reactive: every action needs a dashboard click. Proactive: whitelisted
// action-spec kinds may execute overnight; the user reviews results in the
// morning. Hard invariant regardless of mode: generated code is NEVER
// auto-installed — codegen output is always review-first.
// No chrome / DOM / supabase deps — unit-tested in isolation.
// ============================================================

/**
 * @param {object} spec     an action spec from buildActionSpec()
 * @param {object} settings { cortexProactivity: 'reactive'|'proactive', cortexProactiveKinds: string[] }
 * @returns {{allowed:boolean, reason:string, reviewRequired:boolean}}
 */
export function gateProactiveExecution(spec, settings) {
  const reviewRequired = spec?.kind === 'codegen'; // invariant, mode-independent

  if ((settings?.cortexProactivity || 'reactive') !== 'proactive') {
    return { allowed: false, reason: 'reactive-mode', reviewRequired };
  }
  const kinds = settings.cortexProactiveKinds || [];
  if (!kinds.includes(spec?.kind)) {
    return { allowed: false, reason: 'kind-not-whitelisted', reviewRequired };
  }
  return { allowed: true, reason: 'ok', reviewRequired };
}
