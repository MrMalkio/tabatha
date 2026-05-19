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

let deps = {};
let realtimeChannel = null;
let heartbeatTimer = null;
let lastPayload = null;
let activeProfileId = null;
let activeBrowserProfileId = null;
let storageListenerRegistered = false;
let pendingPushTimer = null;

const HEARTBEAT_INTERVAL_MS = 60_000;
const PUSH_DEBOUNCE_MS = 500;
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes since last heartbeat → offline
const OTHER_PROFILES_KEY = '_otherProfiles';
const WATCHED_STORAGE_KEYS = new Set(['clockSession', 'focusEngine']);

export function configureAwarenessService(injected = {}) {
  deps = { ...deps, ...injected };
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
    metadata: {},
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
      .select('id, browser, profile_name, classification')
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
          online: !!s.online && !stale,
          stale,
          last_heartbeat_at: s.last_heartbeat_at,
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
      () => { rebuildOtherProfilesCache(supabase, profileId, selfBrowserProfileId); }
    )
    .subscribe();
}

// Public message handlers (wired into the service router).
export async function handleMessage(type) {
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
    default:
      return undefined;
  }
}
