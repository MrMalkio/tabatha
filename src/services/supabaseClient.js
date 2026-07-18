import { createClient } from '@supabase/supabase-js';
import { normalizeOutbox, enqueue } from '../utils/cloudOutbox.js';

const supabaseUrl = 'https://mtdgoahskcibjbhfvofx.supabase.co';
const supabaseKey = 'sb_publishable_lPmWAzfBqbHkyGslkhohQA_8QgdBCu_';

// Page-side durable-fallback keys — MUST mirror cloudWriteService's constants.
// Used only when the SW can't be reached to enqueue a cloud write (see
// updateProfileName's catch below); the write is persisted straight into the
// same outbox the background flushes on its next wake.
const CLOUD_OUTBOX_STORAGE_KEY = '_cloudOutbox';
const CLOUD_OUTBOX_ALARM = 'cloud-outbox-flush';

// Disable supabase-js's Web Locks coordination. The default lock uses
// navigator.locks to serialize auth-token access across browser tabs — fine
// for a normal web app, broken in a Chrome MV3 extension where home.html,
// sidebar.html, settings.html, popup.html, *and* the service worker each
// construct their own Supabase client and all fight for the same lock name.
const noopLock = async (_name, _acquireTimeout, fn) => fn();

// Custom session storage adapter backed by chrome.storage.local. By default
// supabase-js uses window.localStorage in browser context and memory in
// node-like contexts. In an MV3 extension this means:
//   - extension PAGES (home.html, sidebar.html, settings.html, popup.html)
//     each have their own window.localStorage — partly shared across pages
//     of the same extension, but NOT visible to the service worker
//   - the service worker has no window at all, so the default falls back to
//     in-memory; every SW wake-up starts with an empty session
// Result: user signs in on Settings → JWT lands in localStorage → SW
// (where syncService runs) sees no session → every sync attempt logs
// "no_auth_session: Sync attempted while signed out" even though the UI
// shows the user as Connected.
//
// chrome.storage.local is the one storage layer shared by ALL extension
// contexts. Pointing supabase-js at it via a custom adapter unifies the
// session: page sign-in is immediately visible to the SW, signOut from
// either context invalidates both.
const chromeStorageAdapter = {
  async getItem(key) {
    try {
      if (!chrome?.storage?.local) return null;
      const res = await chrome.storage.local.get(key);
      return res?.[key] ?? null;
    } catch { return null; }
  },
  async setItem(key, value) {
    try {
      if (!chrome?.storage?.local) return;
      await chrome.storage.local.set({ [key]: value });
    } catch { /* ignore */ }
  },
  async removeItem(key) {
    try {
      if (!chrome?.storage?.local) return;
      await chrome.storage.local.remove(key);
    } catch { /* ignore */ }
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: chromeStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    lock: noopLock,
  },
});

// ── Page-context data client (deadlock-proof reads + realtime) ──────────
// In an MV3 extension PAGE, the auth client above can self-deadlock: its
// auth-js init lock is held while `onAuthStateChange` subscribers run, and any
// nested Supabase call (getSession → PostgREST) re-enters that lock and hangs
// forever. The background service worker is the single auth owner whose client
// never wedges (it registers no onAuthStateChange), so page reads should not
// run their own auth machinery at all.
//
// `dataClient` is configured with the `accessToken` async callback: supabase-js
// then NEVER touches auth-js's getSession()/lock — it just calls this callback
// for the current JWT, which we fetch from the background. This makes every
// PostgREST read and Realtime subscription immune to the page-context deadlock.
// (Setting `accessToken` disables `dataClient.auth.*` by design; use the auth
// client `supabase` for sign-in/out flows.)
let _tokenCache = { token: null, expiresAt: 0 };

async function fetchAccessTokenFromBackground() {
  try {
    if (!chrome?.runtime?.sendMessage) return null;
    const res = await chrome.runtime.sendMessage({ type: 'GET_ACCESS_TOKEN' });
    if (res && res.token) {
      // expiresAt from Supabase is unix seconds; keep a 60s safety margin.
      _tokenCache = { token: res.token, expiresAt: (res.expiresAt ? res.expiresAt * 1000 : Date.now() + 60000) };
      return res.token;
    }
  } catch { /* SW asleep / not signed in — fall through to anon */ }
  _tokenCache = { token: null, expiresAt: 0 };
  return null;
}

async function getRoutedAccessToken() {
  // The background service worker (no `window`) is the auth owner and never uses
  // dataClient — short-circuit so it never messages itself at construction time.
  if (typeof window === 'undefined') return null;
  const now = Date.now();
  if (_tokenCache.token && now < _tokenCache.expiresAt - 60000) return _tokenCache.token;
  return fetchAccessTokenFromBackground();
}

export const dataClient = createClient(supabaseUrl, supabaseKey, {
  accessToken: getRoutedAccessToken,
});

// Small helper for the page-context mutation wrappers below: send a typed
// message to the background service worker and unwrap its { ok, data, error }
// envelope, throwing on transport/exception failures (RPC-level {success:false}
// results are returned as-is for the caller to handle).
async function callBackground(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res || res.ok === false) {
    throw new Error(res?.error || `${type} failed`);
  }
  return res;
}

/**
 * Authenticate or get the current user session.
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) console.error('Supabase getSession error:', error);
  return data?.session;
}

/**
 * Sign in using Chrome Identity (Google OAuth via Supabase)
 */
export async function signInWithChromeIdentity() {
  const redirectUrl = chrome.identity.getRedirectURL();
  console.log("Extension Redirect URL:", redirectUrl);
  
  // 1. Get the OAuth URL from Supabase
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    }
  });

  if (error) throw error;
  if (!data?.url) throw new Error("No OAuth URL returned from Supabase");

  // 2. Launch the Web Auth Flow
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({
      url: data.url,
      interactive: true
    }, async (redirectedTo) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      if (!redirectedTo) {
        return reject(new Error("Auth flow was cancelled or returned no URL."));
      }

      // 3. Supabase will append #access_token=... to the redirect URL
      // We need to parse this and set the session manually.
      // Wait, in Supabase v2, if PKCE is enabled, it returns ?code=...
      // Since this is a Chrome Extension, let's just let Supabase JS handle the URL parsing.
      // In @supabase/supabase-js v2, we can exchange the code or parse the hash.
      const urlParams = new URL(redirectedTo);
      
      // If PKCE code flow (query params)
      const code = urlParams.searchParams.get('code');
      if (code) {
        const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
        if (sessionError) return reject(sessionError);
        return resolve(sessionData);
      }
      
      // If implicit grant (hash params)
      const hashParams = new URLSearchParams(urlParams.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      
      if (accessToken && refreshToken) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (sessionError) return reject(sessionError);
        return resolve(sessionData);
      }

      reject(new Error("No valid auth tokens found in redirect URL: " + redirectedTo));
    });
  });
}

/**
 * Link an additional identity using Chrome Identity (Google OAuth via Supabase)
 */
export async function linkChromeIdentity() {
  const redirectUrl = chrome.identity.getRedirectURL();
  console.log("Extension Redirect URL for Linking:", redirectUrl);
  
  // 1. Get the OAuth URL for linking from Supabase
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    }
  });

  if (error) throw error;
  if (!data?.url) throw new Error("No OAuth URL returned from Supabase for linking");

  // 2. Launch the Web Auth Flow
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({
      url: data.url,
      interactive: true
    }, async (redirectedTo) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      if (!redirectedTo) {
        return reject(new Error("Auth flow was cancelled or returned no URL."));
      }

      const urlParams = new URL(redirectedTo);
      
      // If PKCE code flow (query params)
      const code = urlParams.searchParams.get('code');
      if (code) {
        // We already have a session, but we exchange code for session to finalize link
        const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
        if (sessionError) return reject(sessionError);
        return resolve(sessionData);
      }
      
      // If implicit grant (hash params)
      const hashParams = new URLSearchParams(urlParams.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      
      if (accessToken && refreshToken) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (sessionError) return reject(sessionError);
        return resolve(sessionData);
      }

      reject(new Error("No valid auth tokens found in redirect URL: " + redirectedTo));
    });
  });
}

/**
 * Sign in using Magic Link (Email)
 */
export async function signInWithMagicLink(email) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: chrome.identity.getRedirectURL()
    }
  });
  if (error) throw error;
  return data;
}

/**
 * Sign out
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ── Mutations — routed through the background service worker ─────────────
// These previously ran in page context and hung (the auth-js deadlock). They
// now execute against the background client (the single, never-wedged auth
// owner). The page-facing signatures + return shapes are unchanged: each
// returns the underlying RPC result object ({ success, org_id, token, … }).

/**
 * Redeem an Invite Token. Runs the SECURITY DEFINER RPC tabatha.redeem_invite_token
 * in the background; the background also applies org/team defaults as a
 * client-side belt-and-braces (mirrors migration 018).
 */
export async function redeemInviteToken(token) {
  const res = await callBackground('REDEEM_INVITE_TOKEN', { token });
  return res.data;
}

/**
 * Create a new Organization (and become its owner). Runs the SECURITY DEFINER
 * RPC tabatha.create_organization in the background (org + owner membership +
 * profile defaults, one transaction, idempotent server-side).
 */
export async function createOrganization(name) {
  const res = await callBackground('CREATE_ORGANIZATION', { name });
  return res.data;
}

/**
 * Mint a new Invite Token (org owners + team managers only — server-side gated
 * by SECURITY DEFINER RPC tabatha.create_invite_token). Routed to background.
 */
export async function createInviteToken({ orgId, teamId = null, role = 'user', expiresInHours = 168 }) {
  const res = await callBackground('CREATE_INVITE_TOKEN', { orgId, teamId, role, expiresInHours });
  return res.data;
}

/**
 * Revoke (delete) a pending invite token. Routed to background.
 */
export async function deleteInviteToken(id) {
  await callBackground('DELETE_INVITE_TOKEN', { id });
  return { success: true };
}

/**
 * Page-side durable fallback for a display-name write. Used only when the
 * service worker can't be reached to enqueue (asleep / torn down mid-message —
 * a routine MV3 race). Persists the op straight into the same `_cloudOutbox`
 * storage the background flushes on its next wake (boot flush / periodic alarm /
 * next sign-in), and arms the retry alarm so a sleeping SW is woken to flush it.
 * Latest-wins dedupe by `key` means this can't double-apply if the message
 * actually did reach the background before the channel dropped.
 */
async function enqueueProfileNameLocally({ displayName, profileId = null, authUserId = null }) {
  const key = `cloud_profile_name:${profileId || authUserId}`;
  const { [CLOUD_OUTBOX_STORAGE_KEY]: raw } = await chrome.storage.local.get(CLOUD_OUTBOX_STORAGE_KEY);
  const { outbox } = enqueue(normalizeOutbox(raw), {
    type: 'cloud_profile_name',
    key,
    payload: { displayName, profileId, authUserId },
    now: Date.now(),
  });
  await chrome.storage.local.set({ [CLOUD_OUTBOX_STORAGE_KEY]: outbox });
  // Wake a sleeping SW within ~1 min to flush the queued write.
  try { chrome.alarms?.create(CLOUD_OUTBOX_ALARM, { periodInMinutes: 1 }); } catch { /* alarms unavailable */ }
}

/**
 * Queue a display-name update. The background enqueues it to the durable cloud
 * outbox and returns an immediate optimistic ack — no UI timeout race. The
 * write flushes with exponential backoff and survives SW restarts.
 *
 * If the SW can't be reached to enqueue, we do NOT fabricate a success: we fall
 * back to persisting the write directly into the durable outbox (see
 * enqueueProfileNameLocally). Only if even that local persist fails does the
 * error propagate to the caller.
 */
export async function updateProfileName({ displayName, profileId = null, authUserId = null }) {
  try {
    return await callBackground('UPDATE_PROFILE_NAME', { displayName, profileId, authUserId });
  } catch (err) {
    await enqueueProfileNameLocally({ displayName, profileId, authUserId });
    return { ok: true, success: true, queued: true, deferred: true };
  }
}
