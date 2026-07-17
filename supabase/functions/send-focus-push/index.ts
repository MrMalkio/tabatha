// Supabase Edge Function: send-focus-push
// Invoked every minute by pg_cron. Delivers the desktop-equivalent focus
// notifications to the Sidecar's Web Push subscriptions:
//   • timer_expired    — a Sidecar focus's timer ran out
//   • drifted          — a focus flipped to focus_state='drifted'
//   • checkpoint_stale — an active Sidecar focus's last checkpoint is >30m old
// Dedup via tabatha.push_dedup so each (focus, kind) fires once.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (platform),
//          VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

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

const CHECKPOINT_STALE_MS = 30 * 60 * 1000;

type FocusRow = {
  id: string;
  profile_id: string;
  client_id: string;
  label: string;
  timer_minutes: number;
  created_at: string;
  focus_state: string;
  tags: Record<string, any> | null;
};

const results = { scanned: 0, fired: 0, errors: 0, byKind: {} as Record<string, number> };

function timerExpired(f: FocusRow): boolean {
  const start = new Date(f.tags?._startedAt || f.created_at).getTime();
  return Date.now() >= start + (f.timer_minutes || 15) * 60000;
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

async function deliver(profileId: string, focusId: string, kind: string, payload: object) {
  if (await alreadyFired(focusId, kind)) return;

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', profileId);

  if (subs && subs.length) {
    const body = JSON.stringify(payload);
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        await admin.from('push_subscriptions').update({ last_ok_at: new Date().toISOString(), last_error: null }).eq('id', s.id);
        results.fired++;
        results.byKind[kind] = (results.byKind[kind] || 0) + 1;
      } catch (e) {
        results.errors++;
        const status = (e as any)?.statusCode;
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          await admin.from('push_subscriptions').update({ last_error: String((e as any)?.message || e) }).eq('id', s.id);
        }
      }
    }
  }
  await admin.from('push_dedup').insert({ profile_id: profileId, focus_item_id: focusId, kind });
}

Deno.serve(async () => {
  // ── Pass A: timer expiry (Sidecar-sourced active focuses) ──
  const { data: sidecarActive } = await admin
    .from('focus_items')
    .select('id, profile_id, client_id, label, timer_minutes, created_at, focus_state, tags')
    .eq('focus_state', 'active')
    .contains('tags', { _src: 'sidecar' })
    .limit(500);

  for (const f of (sidecarActive ?? []) as FocusRow[]) {
    results.scanned++;
    if (timerExpired(f)) {
      await deliver(f.profile_id, f.id, 'timer_expired', {
        title: '⏰ Focus timer up',
        body: `"${f.label}" — time's up. Keep going, wrap up, or switch?`,
        tag: `focus-${f.id}`,
        requireInteraction: true,
        url: '/sidecar',
        data: { focusId: f.id, kind: 'timer_expired' },
      });
    }

    // ── Pass C: checkpoint staleness ──
    const { data: cp } = await admin
      .from('focus_checkpoints')
      .select('created_at')
      .eq('focus_client_id', f.client_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cp && Date.now() - new Date(cp.created_at).getTime() > CHECKPOINT_STALE_MS) {
      await deliver(f.profile_id, f.id, 'checkpoint_stale', {
        title: '📋 Checkpoint due',
        body: `"${f.label}" — it's been a while. Log a quick checkpoint?`,
        tag: `cp-${f.id}`,
        url: '/sidecar',
        data: { focusId: f.id, kind: 'checkpoint_stale' },
      });
    }
  }

  // ── Pass B: drift (any focus that flipped to drifted) ──
  const { data: drifted } = await admin
    .from('focus_items')
    .select('id, profile_id, client_id, label, timer_minutes, created_at, focus_state, tags')
    .eq('focus_state', 'drifted')
    .limit(500);

  for (const f of (drifted ?? []) as FocusRow[]) {
    results.scanned++;
    await deliver(f.profile_id, f.id, 'drifted', {
      title: '⚠️ Focus drifted',
      body: `"${f.label}" — you've wandered off. Back to it, or switch?`,
      tag: `drift-${f.id}`,
      url: '/sidecar',
      data: { focusId: f.id, kind: 'drifted' },
    });
  }

  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
});
