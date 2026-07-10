// ============================================================
// Tabatha — Awareness Service (Phase C: cross-profile coordination)
//
// Each install owns one row in tabatha.browser_profile_status. We upsert
// on every clock/focus state change and refresh last_heartbeat_at on a
// 60s tick while the SW is alive. Other installs of the same user
// subscribe via Supabase Realtime and cache the result in
// chrome.storage.local under `_otherProfiles` so React surfaces can
// render awareness chips reactively via useChromeStorage.
//
// This service is push-AND-pull, unlike syncService which is push-only.
// The pull is bounded — we only mirror the small status rows of OTHER
// installs into a tiny local cache. Detailed data (focus_items,
// clock_sessions, …) still does not get pulled by this service.
// ============================================================

import { getStorage, setStorage } from './storageService.js';
import { getInstallIdentity } from '../../services/installIdentity.js';
import {
  reconstructStintFromStatus,
  resolveAttributionTarget,
  classifyInstallForCleanup,
  isOwnAbandonedStint
} from '../../utils/stintReconciliation.js';

let deps = {};
let realtimeChannel = null;
let heartbeatTimer = null;
let lastPayload = null;
// Plan 036: this profile's Chrome idle verdict, published in the status row's
// metadata so OTHER profiles can tell whether we are truly active. Stored in
// metadata (jsonb) to avoid a schema migration.
let localIdleState = 'active'; // 'active' | 'idle' | 'locked'
let activeProfileId = null;
let activeBrowserProfileId = null;
let storageListenerRegistered = false;
let pendingPushTimer = null;
let lastHandledClockOutReq = null;

const HEARTBEAT_INTERVAL_MS = 60_000;
const PUSH_DEBOUNCE_MS = 500;
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes since last heartbeat → offline
const OTHER_PROFILES_KEY = '_otherProfiles';
// FIX-10: cap how many queue items we surface per OTHER device so a busy
// sibling can't flood the awareness strip. This is a BOUNDED READ path — a
// lazy, on-demand pull (GET_OTHER_QUEUE), NOT another background sync.
const OTHER_QUEUE_CAP_PER_DEVICE = 8;
const NON_QUEUE_FOCUS_STATES = new Set(['completed']);
const WATCHED_STORAGE_KEYS = new Set(['clockSession', 'focusEngine']);

export function configureAwarenessService(injected = {}) {
  deps = { ...deps, ...injected };
}

// Test-only: seed the active identity that startAwareness would normally
// resolve from the Supabase session, so message handlers can be exercised in
// isolation without a full auth/identity mock. No-op semantics in production.
export function __setActiveForTest({ profileId = null, browserProfileId = null } = {}) {
  activeProfileId = profileId;
  activeBrowserProfileId = browserProfileId;
}

// Public: read auth + identity, push current state, ensure realtime is
// subscribed. Called from background.js on startup and after sign-in.
export async function startAwareness() {
  const supabase = deps.supabase;
  if (!supabase) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      await stopAwareness({ markOffline: false });
      return;
    }

    const { data: profile, error: profErr } = await supabase
      .schema('tabatha')
      .from('profiles')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (profErr || !profile?.id) return;

    const identity = await getInstallIdentity();
    if (!identity?.supabaseId) {
      // browser_profiles row hasn't been created yet — syncService will do
      // it on first sync. Awareness can start on the next call.
      return;
    }

    activeProfileId = profile.id;
    activeBrowserProfileId = identity.supabaseId;

    // Initial push + heartbeat tick + storage listener for state-change pings
    await pushHeartbeat({ online: true });
    startHeartbeatLoop();
    registerStorageListener();
    await subscribeToOtherProfiles(supabase, profile.id, identity.supabaseId);
  } catch {
    // Best-effort. Sync diagnostics already cover the failure modes that
    // matter (auth, profile lookup). Awareness is a UX nicety — don't
    // pollute the diagnostic log with retries.
  }
}

export async function stopAwareness({ markOffline = true } = {}) {
  stopHeartbeatLoop();
  if (realtimeChannel) {
    try { await realtimeChannel.unsubscribe(); } catch { /* ignore */ }
    realtimeChannel = null;
  }
  if (markOffline && activeBrowserProfileId && deps.supabase) {
    try {
      await deps.supabase
        .schema('tabatha')
        .from('browser_profile_status')
        .update({ online: false, last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('browser_profile_id', activeBrowserProfileId);
    } catch { /* ignore */ }
  }
  activeProfileId = null;
  activeBrowserProfileId = null;
}

// Build a status payload from current chrome.storage.local state. Pure
// (no side-effects) so callers can diff and skip no-op pushes.
async function buildStatusPayload({ online }) {
  const { clockSession, focusEngine } = await getStorage(['clockSession', 'focusEngine']);
  const now = new Date().toISOString();

  let clock_state = null;
  let clocked_in_at = null;
  let on_break_since = null;
  let last_clock_event_at = null;
  if (clockSession?.active) {
    clock_state = clockSession.onBreak ? 'on_break' : 'clocked_in';
    clocked_in_at = clockSession.clockedInAt || null;
    on_break_since = clockSession.onBreak ? (clockSession.breakStartedAt || null) : null;
    last_clock_event_at = clockSession.breakStartedAt || clockSession.clockedInAt || null;
  } else if (clockSession?.clockedOutAt) {
    clock_state = 'clocked_out';
    last_clock_event_at = clockSession.clockedOutAt;
  }

  let focus_state = null;
  let active_focus_id = null;
  let active_focus_label = null;
  let focus_started_at = null;
  let focus_timer_minutes = null;
  let focus_elapsed_ms = null;
  let focus_timer_ends_at = null;
  const af = focusEngine?.activeFocusId ? focusEngine.items?.[focusEngine.activeFocusId] : null;
  if (af) {
    focus_state = af.focusState || 'active';
    active_focus_id = af.id || null;
    active_focus_label = af.label || null;
    focus_started_at = af.startedAt || af.createdAt || null;
    focus_timer_minutes = Number.isFinite(Number(af.timerMinutes)) ? Number(af.timerMinutes) : null;
    focus_elapsed_ms = Number.isFinite(Number(af.elapsedMs)) ? Number(af.elapsedMs) : 0;
    // Predict expiry from elapsed + lastResumedAt
    if (focus_timer_minutes != null) {
      const targetMs = focus_timer_minutes * 60_000;
      const remainMs = af.focusState === 'paused' || !af.lastResumedAt
        ? Math.max(0, targetMs - (focus_elapsed_ms || 0))
        : Math.max(0, targetMs - ((focus_elapsed_ms || 0) + (Date.now() - new Date(af.lastResumedAt).getTime())));
      focus_timer_ends_at = new Date(Date.now() + remainMs).toISOString();
    }
  }

  return {
    browser_profile_id: activeBrowserProfileId,
    profile_id: activeProfileId,
    online: !!online,
    last_heartbeat_at: now,
    clock_state,
    clocked_in_at,
    on_break_since,
    last_clock_event_at,
    focus_state,
    active_focus_id,
    active_focus_label,
    focus_started_at,
    focus_timer_minutes,
    focus_elapsed_ms,
    focus_timer_ends_at,
    metadata: { idle_state: localIdleState },
    updated_at: now
  };
}

function shallowEqualMostFields(a, b) {
  if (!a || !b) return false;
  const keys = ['online', 'clock_state', 'clocked_in_at', 'on_break_since',
    'focus_state', 'active_focus_id', 'active_focus_label', 'focus_started_at',
    'focus_timer_minutes', 'focus_elapsed_ms'];
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  // Plan 036: idle_state lives in metadata — a change here must force a full
  // upsert (the heartbeat-only refresh path doesn't touch metadata).
  if ((a.metadata?.idle_state ?? null) !== (b.metadata?.idle_state ?? null)) return false;
  return true;
}

async function pushHeartbeat({ online }) {
  const supabase = deps.supabase;
  if (!supabase || !activeBrowserProfileId) return;

  const payload = await buildStatusPayload({ online });
  if (shallowEqualMostFields(payload, lastPayload)) {
    // Refresh only last_heartbeat_at to keep the row fresh without
    // bumping updated_at noticeably.
    const { error } = await supabase
      .schema('tabatha')
      .from('browser_profile_status')
      .update({ last_heartbeat_at: payload.last_heartbeat_at, online: payload.online })
      .eq('browser_profile_id', activeBrowserProfileId);
    if (!error) lastPayload = payload;
    return;
  }

  const { error } = await supabase
    .schema('tabatha')
    .from('browser_profile_status')
    .upsert(payload, { onConflict: 'browser_profile_id' });
  if (!error) lastPayload = payload;
}

function startHeartbeatLoop() {
  stopHeartbeatLoop();
  heartbeatTimer = setInterval(() => {
    pushHeartbeat({ online: true });
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatLoop() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function registerStorageListener() {
  if (storageListenerRegistered) return;
  storageListenerRegistered = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (Object.keys(changes || {}).some(key => WATCHED_STORAGE_KEYS.has(key))) {
      schedulePush();
    }
  });
}

function schedulePush() {
  if (pendingPushTimer) clearTimeout(pendingPushTimer);
  pendingPushTimer = setTimeout(() => {
    pendingPushTimer = null;
    pushHeartbeat({ online: true });
  }, PUSH_DEBOUNCE_MS);
}

// Public: explicit poke for callers that mutate without touching the
// watched storage keys (rare). Storage onChanged covers the common path.
export async function notifyStateChange() {
  schedulePush();
}

// Plan 036: update this profile's Chrome idle verdict and propagate it to the
// status row so other profiles can suppress their own idle pausing while we
// are still active. Idempotent — a no-op state change won't force a push.
export async function setLocalIdleState(state) {
  const next = (state === 'idle' || state === 'locked') ? state : 'active';
  if (next === localIdleState) return;
  localIdleState = next;
  schedulePush();
}

export function getLocalIdleState() {
  return localIdleState;
}

// Cache the merged list of other-install statuses under chrome.storage
// so the React hook stays reactive. Includes only OTHER installs (not
// this one). Marks rows as stale if last_heartbeat_at older than 5m.
async function rebuildOtherProfilesCache(supabase, profileId, selfBrowserProfileId) {
  try {
    const { data: statuses } = await supabase
      .schema('tabatha')
      .from('browser_profile_status')
      .select('*')
      .eq('profile_id', profileId);
    const { data: meta } = await supabase
      .schema('tabatha')
      .from('browser_profiles')
      .select('id, browser, profile_name, classification, machine_id')
      .eq('profile_id', profileId);

    const metaById = new Map((meta || []).map(m => [m.id, m]));
    const now = Date.now();
    const rows = (statuses || [])
      .filter(s => s.browser_profile_id !== selfBrowserProfileId)
      .map(s => {
        const m = metaById.get(s.browser_profile_id) || {};
        const lastBeatMs = s.last_heartbeat_at ? new Date(s.last_heartbeat_at).getTime() : 0;
        const stale = now - lastBeatMs > OFFLINE_THRESHOLD_MS;
        return {
          browser_profile_id: s.browser_profile_id,
          profile_name: m.profile_name || null,
          browser: m.browser || 'chrome',
          classification: m.classification || null,
          machine_id: m.machine_id || null,
          online: !!s.online && !stale,
          stale,
          last_heartbeat_at: s.last_heartbeat_at,
          idle_state: s.metadata?.idle_state || null,
          clock_state: s.clock_state,
          clocked_in_at: s.clocked_in_at,
          on_break_since: s.on_break_since,
          focus_state: s.focus_state,
          active_focus_label: s.active_focus_label,
          focus_timer_ends_at: s.focus_timer_ends_at,
          focus_started_at: s.focus_started_at,
          focus_timer_minutes: s.focus_timer_minutes
        };
      });

    await setStorage({ [OTHER_PROFILES_KEY]: rows });
  } catch {
    // Cache rebuild is best-effort.
  }
}

async function subscribeToOtherProfiles(supabase, profileId, selfBrowserProfileId) {
  // Initial fetch
  await rebuildOtherProfilesCache(supabase, profileId, selfBrowserProfileId);

  // Tear down any previous subscription before re-arming
  if (realtimeChannel) {
    try { await realtimeChannel.unsubscribe(); } catch { /* ignore */ }
    realtimeChannel = null;
  }

  realtimeChannel = supabase
    .channel(`bps_${profileId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'tabatha', table: 'browser_profile_status', filter: `profile_id=eq.${profileId}` },
      (payload) => { handleRealtimeChange(payload, supabase, profileId, selfBrowserProfileId); }
    )
    .subscribe();
}

// Realtime fan-in. Rebuilds the others-cache on any change, and — if the
// changed row is THIS install's — acts on a clock-out command another install
// wrote into our metadata (the live-install path of CLOCK_OUT_INSTALL).
async function handleRealtimeChange(payload, supabase, profileId, selfId) {
  rebuildOtherProfilesCache(supabase, profileId, selfId);
  try {
    const row = payload?.new;
    if (!row || row.browser_profile_id !== selfId) return;
    const req = row.metadata?.clock_out_requested_at;
    if (req && req !== lastHandledClockOutReq) {
      lastHandledClockOutReq = req;
      // clockOut() is a no-op if we're not clocked in, so this is safe.
      if (deps.requestClockOut) await deps.requestClockOut();
    }
  } catch { /* best-effort */ }
}

// Read all installs for this user, enriched with browser_profiles meta and a
// computed stale/online flag. Shared by LIST_LIVE_STINTS and clock-out.
async function fetchInstalls(supabase, profileId, selfId) {
  const { data: statuses } = await supabase
    .schema('tabatha')
    .from('browser_profile_status')
    .select('*')
    .eq('profile_id', profileId);
  const { data: meta } = await supabase
    .schema('tabatha')
    .from('browser_profiles')
    .select('id, browser, profile_name, classification, machine_id')
    .eq('profile_id', profileId);

  const metaById = new Map((meta || []).map(m => [m.id, m]));
  const now = Date.now();
  return (statuses || []).map(s => {
    const m = metaById.get(s.browser_profile_id) || {};
    const lastBeatMs = s.last_heartbeat_at ? new Date(s.last_heartbeat_at).getTime() : 0;
    const stale = now - lastBeatMs > OFFLINE_THRESHOLD_MS;
    return {
      ...s,
      profile_name: m.profile_name || null,
      browser: m.browser || 'chrome',
      classification: m.classification || null,
      machine_id: m.machine_id || null,
      online: !!s.online && !stale,
      stale,
      is_self: s.browser_profile_id === selfId
    };
  });
}

// NB-05: return the ACTIVE install's OWN abandoned same-class stints — installs
// left clocked in/on-break that have gone stale without a proper clock-out.
// Used by the headless auto-clock-in path (clockService.maybeAutoClockIn) to
// decide whether to suppress silent clock-in and notify instead. Returns [] when
// awareness isn't ready (no supabase / not signed in), so callers stay safe.
export async function getOwnAbandonedStints() {
  if (!deps.supabase || !activeProfileId) return [];
  try {
    const identity = await getInstallIdentity();
    const selfClassification = identity?.classification || 'professional';
    const installs = await fetchInstalls(deps.supabase, activeProfileId, activeBrowserProfileId);
    return installs.filter(i => isOwnAbandonedStint(i, selfClassification));
  } catch {
    return [];
  }
}

// FIX-10 — pure shaper (exported for tests). Takes raw focus_items rows and
// browser_profiles meta and produces a read-only, per-device grouped queue:
//   [{ browser_profile_id, profile_name, browser, classification, machine_id,
//      count, truncated, items: [{ client_id, label, funnel_stage, focus_state,
//      priority, timer_minutes, created_at }] }]
// Filters out this install's own rows and completed items, orders each device's
// items by priority (nulls last) then recency, and caps to `cap` per device.
export function shapeOtherQueues(focusRows, metaRows, selfBrowserProfileId, cap = OTHER_QUEUE_CAP_PER_DEVICE) {
  const metaById = new Map((metaRows || []).map(m => [m.id, m]));
  const byDevice = new Map();

  for (const row of focusRows || []) {
    const bpid = row?.browser_profile_id;
    // Only OTHER installs, and only rows attributable to a device.
    if (!bpid || bpid === selfBrowserProfileId) continue;
    // Read-only intent QUEUE: exclude completed/resolved items.
    if (NON_QUEUE_FOCUS_STATES.has(row.focus_state)) continue;
    if (!byDevice.has(bpid)) byDevice.set(bpid, []);
    byDevice.get(bpid).push(row);
  }

  const prio = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? Number.POSITIVE_INFINITY : Number(v));
  const ts = v => { const t = v ? new Date(v).getTime() : 0; return Number.isFinite(t) ? t : 0; };

  const devices = [];
  for (const [bpid, rows] of byDevice) {
    rows.sort((a, b) => (prio(a.priority) - prio(b.priority)) || (ts(b.created_at) - ts(a.created_at)));
    const total = rows.length;
    const capped = rows.slice(0, Math.max(0, cap));
    const m = metaById.get(bpid) || {};
    devices.push({
      browser_profile_id: bpid,
      profile_name: m.profile_name || null,
      browser: m.browser || 'chrome',
      classification: m.classification || null,
      machine_id: m.machine_id || null,
      count: total,
      truncated: total > capped.length,
      items: capped.map(r => ({
        client_id: r.client_id,
        label: r.label || 'Untitled focus',
        funnel_stage: r.funnel_stage || null,
        focus_state: r.focus_state || null,
        priority: (r.priority == null || r.priority === '' || !Number.isFinite(Number(r.priority))) ? null : Number(r.priority),
        timer_minutes: (r.timer_minutes == null || !Number.isFinite(Number(r.timer_minutes))) ? null : Number(r.timer_minutes),
        created_at: r.created_at || null
      }))
    });
  }
  return devices;
}

// FIX-10 — bounded READ path (lazy, on demand). Pulls this user's own
// focus_items (RLS scopes to own profile) plus browser_profiles meta, then
// hands them to shapeOtherQueues to produce per-OTHER-device read-only queues.
// This does NOT write anything and does NOT run on the heartbeat loop.
async function fetchOtherQueues(supabase, profileId, selfBrowserProfileId) {
  const { data: focusRows } = await supabase
    .schema('tabatha')
    .from('focus_items')
    .select('client_id, label, funnel_stage, focus_state, priority, timer_minutes, created_at, browser_profile_id')
    .eq('profile_id', profileId);
  const { data: meta } = await supabase
    .schema('tabatha')
    .from('browser_profiles')
    .select('id, browser, profile_name, classification, machine_id')
    .eq('profile_id', profileId);

  return shapeOtherQueues(focusRows || [], meta || [], selfBrowserProfileId);
}

async function getClockScope(supabase, profileId) {
  const { data } = await supabase
    .schema('tabatha')
    .from('profiles')
    .select('default_org_id, default_team_id')
    .eq('id', profileId)
    .maybeSingle();
  return { org_id: data?.default_org_id || null, team_id: data?.default_team_id || null };
}

// Clock out a single install. Three paths:
//   - self        → run our own local clock-out
//   - live other  → write a command into its row; it self-clocks-out
//   - dead orphan → reconstruct its final stint, attribute it to a real
//                   profile, write it to clock_sessions, delete the row
async function clockOutInstall(supabase, profileId, browserProfileId, endTime) {
  if (browserProfileId === activeBrowserProfileId) {
    if (deps.requestClockOut) await deps.requestClockOut();
    return { success: true, mode: 'local' };
  }

  const installs = await fetchInstalls(supabase, profileId, activeBrowserProfileId);
  const target = installs.find(i => i.browser_profile_id === browserProfileId);
  if (!target) return { error: 'install_not_found' };

  if (target.online && !target.stale) {
    const metadata = { ...(target.metadata || {}), clock_out_requested_at: new Date().toISOString() };
    const { error } = await supabase
      .schema('tabatha')
      .from('browser_profile_status')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('browser_profile_id', browserProfileId);
    if (error) return { error: error.message };
    return { success: true, mode: 'remote' };
  }

  // Dead orphan — reconstruct + attribute.
  const reals = installs
    .filter(i => !i.stale && i.browser_profile_id !== browserProfileId)
    .map(i => ({ browser_profile_id: i.browser_profile_id, classification: i.classification, machine_id: i.machine_id }));
  const attributedTo = resolveAttributionTarget(
    { browser_profile_id: browserProfileId, classification: target.classification, machine_id: target.machine_id },
    reals
  );
  const stint = reconstructStintFromStatus(target, endTime);
  const scope = await getClockScope(supabase, profileId);

  const { error: insErr } = await supabase
    .schema('tabatha')
    .from('clock_sessions')
    .upsert({
      profile_id: profileId,
      org_id: scope.org_id,
      team_id: scope.team_id,
      browser_profile_id: attributedTo,
      client_id: `reconstructed:${browserProfileId}:${stint.clocked_in_at}`,
      ...stint,
      source: 'reconstructed',
      synced_at: new Date().toISOString()
    }, { onConflict: 'profile_id,client_id' });
  if (insErr) return { error: insErr.message };

  // The stint is now preserved in clock_sessions, so the frozen presence row
  // (clock AND focus state) is meaningless — delete it so its chip disappears
  // from the awareness strip entirely rather than lingering dimmed.
  const delErr = await deleteStatusRow(supabase, browserProfileId);
  if (delErr) return { error: delErr.message };

  return { success: true, mode: 'reconstructed', attributedTo, stint };
}

// Delete a sibling's presence row (RLS allows own-profile delete). Used for
// reconciled orphans and for dismissing focus-only ghosts.
async function deleteStatusRow(supabase, browserProfileId) {
  const { error } = await supabase
    .schema('tabatha')
    .from('browser_profile_status')
    .delete()
    .eq('browser_profile_id', browserProfileId);
  return error || null;
}

// Dismiss a stale install that has no open shift (focus-only ghost, or a
// clocked-out row that's gone offline) — nothing to reconstruct, just clear
// the stale presence row. Guarded so we never delete a live or self row.
async function dismissInstall(supabase, profileId, browserProfileId) {
  if (browserProfileId === activeBrowserProfileId) return { error: 'cannot_dismiss_self' };
  const installs = await fetchInstalls(supabase, profileId, activeBrowserProfileId);
  const target = installs.find(i => i.browser_profile_id === browserProfileId);
  if (!target) return { error: 'install_not_found' };
  if (!target.stale) return { error: 'install_is_live' };
  const err = await deleteStatusRow(supabase, browserProfileId);
  if (err) return { error: err.message };
  await rebuildOtherProfilesCache(supabase, profileId, activeBrowserProfileId);
  return { success: true, mode: 'dismissed' };
}

// Sweep every offline (stale) sibling: reconcile the ones still holding an
// open shift (reconstruct a stint ending at their last heartbeat), and dismiss
// the rest (focus-only ghosts, clocked-out rows). Self and live installs are
// left untouched. This is what makes the awareness strip clean itself up.
async function clearAllOffline(supabase, profileId) {
  const installs = await fetchInstalls(supabase, profileId, activeBrowserProfileId);
  let reconciled = 0;
  let dismissed = 0;
  for (const i of installs) {
    const verdict = classifyInstallForCleanup(i, activeBrowserProfileId);
    if (verdict === 'reconcile') {
      const res = await clockOutInstall(supabase, profileId, i.browser_profile_id, i.last_heartbeat_at);
      if (res?.success) reconciled++;
    } else if (verdict === 'dismiss') {
      const err = await deleteStatusRow(supabase, i.browser_profile_id);
      if (!err) dismissed++;
    }
  }
  await rebuildOtherProfilesCache(supabase, profileId, activeBrowserProfileId);
  return { success: true, reconciled, dismissed, count: reconciled + dismissed };
}

// Public message handlers (wired into the service router).
export async function handleMessage(type, message) {
  switch (type) {
    case 'AWARENESS_START':
      await startAwareness();
      return { success: true };
    case 'AWARENESS_PING':
      await notifyStateChange();
      return { success: true };
    case 'AWARENESS_STOP':
      await stopAwareness({ markOffline: true });
      return { success: true };
    case 'LIST_LIVE_STINTS': {
      if (!deps.supabase || !activeProfileId) return { installs: [] };
      const installs = await fetchInstalls(deps.supabase, activeProfileId, activeBrowserProfileId);
      return { installs, selfBrowserProfileId: activeBrowserProfileId };
    }
    case 'GET_OTHER_QUEUE': {
      // FIX-10: read-only, bounded pull of OTHER devices' non-completed queue.
      if (!deps.supabase || !activeProfileId) return { devices: [] };
      const devices = await fetchOtherQueues(deps.supabase, activeProfileId, activeBrowserProfileId);
      return { devices, selfBrowserProfileId: activeBrowserProfileId };
    }
    case 'CLOCK_OUT_INSTALL': {
      if (!deps.supabase || !activeProfileId) return { error: 'not_ready' };
      return await clockOutInstall(deps.supabase, activeProfileId, message?.browser_profile_id, message?.end_time);
    }
    case 'DISMISS_INSTALL': {
      if (!deps.supabase || !activeProfileId) return { error: 'not_ready' };
      return await dismissInstall(deps.supabase, activeProfileId, message?.browser_profile_id);
    }
    case 'CLEAR_ALL_OFFLINE': {
      if (!deps.supabase || !activeProfileId) return { error: 'not_ready' };
      return await clearAllOffline(deps.supabase, activeProfileId);
    }
    default:
      return undefined;
  }
}
