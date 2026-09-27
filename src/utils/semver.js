// ============================================================
// Tabatha — shared version comparator.
// Manifest versions are MV3 dot-separated integers (e.g. "6.4.0").
// Extracted verbatim (behaviour-preserving) from companionService so the
// companion auto-reload path (FIX-11) and the "What's New" layer share one
// comparator instead of drifting.
// ============================================================

// Returns true iff `candidate` is strictly greater than `current`.
// Non-numeric / malformed parts compare as 0 so a parse failure never
// triggers a spurious "newer" verdict.
export function isVersionNewer(current, candidate) {
  if (!current || !candidate) return false;
  const a = String(current).split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(candidate).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (bv > av) return true;
    if (bv < av) return false;
  }
  return false; // equal
}

// Three-way comparator for manifest versions: -1 if a < b, 0 if equal,
// 1 if a > b. Missing/malformed versions sort lowest (null < "0.0.1"), and two
// missing versions compare equal — so a failed fetch never looks "newer".
export function compareVersions(a, b) {
  const hasA = !!a && String(a).trim() !== '';
  const hasB = !!b && String(b).trim() !== '';
  if (!hasA && !hasB) return 0;
  if (!hasA) return -1;
  if (!hasB) return 1;
  if (isVersionNewer(a, b)) return -1;
  if (isVersionNewer(b, a)) return 1;
  return 0;
}
