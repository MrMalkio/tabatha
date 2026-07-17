// Supabase Edge Function: send-focus-push
// Invoked every minute by pg_cron. Scans for Sidecar-created active focuses
// whose timer has expired and sends a Web Push to the owner's subscriptions —
// the phone equivalent of the extension's timer-expiry modal. Dedup via
// tabatha.push_dedup so each focus fires once per kind.
//
// Secrets (set via `supabase secrets set`):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (provided by the platform)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ops@duckandshark.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  db: { schema: 'tabatha' },
  auth: { persistSession: false },
});

type FocusRow = {
  id: string;
  profile_id: string;
  label: string;
  timer_minutes: number;
  created_at: string;
  tags: Record<string, any> | null;
};

function isExpired(f: FocusRow): boolean {
  const startIso = f.tags?._startedAt || f.created_at;
  const start = new Date(startIso).getTime();
  const end = start + (f.timer_minutes || 15) * 60000;
  return Date.now() >= end;
}

async function alreadyFired(focusId: string, kind: string): Promise<boolean> {
  const { data } = await admin
    .from('push_dedup')
    .select('id')
    .eq('focus_item_id', focusId)
    .eq('kind', kind)
    .maybeSingle();
  return !!data;
}

Deno.serve(async () => {
  const results = { scanned: 0, fired: 0, errors: 0 };

  // Active, sidecar-sourced focuses (they carry a reliable _startedAt).
  const { data: focuses, error } = await admin
    .from('focus_items')
    .select('id, profile_id, label, timer_minutes, created_at, tags')
    .eq('focus_state', 'active')
    .contains('tags', { _src: 'sidecar' })
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  for (const f of (focuses ?? []) as FocusRow[]) {
    results.scanned++;
    if (!isExpired(f)) continue;
    if (await alreadyFired(f.id, 'timer_expired')) continue;

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('profile_id', f.profile_id);

    if (!subs || subs.length === 0) {
      // No device to notify — still mark fired so we don't re-scan forever.
      await admin.from('push_dedup').insert({
        profile_id: f.profile_id,
        focus_item_id: f.id,
        kind: 'timer_expired',
      });
      continue;
    }

    const payload = JSON.stringify({
      title: '⏰ Focus timer up',
      body: `"${f.label}" — time's up. Keep going, wrap up, or switch?`,
      tag: `focus-${f.id}`,
      requireInteraction: true,
      url: '/sidecar',
      data: { focusId: f.id, kind: 'timer_expired' },
    });

    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        await admin
          .from('push_subscriptions')
          .update({ last_ok_at: new Date().toISOString(), last_error: null })
          .eq('id', s.id);
        results.fired++;
      } catch (e) {
        results.errors++;
        const status = (e as any)?.statusCode;
        if (status === 404 || status === 410) {
          // Subscription gone — clean it up.
          await admin.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          await admin
            .from('push_subscriptions')
            .update({ last_error: String((e as any)?.message || e) })
            .eq('id', s.id);
        }
      }
    }

    await admin.from('push_dedup').insert({
      profile_id: f.profile_id,
      focus_item_id: f.id,
      kind: 'timer_expired',
    });
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
});
