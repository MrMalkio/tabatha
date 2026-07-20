// Minimal JWT payload decoder — pure, no crypto/verification (the token
// already came from a trusted supabase-js session; this only reads claims
// out of it, it does not authenticate anything). Written without `atob`
// (not reliably available on native/Hermes — push.ts's own atob use is
// web-only, gated behind pushSupported()'s Platform.OS === 'web' check) so
// this works identically on web, iOS, and Android.
//
// Used by AuthContext.registerDevice (device management, migration 045) to
// pull the GoTrue `session_id` claim out of the current session's access
// token and persist it as browser_profiles.auth_session_id, so
// device-signout can revoke that exact session later.

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const rawChar of base64) {
    const idx = BASE64_CHARS.indexOf(rawChar);
    if (idx === -1) continue; // skip padding ('=') and any stray whitespace
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/**
 * Decodes a JWT's payload (middle segment) into a plain object. Returns
 * null for anything malformed — a missing/unparsable claim should never
 * throw and break sign-in.
 */
export function decodeJwtPayload(token: string | null | undefined): Record<string, any> | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const json = base64UrlDecode(parts[1]);
    // decodeURIComponent + escape handles UTF-8 payload bytes correctly
    // (percent-encoding each byte then re-decoding as UTF-8), same
    // technique as the common atob-based jwt-decode polyfills.
    const utf8 = decodeURIComponent(
      Array.from(json)
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    const parsed = JSON.parse(utf8);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Convenience accessor for the claim device-signout keys revocation on. */
export function sessionIdFromAccessToken(token: string | null | undefined): string | null {
  const payload = decodeJwtPayload(token);
  const sid = payload?.session_id;
  return typeof sid === 'string' && sid.length > 0 ? sid : null;
}
