// ============================================================
// Pure helpers for stint reconciliation. Shared by the concurrency
// warning (home/sidebar), the Live Stints panel, and orphan cleanup.
// No chrome / supabase / DOM dependencies — unit-tested in isolation.
// ============================================================

const ACTIVE_STATES = new Set(['clocked_in', 'on_break']);

/**
 * True when `row` represents a genuinely live shift that would stack on top
 * of the current install's shift. "Live" = online and not stale. Concurrency
 * is only a problem within the SAME classification (e.g. two professional
 * clocks); different classifications (professional + personal, or two
 * different businesses) are legitimate parallel work. `personal` never
 * conflicts — those installs aren't billable time.
 *
 * @param {object|null} row             a sibling install status row
 * @param {string} selfClassification   this install's classification
 * @returns {boolean}
 */
export function isLiveConcurrent(row, selfClassification) {
  if (!row) return false;
  if (!row.online || row.stale) return false;
  if (!ACTIVE_STATES.has(row.clock_state)) return false;
  if (!row.classification || row.classification === 'personal') return false;
  return row.classification === selfClassification;
}

function clampMs(value, lo, hi) {
  return Math.min(Math.max(value, lo), hi);
}

/**
 * Reconstruct a closed stint for an abandoned install from its frozen status
 * row. Open stints were never synced, so the only signals we have are
 * clocked_in_at, optionally on_break_since (if it died on break), and
 * last_heartbeat_at. The caller-chosen `endTime` is clamped to
 * [clocked_in_at, now]; if omitted it defaults to last_heartbeat_at.
 *
 * Returns snake_case fields matching the tabatha.clock_sessions columns.
 *
 * @param {object} row       browser_profile_status row
 * @param {string|null} endTime  ISO end time (defaults to last_heartbeat_at)
 * @param {number} now        current epoch ms (injectable for tests)
 */
export function reconstructStintFromStatus(row, endTime, now = Date.now()) {
  const startMs = new Date(row.clocked_in_at).getTime();
  const rawEnd = endTime || row.last_heartbeat_at;
  const endMs = clampMs(new Date(rawEnd).getTime(), startMs, now);

  const breaks = [];
  let breakMs = 0;
  if (row.clock_state === 'on_break' && row.on_break_since) {
    const breakStartMs = clampMs(new Date(row.on_break_since).getTime(), startMs, endMs);
    breakMs = endMs - breakStartMs;
    if (breakMs > 0) {
      breaks.push({ start: new Date(breakStartMs).toISOString(), end: new Date(endMs).toISOString() });
    }
  }

  const totalMs = endMs - startMs;
  return {
    clocked_in_at: new Date(startMs).toISOString(),
    clocked_out_at: new Date(endMs).toISOString(),
    total_ms: totalMs,
    break_ms: breakMs,
    work_ms: Math.max(0, totalMs - breakMs),
    breaks
  };
}

/**
 * Pick which real browser_profile an orphan's reconstructed stint should be
 * attributed to. Prefers a real install of the same classification AND same
 * machine; falls back to any same-classification real install; if none
 * exists, attributes to the orphan's own id (so the hours aren't lost).
 *
 * @param {object} orphan        { browser_profile_id, classification, machine_id }
 * @param {Array}  realProfiles  candidate non-orphan installs
 * @returns {string} browser_profile_id to stamp the stint with
 */
export function resolveAttributionTarget(orphan, realProfiles = []) {
  const sameClass = realProfiles.filter(p => p.classification === orphan.classification);
  if (sameClass.length === 0) return orphan.browser_profile_id;

  if (orphan.machine_id) {
    const sameMachine = sameClass.find(p => p.machine_id && p.machine_id === orphan.machine_id);
    if (sameMachine) return sameMachine.browser_profile_id;
  }
  return sameClass[0].browser_profile_id;
}

/**
 * Decide how a sibling install's status row should be cleaned up. Drives both
 * the per-row Live Stints actions and the bulk "clear all offline" sweep.
 *
 *   'self'      — this install; never auto-cleaned
 *   'live'      — online + actively clocked in; leave it alone
 *   'reconcile' — stale but still clocked_in/on_break → reconstruct a closing
 *                 stint, then delete the (now meaningless) presence row
 *   'dismiss'   — stale with no open shift (focus-only ghost, clocked_out) →
 *                 just delete the presence row so its chip disappears
 *   'skip'      — online + idle, or otherwise nothing to do
 *
 * @param {object|null} row
 * @param {string|null} selfId  this install's browser_profile_id
 * @returns {'self'|'live'|'reconcile'|'dismiss'|'skip'}
 */
export function classifyInstallForCleanup(row, selfId) {
  if (!row) return 'skip';
  if (row.browser_profile_id === selfId) return 'self';
  const active = row.clock_state === 'clocked_in' || row.clock_state === 'on_break';
  if (active && row.online && !row.stale) return 'live';
  if (row.stale && active) return 'reconcile';
  if (row.stale) return 'dismiss';
  return 'skip';
}
