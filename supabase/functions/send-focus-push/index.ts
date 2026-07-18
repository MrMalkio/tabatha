// Supabase Edge Function: send-focus-push
// Invoked every minute by pg_cron. Delivers the desktop-equivalent focus
// notifications to the Sidecar's Web Push subscriptions:
//   • timer_expired    — a Sidecar focus's timer ran out
//   • drifted          — a focus flipped to focus_state='drifted'
//   • checkpoint_stale — an active Sidecar focus's last checkpoint is >30m old
//   • focus_away       — Phone Focus Mode detected the phone walked off
//                         (browser_profile_status.metadata.focusAway; Plan 040
//                         addendum B1) — reliable server-push companion to the
//                         client-side pause, since a client `showNotification`
//                         fired at visibilitychange is unreliable on mobile.
// Dedup via tabatha.push_dedup for the focus-scoped kinds (each (focus, kind)
// fires once). `focus_away` is NOT focus-scoped (see the Pass D comment
// below for why it uses its own per-episode marker instead).
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

// ── focus_away delivery (Pass D) ──────────────────────────────────────────
// `push_dedup` is NOT NULL-FK'd to `focus_items` and fires a given (focus,
// kind) pair once *forever* — the wrong shape here: this event isn't tied to
// a focus row at all (it comes from `browser_profile_status`, a device-status
// row), and a later, separate walk-off episode SHOULD be able to re-alert.
//
// Reusing `push_subscriptions.last_ok_at` (bump-on-send, skip-if-newer) was
// considered — it would naturally dedupe within one episode since the pass
// re-runs every minute — but `last_ok_at` is shared across every push kind
// for a subscription. A `timer_expired` or `checkpoint_stale` send bumping it
// would silently suppress a real, later `focus_away` alert (or vice versa),
// which is a correctness bug hiding behind an innocuous-looking column reuse.
//
// Instead we stamp a per-episode marker directly on the row that carries the
// episode: `metadata.awayNotifiedAt`, compared against `metadata.awaySince`.
// One flag per physical away-episode; it's naturally reset the moment
// PhoneFocusMode signals a new state, since `signal()` replaces `metadata`
// wholesale on every leave/return transition.
async function deliverAwayAlert(profileId: string, browserProfileId: string, meta: Record<string, any>) {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', profileId);

  if (subs && subs.length) {
    const body = JSON.stringify({
      title: '👀 You walked off',
      body: 'Put the phone down — get back to it.',
      tag: 'focus-away',
      url: '/sidecar',
      data: { kind: 'focus_away' },
    });
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        await admin.from('push_subscriptions').update({ last_ok_at: new Date().toISOString(), last_error: null }).eq('id', s.id);
        results.fired++;
        results.byKind.focus_away = (results.byKind.focus_away || 0) + 1;
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

  // Stamp the episode as notified regardless of whether any subs existed, so
  // a device that enables push mid-episode doesn't fire a stale alert for an
  // episode that's already ended by the time it's set up. Guarded on
  // `awaySince` still matching what we read: if PhoneFocusMode wrote a newer
  // episode (or cleared it) between our select and this update, `meta` here
  // is stale and this no-ops instead of clobbering the fresher row.
  await admin
    .from('browser_profile_status')
    .update({ metadata: { ...meta, awayNotifiedAt: new Date().toISOString() } })
    .eq('browser_profile_id', browserProfileId)
    .eq('metadata->>awaySince', meta.awaySince);
}

Deno.serve(async () => {
  // ── Pass A: timer expiry (Sidecar-sourced active focuses) ──
  const { data: sidecarActive } = await admin
    .from('focus_items')
    .select('id, profile_id, client_id, label, timer_minutes, created_at, focus_state, tags')
    .eq('focus_state', 'active')
    .contains('tags', { _src: 'sidecar' })
    .limit(500);

  const activeFoci = (sidecarActive ?? []) as FocusRow[];

  // ── Pass C setup: batched checkpoint-staleness lookup ──
  // Was: one `focus_checkpoints` query per active focus inside the Pass A
  // loop (N+1). Replaced with a single `IN (...)` query over every scanned
  // focus's client_id, then reduced in memory to the latest row per
  // focus_client_id. One query instead of N, same result per focus.
  const clientIds = activeFoci.map((f) => f.client_id).filter(Boolean);
  const latestByClient = new Map<string, { created_at: string }>();
  if (clientIds.length) {
    const { data: latestCps } = await admin
      .from('focus_checkpoints')
      .select('focus_client_id, created_at')
      .in('focus_client_id', clientIds)
      .order('created_at', { ascending: false });
    for (const cp of (latestCps ?? []) as { focus_client_id: string; created_at: string }[]) {
      if (!latestByClient.has(cp.focus_client_id)) latestByClient.set(cp.focus_client_id, cp);
    }
  }

  for (const f of activeFoci) {
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

    // ── Pass C: checkpoint staleness (batched lookup, see above) ──
    const cp = latestByClient.get(f.client_id);
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

  // ── Pass D: phone-away (Phone Focus Mode walked off) ──
  // Same freshness window ContextView's red overlay uses, so the push and the
  // big-screen alert agree on how long an episode stays "live".
  const AWAY_FRESH_MS = 30 * 60 * 1000;
  const { data: awayRows } = await admin
    .from('browser_profile_status')
    .select('profile_id, browser_profile_id, metadata')
    .contains('metadata', { focusAway: true })
    .limit(500);

  for (const row of (awayRows ?? []) as {
    profile_id: string;
    browser_profile_id: string;
    metadata: Record<string, any> | null;
  }[]) {
    const meta = row.metadata || {};
    if (!meta.awaySince) continue;
    const awaySinceMs = new Date(meta.awaySince).getTime();
    if (!Number.isFinite(awaySinceMs) || Date.now() - awaySinceMs > AWAY_FRESH_MS) continue;
    const notifiedMs = meta.awayNotifiedAt ? new Date(meta.awayNotifiedAt).getTime() : 0;
    if (notifiedMs >= awaySinceMs) continue; // already alerted for this episode

    results.scanned++;
    await deliverAwayAlert(row.profile_id, row.browser_profile_id, meta);
  }

  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
});
