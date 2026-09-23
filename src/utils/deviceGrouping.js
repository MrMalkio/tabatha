// ============================================================
// Feature #222 — Device Management (extension). Pure grouping/labeling
// helpers ported from the Sidecar's DevicesCard.tsx (migration 045,
// 2026-07-20/21 fix-wave). Kept as a standalone pure module (no chrome.*,
// no React) so the same de-dup/visibility logic that keeps the Sidecar's
// device list from flooding with ~100 dupe rows is unit-testable here too,
// and so src/settings/DevicesPanel.jsx and src/background/services/
// deviceService.js can both import it without duplicating the rules.
//
// Row shape expected (subset of tabatha.browser_profiles columns):
//   { id, browser, profile_name, display_name, classification,
//     extension_installed, last_seen_at, paused, revoked_at,
//     local_id, machine_id, device_settings }
// ============================================================

export const DEVICE_KINDS = [
  { value: 'phone', label: '📱 Phone' },
  { value: 'tablet', label: '📱 Tablet' },
  { value: 'desktop', label: '🖥️ Desktop' },
  { value: 'watch', label: '⌚ Watch' },
  { value: 'browser_extra', label: '🌐 Extra browser' },
];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function relTime(iso, now = Date.now()) {
  if (!iso) return 'never seen';
  const ms = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function surfaceLabel(row) {
  if (row.extension_installed) return `Chrome extension · ${row.browser}`;
  if (row.browser === 'tabatha_web' || row.browser === 'mobile_ios' || row.browser === 'mobile_android') {
    return `Sidecar · ${String(row.browser).replace('mobile_', '').replace('tabatha_', '')}`;
  }
  return row.browser || 'unknown';
}

// Fix 3c parity: rows without a user-set display_name derive a more
// distinguishing label than a bare repeated surface string.
export function deriveName(row) {
  if (row.display_name) return row.display_name;
  const bits = [surfaceLabel(row)];
  const profileName = row.profile_name?.trim();
  if (profileName && profileName.toLowerCase() !== 'default') bits.push(profileName);
  bits.push(`#${String(row.id || '').slice(0, 4).toUpperCase()}`);
  return bits.join(' · ');
}

// Fix 3a: the default view hides stale, never-renamed, unfamiliar rows. A
// row stays visible by default if it's recent, named, or "this device".
export function isDefaultVisible(row, thisDeviceId, now = Date.now()) {
  if (row.id === thisDeviceId) return true;
  if (row.display_name) return true;
  if (row.last_seen_at && now - new Date(row.last_seen_at).getTime() <= THIRTY_DAYS_MS) return true;
  return false;
}

// Fix 3a refinement: default view shows ONE row per physical device — group
// by machine_id when present (extension reaching the desktop companion is by
// definition the same machine), falling back to browser+local_id prefix, and
// finally the row's own id when neither correlating field is set.
export function groupKey(row) {
  if (row.machine_id) return `m:${row.machine_id}`;
  if (row.local_id) return `l:${row.browser}:${String(row.local_id).slice(0, 16)}`;
  return `id:${row.id}`;
}

// One representative row per group — the most-recently-seen one. Assumes
// `rows` is already ordered last_seen_at desc (nulls last), matching the
// query deviceService issues, so first-wins is enough.
export function groupRows(rows) {
  const seen = new Map();
  for (const r of rows || []) {
    const key = groupKey(r);
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}

// Convenience: grouped + narrowed-to-default-visible rows, plus how many
// rows the "Show all" toggle would reveal. Mirrors DevicesCard's derivation
// so DevicesPanel.jsx doesn't have to re-implement the two-pass logic.
export function visibleDeviceRows(rows, thisDeviceId, { showAll = false, now = Date.now() } = {}) {
  const grouped = groupRows(rows);
  const defaultVisible = grouped.filter((r) => isDefaultVisible(r, thisDeviceId, now));
  const hiddenCount = (rows || []).length - defaultVisible.length;
  return { visible: showAll ? (rows || []) : defaultVisible, hiddenCount, groupedCount: grouped.length };
}

export function deviceKindOf(row) {
  return row?.device_settings?.kind || 'phone';
}
