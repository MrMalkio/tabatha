// ============================================================
// Org-hours v1 — pure client-side helpers (migration 060's RPC shape)
//
// tabatha.get_org_hours_summary(p_org_id, p_start_date, p_end_date) returns
// rows of two kinds, distinguished by is_aggregate_only:
//   - exactly one anonymous row (member_profile_id IS NULL) — the org-wide
//     total across EVERY member's clock_sessions in range, regardless of
//     opt-in. This is the "aggregate-only by default" bucket.
//   - zero or more named rows, one per member who currently has
//     profiles.settings.share_hours_with_org = true.
//
// These helpers turn that flat row array into a shape the UI can render
// directly, and are pure (no React, no chrome.*, no network) so they're
// unit-testable in isolation.
// ============================================================

/**
 * Split get_org_hours_summary's raw row array into an aggregate summary,
 * a sorted named-member list, and the portion of the aggregate that isn't
 * attributable to any named (opted-in) member.
 *
 * @param {Array<object>} rows - raw rows from the RPC (or [] / null / undefined)
 * @returns {{
 *   aggregate: { totalMs: number, workMs: number, breakMs: number, sessionCount: number } | null,
 *   members: Array<{ profileId: string, displayName: string, totalMs: number, workMs: number, breakMs: number, sessionCount: number }>,
 *   unattributedWorkMs: number,
 * }}
 */
export function splitOrgHoursRows(rows) {
  const list = Array.isArray(rows) ? rows : [];

  const aggregateRow = list.find((r) => r && r.is_aggregate_only === true) || null;

  const members = list
    .filter((r) => r && r.is_aggregate_only === false && r.member_profile_id)
    .map((r) => ({
      profileId: r.member_profile_id,
      displayName: r.display_name || 'Unknown user',
      totalMs: Number(r.total_ms) || 0,
      workMs: Number(r.work_ms) || 0,
      breakMs: Number(r.break_ms) || 0,
      sessionCount: Number(r.session_count) || 0,
    }))
    .sort((a, b) => b.workMs - a.workMs);

  const aggregate = aggregateRow
    ? {
        totalMs: Number(aggregateRow.total_ms) || 0,
        workMs: Number(aggregateRow.work_ms) || 0,
        breakMs: Number(aggregateRow.break_ms) || 0,
        sessionCount: Number(aggregateRow.session_count) || 0,
      }
    : null;

  const namedWorkMs = members.reduce((sum, m) => sum + m.workMs, 0);
  const unattributedWorkMs = Math.max(0, (aggregate?.workMs || 0) - namedWorkMs);

  return { aggregate, members, unattributedWorkMs };
}

/** Human-readable "Xh Ym" / "Ym" duration, matching Work Shifts' existing style. */
export function formatHoursDuration(ms) {
  if (!ms || ms < 0) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** ISO date (YYYY-MM-DD) N days before today, for the RPC's p_start_date. */
export function daysAgoIsoDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(0, days - 1));
  return d.toISOString().slice(0, 10);
}

/** Today's ISO date (YYYY-MM-DD), for the RPC's p_end_date. */
export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
