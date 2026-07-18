// Shared Web Push delivery + scheduling helpers for Sidecar edge functions.
//
// Used by both `send-focus-push` (Plan 040) and `send-schedule-nudges`
// (Epic 8, design doc §4.3 — docs/superpowers/specs/2026-07-18-epic8-
// dedup-nudges-design.md) so the send-and-cleanup logic (fan a payload out
// to a profile's push_subscriptions, mark last_ok_at, delete on 404/410,
// else stamp last_error) lives in exactly one place instead of being
// duplicated a third time, per the design doc's explicit recommendation.

import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

let configured = false;

/** Idempotent — safe to call once per cold start per function. */
export function configureWebPush(opts: { subject: string; publicKey: string; privateKey: string }) {
  if (configured) return;
  webpush.setVapidDetails(opts.subject, opts.publicKey, opts.privateKey);
  configured = true;
}

export type PushPayload = Record<string, unknown>;
export type DeliveryResult = { fired: number; errors: number };

/**
 * Fan a payload out to every push_subscriptions row for a profile.
 * Mirrors the cleanup behavior every existing pass already had: bump
 * `last_ok_at` on success, delete the subscription on a 404/410 (the
 * endpoint is gone), otherwise stamp `last_error` for diagnostics.
 */
export async function sendPushToProfile(
  admin: SupabaseClient,
  profileId: string,
  payload: PushPayload
): Promise<DeliveryResult> {
  const result: DeliveryResult = { fired: 0, errors: 0 };
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', profileId);

  if (!subs || !subs.length) return result;

  const body = JSON.stringify(payload);
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      );
      await admin
        .from('push_subscriptions')
        .update({ last_ok_at: new Date().toISOString(), last_error: null })
        .eq('id', s.id);
      result.fired++;
    } catch (e) {
      result.errors++;
      const status = (e as any)?.statusCode;
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', s.id);
      } else {
        await admin
          .from('push_subscriptions')
          .update({ last_error: String((e as any)?.message || e) })
          .eq('id', s.id);
      }
    }
  }
  return result;
}

/** Parses "HH:MM" (24h) into minutes-since-midnight, or null if malformed. */
export function hhmmToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * Midnight-safe quiet-hours check (design doc §2.4 — introduces the
 * pattern, no prior DND helper existed in this codebase). `start`/`end`
 * are "HH:MM" 24h local-time strings; `localMinutes` is minutes-since-
 * midnight in the profile's local time (see `profileLocalClock`). Wraps
 * across midnight when `end <= start` (e.g. "22:00" -> "07:00").
 */
export function withinQuietHours(
  localMinutes: number,
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  const startM = hhmmToMinutes(start);
  const endM = hhmmToMinutes(end);
  if (startM == null || endM == null) return false;
  if (startM === endM) return false; // zero-width window = never quiet
  if (startM < endM) return localMinutes >= startM && localMinutes < endM;
  return localMinutes >= startM || localMinutes < endM; // wraps midnight
}

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/**
 * Resolves `now` into the profile's local wall-clock parts, honoring the
 * profile's IANA timezone (`profiles.timezone`) and the same day-boundary
 * the rest of the Sidecar already uses (`settings.sidecar.dayResetHour`,
 * the boundary Context View's countdown uses), so a nudge for "today" and
 * Context View's "today" agree rather than inventing a second convention.
 */
export function profileLocalClock(
  now: Date,
  timeZone: string,
  dayResetHour: number
): { dow: DayKey; minutes: number; day: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = parseInt(get('hour'), 10) || 0;
  const minute = parseInt(get('minute'), 10) || 0;
  const minutes = hour * 60 + minute;

  // Calendar day + weekday per dayResetHour: if the local wall-clock hour
  // is before the reset hour, "today" is still the previous calendar day
  // (same rule Context View's day-countdown uses) — and the weekday used
  // for workDays[dow] lookup must roll back with it, or a 1am Tuesday
  // schedule check would consult Tuesday's hours while `day` (and the
  // rest of the Sidecar) still consider it "Monday".
  let asOf = new Date(Date.UTC(
    parseInt(get('year'), 10),
    parseInt(get('month'), 10) - 1,
    parseInt(get('day'), 10)
  ));
  if (hour < (dayResetHour || 0)) {
    asOf = new Date(asOf.getTime() - 24 * 60 * 60 * 1000);
  }
  const y = asOf.getUTCFullYear();
  const mo = asOf.getUTCMonth() + 1;
  const d = asOf.getUTCDate();
  const day = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' })
    .format(asOf)
    .toLowerCase()
    .slice(0, 3) as DayKey;

  return { dow, minutes, day };
}
