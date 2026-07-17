import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius } from '../lib/theme';

const KEY = 'tabby.sidecar.focusMode';

async function nudge(body: string) {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg =
      (await navigator.serviceWorker.getRegistration('/sidecar/')) ||
      (await navigator.serviceWorker.ready);
    reg?.showNotification('👀 Back to it', {
      body,
      tag: 'focus-mode-leave',
      icon: '/sidecar/icons/icon-192.png',
    });
  } catch {
    /* best effort */
  }
}

/**
 * Phone Focus Mode. Uses the Page Visibility API to detect when the user
 * navigates away from / backgrounds the Sidecar. The idea: leave it open, put
 * the phone down; if you pick it up and wander off, it nudges you back. This is
 * also the hook point for future triggers (e.g. auto-pausing a focus).
 */
export default function PhoneFocusMode() {
  const [enabled, setEnabled] = useState(false);
  const [lastAway, setLastAway] = useState<number | null>(null);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(KEY);
        if (v === '1') setEnabled(true);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const onToggle = useCallback(async (v: boolean) => {
    setEnabled(v);
    try {
      await AsyncStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVis = () => {
      if (document.hidden) {
        leftAt.current = Date.now();
        nudge('You stepped away from Tabatha while in Focus Mode. Eyes back on the task 👇');
      } else if (leftAt.current) {
        setLastAway(Date.now() - leftAt.current);
        leftAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled]);

  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📵 Phone Focus Mode</Text>
          <Text style={styles.sub}>
            {enabled
              ? 'On — keep this open and your phone down. Wander off and I’ll nudge you.'
              : 'Leave the Sidecar open; if you navigate away I’ll nudge you back.'}
          </Text>
          {enabled && lastAway != null && (
            <Text style={styles.away}>Last stepped away for {Math.round(lastAway / 1000)}s.</Text>
          )}
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ true: colors.accent, false: colors.border }}
          thumbColor="#fff"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  away: { fontSize: 11, color: colors.accent, marginTop: 4 },
});
