// ============================================================
// Cortex C11 — pure controller-attribution decision table (Plan 044 T1).
// Who is driving this browser/window/machine right now: the human or an
// AI agent? Attribution feeds honest "how well are you leveraging your
// tools" analytics; every observation can carry a `controller` field.
// No chrome / DOM / supabase deps — unit-tested in isolation.
//
// Detection surfaces (callers gather these):
//   webdriver             navigator.webdriver flag in the page
//   cdpActive             a DevTools-protocol client is attached
//   processAncestryAgent  companion sees the browser spawned by a known agent
//   agentAnnounced        an agent explicitly self-announced via the API
//   inputEventsRecent     hardware input observed in the window (companion)
// ============================================================

/**
 * @param {object} s signal booleans (all optional)
 * @returns {{controller:'human'|'ai-agent'|'unknown', confidence:'explicit'|'high'|'medium'|'low', signals:string[]}}
 */
export function attributeController(s = {}) {
  if (s.agentAnnounced) {
    return { controller: 'ai-agent', confidence: 'explicit', signals: ['agent-announced'] };
  }

  const markers = [];
  if (s.webdriver) markers.push('webdriver');
  if (s.cdpActive) markers.push('cdp-active');
  if (s.processAncestryAgent) markers.push('process-ancestry');

  if (markers.length) {
    // Automation markers dominate, but concurrent hardware input suggests
    // co-driving (human touching an automated session) → lower confidence.
    return {
      controller: 'ai-agent',
      confidence: s.inputEventsRecent ? 'medium' : 'high',
      signals: markers
    };
  }

  if (s.inputEventsRecent) {
    return { controller: 'human', confidence: 'high', signals: ['input-events'] };
  }

  return { controller: 'unknown', confidence: 'low', signals: [] };
}
