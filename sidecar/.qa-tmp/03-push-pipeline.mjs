// Sidecar v0.3.0 QA blitz — Test matrix item 2: push pipeline
// (supabase/functions/send-focus-push). No real push_subscriptions exist on
// this profile right now (verified via 02-check-subs.mjs), so invoking the
// function is safe -- it will scan/dedupe/write push_dedup rows but there is
// nothing to actually deliver to, so Malkio's real phone won't buzz.

import { mintSession, log } from './lib.mjs';

const FN_URL = 'https://mtdgoahskcibjbhfvofx.supabase.co/functions/v1/send-focus-push';

const results = [];
function record(area, pass, detail) {
  results.push({ area, pass, detail });
  log(pass ? 'PASS' : 'FAIL', area, '-', detail);
}
function uuid() {
  return 'xxxxxxxxxxxx4xxxyxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function invoke(service) {
  const resp = await fetch(FN_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${service}`, apikey: service, 'Content-Type': 'application/json' },
  });
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: resp.status, json, text };
}

const createdFocusIds = [];
const createdCheckpointIds = [];
let qaBrowserProfileId = null;

async function main() {
  const { user, adminTabatha, userId, service } = await mintSession();
  const { data: prof } = await user.from('profiles').select('id').eq('auth_user_id', userId).maybeSingle();
  const profileId = prof.id;

  // ── Pass A/C: expired timer + stale checkpoint on the SAME focus ──
  const clientId = `sidecar-qa-push-${uuid()}`;
  const startedAt = new Date(Date.now() - 10 * 60000).toISOString(); // 10 min ago
  const { data: expiredFocus, error: focusErr } = await user
    .from('focus_items')
    .insert({
      profile_id: profileId,
      client_id: clientId,
      label: '[QA TEST] expired timer focus',
      funnel_stage: 'focus',
      focus_state: 'active',
      timer_minutes: 1, // 1-min timer, started 10 min ago -> definitely expired
      priority: 5,
      tags: { realm: 'work', _src: 'sidecar', _off: true, _startedAt: startedAt },
    })
    .select('id')
    .maybeSingle();
  record('setup: expired sidecar focus insert', !focusErr && !!expiredFocus?.id, focusErr?.message || expiredFocus?.id);
  if (expiredFocus?.id) createdFocusIds.push(expiredFocus.id);

  const { data: cpIns } = await user
    .from('focus_checkpoints')
    .insert({
      profile_id: profileId,
      focus_client_id: clientId,
      text: '[QA TEST] stale checkpoint',
      progress_level: 'little',
      source: 'sidecar',
      created_at: new Date(Date.now() - 40 * 60000).toISOString(), // 40 min ago (> 30min stale window)
    })
    .select('id')
    .maybeSingle();
  if (cpIns?.id) createdCheckpointIds.push(cpIns.id);
  record('setup: stale checkpoint (40m old) insert', !!cpIns?.id, cpIns?.id);

  // ── Pass B: drift ──
  const driftClientId = `sidecar-qa-drift-${uuid()}`;
  const { data: driftFocus } = await user
    .from('focus_items')
    .insert({
      profile_id: profileId,
      client_id: driftClientId,
      label: '[QA TEST] drifted focus',
      funnel_stage: 'focus',
      focus_state: 'drifted',
      timer_minutes: 15,
      priority: 5,
      tags: { realm: 'work' },
    })
    .select('id')
    .maybeSingle();
  if (driftFocus?.id) createdFocusIds.push(driftFocus.id);
  record('setup: drifted focus insert', !!driftFocus?.id, driftFocus?.id);

  // ── Pass D: focus_away episode (needs a browser_profile_id row) ──
  const localId = 'sidecar-qa-away-fixed';
  const { data: bp } = await user
    .from('browser_profiles')
    .upsert(
      { profile_id: profileId, browser: 'sidecar_qa_away', local_id: localId, profile_name: '[QA TEST] away device', last_seen_at: new Date().toISOString() },
      { onConflict: 'profile_id,local_id' }
    )
    .select('id')
    .maybeSingle();
  qaBrowserProfileId = bp?.id || null;
  record('setup: qa browser_profile for away test', !!qaBrowserProfileId, qaBrowserProfileId);

  const awaySince1 = new Date(Date.now() - 2 * 60000).toISOString(); // 2 min ago (fresh)
  await user.from('browser_profile_status').upsert(
    {
      browser_profile_id: qaBrowserProfileId,
      profile_id: profileId,
      online: false,
      last_heartbeat_at: new Date().toISOString(),
      metadata: { source: 'sidecar', focusAway: true, awaySince: awaySince1 },
    },
    { onConflict: 'browser_profile_id' }
  );

  // ── Baseline: confirm no pre-existing dedup rows for our focus ids ──
  const { data: dedupBefore } = await adminTabatha
    .from('push_dedup')
    .select('id, kind')
    .in('focus_item_id', createdFocusIds);
  record('baseline: no push_dedup rows yet for our focuses', (dedupBefore?.length || 0) === 0, `count=${dedupBefore?.length}`);

  // ── Invoke #1 ──
  const inv1 = await invoke(service);
  log('invoke#1 status', inv1.status, JSON.stringify(inv1.json));
  record('invoke#1 returns 200', inv1.status === 200, `status=${inv1.status}`);

  const { data: dedupAfter1 } = await adminTabatha
    .from('push_dedup')
    .select('id, kind, focus_item_id')
    .in('focus_item_id', createdFocusIds);
  const kindsAfter1 = dedupAfter1?.map((d) => d.kind).sort();
  record(
    'invoke#1: timer_expired dedup row created (once)',
    dedupAfter1?.some((d) => d.focus_item_id === expiredFocus.id && d.kind === 'timer_expired'),
    JSON.stringify(kindsAfter1)
  );
  record(
    'invoke#1: checkpoint_stale dedup row created',
    dedupAfter1?.some((d) => d.focus_item_id === expiredFocus.id && d.kind === 'checkpoint_stale'),
    JSON.stringify(kindsAfter1)
  );
  record(
    'invoke#1: drifted dedup row created',
    dedupAfter1?.some((d) => d.focus_item_id === driftFocus.id && d.kind === 'drifted'),
    JSON.stringify(kindsAfter1)
  );

  const { data: statusAfter1 } = await adminTabatha
    .from('browser_profile_status')
    .select('metadata')
    .eq('browser_profile_id', qaBrowserProfileId)
    .maybeSingle();
  const notifiedAt1 = statusAfter1?.metadata?.awayNotifiedAt;
  record(
    'invoke#1: focus_away episode #1 stamped awayNotifiedAt',
    !!notifiedAt1 && new Date(notifiedAt1).getTime() >= new Date(awaySince1).getTime(),
    JSON.stringify(statusAfter1?.metadata)
  );

  // ── Invoke #2 (immediately after) — everything should be a no-op re-fire ──
  const inv2 = await invoke(service);
  record('invoke#2 returns 200', inv2.status === 200, `status=${inv2.status}`);

  const { data: dedupAfter2 } = await adminTabatha
    .from('push_dedup')
    .select('id, kind, focus_item_id')
    .in('focus_item_id', createdFocusIds);
  record(
    'invoke#2: no duplicate push_dedup rows (still exactly 1 per kind per focus)',
    dedupAfter2?.length === dedupAfter1?.length,
    `after1=${dedupAfter1?.length} after2=${dedupAfter2?.length}`
  );

  const { data: statusAfter2 } = await adminTabatha
    .from('browser_profile_status')
    .select('metadata')
    .eq('browser_profile_id', qaBrowserProfileId)
    .maybeSingle();
  record(
    'invoke#2: focus_away NOT re-notified within same episode (awayNotifiedAt unchanged)',
    statusAfter2?.metadata?.awayNotifiedAt === notifiedAt1,
    `notifiedAt1=${notifiedAt1} notifiedAt2=${statusAfter2?.metadata?.awayNotifiedAt}`
  );

  // ── New episode: fresh awaySince MUST re-notify ──
  const awaySince2 = new Date(Date.now() - 1 * 60000).toISOString(); // a NEW, later episode
  await user.from('browser_profile_status').update({ metadata: { source: 'sidecar', focusAway: true, awaySince: awaySince2 } }).eq('browser_profile_id', qaBrowserProfileId);
  const inv3 = await invoke(service);
  record('invoke#3 (new episode) returns 200', inv3.status === 200, `status=${inv3.status}`);
  const { data: statusAfter3 } = await adminTabatha
    .from('browser_profile_status')
    .select('metadata')
    .eq('browser_profile_id', qaBrowserProfileId)
    .maybeSingle();
  const notifiedAt3 = statusAfter3?.metadata?.awayNotifiedAt;
  record(
    'invoke#3: NEW awaySince episode re-triggers awayNotifiedAt stamp',
    !!notifiedAt3 && notifiedAt3 !== notifiedAt1 && new Date(notifiedAt3).getTime() >= new Date(awaySince2).getTime(),
    `notifiedAt1=${notifiedAt1} notifiedAt3=${notifiedAt3} awaySince2=${awaySince2}`
  );

  // clear the away flag (cleanup-in-place, avoid leaving a stuck alert)
  await user.from('browser_profile_status').update({ metadata: { source: 'sidecar', focusAway: false, awaySince: null } }).eq('browser_profile_id', qaBrowserProfileId);

  const failed = results.filter((r) => !r.pass);
  log('=== SUMMARY ===', `${results.length - failed.length}/${results.length} passed`);
  failed.forEach((f) => log('FAIL DETAIL:', f.area, '-', f.detail));

  console.log(
    'CLEANUP_JSON=' +
      JSON.stringify({
        focusIds: createdFocusIds,
        checkpointIds: createdCheckpointIds,
        browserProfileId: qaBrowserProfileId,
        profileId,
      })
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
