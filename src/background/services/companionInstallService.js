// ============================================================
// Tabatha — Companion Install Service (Plan 028 Phase D₂)
//
// Proxy-registers the desktop companion as a row in tabatha.browser_profiles
// (browser='desktop_companion') and heartbeats its tabatha.browser_profile_status.
// The companion itself has no auth client today; this extension acts as its
// authenticated proxy.
//
// For v0 we assume one companion per user (single machine). Multi-machine
// is enforced server-side by the partial unique index in migration 013;
// multi-machine UX is a future-Phase concern.
// ============================================================

import { getStorage, setStorage } from './storageService.js';

let deps = {};
let activeProfileId = null;
let companionBrowserProfileId = null;
let companionHeartbeatTimer = null;
let listenersAttached = false;
let lastPushedClockState = null;
let initialized = false;

const COMPANION_HEARTBEAT_MS = 60_000;

export function configureCompanionInstallService(injected = {}) {
  deps = { ...deps, ...injected };
}

// Public — start. Called from background.js after auth + supabase ready.
export async function startCompanionInstallService() {
  if (initialized) return;
  if (!deps.supabase || !deps.companionBridge) return;
  initialized = true;
  attachBridgeListeners();
  // If the bridge is already connected at start time (rare, but possible
  // for module re-entries), kick the connect path manually.
  if (deps.companionBridge.isConnected) {
    await onCompanionConnected();
  }
}

function attachBridgeListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  deps.companionBridge.on('connected', onCompanionConnected);
  deps.companionBridge.on('disconnected', onCompanionDisconnected);
  deps.companionBridge.on('clockState', onCompanionClockState);
}

async function getActiveProfileId() {
  if (activeProfileId) return activeProfileId;
  const { data: { session } } = await deps.supabase.auth.getSession();
  if (!session) return null;
  const { data: profile } = await deps.supabase
    .schema('tabatha')
    .from('profiles')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();
  activeProfileId = profile?.id || null;
  return activeProfileId;
}

// SELECT-or-INSERT pattern, protected by the partial unique index from
// migration 013. If two extension installs race and both try to insert,
// the second hits a unique violation and falls back to SELECT.
async function ensureCompanionRow() {
  const profileId = await getActiveProfileId();
  if (!profileId) return null;

  // 0. Cached?
  const { _companionBrowserProfileId } = await getStorage('_companionBrowserProfileId');
  if (_companionBrowserProfileId) {
    companionBrowserProfileId = _companionBrowserProfileId;
    return companionBrowserProfileId;
  }

  // 1. SELECT existing
  const { data: existing } = await deps.supabase
    .schema('tabatha')
    .from('browser_profiles')
    .select('id')
    .eq('profile_id', profileId)
    .eq('browser', 'desktop_companion')
    .maybeSingle();
  if (existing?.id) {
    companionBrowserProfileId = existing.id;
    await setStorage({ _companionBrowserProfileId: existing.id });
    return existing.id;
  }

  // 2. INSERT — race-tolerant via the partial unique index
  const status = deps.companionBridge.status || {};
  const insertPayload = {
    profile_id: profileId,
    browser: 'desktop_companion',
    profile_name: 'Desktop Companion',
    classification: 'professional',
    extension_installed: true,
    last_seen_at: new Date().toISOString()
  };
  const { data: inserted, error: insertErr } = await deps.supabase
    .schema('tabatha')
    .from('browser_profiles')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertErr) {
    // Race — re-SELECT to grab the winner's id.
    const { data: retry } = await deps.supabase
      .schema('tabatha')
      .from('browser_profiles')
      .select('id')
      .eq('profile_id', profileId)
      .eq('browser', 'desktop_companion')
      .maybeSingle();
    if (retry?.id) {
      companionBrowserProfileId = retry.id;
      await setStorage({ _companionBrowserProfileId: retry.id });
      return retry.id;
    }
    return null;
  }

  companionBrowserProfileId = inserted?.id || null;
  if (companionBrowserProfileId) {
    await setStorage({ _companionBrowserProfileId: companionBrowserProfileId });
  }
  return companionBrowserProfileId;
}

function buildCompanionStatusPayload({ online }) {
  // Reads the companion's reported clock state from chrome.storage. The
  // companion may not push CLOCK_STATE until it sees activity, so this
  // can be null on first connect — that's fine, we'll fill it in on the
  // next clockState event.
  const now = new Date().toISOString();

  let clock_state = null;
  let clocked_in_at = null;
  let on_break_since = null;
  let last_clock_event_at = null;

  const c = lastPushedClockState; // updated by onCompanionClockState
  if (c) {
    if (c.active) {
      clock_state = c.on_break ? 'on_break' : 'clocked_in';
      clocked_in_at = c.clocked_in_at || c.started_at || null;
      on_break_since = c.on_break ? (c.break_started_at || null) : null;
      last_clock_event_at = c.break_started_at || c.clocked_in_at || null;
    } else if (c.clocked_out_at) {
      clock_state = 'clocked_out';
      last_clock_event_at = c.clocked_out_at;
    }
  }

  return {
    browser_profile_id: companionBrowserProfileId,
    profile_id: activeProfileId,
    online: !!online,
    last_heartbeat_at: now,
    clock_state,
    clocked_in_at,
    on_break_since,
    last_clock_event_at,
    focus_state: null,
    active_focus_id: null,
    active_focus_label: null,
    focus_started_at: null,
    focus_timer_minutes: null,
    focus_elapsed_ms: null,
    focus_timer_ends_at: null,
    metadata: {},
    updated_at: now
  };
}

async function pushCompanionStatus({ online }) {
  if (!companionBrowserProfileId || !activeProfileId) return;
  const payload = buildCompanionStatusPayload({ online });
  await deps.supabase
    .schema('tabatha')
    .from('browser_profile_status')
    .upsert(payload, { onConflict: 'browser_profile_id' });
}

async function onCompanionConnected() {
  const id = await ensureCompanionRow();
  if (!id) return;

  // Refresh last_seen_at on the row
  try {
    await deps.supabase
      .schema('tabatha')
      .from('browser_profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', id);
  } catch { /* ignore */ }

  await pushCompanionStatus({ online: true });
  startCompanionHeartbeat();
}

async function onCompanionDisconnected() {
  stopCompanionHeartbeat();
  if (companionBrowserProfileId) {
    try { await pushCompanionStatus({ online: false }); } catch { /* ignore */ }
  }
}

function onCompanionClockState(clock) {
  lastPushedClockState = clock || null;
  if (deps.companionBridge.isConnected) {
    pushCompanionStatus({ online: true });
  }
}

function startCompanionHeartbeat() {
  stopCompanionHeartbeat();
  companionHeartbeatTimer = setInterval(() => {
    pushCompanionStatus({ online: deps.companionBridge.isConnected });
  }, COMPANION_HEARTBEAT_MS);
}

function stopCompanionHeartbeat() {
  if (companionHeartbeatTimer) {
    clearInterval(companionHeartbeatTimer);
    companionHeartbeatTimer = null;
  }
}

// Public — getter for syncService so desktop_activity rows can be
// stamped with the companion's browser_profile_id instead of the
// extension's.
export async function getCompanionBrowserProfileId() {
  if (companionBrowserProfileId) return companionBrowserProfileId;
  const { _companionBrowserProfileId } = await getStorage('_companionBrowserProfileId');
  if (_companionBrowserProfileId) {
    companionBrowserProfileId = _companionBrowserProfileId;
    return companionBrowserProfileId;
  }
  return null;
}
