// ════════════════════════════════════════════
// scheduleApi — thin Supabase wrappers for NB-01/NB-02
// (Work Schedule, Work Profiles, Required Hours, Shortfall accounting).
//
// All tables/RPCs live in the `tabatha` schema (migration 027) and are
// RLS-gated by migration 022's helpers: members read their own rows;
// the can_manage_profile scope (owner/admin org-wide, manager/sub_manager
// team-scoped) reads/writes members it manages. Writes that need privilege
// checks beyond RLS go through SECURITY DEFINER RPCs (set_member_schedule,
// set_work_requirements, set_member_work_profile, decide_change_request).
//
// Every wrapper follows the createInviteToken precedent in
// src/services/supabaseClient.js: schema-qualified, throws on error.
// ════════════════════════════════════════════

import { supabase, getSession } from './supabaseClient';

async function requireSession(what) {
  const session = await getSession();
  if (!session) throw new Error(`Must be signed in to ${what}.`);
  return session;
}

// ── Reads ───────────────────────────────────────────────────

/** Weekly schedule slots for a member (own rows need no orgId filter). */
export async function getScheduleSlots({ profileId, orgId = null }) {
  await requireSession('read schedules');
  let q = supabase
    .schema('tabatha')
    .from('work_schedule_slots')
    .select('id, org_id, profile_id, weekday, start_minute, end_minute, set_by, updated_at')
    .eq('profile_id', profileId)
    .order('weekday', { ascending: true })
    .order('start_minute', { ascending: true });
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Open (active) required-hours floors for a member. */
export async function getWorkRequirements({ profileId, orgId = null, includeHistory = false }) {
  await requireSession('read requirements');
  let q = supabase
    .schema('tabatha')
    .from('work_requirements')
    .select('id, org_id, team_id, profile_id, cadence, min_minutes, effective_from, effective_to, created_by, updated_at')
    .eq('profile_id', profileId)
    .order('effective_from', { ascending: false });
  if (orgId) q = q.eq('org_id', orgId);
  if (!includeHistory) q = q.is('effective_to', null);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** The caller's (or a member's) org membership incl. work_profile_type. */
export async function getMembership({ profileId, orgId }) {
  await requireSession('read memberships');
  const { data, error } = await supabase
    .schema('tabatha')
    .from('org_members')
    .select('org_id, profile_id, role, work_profile_type')
    .eq('org_id', orgId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Roster of an org (RLS scopes what's visible). */
export async function getOrgRoster(orgId) {
  await requireSession('read the roster');
  const { data: members, error } = await supabase
    .schema('tabatha')
    .from('org_members')
    .select('profile_id, role, work_profile_type')
    .eq('org_id', orgId);
  if (error) throw error;
  const ids = (members || []).map(m => m.profile_id);
  if (ids.length === 0) return [];
  const { data: profiles, error: pErr } = await supabase
    .schema('tabatha')
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', ids);
  if (pErr) throw pErr;
  const byId = new Map((profiles || []).map(p => [p.id, p]));
  return (members || []).map(m => ({
    ...m,
    display_name: byId.get(m.profile_id)?.display_name || 'Unknown user',
    avatar_url: byId.get(m.profile_id)?.avatar_url || null,
  })).sort((a, b) => a.display_name.localeCompare(b.display_name));
}

/** Display names for a set of profile ids (RLS scopes visibility). */
export async function getProfileNames(profileIds) {
  await requireSession('read profiles');
  const ids = [...new Set((profileIds || []).filter(Boolean))];
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .schema('tabatha')
    .from('profiles')
    .select('id, display_name')
    .in('id', ids);
  if (error) throw error;
  return Object.fromEntries((data || []).map(p => [p.id, p.display_name || 'Unknown user']));
}

/** Change requests filed by/for a member. */
export async function listMyChangeRequests(profileId) {
  await requireSession('read change requests');
  const { data, error } = await supabase
    .schema('tabatha')
    .from('schedule_change_requests')
    .select('*')
    .or(`profile_id.eq.${profileId},requested_by.eq.${profileId}`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

/** Pending change requests across the given orgs (OA approval inbox). */
export async function listPendingChangeRequests(orgIds) {
  await requireSession('read the approval inbox');
  if (!orgIds?.length) return [];
  const { data, error } = await supabase
    .schema('tabatha')
    .from('schedule_change_requests')
    .select('*')
    .in('org_id', orgIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Shortfall ledger rows for a member (unresolved first). */
export async function listShortfalls({ profileId, orgId = null, unresolvedOnly = false }) {
  await requireSession('read shortfalls');
  let q = supabase
    .schema('tabatha')
    .from('shortfall_ledger')
    .select('*')
    .eq('profile_id', profileId)
    .order('period_start', { ascending: false })
    .limit(50);
  if (orgId) q = q.eq('org_id', orgId);
  if (unresolvedOnly) q = q.eq('resolution', 'unresolved');
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ── Writes ──────────────────────────────────────────────────

/** OA/manager: replace a member's weekly slot set (RPC, atomic). */
export async function setMemberSchedule({ orgId, profileId, slots }) {
  await requireSession('set a schedule');
  const { data, error } = await supabase
    .schema('tabatha')
    .rpc('set_member_schedule', {
      p_org_id: orgId,
      p_profile_id: profileId,
      p_slots: slots,
    });
  if (error) throw error;
  return data;
}

/**
 * OA/manager: upsert required-hours floors (RPC).
 * requirements: [{ cadence: 'daily'|'weekly'|'monthly', min_minutes: int|null }]
 * min_minutes null clears that cadence's floor.
 */
export async function setWorkRequirements({ orgId, profileId, requirements, teamId = null }) {
  await requireSession('set requirements');
  const { data, error } = await supabase
    .schema('tabatha')
    .rpc('set_work_requirements', {
      p_org_id: orgId,
      p_profile_id: profileId,
      p_requirements: requirements,
      p_team_id: teamId,
    });
  if (error) throw error;
  return data;
}

/** OA/manager: set a member's work profile type (RPC). */
export async function setMemberWorkProfile({ orgId, profileId, type }) {
  await requireSession('set a work profile');
  const { data, error } = await supabase
    .schema('tabatha')
    .rpc('set_member_work_profile', {
      p_org_id: orgId,
      p_profile_id: profileId,
      p_type: type,
    });
  if (error) throw error;
  return data;
}

/**
 * Member: file a schedule change request.
 * kind 'slot_change'  payload { slots: [{weekday,start_minute,end_minute}] }
 * kind 'shift_hours'  payload { from_date, to_date, minutes, shortfall_ledger_id? }
 * kind 'make_up'      payload { date, minutes, shortfall_ledger_id? }
 */
export async function submitChangeRequest({ orgId, profileId, requestedBy, kind, payload, reason = null }) {
  await requireSession('file a change request');
  const { data, error } = await supabase
    .schema('tabatha')
    .from('schedule_change_requests')
    .insert({
      org_id: orgId,
      profile_id: profileId,
      requested_by: requestedBy,
      kind,
      payload: payload || {},
      reason,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** OA/manager: approve/reject a pending change request (RPC, atomic). */
export async function decideChangeRequest({ requestId, decision }) {
  await requireSession('decide a change request');
  const { data, error } = await supabase
    .schema('tabatha')
    .rpc('decide_change_request', {
      p_request_id: requestId,
      p_decision: decision,
    });
  if (error) throw error;
  return data;
}

/**
 * Log detected shortfalls (idempotent — one row per member/cadence/period
 * via uq_shortfall_ledger_period; duplicates are ignored).
 * shortfalls: output of scheduleModel.shortfallsToPrompt + orgId.
 */
export async function logShortfalls({ orgId, profileId, shortfalls }) {
  await requireSession('log shortfalls');
  if (!shortfalls?.length) return [];
  const rows = shortfalls.map(s => ({
    org_id: orgId,
    profile_id: profileId,
    period_start: s.periodStart,
    cadence: s.cadence,
    missing_minutes: s.missingMinutes,
  }));
  const { data, error } = await supabase
    .schema('tabatha')
    .from('shortfall_ledger')
    .upsert(rows, {
      onConflict: 'org_id,profile_id,cadence,period_start',
      ignoreDuplicates: true,
    })
    .select();
  if (error) throw error;
  return data || [];
}

/** Member/OA: account for a shortfall (made_up / shifted / excused + reason). */
export async function resolveShortfall({ ledgerId, resolution, reason = null }) {
  await requireSession('resolve a shortfall');
  const { data, error } = await supabase
    .schema('tabatha')
    .from('shortfall_ledger')
    .update({
      resolution,
      reason,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ledgerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
