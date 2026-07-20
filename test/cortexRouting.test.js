// Cortex Phase 2 (Plan 041 T3/T4) — pure routing-tier selector (TDD: written first).
// C8 Autonomy Ladder: ① harness (local files, no key) ② proxy (edge fn holds key)
// ③ gateway (Vercel AI Gateway — key pending) ④ byok (user's own key).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, ROUTING_TIERS } from '../src/utils/cortexRouting.js';

test('ROUTING_TIERS: the four ladder tiers in escalation order', () => {
  assert.deepEqual(ROUTING_TIERS, ['harness', 'proxy', 'gateway', 'byok']);
});

test('resolveRoute: default/harness → local, no network, no AI capability', () => {
  const r = resolveRoute({ cortexRouting: 'harness' }, { signedIn: true });
  assert.deepEqual(r, { tier: 'harness', canCallAi: false, endpoint: null, reason: 'local-files-only' });
});

test('resolveRoute: proxy requires a signed-in session', () => {
  const ok = resolveRoute({ cortexRouting: 'proxy' }, { signedIn: true });
  assert.equal(ok.tier, 'proxy');
  assert.equal(ok.canCallAi, true);
  assert.match(ok.endpoint, /cortex-proxy/);

  const anon = resolveRoute({ cortexRouting: 'proxy' }, { signedIn: false });
  assert.equal(anon.canCallAi, false);
  assert.equal(anon.reason, 'auth-required');
});

test('resolveRoute: gateway is config-gated until the key exists', () => {
  const r = resolveRoute({ cortexRouting: 'gateway' }, { signedIn: true, gatewayConfigured: false });
  assert.equal(r.canCallAi, false);
  assert.equal(r.reason, 'gateway-not-configured');
  const ok = resolveRoute(
    { cortexRouting: 'gateway', cortexGatewayUrl: 'https://gw.example/v1' },
    { signedIn: true, gatewayConfigured: true }
  );
  assert.equal(ok.canCallAi, true);
  assert.equal(ok.endpoint, 'https://gw.example/v1');
});

test('resolveRoute: byok requires a non-empty key marker (never the key itself)', () => {
  const no = resolveRoute({ cortexRouting: 'byok' }, { signedIn: false, byokPresent: false });
  assert.equal(no.canCallAi, false);
  assert.equal(no.reason, 'byok-key-missing');
  const yes = resolveRoute({ cortexRouting: 'byok' }, { signedIn: false, byokPresent: true });
  assert.equal(yes.canCallAi, true);
  assert.equal(yes.endpoint, 'https://api.openai.com/v1/chat/completions');
});

test('resolveRoute: unknown tier falls back to harness', () => {
  const r = resolveRoute({ cortexRouting: 'quantum' }, { signedIn: true });
  assert.equal(r.tier, 'harness');
});
