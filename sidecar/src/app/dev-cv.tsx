import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { FocusItem } from '../data/focus';
import { isSidecarSourced, isOffComputer, elapsedMsOf, startedAtOf } from '../data/focus';
import type { Checkpoint } from '../data/checkpoints';
import { PROGRESS_LEVELS } from '../data/checkpoints';
import type { FocusEvent } from '../data/events';
import FocusTimeline from '../components/FocusTimeline';
import ProgressRing from '../components/ProgressRing';
import { colors, radius, FUNNEL_STAGES, priorityColor, formatTimer, formatElapsedMs } from '../lib/theme';

// ────────────────────────────────────────────────────────────────────────
// DEV-ONLY visual harness for Context View "layout v2" (Plan 040 Epic 6).
//
// ContextView.tsx pulls its data through useAuth() + useFocus() (real
// Supabase reads, RLS-gated behind Google/magic-link auth), so it has never
// actually been rendered and eyeballed in a browser -- it shipped
// computed-defensively. This route recreates the exact same composition
// (same styles, same FocusTimeline/ProgressRing pieces, same layout math)
// fed by static mock data instead of live hooks, so QA can visually verify
// it without touching auth.
//
// HARD GATE: this must never render in a production bundle. `web.output` is
// "single" (expo-router bundles all app/ routes into one SPA JS bundle), so
// simply naming the file isn't enough -- the route file itself would still
// ship. Guard on both `__DEV__` (Metro strips/false's this in production
// builds) and NODE_ENV as a second, independent signal; if either says
// "production", render nothing. Verified after `expo export -p web` by
// grepping dist/ for a marker string unique to this screen (see report).
// ────────────────────────────────────────────────────────────────────────

const DEV_UNLOCKED =
  (typeof __DEV__ !== 'undefined' ? __DEV__ : true) &&
  (typeof process === 'undefined' || process.env?.NODE_ENV !== 'production');

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

function dayLeft(resetHour: number): { text: string; mins: number } {
  const d = new Date();
  const nowMin = d.getHours() * 60 + d.getMinutes();
  let left = resetHour * 60 - nowMin;
  if (left <= 0) left += 1440;
  return { text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, mins: left };
}

function relTime(iso: string, now: number): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Mock data builders ────────────────────────────────────────────────
// All timestamps are relative to `base` (captured once at mount), NOT to
// the live tick -- mirrors how the real `tags._startedAt` is a fixed value
// that `elapsedMsOf` measures forward from. This keeps the "~70% elapsed"
// and "overtime" framing accurate even as the harness sits open for a
// while during a QA pass.
function buildActiveScenario(base: number) {
  const min = 60000;
  // Story: started 24m ago, paused after 6m tracked, resumed 11m ago,
  // extended 5m ago (+5min, 20->25min). Currently active.
  // elapsedMsOf target: ~70% of 25min = ~17.5min.
  const startAt = base - 24 * min;
  const pauseAt = base - 18 * min;
  const resumeAt = base - 11 * min;
  const extendAt = base - 5 * min;
  const accumulatedBeforeResume = 6 * min; // pause - start
  const startedAtTag = new Date(resumeAt - accumulatedBeforeResume).toISOString();

  const focus: FocusItem = {
    id: 'mock-focus-active',
    profile_id: 'mock-profile',
    client_id: 'mock-client-active',
    label: 'Draft Q3 investor update deck',
    funnel_stage: 'focus',
    focus_state: 'active',
    timer_minutes: 25,
    priority: 2,
    tags: {
      _src: 'sidecar',
      _startedAt: startedAtTag,
      client: 'Acme Co',
      project: 'Investor Relations',
    },
    created_at: new Date(startAt).toISOString(),
    completed_at: null,
  };

  const events: FocusEvent[] = [
    { id: 'ev1', profile_id: 'mock-profile', focus_client_id: focus.client_id, kind: 'start', at: new Date(startAt).toISOString(), source: 'sidecar', meta: {} },
    { id: 'ev2', profile_id: 'mock-profile', focus_client_id: focus.client_id, kind: 'pause', at: new Date(pauseAt).toISOString(), source: 'sidecar', meta: {} },
    { id: 'ev3', profile_id: 'mock-profile', focus_client_id: focus.client_id, kind: 'resume', at: new Date(resumeAt).toISOString(), source: 'sidecar', meta: {} },
    {
      id: 'ev4',
      profile_id: 'mock-profile',
      focus_client_id: focus.client_id,
      kind: 'extend',
      at: new Date(extendAt).toISOString(),
      source: 'sidecar',
      meta: { addedMinutes: 5, fromMinutes: 20, toMinutes: 25 },
    },
  ];

  // Most-recent-first, matching useCheckpoints' query order.
  const checkpoints: Checkpoint[] = [
    { id: 'cp3', focus_client_id: focus.client_id, text: 'Numbers in the appendix still need the CFO sign-off.', progress_level: 'stuck', created_at: new Date(base - 2 * min).toISOString() },
    { id: 'cp2', focus_client_id: focus.client_id, text: 'Narrative slides done, moving to the metrics section.', progress_level: 'lot', created_at: new Date(base - 9 * min).toISOString() },
    { id: 'cp1', focus_client_id: focus.client_id, text: 'Outline drafted, pulling last quarter\'s deck for reference.', progress_level: 'little', created_at: new Date(base - 20 * min).toISOString() },
  ];

  const queue: FocusItem[] = [
    { id: 'q1', profile_id: 'mock-profile', client_id: 'q1', label: 'Reply to design review thread', funnel_stage: 'todo', focus_state: 'paused', timer_minutes: 15, priority: 3, tags: {}, created_at: new Date(base - 60 * min).toISOString(), completed_at: null },
    { id: 'q2', profile_id: 'mock-profile', client_id: 'q2', label: 'Book travel for offsite', funnel_stage: 'unsorted', focus_state: 'paused', timer_minutes: 15, priority: 5, tags: {}, created_at: new Date(base - 90 * min).toISOString(), completed_at: null },
    { id: 'q3', profile_id: 'mock-profile', client_id: 'q3', label: 'Follow up with legal on MSA redlines', funnel_stage: 'addressing', focus_state: 'paused', timer_minutes: 15, priority: 1, tags: {}, created_at: new Date(base - 120 * min).toISOString(), completed_at: null },
  ];

  return { focus, events, checkpoints, queue };
}

function buildOvertimeScenario(base: number) {
  const min = 60000;
  const startAt = base - 24 * min; // duration is 20min -> 4min over
  const focus: FocusItem = {
    id: 'mock-focus-overtime',
    profile_id: 'mock-profile',
    client_id: 'mock-client-overtime',
    label: 'Untangle the flaky CI pipeline',
    funnel_stage: 'addressing',
    focus_state: 'active',
    timer_minutes: 20,
    priority: 1,
    tags: { _src: 'sidecar', _startedAt: new Date(startAt).toISOString() },
    created_at: new Date(startAt).toISOString(),
    completed_at: null,
  };
  const events: FocusEvent[] = [
    { id: 'ev1', profile_id: 'mock-profile', focus_client_id: focus.client_id, kind: 'start', at: new Date(startAt).toISOString(), source: 'sidecar', meta: {} },
  ];
  const checkpoints: Checkpoint[] = [
    { id: 'cp1', focus_client_id: focus.client_id, text: 'Isolated it to the retry flake in the auth fixture.', progress_level: 'lot', created_at: new Date(base - 10 * min).toISOString() },
  ];
  return { focus, events, checkpoints, queue: [] as FocusItem[] };
}

function buildEmptyScenarioQueue(base: number): FocusItem[] {
  const min = 60000;
  const mk = (id: string, label: string, priority: number, funnel_stage: string, mAgo: number): FocusItem => ({
    id,
    profile_id: 'mock-profile',
    client_id: id,
    label,
    funnel_stage,
    focus_state: 'paused',
    timer_minutes: 15,
    priority,
    tags: {},
    created_at: new Date(base - mAgo * min).toISOString(),
    completed_at: null,
  });
  return [
    mk('p1', 'Ship the pricing page copy update', 1, 'addressing', 15),
    mk('p2', 'Review PR #482 (auth refactor)', 2, 'todo', 40),
    mk('p3', 'Write release notes for v0.5.0', 2, 'focus', 22),
    mk('p4', 'Sync with design on the empty-state illustration', 3, 'unsorted', 200),
    mk('p5', 'Triage the roadblocked support tickets', 1, 'roadblocked', 300),
    mk('p6', 'Plan next sprint priorities', 4, 'todo', 500),
    mk('p7', 'Renew the SSL cert on staging', 5, 'unsorted', 600),
  ];
}

type Scenario = 'active' | 'overtime' | 'empty' | 'phone-away';

function DevContextViewHarness() {
  const baseRef = useRef(Date.now());
  const base = baseRef.current;
  const now = useTick();
  const { width } = useWindowDimensions();

  const [scenario, setScenario] = useState<Scenario>('active');
  const [manualPhoneAway, setManualPhoneAway] = useState(false);
  const [instantAlert, setInstantAlert] = useState(false);

  const activeData = buildActiveScenario(base);
  const overtimeData = buildOvertimeScenario(base);
  const emptyQueue = buildEmptyScenarioQueue(base);

  const cv = { showDayCountdown: true, showUpNext: true, showTimeline: true, showCheckpoints: true, dayResetHour: 0, focusAwayImmediate: false };
  const resetHour = cv.dayResetHour;
  const day = dayLeft(resetHour);
  const showCheckpoints = cv.showCheckpoints;

  const phoneAway = scenario === 'phone-away' || manualPhoneAway;
  const immediateAlert = instantAlert;

  const shift: { state: string; since: string | null } | null =
    scenario === 'empty' ? null : { state: 'clocked_in', since: new Date(base - 143 * 60000).toISOString() };

  const cf: FocusItem | null =
    scenario === 'active' || scenario === 'phone-away'
      ? activeData.focus
      : scenario === 'overtime'
        ? overtimeData.focus
        : null;
  const focusEvents: FocusEvent[] =
    scenario === 'active' || scenario === 'phone-away' ? activeData.events : scenario === 'overtime' ? overtimeData.events : [];
  const cpNotes: Checkpoint[] =
    scenario === 'active' || scenario === 'phone-away' ? activeData.checkpoints : scenario === 'overtime' ? overtimeData.checkpoints : [];
  const queueForUpNext: FocusItem[] = scenario === 'active' || scenario === 'phone-away' ? activeData.queue : [];
  const pending: FocusItem[] = scenario === 'empty' ? emptyQueue : [];

  // Personality Interrupts / chaperone hook is intentionally NOT wired here
  // -- it's a side-effecting hook (fires audio/notification side effects on
  // phoneAway) that has nothing to do with this screen's LAYOUT, which is
  // all this harness exists to verify. See report for why it's excluded.

  const alertOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(alertOpacity, {
      toValue: phoneAway ? 1 : 0,
      duration: phoneAway ? (immediateAlert ? 0 : 7000) : 500,
      useNativeDriver: false,
    }).start();
  }, [phoneAway, immediateAlert, alertOpacity]);

  const stage = cf ? FUNNEL_STAGES[cf.funnel_stage] || FUNNEL_STAGES.unsorted : null;
  const cfElapsed = cf ? elapsedMsOf(cf, now) : 0;
  const dur = cf ? (cf.timer_minutes || 15) * 60000 : 0;
  const remaining = cf && isSidecarSourced(cf) ? dur - cfElapsed : null;
  const over = remaining != null && remaining < 0;
  const overtimeMs = over && remaining != null ? Math.abs(remaining) : 0;
  const frac = dur > 0 ? Math.max(0, Math.min(1, cfElapsed / dur)) : 0;
  const accent = over ? colors.red : shift?.state === 'on_break' ? colors.amber : colors.accent;

  let shiftText = '';
  if (shift?.since) {
    const s = Math.floor((now - new Date(shift.since).getTime()) / 1000);
    shiftText = `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  const big = Math.min(width * 0.14, 220);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgBase }}>
      {/* Dev-only scenario toolbar -- ABSOLUTE overlay so it does NOT consume
          flex height from the CV layout below. This keeps the harness's
          "root" container at the exact same pixel height as production at
          this viewport (no toolbar-induced compression of the flex column),
          which matters for judging whether content overflows into the
          footer. Never ships (whole route is gated). */}
      <View style={toolbar.bar} pointerEvents="box-none">
        <Text style={toolbar.label}>CV LAYOUT v2 HARNESS (dev-only)</Text>
        {(['active', 'overtime', 'empty', 'phone-away'] as Scenario[]).map((s) => (
          <Pressable key={s} onPress={() => setScenario(s)} style={[toolbar.btn, scenario === s && toolbar.btnActive]}>
            <Text style={[toolbar.btnTxt, scenario === s && toolbar.btnTxtActive]}>{s}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setManualPhoneAway((v) => !v)} style={[toolbar.btn, manualPhoneAway && toolbar.btnActive]}>
          <Text style={[toolbar.btnTxt, manualPhoneAway && toolbar.btnTxtActive]}>toggle phone-away</Text>
        </Pressable>
        <Pressable onPress={() => setInstantAlert((v) => !v)} style={[toolbar.btn, instantAlert && toolbar.btnActive]}>
          <Text style={[toolbar.btnTxt, instantAlert && toolbar.btnTxtActive]}>instant fade</Text>
        </Pressable>
      </View>

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
              {cf?.tags?.client ? `${cf.tags.client}` : 'Tabatha Mock'}
              {cf?.tags?.project ? ` · ${cf.tags.project}` : ''}
            </Text>
            {cv.showDayCountdown && (
              <View style={styles.dayBox}>
                <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveTxt}>LIVE</Text></View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.dayNumSm}>{day.text}</Text>
                  <Text style={styles.dayLabelSm}>left today</Text>
                </View>
              </View>
            )}
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
          ) : cf ? (
            <View style={styles.mainV2}>
              <View style={styles.titleCol} pointerEvents="none">
                <Text style={styles.eyebrow}>
                  {shift?.state === 'on_break' ? 'ON BREAK' : 'IN FOCUS'}
                  {stage ? `   ·   ` : ''}
                  <Text style={{ color: stage?.color }}>{stage ? `${stage.icon} ${stage.label}` : ''}</Text>
                  {isOffComputer(cf) ? '   ·   🚶 off-computer' : ''}
                </Text>
                <Text style={[styles.focusLabelHuge, { fontSize: Math.min(width * 0.078, 128) }]} numberOfLines={3}>{cf.label}</Text>
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
                      {last.text ? `"${last.text}" ` : ''}
                      {lastLevel?.icon || ''} {relTime(last.created_at, now)}
                    </Text>
                  );
                })()}
                {cv.showUpNext && queueForUpNext.length > 0 && (
                  <View style={styles.next}>
                    <Text style={styles.nextHdr}>UP NEXT</Text>
                    {queueForUpNext.slice(0, 3).map((q) => (
                      <View key={q.id} style={styles.qrow}>
                        <Text style={[styles.qp, { color: priorityColor(q.priority || 5), borderColor: priorityColor(q.priority || 5) }]}>P{q.priority || 5}</Text>
                        <Text style={styles.qt} numberOfLines={1}>{q.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.ringZone} pointerEvents="none">
                <ProgressRing size={Math.min(width * 0.3, big * 2.3)} thickness={Math.max(6, big * 0.045)} progress={frac} color={accent} bgColor={colors.bgBase}>
                  <Text style={styles.timerMode}>{isSidecarSourced(cf) ? 'FOCUS TIMER' : 'IN FOCUS'}</Text>
                  <Text style={[styles.timerBig, { fontSize: big, color: accent }]}>
                    {remaining != null ? formatTimer(Math.abs(remaining)) : formatElapsedMs(cfElapsed)}
                  </Text>
                  <Text style={styles.timerCap}>{remaining != null ? (over ? 'over' : 'remaining') : 'elapsed'}</Text>
                </ProgressRing>
              </View>
            </View>
          ) : (
            <View style={styles.mainV2}>
              <Text style={styles.idle}>No active focus.{'\n'}Set one from your phone or extension.</Text>
            </View>
          )}

          {cv.showTimeline && cf && dur > 0 && (
            <FocusTimeline
              focus={cf}
              now={now}
              checkpoints={cpNotes}
              events={focusEvents}
              frac={frac}
              durationMs={dur}
              over={over}
              overtimeMs={overtimeMs}
            />
          )}

          <View style={styles.foot}>
            <View style={styles.footLeft}>
              <View style={styles.brand}>
                <Text style={styles.logo}>Tabby<Text style={{ color: colors.accent }}>·</Text>Sidecar</Text>
                <Text style={styles.tag}>CONTEXT · VIEW-ONLY</Text>
              </View>
              <Pressable style={styles.exit}><Text style={styles.exitTxt}>Use controls →</Text></Pressable>
            </View>
            <Text style={styles.nowClock}>{nowTime(new Date(now))}</Text>
            <View style={styles.footRight} />
          </View>
        </View>

        <Animated.View pointerEvents="none" style={[styles.alert, { opacity: alertOpacity }]}>
          <Text style={styles.alertEmoji}>📵</Text>
          <Text style={styles.alertBig}>Put the phone down</Text>
          <Text style={styles.alertSub}>You stepped away from focus — back to it.</Text>
        </Animated.View>
      </View>
    </View>
  );
}

export default function DevCV() {
  if (!DEV_UNLOCKED) return null;
  return <DevContextViewHarness />;
}

// ── styles: verbatim copy of ContextView.tsx's StyleSheet, so the layout
// under test is byte-identical to production. ────────────────────────────
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
  dayNumSm: { color: colors.textPrimary, fontWeight: '700', fontSize: 18, fontVariant: ['tabular-nums'] },
  dayLabelSm: { color: colors.textMuted, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  mainV2: { flex: 1, position: 'relative' },
  // Kept in sync with the fix applied to ContextView.tsx's titleCol (see
  // that file's comment) -- bottom:0 + overflow:hidden so this harness
  // continues to mirror production after the position-math fix.
  titleCol: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '66%', maxWidth: 920, zIndex: 3, overflow: 'hidden' },
  ringZone: { position: 'absolute', right: 0, bottom: 0, zIndex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: colors.accent, fontSize: 15, letterSpacing: 3, fontWeight: '700', marginBottom: 18, textTransform: 'uppercase' },
  focusLabelHuge: { color: colors.textPrimary, fontWeight: '800', letterSpacing: -2, marginBottom: 22 },
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
  timerMode: { color: colors.accent, fontSize: 14, letterSpacing: 3, fontWeight: '700', marginBottom: 8 },
  timerBig: { fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -2, lineHeight: undefined },
  timerCap: { color: colors.textMuted, fontSize: 15, letterSpacing: 4, textTransform: 'uppercase', fontWeight: '700', marginTop: 6 },
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
  footLeft: { flex: 1, gap: 8 },
  footRight: { flex: 1 },
  brand: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  logo: { color: colors.textPrimary, fontWeight: '800', fontSize: 22 },
  tag: { color: colors.textMuted, fontSize: 12, letterSpacing: 2 },
  nowClock: { color: colors.textPrimary, fontSize: 26, fontWeight: '600', fontVariant: ['tabular-nums'], flex: 1, textAlign: 'center' },
  exit: { alignSelf: 'flex-start' },
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

const toolbar = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(26,16,48,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: '#3a2a55',
  },
  label: { color: '#c9a8ff', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginRight: 8 },
  btn: { borderWidth: 1, borderColor: '#3a2a55', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  btnActive: { backgroundColor: '#c9a8ff', borderColor: '#c9a8ff' },
  btnTxt: { color: '#c9a8ff', fontSize: 11, fontWeight: '600' },
  btnTxtActive: { color: '#1a1030' },
});
