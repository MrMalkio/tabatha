// ════════════════════════════════════════════
// Tabatha — duration.js (NB-09)
// Pure typed-duration parsing/formatting for the focus time-edit UI.
// No chrome.* usage — unit-testable under plain node --test.
// ════════════════════════════════════════════

const MIN_MS = 60000;
const HOUR_MS = 3600000;

/**
 * Parse a human-typed duration into milliseconds.
 *
 * Accepted forms (case-insensitive, optional whitespace):
 *   "500m"     → 500 minutes
 *   "8h20m"    → 8 h 20 min
 *   "2h"       → 2 hours
 *   "90"       → plain number = minutes
 *   "1.5h"     → decimals allowed on either unit
 *   "1h 20m"   → internal spaces allowed
 *
 * Returns an integer number of milliseconds, or null when the input is
 * empty, negative, or not a recognisable duration.
 */
export function parseDuration(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;

  // Plain number → minutes.
  if (/^\d+(\.\d+)?$/.test(s)) {
    return Math.round(parseFloat(s) * MIN_MS);
  }

  // h/m component form: "8h20m", "2h", "45m", "1h 20m".
  const m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?$/);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;

  const hours = m[1] !== undefined ? parseFloat(m[1]) : 0;
  const mins = m[2] !== undefined ? parseFloat(m[2]) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;

  return Math.round(hours * HOUR_MS + mins * MIN_MS);
}

/**
 * Format milliseconds as a compact "8h 20m" / "45m" / "0m" string.
 * Sub-minute remainders are rounded to the nearest minute.
 */
export function formatDurationMs(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / MIN_MS));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
