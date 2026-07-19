import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import FocusScreen from '../screens/FocusScreen';
import TasksScreen from '../screens/TasksScreen';
import ClockScreen from '../screens/ClockScreen';
import RecentScreen from '../screens/RecentScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ContextView from '../screens/ContextView';
import SimpleScreen from '../screens/SimpleScreen';
import { colors } from '../lib/theme';

// Plan 040 Epic 5 — "Notes-simple" capture mode. AsyncStorage mirrors
// settings.sidecar.simpleMode (the source of truth once the profile loads)
// so a returning simple-mode user doesn't flash full-view while signed-in
// state is still resolving. Default OFF — existing users keep full view
// until they opt in.
const SIMPLE_MODE_KEY = 'tabby.sidecar.simpleMode';

type TabKey = 'focus' | 'tasks' | 'clock' | 'recent' | 'settings';

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'focus', icon: '🎯', label: 'Focus' },
  { key: 'tasks', icon: '📋', label: 'Tasks' },
  { key: 'clock', icon: '⏱️', label: 'Clock' },
  { key: 'recent', icon: '🕘', label: 'Recent' },
  { key: 'settings', icon: '⚙️', label: 'Settings' },
];

export default function Index() {
  const { session, loading, profile, saveSidecarSettings } = useAuth();
  const [tab, setTab] = useState<TabKey>('focus');
  const { width, height } = useWindowDimensions();
  // Large landscape viewport (computer / tablet / TV) → view-only Context View.
  const isLarge = width >= 900 && width > height;
  const [override, setOverride] = useState<null | 'app' | 'context'>(null);

  // Desk View companion embed (web-only query-param routing). `?view=context`
  // forces the Context View regardless of viewport size/orientation;
  // `?embed=desk` marks desk-embed mode (implies view=context) so the
  // companion app's dedicated window can neutralize Sidecar branding.
  // Read once at mount — this route doesn't need to react to URL changes.
  const { forceContext, embed } = useMemo(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return { forceContext: false, embed: null as 'desk' | null };
    }
    const sp = new URLSearchParams(window.location.search);
    const embedParam: 'desk' | null = sp.get('embed') === 'desk' ? 'desk' : null;
    return { forceContext: sp.get('view') === 'context' || embedParam === 'desk', embed: embedParam };
  }, []);

  const showContext = forceContext || (isLarge && (override ?? 'context') === 'context');

  const [simpleMode, setSimpleModeState] = useState(false);

  // Fast local read so a returning simple-mode user doesn't see the full
  // app flash before the profile loads over the network.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SIMPLE_MODE_KEY).then((v) => {
      if (!cancelled && v != null) setSimpleModeState(v === '1');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Once the profile loads, settings.sidecar.simpleMode is authoritative.
  useEffect(() => {
    const fromProfile = profile?.settings?.sidecar?.simpleMode;
    if (typeof fromProfile === 'boolean') {
      setSimpleModeState(fromProfile);
      AsyncStorage.setItem(SIMPLE_MODE_KEY, fromProfile ? '1' : '0').catch(() => {});
    }
  }, [profile]);

  const setSimpleMode = (next: boolean) => {
    setSimpleModeState(next);
    AsyncStorage.setItem(SIMPLE_MODE_KEY, next ? '1' : '0').catch(() => {});
    saveSidecarSettings({ simpleMode: next });
  };

  if (loading) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashLogo}>Tabby</Text>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
      </View>
    );
  }

  if (!session) return <LoginScreen />;

  // Large-landscape auto-switch to Context View always wins over simple mode.
  if (showContext) return <ContextView onExit={() => setOverride('app')} embed={embed} />;

  if (simpleMode) return <SimpleScreen onFullView={() => setSimpleMode(false)} />;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={styles.brand}>Tabby</Text>
          <Text style={styles.brandSub}>Sidecar</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {isLarge && (
            <Pressable onPress={() => setOverride('context')} style={styles.ctxBtn}>
              <Text style={styles.ctxBtnTxt}>📺 Context view</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setSimpleMode(true)} style={styles.ctxBtn}>
            <Text style={styles.ctxBtnTxt}>✏️ Simple view</Text>
          </Pressable>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile?.display_name || 'T').charAt(0).toUpperCase()}
            </Text>
          </View>
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
  ctxBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  ctxBtnTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
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
