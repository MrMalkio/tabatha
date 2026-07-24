// Security fix wave (2026-07-21 audit, NOW #1) — shared HTML-escaping helper.
// Any user-controlled string (focus/intent labels, notes, task names — anything
// typed on ANY device and synced) that gets interpolated into an innerHTML-style
// template string MUST be routed through this first. Escaping & first is load-bearing
// (it must not double-escape the entities produced by the other replacements).
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
