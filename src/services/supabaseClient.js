import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mtdgoahskcibjbhfvofx.supabase.co';
const supabaseKey = 'sb_publishable_lPmWAzfBqbHkyGslkhohQA_8QgdBCu_';

// Disable supabase-js's Web Locks coordination. The default lock uses
// navigator.locks to serialize auth-token access across browser tabs — fine
// for a normal web app, broken in a Chrome MV3 extension where home.html,
// sidebar.html, settings.html, popup.html, *and* the service worker each
// construct their own Supabase client and all fight for the same lock name
// "lock:sb-<project>-auth-token". They constantly steal it from each other,
// surfacing as `profile_*_select_failed: Lock ... was released because
// another request stole it` and aborting every auth/profile network call.
//
// The no-op lock passes the inner function through immediately, so every
// caller proceeds without serialization. Concurrent token refresh is a
// theoretical downside but in practice unproblematic — at most one refresh
// round-trip wins and the others read the same updated token on their next
// read of the shared storage.
const noopLock = async (_name, _acquireTimeout, fn) => fn();

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { lock: noopLock },
});

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

/**
 * Redeem an Invite Token
 */
export async function redeemInviteToken(token) {
  const session = await getSession();
  if (!session) throw new Error("Must be logged in to redeem a token.");
  
  // Call the Supabase Postgres function to securely redeem the token
  const { data, error } = await supabase.rpc('redeem_invite_token', {
    p_token: token
  });
  if (error) throw error;
  return data;
}
