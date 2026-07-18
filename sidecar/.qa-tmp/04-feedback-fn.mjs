// Sidecar v0.3.0 QA blitz — Test matrix item 2 (feedback fn):
// supabase/functions/feedback-to-asana. Authed POST from the Sidecar's real
// origin should create an Asana task; anon-only POST should be rejected;
// OPTIONS preflight should echo each allowed origin correctly.

import { mintSession, log } from './lib.mjs';

const FN_URL = 'https://mtdgoahskcibjbhfvofx.supabase.co/functions/v1/feedback-to-asana';
const SIDECAR_ORIGIN = 'https://tabatha.pondocean.co';
const EXT_ORIGIN = 'chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod';

const results = [];
function record(area, pass, detail) {
  results.push({ area, pass, detail });
  log(pass ? 'PASS' : 'FAIL', area, '-', detail);
}

async function main() {
  const { userId, session, anon } = await mintSession();
  const accessToken = session.access_token;

  const payload = {
    kind: 'bug',
    text: '[QA TEST — ignore] Rook QA blitz probe for Sidecar v0.3.0 feedback pipeline. Safe to archive/delete this task.',
    version: '0.3.0',
    context: { surface: 'sidecar_qa', localId: 'qa-device', machineId: 'qa-device', url: '/sidecar/settings' },
    submittedAt: new Date().toISOString(),
  };

  // ── 1. Authed POST from the Sidecar's real origin -> expect 2xx + taskGid ──
  const authedResp = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: anon,
      Origin: SIDECAR_ORIGIN,
    },
    body: JSON.stringify(payload),
  });
  const authedText = await authedResp.text();
  let authedJson = null;
  try {
    authedJson = JSON.parse(authedText);
  } catch {
    /* ignore */
  }
  record('authed POST (sidecar origin) -> 2xx', authedResp.status >= 200 && authedResp.status < 300, `status=${authedResp.status} body=${authedText}`);
  record('authed POST -> taskGid returned', !!authedJson?.taskGid, JSON.stringify(authedJson));
  record(
    'authed POST -> CORS echoes sidecar origin',
    authedResp.headers.get('access-control-allow-origin') === SIDECAR_ORIGIN,
    authedResp.headers.get('access-control-allow-origin')
  );
  const qaTaskGid = authedJson?.taskGid || null;

  // ── 2. Unauthenticated (no Authorization header at all) -> should be rejected. ──
  // NOTE: the edge function GATEWAY itself has verify_jwt=true (confirmed via
  // `supabase functions list`), so a request with NO valid JWT never even
  // reaches the handler -- it 401s at the gateway. This is a stronger
  // rejection than the function's own internal verifyUser() check.
  const noAuthResp = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SIDECAR_ORIGIN },
    body: JSON.stringify(payload),
  });
  record('unauthenticated POST (no Authorization header) -> rejected', noAuthResp.status === 401, `status=${noAuthResp.status}`);

  // ── 3. Anon-key-only (valid JWT at the gateway, but the function's own
  // verifyUser() explicitly excludes the bare anon key) -> should be 401
  // from the FUNCTION's own check, not just the gateway. ──
  const anonOnlyResp = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anon}`,
      apikey: anon,
      Origin: SIDECAR_ORIGIN,
    },
    body: JSON.stringify(payload),
  });
  const anonOnlyJson = await anonOnlyResp.json().catch(() => null);
  record(
    'anon-key-only POST (valid gateway JWT, no user) -> 401 from function verifyUser()',
    anonOnlyResp.status === 401,
    `status=${anonOnlyResp.status} body=${JSON.stringify(anonOnlyJson)}`
  );

  // ── 4. OPTIONS preflight for each allowed origin ──
  for (const origin of [SIDECAR_ORIGIN, EXT_ORIGIN]) {
    const preflight = await fetch(FN_URL, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type, apikey',
      },
    });
    const echoed = preflight.headers.get('access-control-allow-origin');
    record(`OPTIONS preflight echoes origin ${origin}`, echoed === origin, `status=${preflight.status} echoed=${echoed}`);
  }

  // Unknown origin should NOT be echoed back (falls back to the extension origin default).
  const unknownOrigin = 'https://evil.example.com';
  const preflightUnknown = await fetch(FN_URL, {
    method: 'OPTIONS',
    headers: { Origin: unknownOrigin, 'Access-Control-Request-Method': 'POST' },
  });
  const echoedUnknown = preflightUnknown.headers.get('access-control-allow-origin');
  record(
    'OPTIONS preflight for UNKNOWN origin does not echo it back',
    echoedUnknown !== unknownOrigin,
    `echoed=${echoedUnknown}`
  );

  const failed = results.filter((r) => !r.pass);
  log('=== SUMMARY ===', `${results.length - failed.length}/${results.length} passed`);
  failed.forEach((f) => log('FAIL DETAIL:', f.area, '-', f.detail));
  if (qaTaskGid) log('QA_TASK_GID=' + qaTaskGid, '(created in ASANA_PROJECT_GID configured on the fn — leave per instructions, CeeCee to archive)');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
