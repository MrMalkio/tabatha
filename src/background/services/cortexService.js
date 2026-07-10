// ════════════════════════════════════════════
// Tabatha — Cortex Service (C6/C7/C8 tier-①, Plan 040 Phase 1 T5)
//
// Owns the Recommendation store (C7 dashboard, read-only + approve/dismiss in
// Phase 1) and the cron-in-harness bundle generator (C8 tier-①). All contract
// logic is pure + unit-tested in src/utils/harnessCron.js; this shell only
// touches chrome.storage + chrome.downloads.
//
// Flow: nightly export (captureService) → user's harness cron runs the
// economize prompt → writes recommendations-<day>.json → user imports it here
// (IMPORT_RECOMMENDATIONS) → dashboard lists + approve/dismiss. Execution of
// approved recommendations is Phase 2 (C7 action layer).
//
// Storage key: cortexRecommendations — array of cortex-recommendations.v1 rows.
// ════════════════════════════════════════════

import { getStorage, setStorage, getSettings } from './storageService.js';
import { recordObservation } from './captureService.js';
import {
  buildHarnessCronBundle,
  normalizeRecommendations,
  RECOMMENDATION_STATUSES
} from '../../utils/harnessCron.js';
import { PROMPT_VERSION, PROMPT_TEXT } from '../cortexPrompt.js';
import { sanitizeRelPath } from '../../utils/captureArtifacts.js';
import { buildActionSpec, buildMorningDigest } from '../../utils/cortexActions.js';
import { gateProactiveExecution } from '../../utils/proactivityGate.js';
import { resolveRoute } from '../../utils/cortexRouting.js';

const RECS_KEY = 'cortexRecommendations';
const RECS_CAP = 200;

async function listRecommendations() {
  const { [RECS_KEY]: recs } = await getStorage(RECS_KEY);
  const arr = Array.isArray(recs) ? recs : [];
  return { recommendations: arr, total: arr.length };
}

async function setRecommendationStatus(id, status) {
  if (!RECOMMENDATION_STATUSES.includes(status)) {
    return { ok: false, error: `unknown status "${status}"` };
  }
  const { [RECS_KEY]: recs } = await getStorage(RECS_KEY);
  const arr = Array.isArray(recs) ? recs : [];
  const rec = arr.find((r) => r.id === id);
  if (!rec) return { ok: false, error: `unknown recommendation "${id}"` };
  rec.status = status;
  rec.decidedAt = new Date().toISOString();
  await setStorage({ [RECS_KEY]: arr });
  return { ok: true, recommendation: rec };
}

// Import a harness-produced payload (parsed JSON from the dashboard's file
// picker). Existing ids keep their current status (re-import is idempotent).
async function importRecommendations(payload) {
  let normalized;
  try {
    normalized = normalizeRecommendations(payload, { now: Date.now() });
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const { [RECS_KEY]: recs } = await getStorage(RECS_KEY);
  const arr = Array.isArray(recs) ? recs : [];
  const byId = new Map(arr.map((r) => [r.id, r]));
  let added = 0;
  for (const rec of normalized.accepted) {
    if (byId.has(rec.id)) continue; // keep prior status/decision
    byId.set(rec.id, rec);
    added++;
  }
  const merged = [...byId.values()].slice(-RECS_CAP);
  await setStorage({ [RECS_KEY]: merged });
  return { ok: true, added, rejected: normalized.rejected, total: merged.length };
}

// C8 tier-①: generate the harness cron bundle and write it under
// Downloads/<root>/harness/<harness>/ so the user can copy it into
// ~/.claude (or their Codex setup). MV3 cannot place it there directly;
// the desktop companion automates placement in a later phase.
async function downloadHarnessCronBundle(harness = 'claude-code') {
  const settings = await getSettings();
  const storeRoot = sanitizeRelPath(settings.captureStoragePath) || 'Tabatha/Cortex/captures';
  const baseRoot = storeRoot.endsWith('/captures')
    ? storeRoot.slice(0, -'/captures'.length)
    : storeRoot;

  // Absolute hints for the generated task file. %USERPROFILE% keeps the file
  // portable; the harness agent resolves it at run time.
  const exportDir = `%USERPROFILE%\\Downloads\\${baseRoot.replace(/\//g, '\\')}\\exports`;
  const outputDir = `%USERPROFILE%\\Downloads\\${baseRoot.replace(/\//g, '\\')}\\recommendations`;

  let bundle;
  try {
    bundle = buildHarnessCronBundle({
      harness,
      exportDir,
      outputDir,
      promptVersion: PROMPT_VERSION,
      promptText: PROMPT_TEXT,
      scheduleHint: '03:45 local (after the 03:30 nightly export)'
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const written = [];
  for (const file of bundle.files) {
    const relPath = `${baseRoot}/harness/${harness}/${file.relPath}`;
    const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(file.content)}`;
    await chrome.downloads.download({
      url: dataUrl, filename: relPath, conflictAction: 'overwrite', saveAs: false
    });
    written.push(relPath);
  }
  return { ok: true, harness, written, instructions: bundle.instructions };
}

// ── Phase 2/4 (Plans 041 T5 / 043 T1-T2) ────────────────────

// C7 morning digest: assembled from yesterday's ledger + approved digest
// recommendations. Read-only; the home page renders it as a card.
async function getMorningDigest(dayOverride) {
  const now = Date.now();
  const day = dayOverride || new Date(now - 86400000).toISOString().slice(0, 10);
  const { cortexLedger } = await getStorage('cortexLedger');
  const { [RECS_KEY]: recs } = await getStorage(RECS_KEY);
  const approved = (Array.isArray(recs) ? recs : []).filter((r) => r.status === 'approved');
  return buildMorningDigest({
    observations: Array.isArray(cortexLedger) ? cortexLedger : [],
    approved,
    day,
    now
  });
}

// C7→C8 execution handoff: turn every approved recommendation into an action
// spec (with the proactivity gate's verdict stamped) and write the bundle
// beside the ledger exports so the overnight harness agent can pick it up.
async function exportApprovedActions() {
  const settings = await getSettings();
  const { [RECS_KEY]: recs } = await getStorage(RECS_KEY);
  const approved = (Array.isArray(recs) ? recs : []).filter((r) => r.status === 'approved');

  const specs = [];
  for (const rec of approved) {
    try {
      const spec = buildActionSpec(rec);
      const gate = gateProactiveExecution(spec, settings);
      specs.push({ ...spec, proactive: gate.allowed, reviewRequired: gate.reviewRequired });
    } catch { /* skip malformed rows rather than failing the export */ }
  }
  if (!specs.length) return { exported: false, reason: 'no-approved-recommendations' };

  const day = new Date().toISOString().slice(0, 10);
  const route = resolveRoute(settings, { signedIn: false }); // informational for the file
  const content = {
    schema: 'cortex-actions.v1',
    day,
    routingTier: route.tier,
    actions: specs
  };
  const storeRoot = sanitizeRelPath(settings.captureStoragePath) || 'Tabatha/Cortex/captures';
  const baseRoot = storeRoot.endsWith('/captures') ? storeRoot.slice(0, -'/captures'.length) : storeRoot;
  const relPath = `${baseRoot}/exports/cortex-actions-${day}.json`;
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(content, null, 1))}`;
  await chrome.downloads.download({ url: dataUrl, filename: relPath, conflictAction: 'overwrite', saveAs: false });
  return { exported: true, actions: specs.length, path: relPath };
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'LIST_RECOMMENDATIONS': return listRecommendations();
    case 'SET_RECOMMENDATION_STATUS': return setRecommendationStatus(message?.id, message?.status);
    case 'IMPORT_RECOMMENDATIONS': return importRecommendations(message?.payload);
    case 'DOWNLOAD_HARNESS_CRON': return downloadHarnessCronBundle(message?.harness);
    case 'GET_MORNING_DIGEST': return getMorningDigest(message?.day);
    case 'EXPORT_APPROVED_ACTIONS': return exportApprovedActions();
    // C9 voice: mirror a dictation/voice event into the C4 ledger (kind:'voice').
    // Partition-aware — derives clock state so voice notes split org vs personal.
    case 'RECORD_VOICE_OBSERVATION': {
      const transcript = typeof message?.transcript === 'string' ? message.transcript.trim() : '';
      if (!transcript) return { ok: false, error: 'empty-transcript' };
      let clockState = 'clocked_out';
      try {
        const { clockSession } = await getStorage('clockSession');
        if (clockSession?.active) clockState = clockSession.onBreak ? 'on_break' : 'clocked_in';
      } catch { /* default personal */ }
      const rec = await recordObservation(
        { at: Date.now(), surface: 'voice', kind: 'voice', title: transcript },
        clockState,
        { voiceKind: message?.kind || 'voice-note' }
      );
      return { ok: true, observation: rec };
    }
    default: return undefined;
  }
}
