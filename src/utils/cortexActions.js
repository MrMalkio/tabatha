// ============================================================
// Cortex C7 — pure action-layer helpers (Plan 041 T5).
// On approval, a recommendation becomes an ACTION SPEC the C8 routing layer
// executes (reactively via the dashboard, or proactively overnight). Also
// assembles the consolidated morning digest that replaces polling loops.
// No chrome / DOM / supabase deps — unit-tested in isolation.
//
// Guardrail (normative): generated artifacts are ALWAYS review-first — no
// spec may auto-install or self-modify Tabatha.
// ============================================================

import { selectObservationsForDay } from './ledgerExport.js';

/**
 * Turn one APPROVED recommendation into an executable artifact spec.
 * kinds: 'digest-source' (no AI — feeds buildMorningDigest) ·
 *        'instructions' (AI writes a how-to) ·
 *        'codegen' (AI drafts a script/extension for human review) ·
 *        'brief' (AI writes a tool-replacement comparison).
 */
export function buildActionSpec(rec) {
  if (rec?.status !== 'approved') {
    throw new Error(`buildActionSpec: recommendation must be approved (got "${rec?.status}")`);
  }
  const base = { recommendationId: rec.id, title: rec.title, evidence: rec.evidence || [] };

  switch (rec.type) {
    case 'digest':
      return {
        ...base,
        kind: 'digest-source',
        requiresAi: false,
        sources: sourcesFromEvidence(rec.evidence)
      };
    case 'custom-code':
      return {
        ...base,
        kind: 'codegen',
        requiresAi: true,
        guardrails: { autoInstall: false, reviewRequired: true },
        prompt:
          `Draft the artifact for the approved recommendation "${rec.title}". ` +
          `Rationale: ${rec.rationale} ` +
          `Produce complete, minimal code with setup steps. The user must review ` +
          `everything before installing — never assume auto-install.`
      };
    case 'tool-replacement':
      return {
        ...base,
        kind: 'brief',
        requiresAi: true,
        prompt:
          `Write a short switch brief for "${rec.title}". Rationale: ${rec.rationale} ` +
          `Cover: candidate replacement(s), cost/latency delta, migration steps, risks.`
      };
    case 'hotkey':
    default:
      return {
        ...base,
        kind: 'instructions',
        requiresAi: true,
        prompt:
          `Write concise setup instructions for the approved recommendation "${rec.title}". ` +
          `Rationale: ${rec.rationale} Keep it under one screen; the user applies it manually.`
      };
  }
}

/** evidence keys look like `surface|host-or-app|focusId|intentId` → host/app list */
function sourcesFromEvidence(evidence) {
  const out = [];
  for (const e of evidence || []) {
    const source = String(e?.key || '').split('|')[1];
    if (source && !out.includes(source)) out.push(source);
  }
  return out;
}

/**
 * Consolidated morning digest (cortex-digest.v1): one section per approved
 * digest source, summarizing yesterday's visits so the user reads once
 * instead of polling all day.
 */
export function buildMorningDigest({ observations, approved, day, now }) {
  const dayRecords = selectObservationsForDay(observations, day);
  const sources = (approved || [])
    .filter((r) => r.type === 'digest')
    .flatMap((r) => sourcesFromEvidence(r.evidence));

  const sections = [];
  for (const source of [...new Set(sources)]) {
    const hits = dayRecords.filter((rec) => (rec.host || rec.app) === source);
    if (!hits.length) continue;
    sections.push({
      source,
      visits: hits.length,
      firstSeen: hits[0].ts,
      lastSeen: hits[hits.length - 1].ts,
      titles: [...new Set(hits.map((h) => h.title).filter(Boolean))].slice(0, 5)
    });
  }
  sections.sort((a, b) => b.visits - a.visits);

  return {
    schema: 'cortex-digest.v1',
    day,
    generatedAt: new Date(now).toISOString(),
    sections
  };
}
