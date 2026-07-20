import { useCallback, useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';

// Epic 3 v1 — Task Sync (Asana) client layer.
//
// The user's PAT is a credential: it is read from the input field, POSTed
// once to the `connect-asana` edge function over the authed session, and
// never logged, never persisted client-side (no state beyond the in-flight
// request body), never echoed back. Server-side it lives only in Vault
// (migration 035); this client can read connection *status* via the
// RLS-scoped `integration_credentials` row, never the secret.

export type IntegrationStatus = {
  provider: string;
  workspace_gid: string | null;
  connected_at: string;
  last_synced_at: string | null;
  status: 'active' | 'revoked' | 'error';
};

const CONNECT_FN_PATH = '/functions/v1/connect-asana';
const SYNC_FN_PATH = '/functions/v1/sync-asana-tasks';
const TIMEOUT_MS = 20000; // connect validates the PAT against Asana server-side

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type ConnectResult =
  | { ok: true; workspaceGid: string | null; webhookRegistered: boolean }
  | { ok: false; error: string };

export async function connectAsana(pat: string): Promise<ConnectResult> {
  const trimmed = pat.trim();
  if (!trimmed) return { ok: false, error: 'Paste your Asana access token first.' };
  const token = await accessToken();
  if (!token) return { ok: false, error: 'You appear to be signed out — sign in again first.' };

  const { signal, cancel } = withTimeout(TIMEOUT_MS);
  try {
    const resp = await fetch(`${SUPABASE_URL}${CONNECT_FN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ pat: trimmed }),
      signal,
    });
    const body = await resp.json().catch(() => ({}) as Record<string, any>);
    if (!resp.ok) {
      return { ok: false, error: body?.error || `Connection failed (${resp.status}).` };
    }
    return {
      ok: true,
      workspaceGid: body?.workspaceGid ?? null,
      webhookRegistered: !!body?.webhookRegistered,
    };
  } catch {
    return { ok: false, error: 'Couldn’t reach the sync service — try again.' };
  } finally {
    cancel();
  }
}

export type SyncNowResult =
  | { ok: true; tasksSynced: number }
  | { ok: false; error: string };

export async function syncAsanaNow(): Promise<SyncNowResult> {
  const token = await accessToken();
  if (!token) return { ok: false, error: 'You appear to be signed out.' };
  const { signal, cancel } = withTimeout(TIMEOUT_MS);
  try {
    const resp = await fetch(`${SUPABASE_URL}${SYNC_FN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: '{}',
      signal,
    });
    const body = await resp.json().catch(() => ({}) as Record<string, any>);
    if (!resp.ok) {
      return { ok: false, error: body?.error || `Sync failed (${resp.status}).` };
    }
    return { ok: true, tasksSynced: Number(body?.tasksSynced) || 0 };
  } catch {
    return { ok: false, error: 'Couldn’t reach the sync service — try again.' };
  } finally {
    cancel();
  }
}

/** RLS-scoped read of this profile's Task Sync connection status. */
export function useAsanaIntegration(profileId: string | null) {
  const [integration, setIntegration] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!profileId) {
      setIntegration(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('provider, workspace_gid, connected_at, last_synced_at, status')
      .eq('profile_id', profileId)
      .eq('provider', 'asana')
      .maybeSingle();
    // Pre-035 DBs (table absent) surface as an error — render as
    // not-connected rather than crashing the Settings screen.
    setIntegration(!error && data ? (data as IntegrationStatus) : null);
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { integration, loading, reload };
}
