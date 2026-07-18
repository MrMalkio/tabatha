// Shared helpers for the Sidecar v0.3.0 QA blitz scripts.
// Mints a real user session for mr@duckandshark.com via admin generateLink +
// verifyOtp (documented pattern from docs/progress.md 2026-07-17 entries),
// and exposes an admin (service-role) client + a user-scoped client that
// mirrors the app's exact config (schema: tabatha).

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const SUPABASE_URL = 'https://mtdgoahskcibjbhfvofx.supabase.co';
const PROJECT_REF = 'mtdgoahskcibjbhfvofx';
const TEST_EMAIL = 'mr@duckandshark.com';

function getKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${PROJECT_REF}`, {
    encoding: 'utf8',
  });
  const parsed = JSON.parse(raw);
  const anon = parsed.keys.find((k) => k.id === 'anon')?.api_key;
  const service = parsed.keys.find((k) => k.id === 'service_role')?.api_key;
  if (!anon || !service) throw new Error('Could not resolve anon/service_role keys');
  return { anon, service };
}

export async function mintSession() {
  const { anon, service } = getKeys();
  const admin = createClient(SUPABASE_URL, service, {
    auth: { persistSession: false },
  });

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_EMAIL,
  });
  if (linkErr) throw linkErr;

  const hashed = linkData.properties?.hashed_token;
  if (!hashed) throw new Error('No hashed_token in generateLink response');

  const userClient = createClient(SUPABASE_URL, anon, {
    auth: { persistSession: false },
    db: { schema: 'tabatha' },
  });

  const { data: verifyData, error: verifyErr } = await userClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: hashed,
  });
  if (verifyErr) throw verifyErr;

  return {
    admin, // schema: public (default) — used for auth.admin + raw table access with .schema('tabatha')
    adminTabatha: createClient(SUPABASE_URL, service, {
      auth: { persistSession: false },
      db: { schema: 'tabatha' },
    }),
    user: userClient, // schema: tabatha, RLS-scoped to mr@duckandshark.com
    session: verifyData.session,
    userId: verifyData.user?.id,
    anon,
    service,
  };
}

export function log(...args) {
  console.log(new Date().toISOString(), ...args);
}
