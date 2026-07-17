import React, { useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  useFocus,
  isSidecarSourced,
  startedAtOf,
  type FocusItem,
} from '../data/focus';
import { Btn, Card, Chip, Empty, SectionLabel } from '../ui/kit';
import {
  colors,
  radius,
  FUNNEL_STAGES,
  priorityColor,
  formatTimer,
  formatElapsedMs,
} from '../lib/theme';

const REALMS = ['professional', 'work', 'business', 'personal'];
const STAGE_KEYS = Object.keys(FUNNEL_STAGES);

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}

function StageRow({
  current,
  onChange,
}: {
  current: string;
  onChange: (s: string) => void;
}) {
  return (
    <View style={styles.stageRow}>
      {STAGE_KEYS.map((k) => {
        const s = FUNNEL_STAGES[k];
        const on = k === current;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            style={[
              styles.stagePill,
              { borderColor: on ? s.color : colors.border },
              on && { backgroundColor: s.color + '22' },
            ]}
          >
            <Text style={{ fontSize: 11, color: on ? s.color : colors.textMuted }}>
              {s.icon} {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PriorityPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (p: number) => void;
}) {
  return (
    <View style={styles.prioRow}>
      {[1, 2, 3, 4, 5].map((p) => {
        const on = p === value;
        return (
          <Pressable
            key={p}
            onPress={() => onChange(p)}
            style={[
              styles.prioPill,
              { borderColor: on ? priorityColor(p) : colors.border },
              on && { backgroundColor: priorityColor(p) + '22' },
            ]}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: on ? priorityColor(p) : colors.textMuted,
              }}
            >
              P{p}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function FocusScreen() {
  const { profile, browserProfileId } = useAuth();
  const {
    activeFocus,
    queue,
    history,
    loading,
    refreshing,
    refresh,
    createIntent,
    actions,
  } = useFocus(profile?.id ?? null, browserProfileId);
  const now = useNow();

  const defaultRealm =
    profile?.settings?.sidecar?.defaultRealm ||
    profile?.default_realm ||
    'professional';
  const defaultTimer = profile?.settings?.sidecar?.defaultTimer || 15;

  const [label, setLabel] = useState('');
  const [timer, setTimer] = useState(String(defaultTimer));
  const [realm, setRealm] = useState(defaultRealm);
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    if (!label.trim()) return;
    setCreating(true);
    await createIntent(label, parseInt(timer, 10) || 15, realm);
    setLabel('');
    setTimer(String(defaultTimer));
    setCreating(false);
  };

  // Live remaining for a sidecar-active focus.
  let remaining: number | null = null;
  let over = false;
  if (activeFocus && isSidecarSourced(activeFocus) && activeFocus.focus_state === 'active') {
    const dur = (activeFocus.timer_minutes || 15) * 60000;
    const elapsed = now - startedAtOf(activeFocus);
    remaining = dur - elapsed;
    over = remaining < 0;
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.accent}
        />
      }
    >
      {/* Active focus */}
      {activeFocus ? (
        <Card style={{ marginBottom: 12 }}>
          <View style={styles.activeHeadRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Text style={styles.nowTag}>🎯 FOCUS</Text>
                <Chip
                  label={FUNNEL_STAGES[activeFocus.funnel_stage]?.icon || '•'}
                  color={FUNNEL_STAGES[activeFocus.funnel_stage]?.color}
                />
                {isSidecarSourced(activeFocus) && (
                  <Chip label="📱 off-device" color={colors.accent} />
                )}
              </View>
              <Text style={styles.activeLabel}>{activeFocus.label}</Text>
              <Text style={styles.activeMeta}>
                {formatElapsedMs(now - startedAtOf(activeFocus))} elapsed
              </Text>
            </View>
            {remaining != null && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={[
                    styles.timer,
                    { color: over ? colors.red : colors.accent },
                  ]}
                >
                  {formatTimer(Math.abs(remaining))}
                </Text>
                <Text style={styles.timerCap}>{over ? 'over' : 'left'}</Text>
              </View>
            )}
          </View>

          <View style={styles.btnRow}>
            <Btn label="✓ Resolve" small color={colors.green} onPress={() => actions.resolve(activeFocus.id)} />
            {activeFocus.focus_state === 'active' ? (
              <Btn label="⏸ Pause" small color={colors.amber} onPress={() => actions.pause(activeFocus.id)} />
            ) : (
              <Btn label="▶ Resume" small color={colors.green} onPress={() => actions.resume(activeFocus.id)} />
            )}
            <Btn label="+5m" small onPress={() => actions.extend(activeFocus.id, 5)} />
          </View>

          <View style={{ marginTop: 10 }}>
            <StageRow
              current={activeFocus.funnel_stage}
              onChange={(s) => actions.setStage(activeFocus.id, s)}
            />
          </View>
        </Card>
      ) : (
        !loading && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.noActive}>No active focus. Set one below 👇</Text>
          </Card>
        )
      )}

      {/* New intent */}
      <Card style={{ marginBottom: 12 }}>
        <SectionLabel>{activeFocus ? '+ New Intent' : '🎯 Set Focus'}</SectionLabel>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="What are you focusing on?"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          onSubmitEditing={submit}
        />
        <View style={styles.createRow}>
          <View style={styles.timerBox}>
            <TextInput
              value={timer}
              onChangeText={setTimer}
              keyboardType="number-pad"
              inputMode="numeric"
              style={styles.timerInput}
            />
            <Text style={styles.timerUnit}>min</Text>
          </View>
          <View style={styles.realmRow}>
            {REALMS.map((r) => (
              <Pressable
                key={r}
                onPress={() => setRealm(r)}
                style={[
                  styles.realmPill,
                  realm === r && { borderColor: colors.accent, backgroundColor: colors.accentDim },
                ]}
              >
                <Text style={{ fontSize: 10, color: realm === r ? colors.accent : colors.textMuted }}>
                  {r}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Btn
          label={creating ? 'Starting…' : '▶ Start intent (off-device)'}
          onPress={submit}
          filled
          disabled={creating || !label.trim()}
        />
      </Card>

      {/* Queue */}
      <SectionLabel>Queue ({queue.length})</SectionLabel>
      {queue.length === 0 ? (
        <Empty text="Nothing queued." />
      ) : (
        queue.map((item) => <QueueRow key={item.id} item={item} actions={actions} />)
      )}

      {/* History */}
      {history.length > 0 && (
        <>
          <SectionLabel>History</SectionLabel>
          {history.map((h) => (
            <View key={h.id} style={styles.histRow}>
              <Text style={styles.histLabel} numberOfLines={1}>
                {h.funnel_stage === 'resolved' ? '🏁' : '✅'} {h.label}
              </Text>
            </View>
          ))}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function QueueRow({
  item,
  actions,
}: {
  item: FocusItem;
  actions: ReturnType<typeof useFocus>['actions'];
}) {
  const [open, setOpen] = useState(false);
  const s = FUNNEL_STAGES[item.funnel_stage] || FUNNEL_STAGES.unsorted;
  return (
    <Card style={{ marginBottom: 6, padding: 10 }}>
      <View style={styles.qHead}>
        <Text style={{ fontSize: 12, color: s.color }}>{s.icon}</Text>
        <Text style={styles.qLabel} numberOfLines={1}>
          {item.label}
        </Text>
        <Pressable onPress={() => setOpen((o) => !o)} style={styles.prioBadge}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: priorityColor(item.priority || 5) }}>
            P{item.priority || 5}
          </Text>
        </Pressable>
        <Btn label="▶" small onPress={() => actions.switchTo(item.id)} />
        <Btn label="✓" small color={colors.green} onPress={() => actions.resolve(item.id)} />
      </View>
      {open && (
        <View style={{ marginTop: 8, gap: 8 }}>
          <PriorityPicker value={item.priority || 5} onChange={(p) => actions.setPriority(item.id, p)} />
          <StageRow current={item.funnel_stage} onChange={(st) => actions.setStage(item.id, st)} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  activeHeadRow: { flexDirection: 'row', gap: 10 },
  nowTag: { fontSize: 10, fontWeight: '800', color: colors.accent, letterSpacing: 1 },
  activeLabel: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  activeMeta: { fontSize: 12, color: colors.textMuted },
  timer: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timerCap: { fontSize: 10, color: colors.textMuted },
  noActive: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  input: {
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 10,
  },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  timerBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerInput: {
    width: 48,
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 14,
    textAlign: 'center',
  },
  timerUnit: { fontSize: 11, color: colors.textMuted },
  realmRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', flex: 1 },
  realmPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  stageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  stagePill: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  prioRow: { flexDirection: 'row', gap: 5 },
  prioPill: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  qHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  prioBadge: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  histRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  histLabel: { fontSize: 13, color: colors.textPrimary },
});
