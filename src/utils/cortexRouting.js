// ============================================================
// Cortex C8 — pure routing-tier selector (Plan 041 T3/T4).
// The Autonomy Ladder: ① harness (local files, zero network — Phase 1) →
// ② proxy (Supabase edge fn holds the key) → ③ gateway (Vercel AI Gateway;
// requires a key Malkio hasn't minted yet) → ④ byok (user pastes own key).
// This module only DECIDES the route; callers do the I/O. Keys never pass
// through here — only presence flags.
// No chrome / DOM / supabase deps — unit-tested in isolation.
// ============================================================

export const ROUTING_TIERS = ['harness', 'proxy', 'gateway', 'byok'];

const SUPABASE_PROJECT_REF = 'mtdgoahskcibjbhfvofx'; // Flux
const PROXY_ENDPOINT = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/cortex-proxy`;
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * @param {object} settings { cortexRouting, cortexGatewayUrl? }
 * @param {object} ctx { signedIn, gatewayConfigured?, byokPresent? }
 * @returns {{tier, canCallAi, endpoint, reason}}
 */
export function resolveRoute(settings, ctx) {
  const tier = ROUTING_TIERS.includes(settings?.cortexRouting) ? settings.cortexRouting : 'harness';

  switch (tier) {
    case 'proxy':
      if (!ctx?.signedIn) return { tier, canCallAi: false, endpoint: null, reason: 'auth-required' };
      return { tier, canCallAi: true, endpoint: PROXY_ENDPOINT, reason: 'ok' };
    case 'gateway':
      if (!ctx?.gatewayConfigured || !settings?.cortexGatewayUrl) {
        return { tier, canCallAi: false, endpoint: null, reason: 'gateway-not-configured' };
      }
      return { tier, canCallAi: true, endpoint: settings.cortexGatewayUrl, reason: 'ok' };
    case 'byok':
      if (!ctx?.byokPresent) return { tier, canCallAi: false, endpoint: null, reason: 'byok-key-missing' };
      return { tier, canCallAi: true, endpoint: OPENAI_ENDPOINT, reason: 'ok' };
    case 'harness':
    default:
      return { tier: 'harness', canCallAi: false, endpoint: null, reason: 'local-files-only' };
  }
}
