// ============================================================
// Tabatha — Device Service (Feature #222: Device Management in the
// Extension, migration 045)
//
// 2026-07-21 incident: Malkio paused the Sidecar device he was signed into.
// The extension — the primary surface — had NO device UI at all, so while
// trying to recover from the phone he paused his other devices too and had
// to sign out of everything. This service is the extension-side half of the
// fix (the Sidecar's own DevicesCard.tsx / DevicePausedScreen.tsx already
// shipped 0.13.3's self-rescue): list/rename/pause/kind/sign-out for every
// tabatha.browser_profiles row under this profile, plus a soft self-status
// watch so Settings → Devices and a dismissible banner can honor `paused`
// on THIS install without ever hard-blocking it.
//
// Mirrors awarenessService.js's identity-resolution + handleMessage shape
// (the closest precedent: LIST_LIVE_STINTS / CLOCK_OUT_INSTALL / etc. also
// read/act on this user's OTHER browser_profiles-adjacent rows). Sign-out
// reuses feedbackService.js's edge-function-call pattern (user access token
// as Bearer, embedded anon key as apikey — the service-role key never
// leaves the edge function).
// ============================================================

import { setStorage } from './storageService.js';
import { getInstallIdentity } from '../../services/installIdentity.js';
import { groupRows } from '../../utils/deviceGrouping.js';

// Embedded Supabase project URL + publishable (anon) key — identical to
// src/services/supabaseClient.js / feedbackService.js. Kept inline so this
// module's one network call (device-signout) doesn't need to import the
// full page-context client.
const SUPABASE_URL = 'https://mtdgoahskcibjbhfvofx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lPmWAzfBqbHkyGslkhohQA_8QgdBCu_';
const DEVICE_SIGNOUT_FN_PATH = '/functions/v1/device-signout';
// pair-watch despite the name is the generic device-pairing mint/redeem fn
// (watch, TV "Sign in with a code", any code-redeeming surface) — same
// endpoint the Sidecar's PairWatchCard and the TV login flow already use.
const PAIR_FN_PATH = '/functions/v1/pair-watch';
const TIMEOUT_MS = 8000;

// Written on every self-status refresh so Settings → Devices and the
// dismissible paused banner (src/components/DevicePausedBanner.jsx) can read
// via useChromeStorage without a message round-trip on first paint.
export const SELF_DEVICE_STATUS_KEY = '_selfDeviceStatus';

const DEVICE_ROW_COLUMNS =
  'id, browser, profile_name, display_name, classification, extension_installed, last_seen_at, paused, revoked_at, local_id, machine_id, device_settings';

let deps = {};
let activeProfileId = null;
let activeBrowserProfileId = null;

export function configureDeviceService(injected = {}) {
  deps = { ...deps, ...injected };
}

// Test-only, mirrors awarenessService.__setActiveForTest.
export function __setActiveForTest({ profileId = null, browserProfileId = null } = {}) {
  activeProfileId = profileId;
  activeBrowserProfileId = browserProfileId;
}

// Resolve profile + self browser_profile id without depending on any other
// service having run first — same fallback shape as awarenessService's
// resolveActiveIdentity, kept as a separate copy (not imported) so this
// service has no load-order dependency on awarenessService.
async function resolveActiveIdentity() {
  if (activeProfileId && activeBrowserProfileId) {
    return { profileId: activeProfileId, selfId: activeBrowserProfileId };
  }
  if (!deps.supabase) return { profileId: null, selfId: null };
  try {
    const { data: { session } } = await deps.supabase.auth.getSession();
    if (!session) return { profileId: null, selfId: null };
    const { data: profile } = await deps.supabase
      .schema('tabatha')
      .from('profiles')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    const identity = await getInstallIdentity();
    activeProfileId = profile?.id || null;
    activeBrowserProfileId = identity?.supabaseId || null;
    return { profileId: activeProfileId, selfId: activeBrowserProfileId };
  } catch {
    return { profileId: null, selfId: null };
  }
}

// The user's current Supabase access token — needed as the Bearer for the
// device-signout edge function (it verifies the caller, not the anon key).
async function getAccessToken() {
  if (!deps.supabase) return null;
  try {
    const { data: { session } } = await deps.supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

// Every non-revoked device row for this profile, newest-seen first. Callers
// (LIST_DEVICES) apply grouping/visibility client-side via
// src/utils/deviceGrouping.js so the same rules stay testable in one place.
async function fetchDeviceRows(supabase, profileId) {
  const { data, error } = await supabase
    .schema('tabatha')
    .from('browser_profiles')
    .select(DEVICE_ROW_COLUMNS)
    .eq('profile_id', profileId)
    // 0.13.3 parity: signed-out (revoked) devices leave the list entirely
    // instead of lingering for up to 30 days under the recency filter.
    .is('revoked_at', null)
    .order('last_seen_at', { ascending: false, nullsFirst: false });
  if (error) return { rows: [], error: error.message };
  return { rows: data || [], error: null };
}

async function renameDevice(supabase, browserProfileId, displayName) {
  const name = String(displayName || '').trim().slice(0, 200);
  if (!name) return { error: 'display_name required' };
  const { error } = await supabase
    .schema('tabatha')
    .from('browser_profiles')
    .update({ display_name: name })
    .eq('id', browserProfileId);
  if (error) return { error: error.message };
  return { success: true };
}

// Pausing/resuming THIS install writes the fresh self-status straight into
// storage in the same call (rather than waiting for the next poll), so a
// pause/resume triggered from this device's own Devices panel updates its
// paused-banner instantly.
async function setDevicePaused(supabase, browserProfileId, paused) {
  const { error } = await supabase
    .schema('tabatha')
    .from('browser_profiles')
    .update({ paused: !!paused })
    .eq('id', browserProfileId);
  if (error) return { error: error.message };
  if (browserProfileId === activeBrowserProfileId) {
    await setStorage({
      [SELF_DEVICE_STATUS_KEY]: {
        browserProfileId,
        paused: !!paused,
        revokedAt: null,
        checkedAt: new Date().toISOString(),
      },
    });
  }
  return { success: true };
}

// Read-modify-write so future device_settings keys (per-device Context View
// overrides, still no editor UI per DevicesCard.tsx's own comment) are never
// clobbered by a kind-only write.
async function setDeviceKind(supabase, browserProfileId, kind) {
  const VALID = new Set(['phone', 'tablet', 'desktop', 'watch', 'browser_extra']);
  if (!VALID.has(kind)) return { error: `invalid kind: ${kind}` };
  const { data: current, error: readErr } = await supabase
    .schema('tabatha')
    .from('browser_profiles')
    .select('device_settings')
    .eq('id', browserProfileId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  const nextSettings = { ...(current?.device_settings || {}), kind };
  const { error } = await supabase
    .schema('tabatha')
    .from('browser_profiles')
    .update({ device_settings: nextSettings })
    .eq('id', browserProfileId);
  if (error) return { error: error.message };
  return { success: true, device_settings: nextSettings };
}

// Remote sign-out via the device-signout edge function — mirrors
// feedbackService.js's fetch/auth pattern. Guarded against targeting THIS
// install (the UI also disables the control, but the handler defends too).
async function signOutDevice(browserProfileId) {
  if (!browserProfileId) return { error: 'browser_profile_id required' };
  if (browserProfileId === activeBrowserProfileId) {
    return { error: 'cannot_signout_self' };
  }
  const accessToken = await getAccessToken();
  if (!accessToken) return { error: 'You must be signed in to manage devices' };

  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  try {
    const response = await fetchImpl(`${SUPABASE_URL}${DEVICE_SIGNOUT_FN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ browser_profile_id: browserProfileId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const out = await response.json().catch(() => ({}));
    if (!response.ok || !out?.ok) {
      return { error: out?.error || `sign-out failed (${response.status})` };
    }
    return { success: true, revokedSession: !!out.revokedSession };
  } catch (e) {
    return { error: e?.message || 'sign-out request failed' };
  }
}

// Mint a device pairing code (6.7.52) — the missing half of the Devices
// panel Malkio hit on 2026-07-21 ("why can't I generate a device code from
// the extension?"): minting only existed in the Sidecar. Mirrors
// PairWatchCard.tsx's call exactly: user JWT as Bearer, `action: 'mint'`,
// optional deviceLabel that the redeeming device adopts as its first name.
// The raw code lives only in the edge fn's response + the DB hash.
async function mintDeviceCode(deviceLabel) {
  const accessToken = await getAccessToken();
  if (!accessToken) return { error: 'You must be signed in to pair a device' };
  const label = String(deviceLabel || '').trim().slice(0, 120) || 'Other device';
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  try {
    const response = await fetchImpl(`${SUPABASE_URL}${PAIR_FN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: 'mint', deviceLabel: label }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const out = await response.json().catch(() => ({}));
    if (!response.ok || !out?.code) {
      // 401/unauthorized from the fn almost always means this install's
      // Supabase session was revoked (e.g. by a remote sign-out sweep) and
      // token refresh is dead — a raw "unauthorized" told Malkio nothing on
      // 2026-07-21. Say what to actually do.
      if (response.status === 401 || /unauthor/i.test(out?.error || '')) {
        return { error: 'Session expired — sign out and back in (Settings → Sync & Account), then generate again.' };
      }
      return { error: out?.error || `pairing code failed (${response.status})` };
    }
    return { success: true, code: out.code, expiresInSeconds: out.expiresInSeconds || 300 };
  } catch (e) {
    return { error: e?.message || 'pairing request failed' };
  }
}

// Fetch + cache THIS install's own paused/revoked flags. Called on SW
// startup (startDeviceStatusWatch, from background.js) and on-demand via
// GET_SELF_DEVICE_STATUS (the banner polls this — no realtime channel here;
// a pause set on this device or resumed from this device already updates
// storage synchronously via setDevicePaused above, and a ~30s poll is plenty
// for a soft convenience flag set from ANOTHER device).
async function refreshSelfStatus() {
  const { selfId } = await resolveActiveIdentity();
  if (!deps.supabase || !selfId) return null;
  const { data, error } = await deps.supabase
    .schema('tabatha')
    .from('browser_profiles')
    .select('id, paused, revoked_at')
    .eq('id', selfId)
    .maybeSingle();
  if (error || !data) return null;
  const status = {
    browserProfileId: data.id,
    paused: !!data.paused,
    revokedAt: data.revoked_at || null,
    checkedAt: new Date().toISOString(),
  };
  await setStorage({ [SELF_DEVICE_STATUS_KEY]: status });
  return status;
}

// Public: called once from background.js at SW startup so the paused banner
// has data on first paint instead of waiting for the first poll.
export async function startDeviceStatusWatch() {
  if (!deps.supabase) return;
  try {
    await refreshSelfStatus();
  } catch {
    // Best-effort — GET_SELF_DEVICE_STATUS / the next poll will retry.
  }
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'LIST_DEVICES': {
      if (!deps.supabase) return { devices: [], error: 'not_ready' };
      const { profileId, selfId } = await resolveActiveIdentity();
      if (!profileId) return { devices: [], error: 'not_ready' };
      const { rows, error } = await fetchDeviceRows(deps.supabase, profileId);
      if (error) return { devices: [], error };
      // Grouped representative rows only travel over the wire — the raw
      // (ungrouped) `rows` count is included so the panel's "Show all"
      // toggle knows how many extra dupe rows it would reveal without a
      // second round-trip.
      return {
        devices: groupRows(rows),
        rawCount: rows.length,
        selfBrowserProfileId: selfId,
      };
    }
    case 'RENAME_DEVICE': {
      if (!deps.supabase) return { error: 'not_ready' };
      return renameDevice(deps.supabase, message?.browser_profile_id, message?.display_name);
    }
    case 'SET_DEVICE_PAUSED': {
      if (!deps.supabase) return { error: 'not_ready' };
      await resolveActiveIdentity(); // ensure activeBrowserProfileId is populated for the self-write shortcut
      return setDevicePaused(deps.supabase, message?.browser_profile_id, !!message?.paused);
    }
    case 'SET_DEVICE_KIND': {
      if (!deps.supabase) return { error: 'not_ready' };
      return setDeviceKind(deps.supabase, message?.browser_profile_id, message?.kind);
    }
    case 'SIGNOUT_DEVICE': {
      if (!deps.supabase) return { error: 'not_ready' };
      await resolveActiveIdentity(); // ensure activeBrowserProfileId is populated for the self-signout guard
      return signOutDevice(message?.browser_profile_id);
    }
    case 'MINT_DEVICE_CODE': {
      if (!deps.supabase) return { error: 'not_ready' };
      return mintDeviceCode(message?.device_label);
    }
    case 'GET_SELF_DEVICE_STATUS': {
      if (!deps.supabase) return { status: null, error: 'not_ready' };
      const status = await refreshSelfStatus();
      return { status };
    }
    default:
      return undefined;
  }
}
