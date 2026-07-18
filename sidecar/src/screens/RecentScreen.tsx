import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Empty, SectionLabel } from '../ui/kit';
import { colors } from '../lib/theme';

type IntentRow = {
  id: string;
  action: string;
  context: string | null;
  domain: string | null;
  timestamp: string;
};

const ACTION_ICON: Record<string, string> = {
  continue: '▶',
  inherit: '🎯',
  side_quest: '↪',
  sugar_box: '🍬',
  park: '🅿️',
  later: '⏰',
  nevermind: '✕',
  skip_domain: '⤳',
};

function ago(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function RecentScreen() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<IntentRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('intent_history')
      .select('id, action, context, domain, timestamp')
      .eq('profile_id', profile.id)
      .order('timestamp', { ascending: false })
      .limit(50);
    if (data) setRows(data as IntentRow[]);
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <SectionLabel>Recent activity (all devices)</SectionLabel>
      {rows.length === 0 ? (
        <Empty text="No recent activity." />
      ) : (
        rows.map((r) => (
          <View key={r.id} style={styles.row}>
            <Text style={styles.icon}>{ACTION_ICON[r.action] || '•'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctx} numberOfLines={1}>
                {r.context || r.domain || r.action}
              </Text>
              {r.domain && r.context && (
                <Text style={styles.domain} numberOfLines={1}>
                  {r.domain}
                </Text>
              )}
            </View>
            <Text style={styles.time}>{ago(r.timestamp)}</Text>
          </View>
        ))
      )}
      <Text style={styles.note}>
        Parked tabs and the Sugar Box live on your desktop browser and aren’t
        synced to the phone.
      </Text>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: { fontSize: 14, width: 20, textAlign: 'center' },
  ctx: { fontSize: 13, color: colors.textPrimary },
  domain: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  time: { fontSize: 11, color: colors.textMuted },
  note: { fontSize: 12, color: colors.textMuted, marginTop: 20, fontStyle: 'italic' },
});
