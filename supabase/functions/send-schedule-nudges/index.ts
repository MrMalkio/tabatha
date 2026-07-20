// Supabase Edge Function: send-schedule-nudges
// Invoked every 5 minutes by pg_cron (migration 037, job
// `sidecar-schedule-nudges`). v1 scope (design doc §5 — docs/superpowers/
// specs/2026-07-18-epic8-dedup-nudges-design.md): the "are you working
// yet?" clock-in check only (§2.1). `blockStart` (§2.2, needs
// calendar_events) and `idleNudge` (§2.3, needs idle_state trust window)
// are v2/v3 — not built here. This function's shape (per-kind predicate +
// shared dedup + shared DND) is meant to grow additively as those land.
//
// Runs on a separate, lower-frequency cron from send-focus-push (design
// doc §4.3): a 15-minute grace / 120-minute cutoff window tolerates a
// coarser tick than timer_expired's exact-minute needs, and isolating the
// nudge pass means a bug in this newer, less-proven code can't degrade
// the timer/drift/checkpoint delivery users already depend on. It also
// keeps the "scan every profile with an enabled schedule" query — a
// materially larger working set than send-focus-push's "only profiles
// with an active Sidecar focus" — off the 1-minute cron.
//
// Dedup via tabatha.push_log (migration 036) — day-scoped, NOT
// push_dedup (which is forever-scoped per focus row and wrong for a
// nudge that must be able to re-fire tomorrow).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (platform),
//          VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  configureWebPush,
  sendPushToProfile,
  withinQuietHours,
  hhmmToMinutes,
  profileLocalClock,
} from '../_shared/webpush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ops@duckandshark.com';

configureWebPush({ subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  db: { schema: 'tabatha' },
  auth: { persistSession: false },
});

type ProfileRow = {
  id: string;
  timezone: string | null;
  settings: Record<string, any> | null;
};

const DEFAULT_GRACE_MINUTES = 15;
const DEFAULT_CUTOFF_MINUTES = 120;

const results = { scanned: 0, fired: 0, errors: 0, byKind: {} as Record<string, number> };

async function alreadyFiredToday(
  profileId: string,
  kind: string,
  scopeKey: string,
  day: string
): Promise<boolean> {
  const { data } = await admin
    .from('push_log')
    .select('id')
    .eq('profile_id', profileId)
    .eq('kind', kind)
    .eq('scope_key', scopeKey)
    .eq('day', day)
    .maybeSingle();
  return !!data;
}

async function logFired(profileId: string, kind: string, scopeKey: string, day: string) {
  // UNIQUE(profile_id, kind, scope_key, day) — a racing duplicate insert
  // just violates the constraint; nothing else to reconcile.
  await admin.from('push_log').insert({ profile_id: profileId, kind, scope_key: scopeKey, day });
}

async function deliverNudge(
  profileId: string,
  kind: string,
  scopeKey: string,
  day: string,
  payload: object
) {
  if (await alreadyFiredToday(profileId, kind, scopeKey, day)) return;
  const { fired, errors } = await sendPushToProfile(admin, profileId, payload);
  results.fired += fired;
  results.errors += errors;
  if (fired) results.byKind[kind] = (results.byKind[kind] || 0) + 1;
  // Log the firing regardless of whether any subscription currently
  // exists, mirroring send-focus-push's Pass D stamp-even-if-no-subs
  // behavior — a device that enables push mid-window shouldn't trigger a
  // stale backfilled nudge for a check that already would have fired.
  await logFired(profileId, kind, scopeKey, day);
}

Deno.serve(async () => {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, timezone, settings')
    .limit(2000);

  const now = new Date();

  for (const p of (profiles ?? []) as ProfileRow[]) {
    const sc = p.settings?.sidecar || {};
    const nudges = sc.nudges || {};
    const clockInCheck = nudges.clockInCheck || {};
    if (!clockInCheck.enabled) continue;

    const workDays = sc.workDays || {};
    const tz = p.timezone || 'America/New_York';
    const dayResetHour = Number.isFinite(sc.dayResetHour) ? sc.dayResetHour : 0;
    const { dow, minutes, day } = profileLocalClock(now, tz, dayResetHour);

    if (withinQuietHours(minutes, nudges.quietHoursStart, nudges.quietHoursEnd)) continue;

    const todaySchedule = workDays[dow];
    if (!todaySchedule?.enabled || !todaySchedule?.start) continue;

    const startMinutes = hhmmToMinutes(todaySchedule.start);
    if (startMinutes == null) continue;

    const grace = Number.isFinite(clockInCheck.graceMinutes)
      ? clockInCheck.graceMinutes
      : DEFAULT_GRACE_MINUTES;
    const cutoff = Number.isFinite(clockInCheck.cutoffMinutes)
      ? clockInCheck.cutoffMinutes
      : DEFAULT_CUTOFF_MINUTES;
    const elapsed = minutes - startMinutes;
    if (elapsed < grace || elapsed > cutoff) continue;

    results.scanned++;

    const { data: activeStatus } = await admin
      .from('browser_profile_status')
      .select('browser_profile_id')
      .eq('profile_id', p.id)
      .in('clock_state', ['clocked_in', 'on_break'])
      .limit(1)
      .maybeSingle();
    if (activeStatus) continue; // already clocked in (or on break) somewhere

    await deliverNudge(p.id, 'clock_in_check', '', day, {
      title: '🕐 Are you working yet?',
      body: `Your shift was set to start at ${todaySchedule.start}. Clocked in somewhere else, or want a nudge to get going?`,
      tag: `clockin-${p.id}-${day}`,
      url: '/sidecar',
      data: { kind: 'clock_in_check' },
    });
  }

  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
});
