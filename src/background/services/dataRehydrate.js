// ============================================================
// Tabatha — Cloud rehydrate-on-sign-in (Workstream A3)
//
// bootstrapPull.js pulls only the org REGISTRY; clock_sessions /
// intent_history / focus_items are push-only, so a fresh or new-ID install
// (e.g. after the A2 key pin changes the extension ID) shows EMPTY until new
// local activity is generated. This module reconstructs the user's local view
// from the server rows, mirroring bootstrapPull.js.
//
// Gated by _dataRehydratedAt keyed by profileId — runs once per profile per
// install. Clearing the watermark (or signing into a different profile) re-runs
// it. Merge is newest-wins by stable client id; we never drop local-only rows.
//
// Watermarks (lastClockSync / lastIntentSync) are advanced to the newest pulled
// row so the very next push selects 0 new rows — no re-push churn.
//
// desktop_activity rehydrate is intentionally NOT done here for day one: the
// owner reads desktop rows server-side (service-role views, migration 019), so
// the local view doesn't need them to be correct.
// ============================================================

import { getStorage, setStorage } from './storageService.js';
import { getFocusEngine, setFocusEngine } from './storageService.js';

function toArray(v) { return Array.isArray(v) ? v : []; }
function maxIso(a, b) {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  const m = Math.max(ta, tb);
  return m > 0 ? new Date(m).toISOString() : null;
}

async function fetchTable(supabase, table, profileId) {
  const { data, error } = await supabase
    .schema('tabatha')
    .from(table)
    .select('*')
    .eq('profile_id', profileId);
  if (error) throw new Error(`rehydrate pull ${table} failed: ${error.message || error.code || JSON.stringify(error)}`);
  return toArray(data);
}

// ── Reconstructors: inverse of syncService.build* ──

function serverClockToLocal(row) {
  return {
    id: row.client_id,
    clockedInAt: row.clocked_in_at,
    clockedOutAt: row.clocked_out_at,
    totalMs: row.total_ms ?? null,
    breakMs: row.break_ms ?? 0,
    workMs: row.work_ms ?? null,
    breaks: toArray(row.breaks),
    source: row.source || 'extension',
  };
}

function serverIntentToLocal(row) {
  return {
    action: row.action || 'unknown',
    context: row.context ?? null,
    focusId: row.focus_id || null,
    url: row.url || null,
    domain: row.domain || null,
    timestamp: row.timestamp,
  };
}

function serverFocusToLocal(row) {
  const completedAt = row.completed_at || null;
  return {
    id: row.client_id,
    label: row.label || 'Untitled focus',
    funnelStage: row.funnel_stage || 'unsorted',
    focusState: row.focus_state || (completedAt ? 'completed' : 'paused'),
    timerMinutes: Number.isFinite(Number(row.timer_minutes)) ? Number(row.timer_minutes) : 15,
    tags: row.tags || {},
    createdAt: row.created_at || null,
    completedAt,
    // Carried for the newest-wins merge only (the server stamps every push).
    syncedAt: row.synced_at || null,
  };
}

// Reference time for newest-wins on focus items. Prefer an explicit edit/
// completion stamp; fall back to the server sync stamp, then creation/start.
function focusRefTime(f) {
  return new Date(
    f?.updatedAt || f?.completedAt || f?.endedAt || f?.syncedAt || f?.createdAt || f?.startedAt || 0,
  ).getTime();
}

// Merge server rows into a local array keyed by `id`. Newest-wins: a server row
// replaces the local entry when the server's reference time is >= the local
// one. Local-only rows are preserved. Returns the merged array.
function mergeById(local, serverItems, refTime) {
  const byId = new Map();
  for (const item of toArray(local)) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const srv of serverItems) {
    if (!srv?.id) continue;
    const existing = byId.get(srv.id);
    if (!existing) { byId.set(srv.id, srv); continue; }
    const st = refTime(srv);
    const lt = refTime(existing);
    if (st >= lt) byId.set(srv.id, { ...existing, ...srv });
  }
  return Array.from(byId.values());
}

/**
 * rehydrateUserData — pull + reconstruct + persist the user's activity view.
 * Idempotency is the caller's responsibility (check isRehydrateNeeded).
 * Throws on transport errors so syncService can record a diagnostic.
 *
 * @returns {Promise<{clock:number,intent:number,focus:number}>}
 */
export async function rehydrateUserData({ supabase, scope }) {
  const profileId = scope?.profile_id;
  if (!supabase || !profileId) {
    throw new Error('rehydrateUserData requires supabase + scope.profile_id');
  }

  // 1. CLOCK SESSIONS → clockHistory + lastClockSync
  const clockRows = await fetchTable(supabase, 'clock_sessions', profileId);
  const serverClock = clockRows.map(serverClockToLocal);
  const { clockHistory: localClock, lastClockSync } = await getStorage(['clockHistory', 'lastClockSync']);
  const mergedClock = mergeById(localClock, serverClock, s => new Date(s.clockedOutAt || s.clockedInAt || 0).getTime());
  let newestClock = lastClockSync || null;
  for (const r of clockRows) newestClock = maxIso(newestClock, r.clocked_out_at);

  // 2. INTENT HISTORY → intentHistory + lastIntentSync
  const intentRows = await fetchTable(supabase, 'intent_history', profileId);
  const serverIntents = intentRows.map(serverIntentToLocal);
  const { intentHistory: localIntents, lastIntentSync } = await getStorage(['intentHistory', 'lastIntentSync']);
  // Intents have no stable id; dedupe on action+timestamp.
  const intentKey = (i) => `${i.action}|${new Date(i.timestamp).getTime()}`;
  const intentMap = new Map();
  for (const i of toArray(localIntents)) { if (i?.timestamp) intentMap.set(intentKey(i), i); }
  for (const i of serverIntents) { if (i?.timestamp && !intentMap.has(intentKey(i))) intentMap.set(intentKey(i), i); }
  const mergedIntents = Array.from(intentMap.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  let newestIntent = lastIntentSync || null;
  for (const r of intentRows) newestIntent = maxIso(newestIntent, r.timestamp);

  // 3. FOCUS ITEMS → focusEngine.items / .history
  const focusRows = await fetchTable(supabase, 'focus_items', profileId);
  const serverFocus = focusRows.map(serverFocusToLocal);
  const engine = (await getFocusEngine()) || { activeFocusId: null, items: {}, history: [] };
  const items = { ...(engine.items || {}) };
  const history = toArray(engine.history).slice();
  const historyIdx = new Map();
  history.forEach((h, i) => { if (h?.id) historyIdx.set(h.id, i); });

  // Newest-wins merge of cloud focus rows (mirrors mergeById for clock rows).
  // Each id lives in exactly one place — active `items` or completed `history`.
  // A cloud row only overwrites a local entry when it is >= the local ref time,
  // so newer local metadata is never clobbered; ids are never duplicated.
  for (const f of serverFocus) {
    if (!f?.id) continue;
    const isCompleted = f.focusState === 'completed' || !!f.completedAt;
    const localItem = items[f.id];
    const histPos = historyIdx.has(f.id) ? historyIdx.get(f.id) : -1;
    const localEntry = localItem || (histPos >= 0 ? history[histPos] : null);

    if (!localEntry) {
      // Brand new id → land it in the right bucket.
      if (isCompleted) { history.push(f); historyIdx.set(f.id, history.length - 1); }
      else items[f.id] = f;
      continue;
    }

    // Existing id → only apply if the cloud row is at least as new.
    if (focusRefTime(f) < focusRefTime(localEntry)) continue;
    const merged = { ...localEntry, ...f };

    if (isCompleted) {
      // Ensure it ends up in history (and not duplicated in items).
      if (localItem) delete items[f.id];
      if (histPos >= 0) history[histPos] = merged;
      else { history.push(merged); historyIdx.set(f.id, history.length - 1); }
    } else if (localItem) {
      items[f.id] = merged;
    } else {
      // Cloud says still-active but it currently lives in history; keep it in
      // history to avoid resurrecting a completed focus as active.
      history[histPos] = merged;
    }
  }
  const mergedEngine = { ...engine, items, history };

  // 4. Persist everything + the watermarks (so the next push finds 0 new) +
  //    the per-profile rehydrate watermark.
  const patch = {
    clockHistory: mergedClock,
    intentHistory: mergedIntents,
    _dataRehydratedAt: { [profileId]: new Date().toISOString() },
  };
  if (newestClock) patch.lastClockSync = newestClock;
  if (newestIntent) patch.lastIntentSync = newestIntent;
  // Merge the per-profile watermark map rather than clobber other profiles.
  const { _dataRehydratedAt: existingMark } = await getStorage('_dataRehydratedAt');
  patch._dataRehydratedAt = { ...(existingMark && typeof existingMark === 'object' ? existingMark : {}), [profileId]: new Date().toISOString() };

  await setFocusEngine(mergedEngine);
  await setStorage(patch);

  return { clock: serverClock.length, intent: serverIntents.length, focus: serverFocus.length };
}

export async function isRehydrateNeeded(profileId) {
  if (!profileId) return false;
  const { _dataRehydratedAt } = await getStorage('_dataRehydratedAt');
  if (!_dataRehydratedAt || typeof _dataRehydratedAt !== 'object') return true;
  return !_dataRehydratedAt[profileId];
}

export async function clearRehydrateWatermark() {
  await chrome.storage.local.remove('_dataRehydratedAt');
}
