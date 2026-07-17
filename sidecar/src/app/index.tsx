import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import FocusScreen from '../screens/FocusScreen';
import TasksScreen from '../screens/TasksScreen';
import ClockScreen from '../screens/ClockScreen';
import RecentScreen from '../screens/RecentScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { colors } from '../lib/theme';

type TabKey = 'focus' | 'tasks' | 'clock' | 'recent' | 'settings';

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'focus', icon: '🎯', label: 'Focus' },
  { key: 'tasks', icon: '📋', label: 'Tasks' },
  { key: 'clock', icon: '⏱️', label: 'Clock' },
  { key: 'recent', icon: '🕘', label: 'Recent' },
  { key: 'settings', icon: '⚙️', label: 'Settings' },
];

export default function Index() {
  const { session, loading, profile } = useAuth();
  const [tab, setTab] = useState<TabKey>('focus');

  if (loading) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashLogo}>Tabby</Text>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
      </View>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={styles.brand}>Tabby</Text>
          <Text style={styles.brandSub}>Sidecar</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(profile?.display_name || 'T').charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Active screen */}
      <View style={{ flex: 1 }}>
        {tab === 'focus' && <FocusScreen />}
        {tab === 'tasks' && <TasksScreen />}
        {tab === 'clock' && <ClockScreen />}
        {tab === 'recent' && <RecentScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </View>

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabIcon, { opacity: on ? 1 : 0.5 }]}>{t.icon}</Text>
              <Text style={[styles.tabLabel, { color: on ? colors.accent : colors.textMuted }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  splash: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: { fontSize: 40, fontWeight: '800', color: colors.textPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  brandSub: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingBottom: 4,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
});
