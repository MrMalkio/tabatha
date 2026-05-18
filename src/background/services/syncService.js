// ============================================================
// Tabatha - Sync Service (Plan 023 router finalization + v4.0.0 diagnostics)
// Owns Supabase sync and the local debounce used by storage mutations.
//
// Diagnostics: every bail/error writes a row to
// chrome.storage.local._syncDiagnostics so the Settings UI can show users why
// sync isn't happening, without needing the service-worker DevTools console.
// ============================================================

import { getStorage, setStorage } from './storageService.js';
import { getFocusEngine } from './focusService.js';

let deps = {};
let syncTimeout = null;

const MAX_DIAGNOSTIC_ROWS = 20;

export function configureSyncService(injected = {}) {
  deps = { ...deps, ...injected };
}

async function recordDiagnostic(kind, detail) {
  try {
    const { _syncDiagnostics } = await getStorage('_syncDiagnostics');
    const rows = Array.isArray(_syncDiagnostics) ? _syncDiagnostics : [];
    rows.unshift({
      kind,
      detail: typeof detail === 'string' ? detail : (detail?.message || JSON.stringify(detail)),
      at: new Date().toISOString()
    });
    await setStorage({ _syncDiagnostics: rows.slice(0, MAX_DIAGNOSTIC_ROWS) });
  } catch {
    // Diagnostics write is best-effort. Don't let it crash the sync path.
  }
}

async function recordSuccess() {
  try {
    await setStorage({ _lastSyncSuccess: new Date().toISOString() });
  } catch { /* ignore */ }
}

export async function getAuthSession() {
  const supabase = deps.supabase;
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function triggerSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      const session = await getAuthSession();
      if (!session) return;
      await syncToSupabase();
    } catch (err) {
      await recordDiagnostic('debounce_failure', err);
    }
  }, 10000);
}

// Defensive profile read. Tries the wide select first; if the columns
// `default_org_id` / `default_team_id` are missing (migration 005 not yet
// applied), falls back to a minimal select so the rest of the sync can
// proceed without org/team scoping.
async function readProfile(supabase, authUserId) {
  const wide = await supabase
    .schema('tabatha')
    .from('profiles')
    .select('id, default_org_id, default_team_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (!wide.error) return { profile: wide.data, partial: false };

  // Wide select failed — almost certainly an unknown-column error. Try minimal.
  await recordDiagnostic('profile_wide_select_failed', wide.error);

  const minimal = await supabase
    .schema('tabatha')
    .from('profiles')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (minimal.error) {
    await recordDiagnostic('profile_minimal_select_failed', minimal.error);
    return { profile: null, partial: false };
  }

  return { profile: minimal.data ? { ...minimal.data, default_org_id: null, default_team_id: null } : null, partial: true };
}

export async function syncToSupabase() {
  const supabase = deps.supabase;
  if (!supabase) {
    await recordDiagnostic('no_supabase_client', 'configureSyncService was not called with a supabase client');
    return;
  }

  try {
    const session = await getAuthSession();
    if (!session) {
      await recordDiagnostic('no_auth_session', 'Sync attempted while signed out');
      return;
    }

    const { profile, partial } = await readProfile(supabase, session.user.id);

    if (!profile) {
      await recordDiagnostic('no_profile_row', `No tabatha.profiles row for auth_user_id=${session.user.id}. The profile auto-provision may have failed — try signing out and back in.`);
      return;
    }

    const profileId = profile.id;
    const orgId = profile.default_org_id;
    const teamId = profile.default_team_id;

    const engine = await getFocusEngine();
    if (engine?.items) {
      const focusUpserts = Object.values(engine.items).map(item => ({
        profile_id: profileId,
        org_id: orgId || null,
        team_id: teamId || null,
        client_id: item.id,
        label: item.label,
        funnel_stage: item.funnelStage || 'unsorted',
        focus_state: item.focusState || 'paused',
        timer_minutes: item.timerMinutes || 15,
        tags: item.tags || {},
        completed_at: item.completedAt || null,
        synced_at: new Date().toISOString()
      }));

      if (focusUpserts.length > 0) {
        const { error } = await supabase
          .schema('tabatha')
          .from('focus_items')
          .upsert(focusUpserts, { onConflict: 'profile_id, client_id' });
        if (error) await recordDiagnostic('focus_items_upsert_failed', error);
      }
    }

    const { intentHistory } = await getStorage('intentHistory');
    if (intentHistory?.length > 0) {
      const { lastIntentSync } = await getStorage('lastIntentSync');
      const lastSyncTime = lastIntentSync ? new Date(lastIntentSync).getTime() : 0;
      const newIntents = intentHistory
        .filter(i => i.timestamp && !Number.isNaN(new Date(i.timestamp).getTime()))
        .filter(i => new Date(i.timestamp).getTime() > lastSyncTime);

      if (newIntents.length > 0) {
        const intentInserts = newIntents.map(intent => ({
          profile_id: profileId,
          org_id: orgId || null,
          team_id: teamId || null,
          action: intent.action || 'unknown',
          context: intent.context ?? intent.newContext ?? null,
          focus_id: intent.focusId || null,
          url: intent.url || null,
          domain: intent.domain || null,
          // Normalize to ISO 8601 — PostgreSQL TIMESTAMPTZ rejects raw epoch-ms
          // numbers. Pre-v3.13 entries (migrated via bootstrap.migrateIntentChangeLog)
          // may still be numbers; new Date(...).toISOString() converts both.
          timestamp: new Date(intent.timestamp).toISOString()
        }));

        const { error } = await supabase
          .schema('tabatha')
          .from('intent_history')
          .insert(intentInserts);

        if (error) {
          await recordDiagnostic('intent_history_insert_failed', error);
        } else {
          const newest = Math.max(...newIntents.map(i => new Date(i.timestamp).getTime()));
          await setStorage({ lastIntentSync: new Date(newest).toISOString() });
        }
      }
    }

    if (partial) {
      await recordDiagnostic('partial_sync', 'Sync ran with org/team scoping disabled because migration 005 has not been applied. Run supabase/migrations/005_add_profile_defaults.sql in the Supabase SQL Editor.');
    }
    await recordSuccess();
  } catch (err) {
    await recordDiagnostic('sync_threw', err);
  }
}

export function registerSyncServiceAlarms() {
  chrome.alarms.create('supabase-sync', { periodInMinutes: 5 });
}

// Message handlers wired into the service router (background.js). Settings UI
// calls these so the user doesn't have to wait for the 5-minute alarm to see
// whether sync actually works.
export async function handleMessage(type) {
  switch (type) {
    case 'SYNC_NOW': {
      // Run sync immediately and return the post-sync state so the UI knows
      // whether anything new went wrong (no need to poll diagnostics).
      await syncToSupabase();
      const { _syncDiagnostics, _lastSyncSuccess } = await getStorage(['_syncDiagnostics', '_lastSyncSuccess']);
      return {
        success: true,
        lastSyncSuccess: _lastSyncSuccess || null,
        recentDiagnostics: Array.isArray(_syncDiagnostics) ? _syncDiagnostics.slice(0, 5) : []
      };
    }
    case 'CLEAR_SYNC_DIAGNOSTICS': {
      await setStorage({ _syncDiagnostics: [] });
      return { success: true };
    }
    default:
      return undefined;
  }
}
