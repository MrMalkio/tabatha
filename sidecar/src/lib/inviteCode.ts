// Invite-code format helpers — invite-signup gate (follow-on to Plan 039).
// Pure logic, no RN/supabase imports, so it's mirrored verbatim in
// tests/invite-code.test.mjs (same convention as voiceCheckin.ts /
// timer-math.ts mirrors — see that file's header comment).

// Real mint format, from supabase/migrations/012_manager_scoping_and_invite_mint.sql
// (tabatha.create_invite_token): 24 hex chars + '-' + 8 hex chars, e.g.
// "a1b2c3d4e5f6a1b2c3d4e5f6-a1b2c3d4". The invite_tokens.token column itself
// is just TEXT UNIQUE NOT NULL (migration 002) with no DB-level format
// constraint, so this is a soft/informational match, never a hard client
// gate — the redeem RPC (server) is the sole source of truth for validity.
export const INVITE_TOKEN_FORMAT_RE = /^[0-9a-f]{24}-[0-9a-f]{8}$/i;

export function normalizeInviteCode(raw: string): string {
  return (raw || '').trim();
}

// Loose client-side gate for the Redeem button's disabled state — just long
// enough to rule out an empty/obvious-typo submit. Never used to reject a
// code the server would otherwise accept.
export function isPlausibleInviteCode(raw: string): boolean {
  return normalizeInviteCode(raw).length >= 6;
}

export function matchesKnownMintFormat(raw: string): boolean {
  return INVITE_TOKEN_FORMAT_RE.test(normalizeInviteCode(raw));
}
