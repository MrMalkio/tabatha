import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useFocus, isSidecarSourced, isOffComputer, elapsedMsOf, startedAtOf } from '../data/focus';
import { useChaperoneOnPhoneAway } from '../lib/chaperone';
import { useCheckpoints, PROGRESS_LEVELS } from '../data/checkpoints';
import { supabase } from '../lib/supabase';
import { colors, radius, FUNNEL_STAGES, priorityColor, formatTimer, formatElapsedMs } from '../lib/theme';

// Coarse "how long ago" for the last-checkpoint preview — matches the rest of
// the view's compact, glanceable style (no seconds precision needed here).
function relTime(iso: string, now: number): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function useTick(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return n;
}

function nowTime(d: Date): string {
  const h = d.getHours() % 12 || 12;
  const ap = d.getHours() < 12 ? 'AM' : 'PM';
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

// Minutes remaining in the "day" until the configured reset hour (1440-min day).
function dayLeft(resetHour: number): { text: string; mins: number } {
  const d = new Date();
  const nowMin = d.getHours() * 60 + d.getMinutes();
  let left = resetHour * 60 - nowMin;
  if (left <= 0) left += 1440;
  return { text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, mins: left };
}

/**
 * Large-viewport, view-only "Context View" for a TV / 3rd screen. Live via
 * realtime. Controls stay on the phone/extension. Brand bottom-left, day
 * countdown top-right, current wall-clock time bottom-middle.
 */
export default function ContextView({ onExit }: { onExit: () => void }) {
  const { profile, browserProfileId } = useAuth();
  const { currentFocus, queue } = useFocus(profile?.id ?? null, browserProfileId);
  const now = useTick();
  const { width } = useWindowDimensions();
  const [shift, setShift] = useState<{ state: string; since: string | null } | null>(null);
  const [phoneAway, setPhoneAway] = useState(false);

  const resetHour = profile?.settings?.sidecar?.dayResetHour ?? 0;
  const day = dayLeft(resetHour);
  const immediateAlert = !!profile?.settings?.sidecar?.focusAwayImmediate;
  const showCheckpoints = profile?.settings?.sidecar?.showCheckpoints !== false; // default ON

  // Checkpoint counter + last-note preview for the current focus (read-only,
  // ambient — Settings can turn it off). Reuses the existing
  // `focus_checkpoints` hook rather than a bespoke query; that hook has no
  // realtime/poll of its own, so a light interval here keeps the count fresh
  // if a checkpoint lands from the phone while this view is up on a TV.
  const { notes: cpNotes, reload: reloadCp } = useCheckpoints(
    profile?.id ?? null,
    currentFocus?.client_id ?? null
  );
  useEffect(() => {
    if (!showCheckpoints || !currentFocus?.client_id) return;
    const iv = setInterval(reloadCp, 20000);
    return () => clearInterval(iv);
  }, [showCheckpoints, currentFocus?.client_id, reloadCp]);

  // Personality Interrupts v0 (#182 Epic 10) — rides this same phoneAway signal.
  useChaperoneOnPhoneAway(phoneAway, profile?.settings?.chaperone);

  // Account-wide device status (live): the shift, plus the Phone Focus Mode
  // "away" signal from any OTHER device — which drives the red overlay.
  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('browser_profile_status')
        .select('browser_profile_id, clock_state, clocked_in_at, metadata, last_clock_event_at')
        .eq('profile_id', profile.id);
      if (!alive || !data) return;
      const clocked = data
        .filter((r: any) => r.clock_state === 'clocked_in' || r.clock_state === 'on_break')
        .sort((a: any, b: any) => new Date(b.last_clock_event_at || 0).getTime() - new Date(a.last_clock_event_at || 0).getTime());
      setShift(clocked[0] ? { state: clocked[0].clock_state, since: clocked[0].clocked_in_at } : null);
      const away = data.some(
        (r: any) =>
          r.browser_profile_id !== browserProfileId &&
          r.metadata?.focusAway === true &&
          (!r.metadata?.awaySince || Date.now() - new Date(r.metadata.awaySince).getTime() < 30 * 60000)
      );
      setPhoneAway(away);
    };
    load();
    const ch = supabase
      .channel(`ctx_status_${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'tabatha', table: 'browser_profile_status', filter: `profile_id=eq.${profile.id}` }, load)
      .subscribe();
    const iv = setInterval(load, 30000);
    return () => { alive = false; clearInterval(iv); try { supabase.removeChannel(ch); } catch {} };
  }, [profile?.id, browserProfileId]);

  // Red "put the phone down" overlay — slow fade-in by default, immediate if
  // configured. Fades back out quickly when the phone returns.
  const alertOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(alertOpacity, {
      toValue: phoneAway ? 1 : 0,
      duration: phoneAway ? (immediateAlert ? 0 : 7000) : 500,
      useNativeDriver: false,
    }).start();
  }, [phoneAway, immediateAlert, alertOpacity]);

  const cf = currentFocus;
  // B2b: when there's no current focus (active or paused), show the pending
  // queue as priority-ordered choose-from cards instead of a bare "no active
  // focus" message. Excludes sub-intents (`_parent`) — they belong under a
  // parent that isn't on screen. `queue` from `useFocus` is already sorted
  // priority-first. Still strictly view-only: no press handlers — selection
  // happens from the phone or extension.
  const pending = !cf ? queue.filter((q) => !q.tags?._parent) : [];
  const stage = cf ? FUNNEL_STAGES[cf.funnel_stage] || FUNNEL_STAGES.unsorted : null;
  const cfElapsed = cf ? elapsedMsOf(cf, now) : 0;
  const dur = cf ? (cf.timer_minutes || 15) * 60000 : 0;
  const remaining = cf && isSidecarSourced(cf) ? dur - cfElapsed : null;
  const over = remaining != null && remaining < 0;
  const frac = dur > 0 ? Math.max(0, Math.min(1, cfElapsed / dur)) : 0;
  const accent = over ? colors.red : shift?.state === 'on_break' ? colors.amber : colors.accent;

  // shift elapsed
  let shiftText = '';
  if (shift?.since) {
    const s = Math.floor((now - new Date(shift.since).getTime()) / 1000);
    shiftText = `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  const big = Math.min(width * 0.14, 220);

  return (
    <View style={{ flex: 1 }}>
    <View style={styles.root}>
      {/* context bar */}
      <View style={styles.bar}>
        <View style={styles.shiftBox}>
          <View style={[styles.dot, { backgroundColor: shift ? (shift.state === 'on_break' ? colors.amber : colors.green) : '#4C5766' }]} />
          <Text style={styles.shiftTxt}>{shift ? (shift.state === 'on_break' ? 'On break' : 'On shift') : 'Off the clock'}</Text>
          {!!shiftText && <Text style={styles.shiftClk}>{shiftText}</Text>}
        </View>
        <Text style={styles.ctx} numberOfLines={1}>
          {cf?.tags?.client ? `${cf.tags.client}` : profile?.display_name || 'Tabatha'}
          {cf?.tags?.project ? ` · ${cf.tags.project}` : ''}
        </Text>
        <View style={styles.dayBox}>
          <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveTxt}>LIVE</Text></View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.dayNum}>{day.text}</Text>
            <Text style={styles.dayLabel}>left today · {day.mins}/1440</Text>
          </View>
        </View>
      </View>

      {/* main */}
      {pending.length > 0 ? (
        <View style={styles.pendingWrap}>
          <Text style={styles.pendingHdr}>Choose a focus · {pending.length} pending</Text>
          <View style={styles.pendingGrid}>
            {pending.slice(0, 12).map((q) => {
              const s = FUNNEL_STAGES[q.funnel_stage] || FUNNEL_STAGES.unsorted;
              return (
                <View key={q.id} style={styles.pendingCard}>
                  <View style={styles.pendingCardTop}>
                    <Text style={[styles.pendingP, { color: priorityColor(q.priority || 5), borderColor: priorityColor(q.priority || 5) }]}>P{q.priority || 5}</Text>
                    <Text style={{ color: s.color, fontSize: 22 }}>{s.icon}</Text>
                  </View>
                  <Text style={styles.pendingLabel} numberOfLines={4}>{q.label}</Text>
                  <Text style={[styles.pendingStage, { color: s.color }]}>{s.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.main}>
          <View style={styles.left}>
            {cf ? (
              <>
                <Text style={styles.eyebrow}>
                  {shift?.state === 'on_break' ? 'ON BREAK' : 'IN FOCUS'}
                  {stage ? `   ·   ` : ''}
                  <Text style={{ color: stage?.color }}>{stage ? `${stage.icon} ${stage.label}` : ''}</Text>
                  {isOffComputer(cf) ? '   ·   🚶 off-computer' : ''}
                </Text>
                <Text style={[styles.focusLabel, { fontSize: Math.min(width * 0.052, 84) }]} numberOfLines={4}>{cf.label}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}><Text style={styles.metaB}>{formatElapsedMs(cfElapsed)}</Text> elapsed</Text>
                  <Text style={[styles.metaP, { color: priorityColor(cf.priority || 5), borderColor: priorityColor(cf.priority || 5) }]}>P{cf.priority || 5}</Text>
                </View>
                {showCheckpoints && cpNotes.length > 0 && (() => {
                  const last = cpNotes[0];
                  const lastLevel = PROGRESS_LEVELS.find((l) => l.key === last.progress_level);
                  return (
                    <Text style={styles.cpLine} numberOfLines={1}>
                      📋 {cpNotes.length} checkpoint{cpNotes.length === 1 ? '' : 's'}
                      {'  ·  last: '}
                      {last.text ? `“${last.text}” ` : ''}
                      {lastLevel?.icon || ''} {relTime(last.created_at, now)}
                    </Text>
                  );
                })()}
                {queue.filter((q) => !q.tags?._parent).length > 0 && (
                  <View style={styles.next}>
                    <Text style={styles.nextHdr}>UP NEXT</Text>
                    {queue.filter((q) => !q.tags?._parent).slice(0, 3).map((q) => (
                      <View key={q.id} style={styles.qrow}>
                        <Text style={[styles.qp, { color: priorityColor(q.priority || 5), borderColor: priorityColor(q.priority || 5) }]}>P{q.priority || 5}</Text>
                        <Text style={styles.qt} numberOfLines={1}>{q.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.idle}>No active focus.{'\n'}Set one from your phone or extension.</Text>
            )}
          </View>

          {/* timer */}
          <View style={styles.right}>
            {cf && (
              <>
                <Text style={styles.timerMode}>{isSidecarSourced(cf) ? 'FOCUS TIMER' : 'IN FOCUS'}</Text>
                <Text style={[styles.timerBig, { fontSize: big, color: accent }]}>
                  {remaining != null ? formatTimer(Math.abs(remaining)) : formatElapsedMs(cfElapsed)}
                </Text>
                <Text style={styles.timerCap}>{remaining != null ? (over ? 'over' : 'remaining') : 'elapsed'}</Text>
                {dur > 0 && (
                  <View style={styles.track}><View style={[styles.fill, { width: `${frac * 100}%`, backgroundColor: accent }]} /></View>
                )}
              </>
            )}
          </View>
        </View>
      )}

      {/* footer */}
      <View style={styles.foot}>
        <View style={styles.brand}>
          <Text style={styles.logo}>Tabby<Text style={{ color: colors.accent }}>·</Text>Sidecar</Text>
          <Text style={styles.tag}>CONTEXT · VIEW-ONLY</Text>
        </View>
        <Text style={styles.nowClock}>{nowTime(new Date(now))}</Text>
        <Pressable onPress={onExit} style={styles.exit}><Text style={styles.exitTxt}>Use controls →</Text></Pressable>
      </View>
    </View>

    {/* Phone-away accountability overlay — fades in red when the phone (in Focus
        Mode) navigates away. Slow by default; immediate if configured. */}
    <Animated.View pointerEvents="none" style={[styles.alert, { opacity: alertOpacity }]}>
      <Text style={styles.alertEmoji}>📵</Text>
      <Text style={styles.alertBig}>Put the phone down</Text>
      <Text style={styles.alertSub}>You stepped away from focus — back to it.</Text>
    </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase, paddingVertical: 26, paddingHorizontal: 48 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 14 },
  shiftBox: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  shiftTxt: { color: colors.textPrimary, fontWeight: '600', fontSize: 18 },
  shiftClk: { color: colors.textMuted, fontVariant: ['tabular-nums'], fontSize: 16 },
  ctx: { color: colors.textMuted, fontSize: 17, flex: 1, textAlign: 'center' },
  dayBox: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1, justifyContent: 'flex-end' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  liveTxt: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  dayNum: { color: colors.textPrimary, fontWeight: '700', fontSize: 26, fontVariant: ['tabular-nums'] },
  dayLabel: { color: colors.textMuted, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 56 },
  left: { flex: 1.15, justifyContent: 'center' },
  eyebrow: { color: colors.accent, fontSize: 15, letterSpacing: 3, fontWeight: '700', marginBottom: 18, textTransform: 'uppercase' },
  focusLabel: { color: colors.textPrimary, fontWeight: '800', lineHeight: undefined, marginBottom: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  meta: { color: colors.textMuted, fontSize: 20 },
  metaB: { color: colors.textPrimary, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metaP: { fontSize: 16, fontWeight: '700', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2 },
  cpLine: { color: colors.textMuted, fontSize: 15, marginTop: 10 },
  next: { marginTop: 40, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 20, gap: 12, maxWidth: 640 },
  nextHdr: { color: colors.textMuted, fontSize: 12, letterSpacing: 3, fontWeight: '700' },
  qrow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  qp: { fontSize: 13, fontWeight: '700', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 1 },
  qt: { color: colors.textMuted, fontSize: 20, flex: 1 },
  right: { flex: 0.85, alignItems: 'center', justifyContent: 'center' },
  timerMode: { color: colors.accent, fontSize: 14, letterSpacing: 3, fontWeight: '700', marginBottom: 8 },
  timerBig: { fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -2, lineHeight: undefined },
  timerCap: { color: colors.textMuted, fontSize: 15, letterSpacing: 4, textTransform: 'uppercase', fontWeight: '700', marginTop: 6 },
  track: { width: '80%', height: 6, backgroundColor: colors.border, borderRadius: 3, marginTop: 26, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  idle: { color: colors.textMuted, fontSize: 30, fontWeight: '600', lineHeight: 42 },
  pendingWrap: { flex: 1, justifyContent: 'center' },
  pendingHdr: { color: colors.textMuted, fontSize: 15, letterSpacing: 3, fontWeight: '700', textTransform: 'uppercase', textAlign: 'center', marginBottom: 28 },
  pendingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'center' },
  pendingCard: { width: 300, minHeight: 150, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 22, justifyContent: 'space-between' },
  pendingCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pendingP: { fontSize: 15, fontWeight: '700', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  pendingLabel: { color: colors.textPrimary, fontSize: 24, fontWeight: '800', lineHeight: 30, marginTop: 16 },
  pendingStage: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 14 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  brand: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flex: 1 },
  logo: { color: colors.textPrimary, fontWeight: '800', fontSize: 22 },
  tag: { color: colors.textMuted, fontSize: 12, letterSpacing: 2 },
  nowClock: { color: colors.textPrimary, fontSize: 26, fontWeight: '600', fontVariant: ['tabular-nums'], flex: 1, textAlign: 'center' },
  exit: { flex: 1, alignItems: 'flex-end' },
  exitTxt: { color: colors.textMuted, fontSize: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, overflow: 'hidden' },
  alert: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(200,30,30,0.94)',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  alertEmoji: { fontSize: 96 },
  alertBig: { color: '#fff', fontSize: 64, fontWeight: '800', letterSpacing: -1, textAlign: 'center' },
  alertSub: { color: 'rgba(255,255,255,0.9)', fontSize: 24, fontWeight: '600', textAlign: 'center' },
});
