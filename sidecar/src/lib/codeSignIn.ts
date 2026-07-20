// "Sign in with a code" — TV-browser pairing flow, pure helpers.
//
// Reuses the deployed pair-watch device-pairing backend (see
// supabase/functions/pair-watch/index.ts): a signed-in phone/desktop mints a
// 6-digit single-use 5-minute code via PairWatchCard, and this flow redeems
// it unauthenticated on the TV. These are the pure bits split out so they can
// be unit-tested without pulling in react-native/expo/supabase — mirrored
// verbatim in sidecar/tests/code-signin.test.mjs per this repo's existing
// convention (see inviteCode.ts / timer-math.test.mjs headers) since plain
// `node --test` has no TS loader.

/** Strip whitespace so a copy/pasted "123 456" (PairWatchCard's own display
 * format) or a stray leading/trailing space still validates. */
export function normalizePairingCode(raw: string): string {
  return (raw || '').replace(/\s+/g, '');
}

/** True iff the normalized code is exactly 6 digits — the pair-watch
 * `redeem` action's own format check (index.ts:104). */
export function isValidPairingCode(raw: string): boolean {
  return /^\d{6}$/.test(normalizePairingCode(raw));
}

export type RedeemSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  // Device management (migration 045) — the label the pairing device chose
  // (PairWatchCard's free-text "Device name" input, or its chip default).
  // Null when the code was minted before that field existed, or left blank.
  device_label?: string | null;
};

/** Response-shape guard for the redeem POST body. pair-watch returns either
 * `{ access_token, refresh_token, expires_at }` on success or `{ error }` on
 * failure (401 "invalid code", 400/500 for other failures) — treat anything
 * missing a non-empty access_token/refresh_token pair as a failure rather
 * than trusting `res.ok` alone. */
export function isValidRedeemSession(body: unknown): body is RedeemSession {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.access_token === 'string' &&
    b.access_token.length > 0 &&
    typeof b.refresh_token === 'string' &&
    b.refresh_token.length > 0
  );
}
