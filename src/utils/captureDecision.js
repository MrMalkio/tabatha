// ============================================================
// Cortex C1 — Adaptive Capture: pure decision helpers.
// Decide WHEN a screenshot is worth taking and WHICH surface takes it.
// No chrome / DOM / supabase deps — unit-tested in isolation.
//
// Philosophy (from the source video + design dumps): we already capture a lot
// of context (window titles, intent, tabs, domains), so we do NOT blindly grab
// a frame every N seconds. A frame is worth taking when the CONTEXT changes
// (new tab / window / app / focus / intent), or when the user DWELLS in one
// context long enough that the last frame is stale. A min-gap prevents thrash.
// ============================================================

/**
 * Decide whether to capture a frame for the given event.
 *
 * @param {object} event  { type, at (ms epoch), contextKey }
 *   type: 'tab-activated' | 'window-focus-changed' | 'app-switch' |
 *         'focus-changed' | 'intent-changed' | 'dwell-tick'
 *   contextKey: an opaque string identifying the current context
 *               (e.g. `tab:<id>` / `win:<id>` / `app:<name>|focus:<id>`).
 * @param {object} state  { enabled, lastCaptureAt (ms|null), lastContextKey (string|null) }
 * @param {object} config { dwellIntervalMs, minGapMs, captureOnContextChange }
 * @returns {{capture: boolean, reason: string}}
 */
export function decideCapture(event, state, config) {
  if (!state.enabled) return { capture: false, reason: 'disabled' };

  const { at, contextKey, type } = event;
  const { lastCaptureAt, lastContextKey } = state;
  const { dwellIntervalMs, minGapMs, captureOnContextChange } = config;

  const sinceLast = lastCaptureAt == null ? Infinity : at - lastCaptureAt;
  const contextChanged = contextKey !== lastContextKey;

  // A context change is the strongest signal — but never faster than min-gap.
  if (contextChanged && captureOnContextChange) {
    if (sinceLast < minGapMs) return { capture: false, reason: 'min-gap' };
    return { capture: true, reason: 'context-change' };
  }

  // Dwell: same context, but the last frame is stale enough to refresh.
  if (type === 'dwell-tick') {
    if (sinceLast >= dwellIntervalMs) return { capture: true, reason: 'dwell' };
    return { capture: false, reason: 'dwell-not-elapsed' };
  }

  return { capture: false, reason: 'no-context-change' };
}

/**
 * Which surface should own capture right now — the browser extension or the
 * desktop companion. Chrome focused → the extension grabs the visible tab;
 * Chrome blurred → the companion takes over OS-level capture; idle → nobody.
 *
 * @param {object} p { chromeFocused: boolean, idle: boolean }
 * @returns {'browser'|'os'|'none'}
 */
export function captureSurface({ chromeFocused, idle }) {
  if (idle) return 'none';
  return chromeFocused ? 'browser' : 'os';
}
