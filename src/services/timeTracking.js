import { supabase, getSession } from './supabaseClient.js';

// Internal state to track active tabs and their start times
// activeTrackers[tabId] = { url, start_time, context, intent, category }
let activeTrackers = {}; 

/**
 * Start tracking time for a specific tab and URL.
 */
export async function startTracking(tabId, url, tabData) {
  if (activeTrackers[tabId]) {
    await stopTracking(tabId);
  }
  
  // Don't track internal chrome pages heavily, but record them
  activeTrackers[tabId] = {
    url,
    start_time: new Date().toISOString(),
    context: tabData?.context || null,
    intent: tabData?.intent || null,
    category: tabData?.category || null
  };
}

/**
 * Stop tracking time for a specific tab.
 */
export async function stopTracking(tabId) {
  const tracker = activeTrackers[tabId];
  if (!tracker) return;
  
  const end_time = new Date().toISOString();
  const duration_ms = new Date(end_time).getTime() - new Date(tracker.start_time).getTime();
  
  // Clean up
  delete activeTrackers[tabId];
  
  if (duration_ms < 1000) return; // Ignore micro-chunks under 1 second
  
  // Log time locally and queue for sync
  const timeLog = {
    url: tracker.url,
    start_time: tracker.start_time,
    end_time: end_time,
    duration_ms: duration_ms,
    context: tracker.context,
    intent: tracker.intent,
    category: tracker.category,
    synced: false
  };
  
  await queueTimeLog(timeLog);
  
  // Update the aggregated timeTracking storage key that the UI reads
  await updateTimeTrackingAggregates(tabId, duration_ms, tracker.category);
}

/**
 * Force stop all active tracking (e.g. when Chrome locks/idles).
 */
export async function stopAllTracking() {
  const tabIds = Object.keys(activeTrackers);
  for (const tabId of tabIds) {
    await stopTracking(tabId);
  }
}

/**
 * Log a manual offline/idle chunk.
 */
export async function logOfflineTime(idleSince, duration_ms, context, intent, category) {
  const start_time = idleSince;
  const end_time = new Date(new Date(idleSince).getTime() + duration_ms).toISOString();
  
  await queueTimeLog({
    url: 'offline://idle',
    start_time,
    end_time,
    duration_ms,
    context,
    intent,
    category,
    synced: false
  });
}

/**
 * Queue log locally and attempt remote sync.
 */
async function queueTimeLog(timeLog) {
  const { pendingTimeLogs = [] } = await chrome.storage.local.get('pendingTimeLogs');
  pendingTimeLogs.push(timeLog);
  await chrome.storage.local.set({ pendingTimeLogs });
  
  syncTimeLogs();
}

let syncTimeout = null;
/**
 * Batch sync pending time logs to Supabase.
 */
export async function syncTimeLogs() {
  if (syncTimeout) clearTimeout(syncTimeout);
  
  syncTimeout = setTimeout(async () => {
    const { pendingTimeLogs = [] } = await chrome.storage.local.get('pendingTimeLogs');
    if (pendingTimeLogs.length === 0) return;
    
    try {
      const session = await getSession();
      if (!session) return; // Not logged in
      
      // Fetch user profile to get Org/Team routing
      const { data: profile } = await supabase
        .schema('tabatha')
        .from('profiles')
        .select('id, default_org_id, default_team_id')
        .eq('auth_user_id', session.user.id)
        .single();
        
      if (!profile || !profile.default_org_id) {
        console.warn('Tabatha Time Tracker: User lacks default_org_id. Cannot sync time.');
        return;
      }

      const logsToInsert = pendingTimeLogs.map(log => {
        let domain = null;
        try {
          if (log.url && log.url.startsWith('http')) {
            domain = new URL(log.url).hostname;
          }
        } catch(e) {}

        return {
          org_id: profile.default_org_id,
          team_id: profile.default_team_id, // could be null
          profile_id: profile.id,
          start_time: log.start_time,
          end_time: log.end_time,
          duration_ms: log.duration_ms,
          context_label: log.context,
          intent_label: log.intent,
          category: log.category,
          domain: domain,
          url: log.url
        };
      });

      const { error } = await supabase
        .schema('tabatha')
        .from('time_logs')
        .insert(logsToInsert);
        
      if (!error) {
        // Clear synced logs
        await chrome.storage.local.set({ pendingTimeLogs: [] });
      } else {
        console.error('Tabatha Time Sync Error:', error);
      }
    } catch (err) {
      console.error('Tabatha Time Sync Failed:', err);
    }
  }, 5000); // 5 sec debounce
}

/**
 * Update the aggregated `timeTracking` storage key that the UI reads.
 * Adds duration to byTab[tabId] and byCategory[category] maps.
 */
async function updateTimeTrackingAggregates(tabId, durationMs, category) {
  const { timeTracking = { byTab: {}, byGroup: {}, bySubGroup: {}, byCategory: {}, byProject: {} } } =
    await chrome.storage.local.get('timeTracking');

  // Aggregate per tab
  timeTracking.byTab[tabId] = (timeTracking.byTab[tabId] || 0) + durationMs;

  // Aggregate per category
  if (category) {
    timeTracking.byCategory[category] = (timeTracking.byCategory[category] || 0) + durationMs;
  }

  await chrome.storage.local.set({ timeTracking });
}
