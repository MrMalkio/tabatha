import React, { useState } from 'react';
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
import { useTasks } from '../data/tasks';
import { Btn, Empty, SectionLabel } from '../ui/kit';
import { colors, radius } from '../lib/theme';

export default function TasksScreen() {
  const { profile } = useAuth();
  const { active, completed, refreshing, refresh, createTask, complete, reopen } =
    useTasks(profile?.id ?? null);
  const [name, setName] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    await createTask(name);
    setName('');
  };

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

      <SectionLabel>Active ({active.length})</SectionLabel>
      {active.length === 0 ? (
        <Empty text="No active tasks." />
      ) : (
        active.map((t) => (
          <View key={t.id} style={styles.row}>
            <Pressable onPress={() => complete(t.id)} style={styles.checkbox}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>○</Text>
            </Pressable>
            <Text style={styles.taskName} numberOfLines={2}>
              {t.name}
            </Text>
          </View>
        ))
      )}

      {completed.length > 0 && (
        <>
          <SectionLabel>Done ({completed.length})</SectionLabel>
          {completed.slice(0, 20).map((t) => (
            <View key={t.id} style={[styles.row, { opacity: 0.55 }]}>
              <Pressable onPress={() => reopen(t.id)} style={styles.checkbox}>
                <Text style={{ color: colors.green, fontSize: 12 }}>✓</Text>
              </Pressable>
              <Text style={[styles.taskName, styles.done]} numberOfLines={2}>
                {t.name}
              </Text>
            </View>
          ))}
        </>
      )}
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
});
