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
import { getInstallIdentity, recordSupabaseId, touchLastSeen } from '../../services/installIdentity.js';
import { bootstrapOrgRegistry, isBootstrapNeeded } from './bootstrapPull.js';
import { getCompanionBrowserProfileId } from './companionInstallService.js';

let deps = {};
let syncTimeout = null;
let storageListenerRegistered = false;

const MAX_DIAGNOSTIC_ROWS = 20;
const DURABLE_SYNC_KEYS = new Set([
  'tabathaOrg',
  'clockHistory',
  'companionRecentSessions',
  'desktopActivity',
  'calendars',
  'calendarEvents'
]);

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

export function registerSyncStorageListener() {
  if (storageListenerRegistered) return;
  storageListenerRegistered = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (Object.keys(changes || {}).some(key => DURABLE_SYNC_KEYS.has(key))) {
      triggerSync();
    }
  });
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

function syncScope(profileId, orgId, teamId, browserProfileId) {
  return {
    profile_id: profileId,
    org_id: orgId || null,
    team_id: teamId || null,
    browser_profile_id: browserProfileId || null
  };
}

// Ensures a tabatha.browser_profiles row exists for this install. On first
// run inserts a row and stores its id back to chrome.storage.local under
// _browserProfile.supabaseId. On subsequent runs updates last_seen_at +
// any user-edited classification / profile_name. Returns the id or null
// on failure (already diagnosed).
async function ensureBrowserProfileRow(supabase, profileId) {
  const identity = await getInstallIdentity();
  const payload = {
    profile_id: profileId,
    browser: 'chrome',
    profile_name: identity.profileName || null,
    classification: identity.classification || 'professional',
    extension_installed: true,
    last_seen_at: new Date().toISOString()
  };

  try {
    if (identity.supabaseId) {
      const { error } = await supabase
        .schema('tabatha')
        .from('browser_profiles')
        .update(payload)
        .eq('id', identity.supabaseId)
        .eq('profile_id', profileId);
      if (error) {
        await recordDiagnostic('browser_profile_update_failed', error);
        return null;
      }
      await touchLastSeen();
      return identity.supabaseId;
    }

    const { data, error } = await supabase
      .schema('tabatha')
      .from('browser_profiles')
      .insert(payload)
      .select('id')
      .single();
    if (error) {
      await recordDiagnostic('browser_profile_insert_failed', error);
      return null;
    }
    const id = data?.id || null;
    if (id) await recordSupabaseId(id);
    return id;
  } catch (err) {
    await recordDiagnostic('browser_profile_threw', err);
    return null;
  }
}

function isoOrNull(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function isoOrNow(value) {
  return isoOrNull(value) || new Date().toISOString();
}

function numericDuration(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function mapValues(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.values(value)
    : [];
}

function makeClientId(prefix, ...parts) {
  return [prefix, ...parts.filter(Boolean)].join(':').slice(0, 500);
}

async function upsertRows(supabase, table, rows, onConflict, diagnosticKind) {
  if (!rows.length) return true;
  const { error } = await supabase
    .schema('tabatha')
    .from(table)
    .upsert(rows, { onConflict });
  if (error) {
    await recordDiagnostic(diagnosticKind, error);
    return false;
  }
  return true;
}

function buildFocusRows(engine, scope) {
  const byId = new Map();
  for (const item of Object.values(engine?.items || {})) {
    if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
  }
  for (const item of toArray(engine?.history)) {
    if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
  }

  return Array.from(byId.values()).map(item => ({
    ...scope,
    client_id: item.id,
    label: item.label || 'Untitled focus',
    funnel_stage: item.funnelStage || (item.focusState === 'completed' ? 'resolved' : 'unsorted'),
    focus_state: item.focusState || (item.endedAt || item.completedAt ? 'completed' : 'paused'),
    timer_minutes: Number.isFinite(Number(item.timerMinutes)) ? Number(item.timerMinutes) : 15,
    tags: item.tags || {},
    created_at: isoOrNow(item.createdAt || item.startedAt),
    completed_at: isoOrNull(item.completedAt || item.endedAt),
    synced_at: new Date().toISOString()
  }));
}

function buildOrgRows(tabathaOrg, scope) {
  const now = new Date().toISOString();
  const operations = mapValues(tabathaOrg?.operations)
    .filter(item => item?.id && item?.name)
    .map(item => ({
      ...scope,
      operation_id: item.id,
      name: item.name,
      archived: !!item.archived,
      created_at: isoOrNow(item.createdAt),
      archived_at: isoOrNull(item.archivedAt),
      metadata: item,
      synced_at: now
    }));

  const initiatives = mapValues(tabathaOrg?.initiatives)
    .filter(item => item?.id && item?.name)
    .map(item => ({
      ...scope,
      initiative_id: item.id,
      operation_id: item.operationId || null,
      name: item.name,
      archived: !!item.archived,
      created_at: isoOrNow(item.createdAt),
      archived_at: isoOrNull(item.archivedAt),
      metadata: item,
      synced_at: now
    }));

  const clients = mapValues(tabathaOrg?.clients)
    .filter(item => item?.id && item?.name)
    .map(item => ({
      ...scope,
      client_id: item.id,
      initiative_id: item.initiativeId || null,
      name: item.name,
      archived: !!item.archived,
      created_at: isoOrNow(item.createdAt),
      archived_at: isoOrNull(item.archivedAt),
      metadata: item,
      synced_at: now
    }));

  const projects = mapValues(tabathaOrg?.projects)
    .filter(item => item?.id && item?.name)
    .map(item => ({
      ...scope,
      project_id: item.id,
      client_id: item.clientId || null,
      name: item.name,
      archived: !!item.archived,
      created_at: isoOrNow(item.createdAt),
      archived_at: isoOrNull(item.archivedAt),
      metadata: item,
      synced_at: now
    }));

  const tasks = mapValues(tabathaOrg?.tasks)
    .filter(item => item?.id && item?.name)
    .map(item => ({
      ...scope,
      task_id: item.id,
      project_id: item.projectId || null,
      client_id: item.clientId || null,
      name: item.name,
      description: item.description || '',
      status: item.status || (item.completedAt ? 'completed' : 'active'),
      funnel_stage: item.funnelStage || (item.completedAt ? 'resolved' : 'unsorted'),
      linked_intents: toArray(item.linkedIntents),
      archived: !!item.archived,
      created_at: isoOrNow(item.createdAt),
      completed_at: isoOrNull(item.completedAt),
      archived_at: isoOrNull(item.archivedAt),
      metadata: item,
      synced_at: now
    }));

  return { operations, initiatives, clients, projects, tasks };
}

function computeBreakMs(breaks) {
  return toArray(breaks).reduce((total, brk) => {
    const start = isoOrNull(brk?.start);
    const end = isoOrNull(brk?.end);
    if (!start || !end) return total;
    return total + Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  }, 0);
}

function buildClockRows(clockHistory, scope, lastClockSync) {
  const lastSyncMs = lastClockSync ? new Date(lastClockSync).getTime() : 0;
  const rows = [];
  let newest = lastSyncMs;

  for (const session of toArray(clockHistory)) {
    const clockedInAt = isoOrNull(session?.clockedInAt);
    const clockedOutAt = isoOrNull(session?.clockedOutAt);
    if (!clockedInAt || !clockedOutAt) continue;

    const outMs = new Date(clockedOutAt).getTime();
    if (outMs <= lastSyncMs) continue;

    const inMs = new Date(clockedInAt).getTime();
    const totalMs = Math.max(0, outMs - inMs);
    const breakMs = computeBreakMs(session.breaks);
    rows.push({
      ...scope,
      client_id: session.id || makeClientId('clock', clockedInAt, clockedOutAt),
      clocked_in_at: clockedInAt,
      clocked_out_at: clockedOutAt,
      total_ms: numericDuration(session.totalMs) ?? totalMs,
      break_ms: numericDuration(session.breakMs) ?? breakMs,
      work_ms: numericDuration(session.workMs) ?? Math.max(0, totalMs - breakMs),
      breaks: toArray(session.breaks),
      source: session.source || 'extension',
      synced_at: new Date().toISOString()
    });
    newest = Math.max(newest, outMs);
  }

  return { rows, newest: newest > lastSyncMs ? new Date(newest).toISOString() : null };
}

function companionEventTime(item) {
  return isoOrNull(item?.ended_at || item?.endedAt || item?.end || item?.timestamp || item?.started_at || item?.startedAt || item?.start);
}

function buildDesktopRows(companionRecentSessions, desktopActivity, scope, lastDesktopSync, companionBrowserProfileId) {
  const lastSyncMs = lastDesktopSync ? new Date(lastDesktopSync).getTime() : 0;
  const rows = [];
  let newest = lastSyncMs;

  // Desktop activity belongs to the COMPANION install, not the extension's
  // browser_profile. If a companion has been proxy-registered we attribute
  // these rows to it; otherwise we fall back to the extension's stamp so
  // the data still gets RLS-correct attribution under this user.
  const desktopScope = companionBrowserProfileId
    ? { ...scope, browser_profile_id: companionBrowserProfileId }
    : scope;

  for (const session of toArray(companionRecentSessions)) {
    const eventAt = companionEventTime(session);
    if (!eventAt) continue;
    const eventMs = new Date(eventAt).getTime();
    if (eventMs <= lastSyncMs) continue;

    const startedAt = isoOrNull(session.started_at || session.startedAt || session.start || session.timestamp);
    const endedAt = isoOrNull(session.ended_at || session.endedAt || session.end);
    const inferredDuration = startedAt && endedAt
      ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime())
      : null;
    rows.push({
      ...desktopScope,
      activity_id: session.id || makeClientId('companion', startedAt || eventAt, endedAt, session.app_name || session.appName, session.window_title || session.windowTitle),
      source: 'companion',
      kind: 'session',
      app_name: session.app_name || session.appName || null,
      display_name: session.app_display_name || session.displayName || session.display_name || null,
      window_title: session.window_title || session.windowTitle || null,
      category: session.category || null,
      started_at: startedAt,
      ended_at: endedAt,
      timestamp: eventAt,
      duration_ms: numericDuration(session.duration_ms ?? session.durationMs) ?? inferredDuration,
      payload: session,
      synced_at: new Date().toISOString()
    });
    newest = Math.max(newest, eventMs);
  }

  for (const event of toArray(desktopActivity)) {
    const eventAt = isoOrNull(event?.timestamp || event?.started_at || event?.startedAt || event?.start);
    if (!eventAt) continue;
    const eventMs = new Date(eventAt).getTime();
    if (eventMs <= lastSyncMs) continue;

    rows.push({
      ...desktopScope,
      activity_id: event.id || makeClientId('desktop', eventAt, event.appName || event.app_name, event.windowTitle || event.window_title),
      source: 'desktop',
      kind: event.type || event.kind || 'activity',
      app_name: event.appName || event.app_name || null,
      display_name: event.displayName || event.display_name || null,
      window_title: event.windowTitle || event.window_title || null,
      category: event.category || null,
      started_at: isoOrNull(event.started_at || event.startedAt || event.start || event.timestamp),
      ended_at: isoOrNull(event.ended_at || event.endedAt || event.end),
      timestamp: eventAt,
      duration_ms: numericDuration(event.duration_ms ?? event.durationMs),
      payload: event,
      synced_at: new Date().toISOString()
    });
    newest = Math.max(newest, eventMs);
  }

  return { rows, newest: newest > lastSyncMs ? new Date(newest).toISOString() : null };
}

function buildCalendarRows(calendars, scope) {
  const now = new Date().toISOString();
  return toArray(calendars)
    .filter(item => item?.id && item?.name)
    .map(item => ({
      ...scope,
      calendar_id: item.id,
      name: item.name,
      color: item.color || '#6366f1',
      provider: item.provider || 'native',
      provider_calendar_id: item.providerCalendarId || null,
      is_writable: item.isWritable !== false,
      is_visible: item.isVisible !== false,
      sync_token: item.syncToken || null,
      created_at: isoOrNow(item.createdAt),
      updated_at: isoOrNow(item.updatedAt),
      metadata: item,
      synced_at: now
    }));
}

function buildCalendarEventRows(calendarEvents, scope) {
  const now = new Date().toISOString();
  return toArray(calendarEvents)
    .filter(item => item?.id && item?.calendarId && item?.title)
    .map(item => ({
      ...scope,
      calendar_id: item.calendarId,
      event_id: item.id,
      title: item.title,
      description: item.description || '',
      start_time: isoOrNow(item.startTime),
      end_time: isoOrNow(item.endTime),
      is_all_day: !!item.isAllDay,
      color_override: item.colorOverride || null,
      location: item.location || '',
      rrule: item.rrule || null,
      exdate: item.exdate || '',
      associated_focus_id: item.associatedFocusId || null,
      associated_task_id: item.associatedTaskId || null,
      provider_event_id: item.providerEventId || null,
      etag: item.etag || null,
      last_synced_at: isoOrNull(item.lastSyncedAt),
      created_at: isoOrNow(item.createdAt),
      updated_at: isoOrNow(item.updatedAt),
      metadata: item,
      synced_at: now
    }));
}

async function syncCalendarsAndEvents(supabase, scope) {
  try {
    const { calendars: localCalendars } = await getStorage('calendars');
    const { calendarEvents: localEvents } = await getStorage('calendarEvents');

    const localCalArr = Array.isArray(localCalendars) ? localCalendars : [];
    const localEvtArr = Array.isArray(localEvents) ? localEvents : [];

    // 1. PULL from Supabase
    const { data: serverCalendars, error: calError } = await supabase
      .schema('tabatha')
      .from('calendars')
      .select('*')
      .eq('profile_id', scope.profile_id);

    if (calError) {
      await recordDiagnostic('pull_calendars_failed', calError);
      return false;
    }

    const { data: serverEvents, error: evtError } = await supabase
      .schema('tabatha')
      .from('calendar_events')
      .select('*')
      .eq('profile_id', scope.profile_id);

    if (evtError) {
      await recordDiagnostic('pull_events_failed', evtError);
      return false;
    }

    // 2. Bidirectional Merge Calendars
    const mergedCalendars = [...localCalArr];
    for (const serverCal of serverCalendars || []) {
      const localIdx = mergedCalendars.findIndex(c => c.id === serverCal.calendar_id);
      const serverMetadata = serverCal.metadata || {};
      const serverItem = {
        id: serverCal.calendar_id,
        name: serverCal.name,
        color: serverCal.color,
        provider: serverCal.provider,
        providerCalendarId: serverCal.provider_calendar_id,
        isWritable: serverCal.is_writable,
        isVisible: serverCal.is_visible,
        syncToken: serverCal.sync_token,
        createdAt: serverCal.created_at,
        updatedAt: serverCal.updated_at,
        ...serverMetadata
      };

      if (localIdx < 0) {
        mergedCalendars.push(serverItem);
      } else {
        const localItem = mergedCalendars[localIdx];
        const localTime = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
        const serverTime = new Date(serverCal.updated_at || serverCal.created_at || 0).getTime();
        if (serverTime > localTime) {
          mergedCalendars[localIdx] = serverItem;
        }
      }
    }

    // 3. Bidirectional Merge Events
    const mergedEvents = [...localEvtArr];
    for (const serverEvt of serverEvents || []) {
      const localIdx = mergedEvents.findIndex(e => e.id === serverEvt.event_id);
      const serverMetadata = serverEvt.metadata || {};
      const serverItem = {
        id: serverEvt.event_id,
        calendarId: serverEvt.calendar_id,
        title: serverEvt.title,
        description: serverEvt.description || '',
        startTime: serverEvt.start_time,
        endTime: serverEvt.end_time,
        isAllDay: !!serverEvt.is_all_day,
        colorOverride: serverEvt.color_override || null,
        location: serverEvt.location || '',
        rrule: serverEvt.rrule || null,
        exdate: serverEvt.exdate || '',
        associatedFocusId: serverEvt.associated_focus_id || null,
        associatedTaskId: serverEvt.associated_task_id || null,
        providerEventId: serverEvt.provider_event_id || null,
        etag: serverEvt.etag || null,
        lastSyncedAt: serverEvt.last_synced_at || null,
        createdAt: serverEvt.created_at,
        updatedAt: serverEvt.updated_at,
        ...serverMetadata
      };

      if (localIdx < 0) {
        mergedEvents.push(serverItem);
      } else {
        const localItem = mergedEvents[localIdx];
        const localTime = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
        const serverTime = new Date(serverEvt.updated_at || serverEvt.created_at || 0).getTime();
        if (serverTime > localTime) {
          mergedEvents[localIdx] = serverItem;
        }
      }
    }

    // Save merged arrays back to chrome.storage.local
    await setStorage({
      calendars: mergedCalendars,
      calendarEvents: mergedEvents
    });

    // 4. PUSH upserts back to Supabase
    const calRows = buildCalendarRows(mergedCalendars, scope);
    const evtRows = buildCalendarEventRows(mergedEvents, scope);

    const okCal = await upsertRows(supabase, 'calendars', calRows, 'profile_id, calendar_id', 'calendars_upsert_failed');
    const okEvt = await upsertRows(supabase, 'calendar_events', evtRows, 'profile_id, event_id', 'calendar_events_upsert_failed');

    return okCal && okEvt;
  } catch (err) {
    await recordDiagnostic('sync_calendars_failed', err);
    return false;
  }
}

async function syncOrgRegistry(supabase, scope) {
  const { tabathaOrg } = await getStorage('tabathaOrg');
  if (!tabathaOrg) return true;

  const rows = buildOrgRows(tabathaOrg, scope);
  const results = await Promise.all([
    upsertRows(supabase, 'operations', rows.operations, 'profile_id, operation_id', 'operations_upsert_failed'),
    upsertRows(supabase, 'initiatives', rows.initiatives, 'profile_id, initiative_id', 'initiatives_upsert_failed'),
    upsertRows(supabase, 'clients', rows.clients, 'profile_id, client_id', 'clients_upsert_failed'),
    upsertRows(supabase, 'projects', rows.projects, 'profile_id, project_id', 'projects_upsert_failed'),
    upsertRows(supabase, 'tasks_registry', rows.tasks, 'profile_id, task_id', 'tasks_registry_upsert_failed')
  ]);
  return results.every(Boolean);
}

async function syncClockHistory(supabase, scope) {
  const { clockHistory, lastClockSync } = await getStorage(['clockHistory', 'lastClockSync']);
  const { rows, newest } = buildClockRows(clockHistory, scope, lastClockSync);
  const ok = await upsertRows(supabase, 'clock_sessions', rows, 'profile_id, client_id', 'clock_sessions_upsert_failed');
  if (ok && newest) await setStorage({ lastClockSync: newest });
  return ok;
}

async function syncDesktopActivity(supabase, scope) {
  const { companionRecentSessions, desktopActivity, lastDesktopActivitySync } = await getStorage([
    'companionRecentSessions',
    'desktopActivity',
    'lastDesktopActivitySync'
  ]);
  const companionBrowserProfileId = await getCompanionBrowserProfileId();
  const { rows, newest } = buildDesktopRows(companionRecentSessions, desktopActivity, scope, lastDesktopActivitySync, companionBrowserProfileId);
  const ok = await upsertRows(supabase, 'desktop_activity', rows, 'profile_id, activity_id', 'desktop_activity_upsert_failed');
  if (ok && newest) await setStorage({ lastDesktopActivitySync: newest });
  return ok;
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

    // Phase A: register / refresh this install's browser_profiles row.
    // This must happen before any other table push so subsequent rows
    // carry a valid browser_profile_id FK.
    const browserProfileId = await ensureBrowserProfileRow(supabase, profileId);

    // Phase B: pull the org registry once per install, before pushing it
    // back up. Prevents this install from creating duplicate rows for
    // entities the other install(s) already pushed.
    if (await isBootstrapNeeded()) {
      try {
        const result = await bootstrapOrgRegistry({ supabase, profileId });
        await recordDiagnostic('bootstrap_pull_completed',
          `Adopted ${result.adoptedFromServer} from server, re-keyed ${result.renamedLocal} local entries, ${result.merged} already aligned.`);
      } catch (err) {
        await recordDiagnostic('bootstrap_pull_failed', err);
      }
    }

    const scope = syncScope(profileId, orgId, teamId, browserProfileId);
    let hadError = false;

    const engine = await getFocusEngine();
    if (engine?.items || engine?.history) {
      const focusUpserts = buildFocusRows(engine, scope);

      if (focusUpserts.length > 0) {
        const ok = await upsertRows(supabase, 'focus_items', focusUpserts, 'profile_id, client_id', 'focus_items_upsert_failed');
        if (!ok) hadError = true;
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
          browser_profile_id: browserProfileId || null,
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
          hadError = true;
        } else {
          const newest = Math.max(...newIntents.map(i => new Date(i.timestamp).getTime()));
          await setStorage({ lastIntentSync: new Date(newest).toISOString() });
        }
      }
    }

    if (!(await syncOrgRegistry(supabase, scope))) hadError = true;
    if (!(await syncClockHistory(supabase, scope))) hadError = true;
    if (!(await syncDesktopActivity(supabase, scope))) hadError = true;
    if (!(await syncCalendarsAndEvents(supabase, scope))) hadError = true;

    if (partial) {
      await recordDiagnostic('partial_sync', 'Sync ran with org/team scoping disabled because migration 005 has not been applied. Run supabase/migrations/005_add_profile_defaults.sql in the Supabase SQL Editor.');
    }
    if (hadError) {
      await recordDiagnostic('sync_completed_with_errors', 'One or more sync blocks failed. See the preceding diagnostic rows for details.');
    } else {
      await recordSuccess();
    }
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
    case 'REPULL_ORG_REGISTRY': {
      // Forcing a re-bootstrap: clear the watermark and run a sync. The
      // sync entrypoint sees the missing watermark and re-runs the merge.
      await chrome.storage.local.remove('_orgRegistryBootstrappedAt');
      await syncToSupabase();
      const { _syncDiagnostics, _lastSyncSuccess } = await getStorage(['_syncDiagnostics', '_lastSyncSuccess']);
      return {
        success: true,
        lastSyncSuccess: _lastSyncSuccess || null,
        recentDiagnostics: Array.isArray(_syncDiagnostics) ? _syncDiagnostics.slice(0, 5) : []
      };
    }
    default:
      return undefined;
  }
}
