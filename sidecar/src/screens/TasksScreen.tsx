import React, { useEffect, useMemo, useState } from 'react';
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
import { useTasks, isAsanaTask, type TaskRow } from '../data/tasks';
import { useFocus, type FocusItem } from '../data/focus';
import { computeIntervals, totalTrackedMs, type FocusEvent } from '../data/events';
import { supabase } from '../lib/supabase';
import { Btn, Chip, Empty, SectionLabel } from '../ui/kit';
import { colors, radius, formatElapsedDigits } from '../lib/theme';

// Epic 3 Unit 5 — Tasks view: tasks_registry read (Asana-synced + local),
// nested subtasks, blocked badges, per-task tracked time, and ▶ start-task
// wiring into the focus engine.

// Focus <-> task linkage follows the EXTENSION's existing convention:
// `tags.task = <tasks_registry.task_id>` (see src/background/services/
// focusService.js linkIntentToTask and home/index.jsx getLinkedIntents),
// NOT a new tags._taskId field. Sub-intents keep the existing `tags._parent
// = <parent focus client_id>` mechanism from data/focus.ts.
function focusesForTask(items: FocusItem[], taskId: string): FocusItem[] {
  return items.filter((f) => f.tags?.task === taskId);
}

function liveFocusForTask(items: FocusItem[], taskId: string): FocusItem | null {
  const linked = focusesForTask(items, taskId).filter(
    (f) => f.focus_state !== 'completed' && f.funnel_stage !== 'resolved'
  );
  return (
    linked.find((f) => f.focus_state === 'active') ||
    linked.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ||
    null
  );
}

// Per-task tracked time (design §5 "focus_events-derived per-task time"):
// every focus tagged to the task contributes its paired start/pause
// intervals (computeIntervals — the same 28-test-covered pairing used by
// the Context View timeline). Fetched in ONE .in() query over just the
// linked client_ids, recomputed when the linkage set changes. Tasks with no
// tracked time show nothing rather than a zero.
function useTaskTime(profileId: string | null, items: FocusItem[]) {
  const [msByTask, setMsByTask] = useState<Record<string, number>>({});

  const linkage = useMemo(() => {
    const byClient: Record<string, { taskId: string; isActive: boolean }> = {};
    for (const f of items) {
      const taskId = f.tags?.task;
      if (typeof taskId === 'string' && taskId) {
        byClient[f.client_id] = { taskId, isActive: f.focus_state === 'active' };
      }
    }
    return byClient;
  }, [items]);

  const linkageKey = useMemo(
    () =>
      Object.entries(linkage)
        .map(([c, v]) => `${c}:${v.taskId}:${v.isActive ? 1 : 0}`)
        .sort()
        .join('|'),
    [linkage]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const clientIds = Object.keys(linkage);
      if (!profileId || clientIds.length === 0) {
        setMsByTask({});
        return;
      }
      const { data, error } = await supabase
        .from('focus_events')
        .select('id, profile_id, focus_client_id, kind, at, source, meta')
        .eq('profile_id', profileId)
        .in('focus_client_id', clientIds)
        .in('kind', ['start', 'pause', 'resume', 'resolve'])
        .order('at', { ascending: true });
      if (cancelled || error || !data) return;

      const byClient: Record<string, FocusEvent[]> = {};
      for (const e of data as FocusEvent[]) {
        (byClient[e.focus_client_id] ||= []).push(e);
      }
      const now = Date.now();
      const next: Record<string, number> = {};
      for (const [clientId, evts] of Object.entries(byClient)) {
        const link = linkage[clientId];
        if (!link) continue;
        const ms = totalTrackedMs(computeIntervals(evts, link.isActive, now));
        next[link.taskId] = (next[link.taskId] || 0) + ms;
      }
      setMsByTask(next);
    })();
    return () => {
      cancelled = true;
    };
    // linkageKey is the real dependency; linkage is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, linkageKey]);

  return msByTask;
}

export default function TasksScreen() {
  const { profile, browserProfileId } = useAuth();
  const {
    active,
    completed,
    subtaskChildren,
    childTaskIds,
    blockedTaskIds,
    refreshing,
    refresh,
    createTask,
    complete,
    reopen,
    linkFocusToTask,
  } = useTasks(profile?.id ?? null);
  const { items, createIntent, actions } = useFocus(profile?.id ?? null, browserProfileId);
  const msByTask = useTaskTime(profile?.id ?? null, items);

  const [name, setName] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);

  const defaultRealm =
    profile?.settings?.sidecar?.defaultRealm || profile?.default_realm || 'professional';
  const defaultTimer = Number(profile?.settings?.sidecar?.defaultTimer) || 15;

  const add = async () => {
    if (!name.trim()) return;
    await createTask(name);
    setName('');
  };

  // ▶ Start task → focus (design §5): reuse a live focus already tagged to
  // this task (switchTo) rather than minting a duplicate; otherwise create
  // one tagged `task: <task_id>` and append its client_id to the task row's
  // linked_intents (#186 pattern).
  const startFocusForTask = async (
    task: TaskRow,
    parentFocusRowId: string | null
  ) => {
    if (startingId) return;
    setStartingId(task.id);
    try {
      const existing = liveFocusForTask(items, task.task_id);
      if (existing) {
        if (existing.focus_state !== 'active') await actions.switchTo(existing.id);
        return;
      }
      const newRowId = await createIntent(task.name, defaultTimer, defaultRealm, {
        active: true,
        ...(parentFocusRowId ? { parentId: parentFocusRowId } : {}),
        tags: { task: task.task_id },
      });
      if (newRowId) {
        const { data } = await supabase
          .from('focus_items')
          .select('client_id')
          .eq('id', newRowId)
          .maybeSingle();
        if (data?.client_id) await linkFocusToTask(task.id, data.client_id);
      }
    } finally {
      setStartingId(null);
    }
  };

  const startTask = (task: TaskRow) => startFocusForTask(task, null);

  // Starting a subtask creates a sub-intent (tags._parent) under the parent
  // task's focus when that focus is currently active; with no active parent
  // focus it starts standalone, exactly like a top-level task.
  const startSubtask = (sub: TaskRow, parent: TaskRow) => {
    const parentFocus = liveFocusForTask(items, parent.task_id);
    const parentRowId =
      parentFocus && parentFocus.focus_state === 'active' ? parentFocus.id : null;
    return startFocusForTask(sub, parentRowId);
  };

  const renderTask = (t: TaskRow, opts: { nested?: boolean; parent?: TaskRow } = {}) => {
    const tracked = msByTask[t.task_id] || 0;
    const live = liveFocusForTask(items, t.task_id);
    const isRunning = live?.focus_state === 'active';
    return (
      <View key={t.id} style={[styles.row, opts.nested && styles.rowNested]}>
        {opts.nested && <Text style={styles.nestTick}>└</Text>}
        <Pressable onPress={() => complete(t.id)} style={styles.checkbox}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>○</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.taskName} numberOfLines={2}>
            {t.name}
          </Text>
          <View style={styles.badgeRow}>
            {isAsanaTask(t) && <Chip label="Asana" color={colors.purple} />}
            {blockedTaskIds.has(t.task_id) && <Chip label="🚧 blocked" color={colors.amber} />}
            {tracked > 0 && <Chip label={`⏱ ${formatElapsedDigits(tracked)}`} color={colors.textMuted} />}
            {isRunning && <Chip label="● focusing" color={colors.accent} />}
          </View>
        </View>
        <Pressable
          onPress={() => (opts.parent ? startSubtask(t, opts.parent) : startTask(t))}
          disabled={startingId !== null || isRunning}
          style={[styles.startBtn, (startingId !== null || isRunning) && { opacity: 0.35 }]}
          accessibilityLabel={`Start focus on ${t.name}`}
        >
          <Text style={{ color: colors.accent, fontSize: 13 }}>▶</Text>
        </Pressable>
      </View>
    );
  };

  // Open tasks only by default; completed live behind the toggle below.
  // A subtask renders nested under its parent, not in the top-level list —
  // unless its parent isn't in the registry (then it stands alone).
  const topLevel = active.filter((t) => !childTaskIds.has(t.task_id));

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
      }
    >
      <View style={styles.addRow}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="New task…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          onSubmitEditing={add}
        />
        <Btn label="+" onPress={add} filled />
      </View>

      <SectionLabel>Open ({topLevel.length})</SectionLabel>
      {topLevel.length === 0 ? (
        <Empty text="No open tasks." />
      ) : (
        topLevel.map((t) => (
          <React.Fragment key={t.id}>
            {renderTask(t)}
            {(subtaskChildren.get(t.task_id) || [])
              .filter((c) => c.status !== 'completed')
              .map((c) => renderTask(c, { nested: true, parent: t }))}
          </React.Fragment>
        ))
      )}

      {completed.length > 0 && (
        <Pressable onPress={() => setShowDone((v) => !v)} style={styles.doneToggle}>
          <Text style={styles.doneToggleTxt}>
            {showDone ? '▾' : '▸'} Done ({completed.length})
          </Text>
        </Pressable>
      )}
      {showDone &&
        completed.slice(0, 30).map((t) => (
          <View key={t.id} style={[styles.row, { opacity: 0.55 }]}>
            <Pressable onPress={() => reopen(t.id)} style={styles.checkbox}>
              <Text style={{ color: colors.green, fontSize: 12 }}>✓</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.taskName, styles.done]} numberOfLines={2}>
                {t.name}
              </Text>
              {isAsanaTask(t) && (
                <View style={styles.badgeRow}>
                  <Chip label="Asana" color={colors.purple} />
                </View>
              )}
            </View>
          </View>
        ))}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  rowNested: {
    marginLeft: 22,
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
  nestTick: { color: colors.textMuted, fontSize: 11, marginRight: -4 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  done: { textDecorationLine: 'line-through' },
  badgeRow: { flexDirection: 'row', gap: 5, marginTop: 4, flexWrap: 'wrap' },
  startBtn: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneToggle: { paddingVertical: 10, marginTop: 8 },
  doneToggleTxt: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
