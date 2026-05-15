// ============================================================
// Tabatha - Sync Service (Plan 023 router finalization)
// Owns Supabase sync and the local debounce used by storage mutations.
// ============================================================

import { getStorage, setStorage } from './storageService.js';
import { getFocusEngine } from './focusService.js';

let deps = {};
let syncTimeout = null;

export function configureSyncService(injected = {}) {
  deps = { ...deps, ...injected };
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
    } catch {
      // Sync is best-effort and should never interrupt extension behavior.
    }
  }, 10000);
}

export async function syncToSupabase() {
  const supabase = deps.supabase;
  if (!supabase) return;

  try {
    const session = await getAuthSession();
    if (!session) return;

    const { data: profile } = await supabase
      .schema('tabatha')
      .from('profiles')
      .select('id, default_org_id, default_team_id')
      .eq('auth_user_id', session.user.id)
      .single();

    if (!profile) {
      console.warn('Tabatha: No profile found for user. Skipping sync.');
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
        if (error) console.error('Tabatha: Error syncing focus items:', error);
      }
    }

    const { intentHistory } = await getStorage('intentHistory');
    if (intentHistory?.length > 0) {
      const { lastIntentSync } = await getStorage('lastIntentSync');
      const lastSyncTime = lastIntentSync ? new Date(lastIntentSync).getTime() : 0;
      const newIntents = intentHistory.filter(i => new Date(i.timestamp).getTime() > lastSyncTime);

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
          timestamp: intent.timestamp
        }));

        const { error } = await supabase
          .schema('tabatha')
          .from('intent_history')
          .insert(intentInserts);

        if (error) {
          console.error('Tabatha: Error syncing intent history:', error);
        } else {
          const newest = Math.max(...newIntents.map(i => new Date(i.timestamp).getTime()));
          await setStorage({ lastIntentSync: new Date(newest).toISOString() });
        }
      }
    }
  } catch (err) {
    console.error('Tabatha: Supabase sync failed:', err);
  }
}

export function registerSyncServiceAlarms() {
  chrome.alarms.create('supabase-sync', { periodInMinutes: 5 });
}
