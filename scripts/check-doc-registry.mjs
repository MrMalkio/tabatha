#!/usr/bin/env node
// Tabatha docs/plan registry drift lint — catches the two failure modes that
// bit us in the 2026-07-25/26 audit (Asana chore 1216904312614852):
//   1. Duplicate feature numbers in docs/features/ (two files claiming the same #NNN)
//   2. A stale "Next available number" pointer in .headbox/plan-registry.md
// Usage:
//   node scripts/check-doc-registry.mjs
//
// Exit codes:
//   0 — pass (KNOWN DRIFT warnings may still print — see below)
//   1 — hard fail (duplicate feature numbers, or a next-number pointer that
//       has already been lapped by the table)
//
// NOTE: duplicate *plan* numbers are WARN-only, not a hard fail. As of this
// writing, plan numbers 039, 040 and 041 are each legitimately used twice
// (Cortex program 039/cortex_phase1 040/cortex_phase2 041 vs. Sidecar-mobile
// 039/Sidecar-voice 040/Tabby-Watch 041 — see .headbox/plan-registry.md).
// Renumbering plans is explicitly OUT OF SCOPE for this lint — it's a
// question for Malkio — so this script must never hard-fail on it, or it
// would wedge the build. See the KNOWN DRIFT block below.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FEATURES_DIR = resolve(ROOT, 'docs/features');
const PLAN_REGISTRY = resolve(ROOT, '.headbox/plan-registry.md');

const failures = [];
const warnings = [];

// ---------------------------------------------------------------------------
// 1. Duplicate feature numbers in docs/features/
// ---------------------------------------------------------------------------

const featureFiles = readdirSync(FEATURES_DIR).filter((f) => f.endsWith('.md'));
const byNumber = new Map(); // "184" -> [filenames]

for (const file of featureFiles) {
  const match = file.match(/^(\d+)-/);
  if (!match) continue; // skip B0x/D0x bug-fix & design-change docs, and unnumbered stubs
  const num = match[1];
  if (!byNumber.has(num)) byNumber.set(num, []);
  byNumber.get(num).push(file);
}

const dupeFeatureNumbers = [...byNumber.entries()].filter(([, files]) => files.length > 1);

if (dupeFeatureNumbers.length > 0) {
  for (const [num, files] of dupeFeatureNumbers) {
    failures.push(
      `Duplicate feature number #${num}: ${files.map((f) => `docs/features/${f}`).join(', ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Plan-registry "Next available number" pointer vs. highest registered plan
// ---------------------------------------------------------------------------

const registryRaw = readFileSync(PLAN_REGISTRY, 'utf8');
const registryLines = registryRaw.split('\n');

const nextNumberMatch = registryRaw.match(/\*\*Next available number:\*\*\s*(\d+)/);
if (!nextNumberMatch) {
  failures.push('Could not find "**Next available number:** NNN" pointer in .headbox/plan-registry.md');
}
const nextNumber = nextNumberMatch ? parseInt(nextNumberMatch[1], 10) : null;

// The registry file has THREE "| NNN | ... |" tables (main plan table,
// a Supabase migrations table, and a Feature<->Plan Cross-Reference table
// keyed by "#NNN"). We only want the main plan table here, so scope
// parsing to its header ("| #  | Suffix | Date | Conversation / Topic | ...")
// through the next blank line.
const planRowRe = /^\|\s*(\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?)\s*\|/;

const planTableHeaderIdx = registryLines.findIndex((l) => /^\|\s*#\s*\|\s*Suffix\s*\|/.test(l));
if (planTableHeaderIdx === -1) {
  failures.push('Could not locate the main plan table header ("| #  | Suffix | ... |") in .headbox/plan-registry.md');
}

let highestPlanNumber = 0;
const planNumberOccurrences = new Map(); // "039" -> count of rows it appears in

if (planTableHeaderIdx !== -1) {
  const dataStart = planTableHeaderIdx + 2; // skip header row + "----" separator row
  // The table has at least one stray mid-table blank line in practice, so we
  // can't stop at the first blank line. Stop only at an unambiguous
  // end-of-section marker (a "---" rule, a new "##" heading, or a ">" note),
  // skipping over blank lines and any other stray content in between.
  let dataEnd = dataStart;
  while (dataEnd < registryLines.length && !/^(---|##|>)/.test(registryLines[dataEnd].trim())) {
    dataEnd++;
  }

  for (let i = dataStart; i < dataEnd; i++) {
    const m = registryLines[i].match(planRowRe);
    if (!m) continue;
    // Pull every number token out of the first column (handles single numbers,
    // decimals like "014.5", and ranges like "002–011").
    const tokens = m[1].match(/\d+(?:\.\d+)?/g) || [];
    for (const tok of tokens) {
      const val = parseFloat(tok);
      if (val > highestPlanNumber) highestPlanNumber = val;
    }
    // Track the row's own leading identifier for duplicate detection (skips
    // decimal addenda like "014.5" and range rows like "002–011", which are
    // not directly comparable single plan IDs).
    const leadToken = tokens[0];
    if (leadToken && !leadToken.includes('.') && m[1].trim() === leadToken) {
      planNumberOccurrences.set(leadToken, (planNumberOccurrences.get(leadToken) || 0) + 1);
    }
  }
}

if (nextNumber !== null && nextNumber <= highestPlanNumber) {
  failures.push(
    `.headbox/plan-registry.md says "Next available number: ${String(nextNumber).padStart(3, '0')}" but the table already registers plan ${highestPlanNumber} — the pointer is stale (must be > highest registered plan number).`
  );
}

// ---------------------------------------------------------------------------
// 3. Duplicate PLAN numbers — WARN ONLY (deliberate, see file header)
// ---------------------------------------------------------------------------

const dupePlanNumbers = [...planNumberOccurrences.entries()].filter(([, count]) => count > 1);

if (dupePlanNumbers.length > 0) {
  warnings.push(
    'KNOWN DRIFT — duplicate plan numbers in .headbox/plan-registry.md: ' +
      dupePlanNumbers.map(([num]) => num).join(', ') +
      '. This is deliberate/tracked, not a new bug: plans 039, 040 and 041 are each ' +
      'used twice (Cortex program 039/040/041 vs. Sidecar-mobile 039 / Sidecar-voice 040 / ' +
      'Tabby-Watch 041). Renumbering plans is OUT OF SCOPE for this lint — it is a question ' +
      'for Malkio — so this is a warning, not a failure. Do not silently drop this warning ' +
      'or "fix" it by hard-failing the build.'
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('--- docs/plan registry drift check ---');

if (warnings.length > 0) {
  console.log('');
  for (const w of warnings) console.log(`⚠ ${w}`);
}

if (failures.length > 0) {
  console.log('');
  console.error(`✘ FAIL — ${failures.length} issue(s):`);
  for (const f of failures) console.error(`   - ${f}`);
  process.exit(1);
}

console.log('');
console.log(
  `✓ PASS — ${byNumber.size} numbered feature doc(s), no duplicate feature numbers; ` +
    `next-plan pointer (${nextNumber}) > highest registered plan (${highestPlanNumber}).`
);
process.exit(0);
