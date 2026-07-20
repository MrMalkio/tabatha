// ============================================================
// Tabatha — Focus + Clock Live Ingest Service (feat/ext-live-ingest, v6.7.45)
//
// Closes the one-way sync gap: the extension previously only PUSHED to the
// cloud and rehydrated once per install, so intents created/switched (and
// clock-ins) on the Sidecar — or another browser install — never reached a
// running extension until a fresh sign-in/rehydrate. This service PULLS
// focus_items + browser_profile_status on a short cadence (60s alarm) AND
// right after every push cycle (syncService.syncToSupabase calls
// runLiveIngestAfterPush at the end), reconciles known rows, creates unknown
// ones, and arbitrates account-wide "what's current" for both focus and
// clock — mirroring the Sidecar's own arbitration rules (sidecar/src/data/
// focus.ts, clock.ts) so every surface converges on the same answer.
//
// Ingest performs LOCAL STORE WRITES ONLY. It never writes to Supabase
// directly. Any propagation back to the cloud (e.g. pausing the item that
// lost arbitration) rides the EXISTING debounced push path
// (focusService.setFocusEngine → injectedDeps.triggerSync — configured in
// background.js), not a write from this module.
//
// Pure comparator/reconcile rules live in src/utils/liveIngestArbitration.js
// (unit tested in test/liveIngestArbitration.test.js) — this module is the
// thin I/O shell around them.
// ============================================================

import { getStorage, setStorage } from './storageService.js';
import { getFocusEngine, setFocusEngine, pauseItem, adoptRemoteActive } from './focusService.js';
import { applyRemoteClockState } from './clockService.js';
import { broadcastAll } from './notificationService.js';
import { serverFocusToLocal } from './dataRehydrate.js';
import { getInstallIdentity } from '../../services/installIdentity.js';
import {
  localItemStartedAtMs,
  pickLatestActive,
  shouldAdoptFocus,
  reconcileKnownFocusRow,
  deriveLocalClockEvent,
  pickLatestClockCandidate,
  shouldAdoptClock
} from '../../utils/liveIngestArbitration.js';

let deps = {};

export const FOCUS_LIVE_INGEST_ALARM = 'focus-live-ingest';
const INGEST_PERIOD_MINUTES = 1; // 60s cadence per design

export function configureFocusIngestService(injected = {}) {
  deps = { ...deps, ...injected };
}

export function registerFocusIngestAlarm() {
  chrome.alarms.create(FOCUS_LIVE_INGEST_ALARM, { periodInMinutes: INGEST_PERIOD_MINUTES });
}

async function recordDebugLine(text) {
  try {
    const { tabathaLogs } = await getStorage('tabathaLogs');
    const logs = tabathaLogs || [];
    logs.push({ type: 'live_ingest', text, ts: new Date().toISOString() });
    await setStorage({ tabathaLogs: logs.slice(-500) });
  } catch { /* debug logging is best-effort */ }
}

// Resolve profile_id + this install's own browser_profile_id without
// depending on syncService having run first this cycle (mirrors
// awarenessService.resolveActiveIdentity — the alarm-triggered cadence has
// to stand alone, unlike the post-push trigger which already has scope).
async function resolveIngestScope(supabase) {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data: profile } = await supabase
      .schema('tabatha')
      .from('profiles')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (!profile?.id) return null;
    const identity = await getInstallIdentity();
    if (!identity?.supabaseId) return null; // browser_profiles row not created yet
    return { profileId: profile.id, selfBrowserProfileId: identity.supabaseId };
  } catch {
    return null;
  }
}

// Alarm-driven entrypoint (routed from alarmService).
export async function handleFocusLiveIngestAlarm() {
  const supabase = deps.supabase;
  const scope = await resolveIngestScope(supabase);
  if (!scope) return null;
  return runLiveIngest({ supabase, ...scope });
}

// Post-push entrypoint — syncService already resolved profileId/
// browserProfileId this cycle; reuse them instead of a second auth/profile
// round-trip. Called at the tail of syncToSupabase() on every push cycle.
export async function runLiveIngestAfterPush({ supabase, profileId, browserProfileId }) {
  if (!supabase || !profileId || !browserProfileId) return null;
  return runLiveIngest({ supabase, profileId, selfBrowserProfileId: browserProfileId });
}

// ── Focus pull ──

// Seeds `lastFocusPull` to "now" (skipping the first full-table pull) when
// dataRehydrate.rehydrateUserData has ALREADY done the equivalent full pull
// for this profile this install — otherwise a fresh sign-in would fetch the
// entire focus_items table twice back-to-back (once via rehydrate, once via
// this module's first ingest cycle).
async function seedWatermarkIfAlreadyRehydrated(profileId) {
  const { _dataRehydratedAt } = await getStorage('_dataRehydratedAt');
  if (_dataRehydratedAt?.[profileId]) {
    const now = new Date().toISOString();
    await setStorage({ lastFocusPull: now });
    return now;
  }
  return null;
}

async function pullFocusRows(supabase, profileId) {
  let { lastFocusPull } = await getStorage('lastFocusPull');
  if (!lastFocusPull) {
    lastFocusPull = await seedWatermarkIfAlreadyRehydrated(profileId);
  }

  // New-row query: full shape (matches serverFocusToLocal's needs),
  // watermarked on created_at — there's no updated_at column to watermark
  // state changes, which is exactly what the light sweep below is for.
  const newRowsQuery = supabase
    .schema('tabatha')
    .from('focus_items')
    .select('client_id, label, funnel_stage, focus_state, timer_minutes, tags, created_at, completed_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true });
  const { data: newRows, error: newRowsError } = lastFocusPull
    ? await newRowsQuery.gt('created_at', lastFocusPull)
    : await newRowsQuery;

  // Light sweep: catches state changes (pause/resume/switch/backburner) on
  // rows this install already knows about, which created_at can never
  // watermark since it never changes on UPDATE. Small, deliberate payload —
  // focus_state + tags only, no label/timer/created_at.
  const { data: sweepRows, error: sweepError } = await supabase
    .schema('tabatha')
    .from('focus_items')
    .select('client_id, focus_state, tags')
    .eq('profile_id', profileId)
    .neq('focus_state', 'completed');

  return {
    newRows: newRowsError ? [] : (newRows || []),
    sweepRows: sweepError ? [] : (sweepRows || []),
    error: newRowsError || sweepError || null
  };
}

async function pullClockCandidates(supabase, profileId, selfBrowserProfileId) {
  const { data, error } = await supabase
    .schema('tabatha')
    .from('browser_profile_status')
    .select('browser_profile_id, clock_state, clocked_in_at, on_break_since, last_clock_event_at')
    .eq('profile_id', profileId);
  if (error) return [];
  return (data || []).filter(r => r.browser_profile_id !== selfBrowserProfileId);
}

function activeCandidatesFromEngine(engine) {
  const out = [];
  for (const item of Object.values(engine.items || {})) {
    if (item?.focusState === 'active') {
      out.push({ id: item.id, ms: localItemStartedAtMs(item) });
    }
  }
  return out;
}

function findLocalFocus(engine, clientId) {
  if (engine.items[clientId]) return { item: engine.items[clientId], bucket: 'items' };
  const idx = engine.history.findIndex(h => h?.id === clientId);
  if (idx >= 0) return { item: engine.history[idx], bucket: 'history', idx };
  return null;
}

function applyReconciled(engine, clientId, found, item) {
  if (found.bucket === 'items') engine.items[clientId] = item;
  else engine.history[found.idx] = item;
}

export async function runLiveIngest({ supabase, profileId, selfBrowserProfileId }) {
  if (!supabase || !profileId) return { skipped: true };

  const result = { created: 0, reconciled: 0, adoptedFocus: null, adoptedClock: null };

  // ── Focus: pull ──
  const { newRows, sweepRows, error: pullError } = await pullFocusRows(supabase, profileId);
  if (pullError) return { ...result, error: pullError };

  const engine = await getFocusEngine();
  let mutated = false;
  let newestCreatedAt = null;

  // ── Focus: create-unknown / reconcile-known (new-row query) ──
  for (const row of newRows) {
    if (!row?.client_id) continue;
    if (!newestCreatedAt || new Date(row.created_at) > new Date(newestCreatedAt)) {
      newestCreatedAt = row.created_at;
    }

    const found = findLocalFocus(engine, row.client_id);
    if (!found) {
      // Brand new id this install has never seen — create it via the SAME
      // mapper the one-time rehydrate uses, so it renders identically
      // regardless of which path introduced it.
      const mapped = serverFocusToLocal(row);
      const isCompleted = mapped.focusState === 'completed' || !!mapped.completedAt;
      if (isCompleted) engine.history.unshift(mapped);
      else engine.items[mapped.id] = mapped;
      result.created++;
      mutated = true;
      continue;
    }

    const { item, changed } = reconcileKnownFocusRow({ localItem: found.item, row });
    if (changed) {
      applyReconciled(engine, row.client_id, found, item);
      result.reconciled++;
      mutated = true;
    }
  }

  // ── Focus: reconcile-known (light sweep — state-change catch-all) ──
  for (const row of sweepRows) {
    if (!row?.client_id) continue;
    const found = findLocalFocus(engine, row.client_id);
    if (!found) continue; // light sweep never creates — the new-row query's job
    const { item, changed } = reconcileKnownFocusRow({ localItem: found.item, row });
    if (changed) {
      applyReconciled(engine, row.client_id, found, item);
      result.reconciled++;
      mutated = true;
    }
  }

  // ── Focus: account-wide arbitration ──
  // Candidates = every locally 'active' item post-reconcile (normally just
  // engine.activeFocusId, but a sidecar-sourced reconcile above can flip a
  // DIFFERENT item to focusState 'active' too — arbitration must collapse
  // ALL of them to one, not just compare against the current pointer).
  const candidates = activeCandidatesFromEngine(engine);
  const currentId = engine.activeFocusId;
  const currentMs = currentId && engine.items[currentId]
    ? localItemStartedAtMs(engine.items[currentId])
    : -Infinity;
  const latest = pickLatestActive(candidates);

  if (latest && shouldAdoptFocus({ currentId, currentMs, latestId: latest.id, latestMs: latest.ms })) {
    for (const item of Object.values(engine.items)) {
      if (item.id !== latest.id && item.focusState === 'active') {
        pauseItem(item, 'remote-adopt', engine);
      }
    }
    const winner = engine.items[latest.id];
    const remoteStartedAtIso = winner?.tags?._startedAt || new Date(latest.ms).toISOString();
    adoptRemoteActive(winner, engine, remoteStartedAtIso);
    mutated = true;
    result.adoptedFocus = { id: latest.id, label: winner?.label || null, startedAt: remoteStartedAtIso };
    await recordDebugLine(`[live-ingest] adopted remote current focus "${winner?.label || latest.id}" (started ${remoteStartedAtIso})`);
  }

  if (mutated) {
    await setFocusEngine(engine);
    broadcastAll({ type: 'FOCUS_ENGINE_UPDATED' });
  }
  if (newestCreatedAt) await setStorage({ lastFocusPull: newestCreatedAt });

  // ── Clock: pull + arbitrate ──
  if (selfBrowserProfileId) {
    const clockCandidates = await pullClockCandidates(supabase, profileId, selfBrowserProfileId);
    const { clockSession } = await getStorage('clockSession');
    const localEvt = deriveLocalClockEvent(clockSession);
    const remoteWinner = pickLatestClockCandidate(clockCandidates);

    if (shouldAdoptClock({ local: localEvt, remote: remoteWinner })) {
      await applyRemoteClockState(remoteWinner);
      result.adoptedClock = {
        browserProfileId: remoteWinner.browser_profile_id,
        state: remoteWinner.clock_state,
        at: remoteWinner.last_clock_event_at
      };
      await recordDebugLine(`[live-ingest] adopted remote clock state "${remoteWinner.clock_state}" from install ${remoteWinner.browser_profile_id} (event at ${remoteWinner.last_clock_event_at})`);
    }
  }

  return result;
}

// alarmService dispatches by exact alarm name; this module doesn't handle
// runtime messages of its own.
export async function handleMessage() {
  return undefined;
}
