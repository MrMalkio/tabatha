import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useClock } from '../data/clock';
import { Btn, Card, Empty, SectionLabel } from '../ui/kit';
import { colors, formatClock, formatElapsedMs } from '../lib/theme';

export default function ClockScreen() {
  const { profile, browserProfileId } = useAuth();
  const { open, history, clockIn, clockOut, toggleBreak, refreshHistory, breakMsOf } =
    useClock(profile?.id ?? null, browserProfileId);
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshHistory();
    setRefreshing(false);
  };

  let elapsed = '';
  if (open) {
    const start = new Date(open.clockedInAt).getTime();
    const work = now - start - breakMsOf(open, now);
    elapsed = formatClock(work);
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <Card style={{ marginBottom: 14, alignItems: 'center', paddingVertical: 22 }}>
        <Text style={styles.state}>
          {open ? (open.onBreak ? '☕ On break' : '🟢 Clocked in') : '⚪ Clocked out'}
        </Text>
        {open && (
          <Text
            style={[
              styles.bigClock,
              { color: open.onBreak ? colors.amber : colors.accent },
            ]}
          >
            {elapsed}
          </Text>
        )}
        <Text style={styles.deviceNote}>This phone's shift</Text>
        <View style={styles.btnRow}>
          {open ? (
            <>
              <Btn
                label={open.onBreak ? '▶ Resume' : '☕ Break'}
                color={open.onBreak ? colors.green : colors.amber}
                onPress={toggleBreak}
              />
              <Btn label="⏹ Clock out" color={colors.red} filled onPress={clockOut} />
            </>
          ) : (
            <Btn label="▶ Clock in" color={colors.green} filled onPress={clockIn} />
          )}
        </View>
      </Card>

      <SectionLabel>Recent shifts</SectionLabel>
      {history.length === 0 ? (
        <Empty text="No shifts yet." />
      ) : (
        history.map((h) => (
          <View key={h.id} style={styles.shiftRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.shiftDate}>
                {new Date(h.clocked_in_at).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
                {h.source === 'sidecar' ? '  📱' : ''}
              </Text>
              <Text style={styles.shiftTime}>
                {new Date(h.clocked_in_at).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {' – '}
                {new Date(h.clocked_out_at).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            </View>
            <Text style={styles.shiftDur}>{formatElapsedMs(h.work_ms)}</Text>
          </View>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  state: { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
  bigClock: { fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 6 },
  deviceNote: { fontSize: 11, color: colors.textMuted, marginTop: 4, marginBottom: 16 },
  btnRow: { flexDirection: 'row', gap: 10 },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  shiftDate: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  shiftTime: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  shiftDur: { fontSize: 14, fontWeight: '700', color: colors.accent, fontVariant: ['tabular-nums'] },
});
