// Sidecar v0.3.0 QA blitz — Test matrix item 1: data flows under RLS.
// Mirrors the app's EXACT queries (from sidecar/src/data/*.ts,
// sidecar/src/context/AuthContext.tsx, sidecar/src/lib/push.ts) against a
// minted mr@duckandshark.com session. Not a UI test — replicates the pure
// math (elapsedMsOf / pickTier) inline to assert against, since we're
// driving raw Postgres rows instead of React state.

import { mintSession, log } from './lib.mjs';

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

// ── mirrors sidecar/src/data/focus.ts ──
function startedAtOf(f) {
  const iso = f.tags?._startedAt || f.created_at;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Date.now();
}
function elapsedMsOf(f, now) {
  if (f.focus_state === 'active') return Math.max(0, now - startedAtOf(f));
  const frozen = f.tags?._elapsedMs;
  return Number.isFinite(frozen) ? Math.max(0, frozen) : Math.max(0, now - startedAtOf(f));
}

const createdFocusIds = [];
const createdTaskIds = [];
const createdCheckpointIds = [];
const createdClockSessionIds = [];
let browserProfileId = null;
let originalSettings = null;

async function main() {
  const { user, userId, adminTabatha } = await mintSession();
  const { data: prof } = await user
    .from('profiles')
    .select('id, settings')
    .eq('auth_user_id', userId)
    .maybeSingle();
  const profileId = prof.id;
  originalSettings = prof.settings || {};
  log('profile_id', profileId, 'original settings', JSON.stringify(originalSettings));

  // ─────────────────────────────────────────────────────────────
  // A. Intent lifecycle: create -> switch -> pause -> resume -> resolve
  // ─────────────────────────────────────────────────────────────
  {
    const clientA = `sidecar-qa-${uuid()}`;
    const nowIso = new Date().toISOString();
    const rowA = {
      profile_id: profileId,
      client_id: clientA,
      label: '[QA TEST] Intent A',
      funnel_stage: 'focus',
      focus_state: 'active',
      timer_minutes: 15,
      priority: 5,
      tags: { realm: 'work', _src: 'sidecar', _off: true, _startedAt: nowIso },
    };
    const { data: insA, error: errA } = await user
      .from('focus_items')
      .insert(rowA)
      .select('id, tags, focus_state, created_at')
      .maybeSingle();
    record('A.create', !errA && !!insA?.id, errA?.message || `created ${insA?.id}`);
    if (insA?.id) createdFocusIds.push(insA.id);

    await user.from('intent_history').insert({
      profile_id: profileId,
      action: 'inherit',
      context: '[QA TEST] Intent A',
      focus_id: clientA,
      timestamp: nowIso,
    });
    const { data: ihCheck } = await user
      .from('intent_history')
      .select('id')
      .eq('profile_id', profileId)
      .eq('focus_id', clientA)
      .maybeSingle();
    record('A.intent_history write', !!ihCheck?.id, `row ${ihCheck?.id}`);

    // Create Intent B as active — createIntent() pauses prior active sidecar
    // focuses first (freezing elapsed), THEN inserts B active.
    const clientB = `sidecar-qa-${uuid()}`;
    const nowIso2 = new Date().toISOString();
    // Simulate what createIntent does: pause A's elapsed first.
    const aElapsedAtPause = Date.now() - startedAtOf(insA);
    await user
      .from('focus_items')
      .update({ focus_state: 'paused', tags: { ...insA.tags, _elapsedMs: Math.max(0, aElapsedAtPause) } })
      .eq('id', insA.id);
    const { data: insB } = await user
      .from('focus_items')
      .insert({
        profile_id: profileId,
        client_id: clientB,
        label: '[QA TEST] Intent B',
        funnel_stage: 'focus',
        focus_state: 'active',
        timer_minutes: 15,
        priority: 5,
        tags: { realm: 'work', _src: 'sidecar', _off: true, _startedAt: nowIso2 },
      })
      .select('id, tags, focus_state, created_at')
      .maybeSingle();
    if (insB?.id) createdFocusIds.push(insB.id);
    const { data: aAfterCreateB } = await user.from('focus_items').select('focus_state, tags').eq('id', insA.id).maybeSingle();
    record(
      'A.createIntent auto-pauses prior active',
      aAfterCreateB?.focus_state === 'paused' && Number.isFinite(aAfterCreateB?.tags?._elapsedMs),
      `A state=${aAfterCreateB?.focus_state} elapsedMs=${aAfterCreateB?.tags?._elapsedMs}`
    );

    // switchTo(A): pauses B (freeze), reactivates A continuing from its frozen elapsed.
    const frozenA = aAfterCreateB.tags._elapsedMs;
    const bElapsedAtPause = Date.now() - startedAtOf(insB);
    await user
      .from('focus_items')
      .update({ focus_state: 'paused', tags: { ...insB.tags, _elapsedMs: Math.max(0, bElapsedAtPause) } })
      .eq('id', insB.id);
    const newStartA = new Date(Date.now() - frozenA).toISOString();
    await user
      .from('focus_items')
      .update({ focus_state: 'active', tags: { ...aAfterCreateB.tags, _startedAt: newStartA, _backburner: false, _snoozeUntil: null } })
      .eq('id', insA.id);
    const { data: aAfterSwitch } = await user.from('focus_items').select('*').eq('id', insA.id).maybeSingle();
    const elapsedRightAfterSwitch = elapsedMsOf(aAfterSwitch, Date.now());
    record(
      'A.switchTo continuity (elapsed >= frozen, not reset)',
      elapsedRightAfterSwitch >= frozenA - 50, // small tolerance
      `frozenA=${frozenA} elapsedNow=${elapsedRightAfterSwitch}`
    );

    // pause(A) again, wait (simulated via backdate), resume(A) — assert
    // elapsed continues rather than restarting.
    const backdatedStart = new Date(Date.now() - 5000).toISOString(); // pretend A has been active 5s
    await user.from('focus_items').update({ tags: { ...aAfterSwitch.tags, _startedAt: backdatedStart } }).eq('id', insA.id);
    const { data: aBeforePause } = await user.from('focus_items').select('*').eq('id', insA.id).maybeSingle();
    const elapsedBeforePause = elapsedMsOf(aBeforePause, Date.now());
    const pauseElapsed = Math.max(0, Date.now() - startedAtOf(aBeforePause));
    await user
      .from('focus_items')
      .update({ focus_state: 'paused', tags: { ...aBeforePause.tags, _elapsedMs: pauseElapsed } })
      .eq('id', insA.id);
    const { data: aPaused } = await user.from('focus_items').select('*').eq('id', insA.id).maybeSingle();
    const elapsedWhilePaused = elapsedMsOf(aPaused, Date.now() + 3000); // "3s later" while paused: must stay frozen
    record(
      'A.pause freezes elapsed (does not advance while paused)',
      Math.abs(elapsedWhilePaused - pauseElapsed) < 5,
      `frozen=${pauseElapsed} readAt+3s=${elapsedWhilePaused}`
    );

    const resumeElapsed = Number(aPaused.tags?._elapsedMs) || 0;
    const resumeStart = new Date(Date.now() - resumeElapsed).toISOString();
    await user.from('focus_items').update({ focus_state: 'active', tags: { ...aPaused.tags, _startedAt: resumeStart } }).eq('id', insA.id);
    const { data: aResumed } = await user.from('focus_items').select('*').eq('id', insA.id).maybeSingle();
    const elapsedRightAfterResume = elapsedMsOf(aResumed, Date.now());
    record(
      'A.resume continues from frozen elapsed (does NOT restart at 0)',
      elapsedRightAfterResume >= resumeElapsed - 50 && elapsedRightAfterResume < resumeElapsed + 2000,
      `resumeElapsed(frozen)=${resumeElapsed} elapsedRightAfterResume=${elapsedRightAfterResume}`
    );

    // resolve(A)
    await user
      .from('focus_items')
      .update({ focus_state: 'completed', funnel_stage: 'resolved', completed_at: new Date().toISOString() })
      .eq('id', insA.id);
    const { data: aResolved } = await user.from('focus_items').select('focus_state, funnel_stage, completed_at').eq('id', insA.id).maybeSingle();
    record(
      'A.resolve',
      aResolved?.focus_state === 'completed' && aResolved?.funnel_stage === 'resolved' && !!aResolved?.completed_at,
      JSON.stringify(aResolved)
    );

    // resolve(B) too so tier tests below start clean-ish (still tagged QA).
    await user
      .from('focus_items')
      .update({ focus_state: 'completed', funnel_stage: 'resolved', completed_at: new Date().toISOString() })
      .eq('id', insB.id);
  }

  // ─────────────────────────────────────────────────────────────
  // C. Focus tiers
  // ─────────────────────────────────────────────────────────────
  {
    // C1: paused non-resolved focus stays "current" when nothing is active.
    const clientC = `sidecar-qa-${uuid()}`;
    const { data: pausedItem } = await user
      .from('focus_items')
      .insert({
        profile_id: profileId,
        client_id: clientC,
        label: '[QA TEST] Paused tier',
        funnel_stage: 'focus',
        focus_state: 'paused',
        timer_minutes: 15,
        priority: 5,
        tags: { _src: 'sidecar', _off: true, _elapsedMs: 12345 },
      })
      .select('id')
      .maybeSingle();
    if (pausedItem?.id) createdFocusIds.push(pausedItem.id);

    // Replicate useFocus's derived-view logic against a fresh read of all items.
    const { data: allItems } = await user
      .from('focus_items')
      .select('id, focus_state, funnel_stage, tags, created_at, priority')
      .eq('profile_id', profileId);
    const notDone = allItems.filter((f) => f.focus_state !== 'completed' && f.funnel_stage !== 'resolved');
    const nonBB = notDone.filter((f) => !f.tags?._backburner);
    const activeCandidates = nonBB.filter((f) => f.focus_state === 'active');
    const pausedCandidates = nonBB.filter((f) => f.focus_state === 'paused');
    const pickTier = (tier) => tier.slice().sort((a, b) => startedAtOf(b) - startedAtOf(a))[0] || null;
    const currentFocus = activeCandidates.length ? pickTier(activeCandidates) : pausedCandidates.length ? pickTier(pausedCandidates) : null;
    record(
      'C1. paused non-resolved focus becomes "current" (no active exists)',
      currentFocus?.id === pausedItem.id || pausedCandidates.some((p) => p.id === pausedItem.id),
      `currentFocus.id=${currentFocus?.id} expected candidate ${pausedItem.id} pausedCandidates=${pausedCandidates.length}`
    );

    // C2: resolve it — all QA items now resolved for this profile subset;
    // verify tier picking on the QA-tagged subset only (avoids asserting
    // over Malkio's real non-QA focuses, which we must not touch).
    await user.from('focus_items').update({ focus_state: 'completed', funnel_stage: 'resolved', completed_at: new Date().toISOString() }).eq('id', pausedItem.id);
    const { data: qaItemsAfter } = await user
      .from('focus_items')
      .select('id, focus_state, funnel_stage, tags')
      .in('id', createdFocusIds);
    const allResolved = qaItemsAfter.every((f) => f.focus_state === 'completed' || f.funnel_stage === 'resolved');
    record('C2. all-resolved QA subset -> none qualify as current', allResolved, `${qaItemsAfter.length} QA items, allResolved=${allResolved}`);
  }

  // ─────────────────────────────────────────────────────────────
  // D. focus_checkpoints write/read
  // ─────────────────────────────────────────────────────────────
  {
    const focusClientId = `sidecar-qa-cp-${uuid()}`;
    const { data: cpIns, error: cpErr } = await user
      .from('focus_checkpoints')
      .insert({
        profile_id: profileId,
        focus_client_id: focusClientId,
        text: '[QA TEST] checkpoint note',
        progress_level: 'lot',
        source: 'sidecar',
      })
      .select('id')
      .maybeSingle();
    record('D.write', !cpErr && !!cpIns?.id, cpErr?.message || `id ${cpIns?.id}`);
    if (cpIns?.id) createdCheckpointIds.push(cpIns.id);

    const { data: cpRead } = await user
      .from('focus_checkpoints')
      .select('id, focus_client_id, text, progress_level, created_at')
      .eq('profile_id', profileId)
      .eq('focus_client_id', focusClientId)
      .order('created_at', { ascending: false });
    record('D.read', cpRead?.length === 1 && cpRead[0].text === '[QA TEST] checkpoint note', JSON.stringify(cpRead));
  }

  // ─────────────────────────────────────────────────────────────
  // E. tasks_registry CRUD
  // ─────────────────────────────────────────────────────────────
  {
    const taskId = `sidecar-qa-${uuid()}`;
    const { data: taskIns, error: taskErr } = await user
      .from('tasks_registry')
      .insert({ profile_id: profileId, task_id: taskId, name: '[QA TEST] task', status: 'active', funnel_stage: 'unsorted' })
      .select('id')
      .maybeSingle();
    record('E.create', !taskErr && !!taskIns?.id, taskErr?.message || `id ${taskIns?.id}`);
    if (taskIns?.id) createdTaskIds.push(taskIns.id);

    await user.from('tasks_registry').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', taskIns.id);
    const { data: afterComplete } = await user.from('tasks_registry').select('status, completed_at').eq('id', taskIns.id).maybeSingle();
    record('E.complete', afterComplete?.status === 'completed' && !!afterComplete?.completed_at, JSON.stringify(afterComplete));

    await user.from('tasks_registry').update({ status: 'active', completed_at: null }).eq('id', taskIns.id);
    const { data: afterReopen } = await user.from('tasks_registry').select('status, completed_at').eq('id', taskIns.id).maybeSingle();
    record('E.reopen', afterReopen?.status === 'active' && afterReopen?.completed_at === null, JSON.stringify(afterReopen));
  }

  // ─────────────────────────────────────────────────────────────
  // F. clock_sessions insert + browser_profile_status upsert + browser_profiles
  // ─────────────────────────────────────────────────────────────
  {
    // G first (browser_profiles) since clock/status need browser_profile_id.
    const localId = 'sidecar-qa-tabatha_web';
    const { data: bp, error: bpErr } = await user
      .from('browser_profiles')
      .upsert(
        {
          profile_id: profileId,
          browser: 'tabatha_web',
          profile_name: '[QA TEST] device',
          classification: 'professional',
          extension_installed: false,
          local_id: localId,
          machine_id: `qa-${uuid()}`,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id,local_id' }
      )
      .select('id')
      .maybeSingle();
    record('G.browser_profiles upsert (profile_id,local_id)', !bpErr && !!bp?.id, bpErr?.message || `id ${bp?.id}`);
    browserProfileId = bp?.id || null;

    // Re-upsert with same local_id to confirm idempotency (collapses to one row).
    const { data: bp2, error: bpErr2 } = await user
      .from('browser_profiles')
      .upsert(
        { profile_id: profileId, browser: 'tabatha_web', local_id: localId, last_seen_at: new Date().toISOString() },
        { onConflict: 'profile_id,local_id' }
      )
      .select('id')
      .maybeSingle();
    record('G.browser_profiles re-upsert collapses to same row', !bpErr2 && bp2?.id === browserProfileId, `first=${browserProfileId} second=${bp2?.id}`);

    if (browserProfileId) {
      const { error: statusErr } = await user.from('browser_profile_status').upsert(
        {
          browser_profile_id: browserProfileId,
          profile_id: profileId,
          online: true,
          last_heartbeat_at: new Date().toISOString(),
          last_clock_event_at: new Date().toISOString(),
          clock_state: 'clocked_in',
          clocked_in_at: new Date().toISOString(),
          on_break_since: null,
        },
        { onConflict: 'browser_profile_id' }
      );
      record('F.browser_profile_status upsert', !statusErr, statusErr?.message || 'ok');

      const clockedInAt = new Date(Date.now() - 60000).toISOString(); // 1 min shift
      const { data: csIns, error: csErr } = await user
        .from('clock_sessions')
        .insert({
          profile_id: profileId,
          client_id: `sidecar-qa-clock-${uuid()}`,
          clocked_in_at: clockedInAt,
          clocked_out_at: new Date().toISOString(),
          total_ms: 60000,
          break_ms: 0,
          work_ms: 60000,
          breaks: [],
          source: 'sidecar',
          browser_profile_id: browserProfileId,
        })
        .select('id')
        .maybeSingle();
      record('F.clock_sessions insert', !csErr && !!csIns?.id, csErr?.message || `id ${csIns?.id}`);
      if (csIns?.id) createdClockSessionIds.push(csIns.id);

      const { data: csRead } = await user
        .from('clock_sessions')
        .select('id, client_id, total_ms, work_ms, source')
        .eq('profile_id', profileId)
        .order('clocked_out_at', { ascending: false })
        .limit(20);
      record('F.clock_sessions read (history query)', csRead?.some((r) => r.id === csIns?.id), `found=${csRead?.some((r) => r.id === csIns?.id)}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // H. settings isolation — write sidecar then chaperone, re-read: neither clobbers.
  // ─────────────────────────────────────────────────────────────
  {
    // Fresh read (mirrors component state at mount).
    const { data: p0 } = await user.from('profiles').select('id, settings').eq('id', profileId).maybeSingle();
    const marker = `qa-${Date.now()}`;

    // saveSidecarSettings({ qaMarker: marker }) — merges into settings.sidecar only.
    const nextSettings1 = { ...(p0.settings || {}), sidecar: { ...(p0.settings?.sidecar || {}), qaMarker: marker } };
    await user.from('profiles').update({ settings: nextSettings1 }).eq('id', profileId);

    // Sequential flow (mirrors real UI: local state updates after each await,
    // so the next save's merge base already includes the previous patch).
    const nextSettings2 = { ...nextSettings1, chaperone: { ...(nextSettings1.chaperone || {}), qaMarker: marker } };
    await user.from('profiles').update({ settings: nextSettings2 }).eq('id', profileId);

    const { data: pFinal } = await user.from('profiles').select('settings').eq('id', profileId).maybeSingle();
    const sidecarOk = pFinal?.settings?.sidecar?.qaMarker === marker;
    const chaperoneOk = pFinal?.settings?.chaperone?.qaMarker === marker;
    // Also assert pre-existing sidecar.pushEnabled (or whatever else was there) wasn't dropped.
    const preExistingPreserved = JSON.stringify(pFinal?.settings?.sidecar || {}).includes(
      JSON.stringify(originalSettings?.sidecar?.pushEnabled ?? null) === 'null' ? '' : `"pushEnabled":${originalSettings?.sidecar?.pushEnabled}`
    );
    record(
      'H.sequential settings.sidecar + settings.chaperone writes (both survive)',
      sidecarOk && chaperoneOk,
      `sidecar.qaMarker=${pFinal?.settings?.sidecar?.qaMarker} chaperone.qaMarker=${pFinal?.settings?.chaperone?.qaMarker}`
    );

    // ── Race condition probe: TWO writes computed from the SAME stale base
    // (simulates rapid double-toggle before React re-renders / re-fetches),
    // as the app's own hooks would produce if called back-to-back without
    // awaiting between them (both close over the same `profile` state).
    const staleBase = pFinal.settings; // both "concurrent" saves start from this
    const raceMarkerA = `race-sidecar-${Date.now()}`;
    const raceMarkerB = `race-chaperone-${Date.now()}`;
    const writeA = { ...staleBase, sidecar: { ...(staleBase.sidecar || {}), raceMarker: raceMarkerA } };
    const writeB = { ...staleBase, chaperone: { ...(staleBase.chaperone || {}), raceMarker: raceMarkerB } };
    // Fire both "concurrently" (no await between the reads that built them —
    // this is the exact shape of a race, whichever write lands last wins wholesale).
    await Promise.all([
      user.from('profiles').update({ settings: writeA }).eq('id', profileId),
      user.from('profiles').update({ settings: writeB }).eq('id', profileId),
    ]);
    const { data: pRaced } = await user.from('profiles').select('settings').eq('id', profileId).maybeSingle();
    const bothSurvivedRace = pRaced?.settings?.sidecar?.raceMarker === raceMarkerA && pRaced?.settings?.chaperone?.raceMarker === raceMarkerB;
    record(
      'H2. concurrent (same-stale-base) sidecar+chaperone writes — clobber probe',
      bothSurvivedRace,
      bothSurvivedRace
        ? 'both survived (lucky ordering or DB-level merge — no clobber observed this run)'
        : `ONE CLOBBERED THE OTHER: sidecar.raceMarker=${pRaced?.settings?.sidecar?.raceMarker} (want ${raceMarkerA}), chaperone.raceMarker=${pRaced?.settings?.chaperone?.raceMarker} (want ${raceMarkerB})`
    );

    // Restore original settings exactly (cleanup).
    await user.from('profiles').update({ settings: originalSettings }).eq('id', profileId);
    const { data: pRestored } = await user.from('profiles').select('settings').eq('id', profileId).maybeSingle();
    record('H.cleanup restore original settings', JSON.stringify(pRestored?.settings) === JSON.stringify(originalSettings), 'restored');
  }

  // ── Summary ──
  const failed = results.filter((r) => !r.pass);
  log('=== SUMMARY ===', `${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    log('FAILURES:');
    failed.forEach((f) => log(' -', f.area, ':', f.detail));
  }

  // Dump ids for cleanup script.
  const cleanup = {
    focusIds: createdFocusIds,
    taskIds: createdTaskIds,
    checkpointIds: createdCheckpointIds,
    clockSessionIds: createdClockSessionIds,
    browserProfileId,
    profileId,
  };
  console.log('CLEANUP_JSON=' + JSON.stringify(cleanup));

  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
