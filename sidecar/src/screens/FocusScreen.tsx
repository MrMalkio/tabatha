import React, { useEffect, useRef, useState } from 'react';
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
  isOffComputer,
  elapsedMsOf,
  startedAtOf,
  type FocusItem,
} from '../data/focus';
import { useCheckpoints, PROGRESS_LEVELS } from '../data/checkpoints';
import { useVoiceCapture } from '../lib/speech';
import PhoneFocusMode from '../components/PhoneFocusMode';
import VoiceCheckIn from '../components/VoiceCheckIn';
import { Btn, Card, Chip, Empty, MicButton, SectionLabel } from '../ui/kit';
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

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return now;
}

function StageRow({ current, onChange }: { current: string; onChange: (s: string) => void }) {
  return (
    <View style={styles.wrapRow}>
      {STAGE_KEYS.map((k) => {
        const s = FUNNEL_STAGES[k];
        const on = k === current;
        return (
          <Pressable key={k} onPress={() => onChange(k)} style={[styles.pill, { borderColor: on ? s.color : colors.border }, on && { backgroundColor: s.color + '22' }]}>
            <Text style={{ fontSize: 11, color: on ? s.color : colors.textMuted }}>{s.icon} {s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PriorityRow({ value, onChange }: { value: number; onChange: (p: number) => void }) {
  return (
    <View style={styles.wrapRow}>
      {[1, 2, 3, 4, 5].map((p) => {
        const on = p === value;
        return (
          <Pressable key={p} onPress={() => onChange(p)} style={[styles.pill, { borderColor: on ? priorityColor(p) : colors.border }, on && { backgroundColor: priorityColor(p) + '22' }]}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: on ? priorityColor(p) : colors.textMuted }}>P{p}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function FocusScreen() {
  const { profile, browserProfileId } = useAuth();
  const { currentFocus, queue, backburner, history, loading, refreshing, refresh, createIntent, actions } =
    useFocus(profile?.id ?? null, browserProfileId);
  const now = useNow();

  const defaultRealm = profile?.settings?.sidecar?.defaultRealm || profile?.default_realm || 'professional';
  const defaultTimer = profile?.settings?.sidecar?.defaultTimer || 15;

  const [label, setLabel] = useState('');
  const [timer, setTimer] = useState(String(defaultTimer));
  const [realm, setRealm] = useState(defaultRealm);
  const [creating, setCreating] = useState(false);

  // Voice capture (#165 / Epic 1) — speak a new intent. Base text is
  // whatever was already typed when the mic was tapped; the live
  // transcript is appended onto it and stays editable afterward.
  const labelBaseRef = useRef('');
  const labelVoice = useVoiceCapture((text) => {
    setLabel(labelBaseRef.current ? `${labelBaseRef.current} ${text}` : text);
  });
  const onMicLabel = () => {
    if (labelVoice.listening) {
      labelVoice.stop();
      return;
    }
    labelBaseRef.current = label.trim();
    labelVoice.start();
  };

  const [showEdit, setShowEdit] = useState(false);
  const [showCp, setShowCp] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [subLabel, setSubLabel] = useState('');

  const submit = async () => {
    if (!label.trim()) return;
    setCreating(true);
    await createIntent(label, parseInt(timer, 10) || 15, realm);
    setLabel('');
    setTimer(String(defaultTimer));
    setCreating(false);
  };

  const cf = currentFocus;
  const cfElapsed = cf ? elapsedMsOf(cf, now) : 0;
  let remaining: number | null = null;
  let over = false;
  if (cf && isSidecarSourced(cf)) {
    // Continues across pauses (frozen while paused), never restarts on resume.
    const dur = (cf.timer_minutes || 15) * 60000;
    remaining = dur - cfElapsed;
    over = remaining < 0;
  }

  const subIntents = cf ? queue.filter((q) => q.tags?._parent === cf.client_id) : [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
    >
      <PhoneFocusMode currentFocus={cf} onPause={actions.pause} />
      {cf ? (
        <Card style={{ marginBottom: 12 }}>
          {/* NOW bar */}
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.chipRow}>
                <Text style={styles.nowTag}>{cf.focus_state === 'drifted' ? '⚠️ DRIFTED' : '🎯 FOCUS'}</Text>
                <Chip label={FUNNEL_STAGES[cf.funnel_stage]?.icon || '•'} color={FUNNEL_STAGES[cf.funnel_stage]?.color} />
                {cf.focus_state === 'paused' && <Chip label="⏸ paused" color={colors.amber} />}
                {isOffComputer(cf) ? <Chip label="🚶 off-computer" color={colors.accent} /> : <Chip label="💻 at computer" color={colors.textMuted} />}
              </View>
              <Text style={styles.cfLabel}>{cf.label}</Text>
              <Text style={styles.cfMeta}>{formatElapsedMs(cfElapsed)} elapsed · P{cf.priority || 5}</Text>
            </View>
            {remaining != null && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.timer, { color: over ? colors.red : colors.accent }]}>{formatTimer(Math.abs(remaining))}</Text>
                <Text style={styles.timerCap}>{over ? 'over' : 'left'}</Text>
              </View>
            )}
          </View>

          <View style={styles.btnRow}>
            <Btn label="✓ Resolve" small color={colors.green} onPress={() => actions.resolve(cf.id)} />
            {cf.focus_state === 'active' ? (
              <Btn label="⏸ Pause" small color={colors.amber} onPress={() => actions.pause(cf.id)} />
            ) : (
              <Btn label="▶ Resume" small color={colors.green} onPress={() => actions.resume(cf.id)} />
            )}
            <Btn label="+5m" small onPress={() => actions.extend(cf.id, 5)} />
            <Btn label={isOffComputer(cf) ? '💻 At computer' : '🚶 Off-computer'} small color={colors.accent} onPress={() => actions.toggleOffComputer(cf.id)} />
            <Btn label="🔥 Backburner" small color={colors.orange} onPress={() => actions.sendToBackburner(cf.id)} />
          </View>
          <View style={styles.btnRow}>
            <Btn label={showEdit ? '✕ Close edit' : '✏️ Update focus'} small color={colors.textMuted} onPress={() => { setShowEdit((v) => !v); setShowCp(false); setShowSub(false); }} />
            <Btn label={showCp ? '✕ Close notes' : '📋 Checkpoint'} small color={colors.textMuted} onPress={() => { setShowCp((v) => !v); setShowEdit(false); setShowSub(false); }} />
            <Btn label={showSub ? '✕ Close sub' : '📌 Sub-intent'} small color={colors.textMuted} onPress={() => { setShowSub((v) => !v); setShowEdit(false); setShowCp(false); }} />
          </View>

          <View style={{ marginTop: 8 }}>
            <StageRow current={cf.funnel_stage} onChange={(s) => actions.setStage(cf.id, s)} />
          </View>

          {/* Voice check-in (Plan 040 Addendum 7) — manual 🎙 + proactive
              "How's it going?" prompt; sits by the checkpoint composer. */}
          <VoiceCheckIn focus={cf} actions={actions} />

          {showEdit && <EditPanel key={cf.id} focus={cf} onSave={(u) => { actions.updateFocus(cf.id, u); setShowEdit(false); }} />}
          {showCp && <CheckpointPanel profileId={profile?.id ?? null} focus={cf} />}
          {showSub && (
            <View style={styles.subPanel}>
              <TextInput value={subLabel} onChangeText={setSubLabel} placeholder="Sub-intent under this focus…" placeholderTextColor={colors.textMuted} style={styles.input} onSubmitEditing={async () => { if (subLabel.trim()) { await createIntent(subLabel, 15, realm, { active: false, parentId: cf.id }); setSubLabel(''); setShowSub(false); } }} />
              <Btn label="Add sub-intent" small filled onPress={async () => { if (subLabel.trim()) { await createIntent(subLabel, 15, realm, { active: false, parentId: cf.id }); setSubLabel(''); setShowSub(false); } }} />
            </View>
          )}

          {subIntents.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.subHdr}>Sub-intents</Text>
              {subIntents.map((s) => (
                <View key={s.id} style={styles.subRow}>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>↳</Text>
                  <Text style={styles.subText} numberOfLines={1}>{s.label}</Text>
                  <Btn label="▶" small onPress={() => actions.switchTo(s.id)} />
                  <Btn label="✓" small color={colors.green} onPress={() => actions.resolve(s.id)} />
                </View>
              ))}
            </View>
          )}
        </Card>
      ) : (
        !loading && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.noActive}>No current focus. Set one below 👇</Text>
          </Card>
        )
      )}

      {/* New intent */}
      <Card style={{ marginBottom: 12 }}>
        <SectionLabel>{cf ? '+ New intent' : '🎯 Set focus'}</SectionLabel>
        <View style={styles.inputRow}>
          <TextInput value={label} onChangeText={setLabel} placeholder="What are you focusing on?" placeholderTextColor={colors.textMuted} style={[styles.input, styles.inputFlex]} onSubmitEditing={submit} />
          <MicButton listening={labelVoice.listening} supported={labelVoice.supported} onPress={onMicLabel} />
        </View>
        <View style={styles.createRow}>
          <View style={styles.timerBox}>
            <TextInput value={timer} onChangeText={setTimer} keyboardType="number-pad" inputMode="numeric" style={styles.timerInput} />
            <Text style={styles.timerUnit}>min</Text>
          </View>
          <View style={styles.wrapRow}>
            {REALMS.map((r) => (
              <Pressable key={r} onPress={() => setRealm(r)} style={[styles.pill, realm === r && { borderColor: colors.accent, backgroundColor: colors.accentDim }]}>
                <Text style={{ fontSize: 10, color: realm === r ? colors.accent : colors.textMuted }}>{r}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Btn label={creating ? 'Starting…' : cf ? '▶ Start focus' : '▶ Set focus'} onPress={submit} filled disabled={creating || !label.trim()} />
      </Card>

      {/* Backburner */}
      {backburner.length > 0 && (
        <>
          <Text style={styles.bbHdr}>🔥 Backburner ({backburner.length})</Text>
          {backburner.map((b) => (
            <View key={b.id} style={styles.bbRow}>
              <Text style={styles.bbLabel} numberOfLines={1}>🔥 {b.label}</Text>
              <Btn label="▶" small color={colors.green} onPress={() => actions.resumeBackburner(b.id)} />
              <Btn label="⏰" small color={colors.amber} onPress={() => actions.snoozeBackburner(b.id, 10)} />
              <Btn label="✕" small color={colors.red} onPress={() => actions.dismissBackburner(b.id)} />
            </View>
          ))}
        </>
      )}

      {/* Queue */}
      <SectionLabel>Queue ({queue.filter((q) => !q.tags?._parent).length})</SectionLabel>
      {queue.filter((q) => !q.tags?._parent).length === 0 ? (
        <Empty text="Nothing queued." />
      ) : (
        queue.filter((q) => !q.tags?._parent).map((item) => <QueueRow key={item.id} item={item} actions={actions} />)
      )}

      {/* History */}
      {history.length > 0 && (
        <>
          <SectionLabel>History</SectionLabel>
          {history.map((h) => (
            <View key={h.id} style={styles.histRow}>
              <Text style={styles.histLabel} numberOfLines={1}>{h.funnel_stage === 'resolved' ? '🏁' : '✅'} {h.label}</Text>
            </View>
          ))}
        </>
      )}
      <View style={{ height: 44 }} />
    </ScrollView>
  );
}

// ── Edit panel ─────────────────────────────────────────────
function EditPanel({ focus, onSave }: { focus: FocusItem; onSave: (u: any) => void }) {
  const [label, setLabel] = useState(focus.label);
  const [timer, setTimer] = useState(String(focus.timer_minutes || 15));
  const [stage, setStage] = useState(focus.funnel_stage);
  const [client, setClient] = useState(focus.tags?.client || '');
  const [project, setProject] = useState(focus.tags?.project || '');
  const [backMin, setBackMin] = useState(0);
  const started = new Date(startedAtOf({ ...focus } as FocusItem) - backMin * 60000);

  return (
    <View style={styles.panel}>
      <Text style={styles.fieldLabel}>Label</Text>
      <TextInput value={label} onChangeText={setLabel} style={styles.input} />
      <View style={styles.row2}>
        <View style={{ width: 90 }}>
          <Text style={styles.fieldLabel}>Timer (min)</Text>
          <TextInput value={timer} onChangeText={setTimer} keyboardType="number-pad" inputMode="numeric" style={styles.input} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Client</Text>
          <TextInput value={client} onChangeText={setClient} placeholder="—" placeholderTextColor={colors.textMuted} style={styles.input} />
        </View>
      </View>
      <Text style={styles.fieldLabel}>Project</Text>
      <TextInput value={project} onChangeText={setProject} placeholder="—" placeholderTextColor={colors.textMuted} style={styles.input} />
      <Text style={styles.fieldLabel}>Stage</Text>
      <StageRow current={stage} onChange={setStage} />
      <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Backdate start · {started.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{backMin ? `  (-${backMin}m)` : ''}</Text>
      <View style={styles.wrapRow}>
        {[0, 15, 30, 60, 120].map((m) => (
          <Pressable key={m} onPress={() => setBackMin(m)} style={[styles.pill, backMin === m && { borderColor: colors.accent, backgroundColor: colors.accentDim }]}>
            <Text style={{ fontSize: 11, color: backMin === m ? colors.accent : colors.textMuted }}>{m === 0 ? 'now' : `-${m}m`}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: 10 }}>
        <Btn label="💾 Save" filled small onPress={() => onSave({
          label, timerMinutes: parseInt(timer, 10) || 15, funnelStage: stage,
          tags: { client: client || undefined, project: project || undefined },
          startedAt: backMin ? new Date(startedAtOf({ ...focus } as FocusItem) - backMin * 60000).toISOString() : undefined,
        })} />
      </View>
    </View>
  );
}

// ── Checkpoint panel ───────────────────────────────────────
function CheckpointPanel({ profileId, focus }: { profileId: string | null; focus: FocusItem }) {
  const { notes, add, remove } = useCheckpoints(profileId, focus.client_id);
  const [text, setText] = useState('');

  // Voice capture (#165 / Epic 1) — speak a checkpoint/progress note.
  const noteBaseRef = useRef('');
  const noteVoice = useVoiceCapture((t) => {
    setText(noteBaseRef.current ? `${noteBaseRef.current} ${t}` : t);
  });
  const onMicNote = () => {
    if (noteVoice.listening) {
      noteVoice.stop();
      return;
    }
    noteBaseRef.current = text.trim();
    noteVoice.start();
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.fieldLabel}>📋 Checkpoint note</Text>
      <View style={[styles.inputRow, { alignItems: 'flex-start' }]}>
        <TextInput value={text} onChangeText={setText} placeholder="What have you done since the last checkpoint?" placeholderTextColor={colors.textMuted} multiline style={[styles.input, styles.inputFlex, { minHeight: 54, textAlignVertical: 'top' }]} />
        <MicButton listening={noteVoice.listening} supported={noteVoice.supported} onPress={onMicNote} />
      </View>
      <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Submit with progress:</Text>
      <View style={styles.wrapRow}>
        {PROGRESS_LEVELS.map((l) => (
          <Pressable key={l.key} onPress={() => { if (l.key === 'stuck' && !text.trim()) return; add(text, l.key); setText(''); }} style={[styles.pill, { borderColor: l.color }]}>
            <Text style={{ fontSize: 11, color: l.color }}>{l.icon} {l.label}</Text>
          </Pressable>
        ))}
      </View>
      {notes.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.subHdr}>Timeline</Text>
          {notes.map((n) => {
            const lv = PROGRESS_LEVELS.find((l) => l.key === n.progress_level);
            return (
              <View key={n.id} style={styles.cpRow}>
                <Text style={{ fontSize: 12 }}>{lv?.icon}</Text>
                <View style={{ flex: 1 }}>
                  {!!n.text && <Text style={styles.cpText}>{n.text}</Text>}
                  <Text style={styles.cpTime}>{lv?.label} · {new Date(n.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
                </View>
                <Pressable onPress={() => remove(n.id)}><Text style={{ color: colors.textMuted, fontSize: 12 }}>✕</Text></Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Queue row ──────────────────────────────────────────────
function QueueRow({ item, actions }: { item: FocusItem; actions: ReturnType<typeof useFocus>['actions'] }) {
  const [open, setOpen] = useState(false);
  const s = FUNNEL_STAGES[item.funnel_stage] || FUNNEL_STAGES.unsorted;
  return (
    <Card style={{ marginBottom: 6, padding: 10 }}>
      <View style={styles.qHead}>
        <Text style={{ fontSize: 12, color: s.color }}>{s.icon}</Text>
        <Text style={styles.qLabel} numberOfLines={1}>{item.label}</Text>
        {isOffComputer(item) && <Text style={{ fontSize: 11 }}>🚶</Text>}
        <Pressable onPress={() => setOpen((o) => !o)} style={styles.prioBadge}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: priorityColor(item.priority || 5) }}>P{item.priority || 5}</Text>
        </Pressable>
        <Btn label="▶" small onPress={() => actions.switchTo(item.id)} />
        <Btn label="✓" small color={colors.green} onPress={() => actions.resolve(item.id)} />
      </View>
      {open && (
        <View style={{ marginTop: 8, gap: 8 }}>
          <PriorityRow value={item.priority || 5} onChange={(p) => actions.setPriority(item.id, p)} />
          <StageRow current={item.funnel_stage} onChange={(st) => actions.setStage(item.id, st)} />
          <View style={styles.wrapRow}>
            <Btn label={isOffComputer(item) ? '💻 At computer' : '🚶 Off-computer'} small color={colors.accent} onPress={() => actions.toggleOffComputer(item.id)} />
            <Btn label="🔥 Backburner" small color={colors.orange} onPress={() => actions.sendToBackburner(item.id)} />
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  headRow: { flexDirection: 'row', gap: 10 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4, flexWrap: 'wrap' },
  nowTag: { fontSize: 10, fontWeight: '800', color: colors.accent, letterSpacing: 1 },
  cfLabel: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  cfMeta: { fontSize: 12, color: colors.textMuted },
  timer: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timerCap: { fontSize: 10, color: colors.textMuted },
  noActive: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  input: { backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontSize: 15, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  inputFlex: { flex: 1, marginBottom: 0 },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  timerBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerInput: { width: 48, backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 8, color: colors.textPrimary, fontSize: 14, textAlign: 'center' },
  timerUnit: { fontSize: 11, color: colors.textMuted },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  pill: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 5 },
  panel: { marginTop: 10, padding: 10, backgroundColor: colors.bgBase, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  fieldLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: colors.textMuted, fontWeight: '700', marginBottom: 4 },
  row2: { flexDirection: 'row', gap: 8 },
  subPanel: { marginTop: 10, gap: 8 },
  subHdr: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: colors.textMuted, fontWeight: '700', marginBottom: 6 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.border },
  subText: { flex: 1, fontSize: 13, color: colors.textPrimary },
  bbHdr: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: colors.orange, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  bbRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,152,0,0.06)', borderWidth: 1, borderColor: 'rgba(255,152,0,0.25)', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  bbLabel: { flex: 1, fontSize: 13, color: colors.textPrimary },
  qHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  prioBadge: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  cpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  cpText: { fontSize: 13, color: colors.textPrimary },
  cpTime: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  histRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  histLabel: { fontSize: 13, color: colors.textPrimary },
});
