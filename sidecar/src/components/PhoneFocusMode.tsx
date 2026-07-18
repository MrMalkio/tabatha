import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
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
 * navigates away from / backgrounds the Sidecar. On leave it (a) nudges the
 * phone and (b) broadcasts an "away" signal to this device's
 * browser_profile_status.metadata — the big-screen Context View is subscribed
 * to that table and turns red ("put the phone down") when it sees it.
 */
export default function PhoneFocusMode() {
  const { profile, browserProfileId } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [lastAway, setLastAway] = useState<number | null>(null);
  const leftAt = useRef<number | null>(null);

  const signal = useCallback(
    async (away: boolean) => {
      if (!profile?.id || !browserProfileId) return;
      try {
        await supabase.from('browser_profile_status').upsert(
          {
            browser_profile_id: browserProfileId,
            profile_id: profile.id,
            online: !away,
            last_heartbeat_at: new Date().toISOString(),
            metadata: {
              source: 'sidecar',
              focusAway: away,
              awaySince: away ? new Date().toISOString() : null,
            },
          },
          { onConflict: 'browser_profile_id' }
        );
      } catch {
        /* best effort */
      }
    },
    [profile?.id, browserProfileId]
  );

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

  const onToggle = useCallback(
    async (v: boolean) => {
      setEnabled(v);
      try {
        await AsyncStorage.setItem(KEY, v ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (!v) signal(false); // turning the mode off clears any lingering alert
    },
    [signal]
  );

  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVis = () => {
      if (document.hidden) {
        leftAt.current = Date.now();
        signal(true);
        nudge('You stepped away from Tabatha while in Focus Mode. Eyes back on the task 👇');
      } else {
        if (leftAt.current) setLastAway(Date.now() - leftAt.current);
        leftAt.current = null;
        signal(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      signal(false); // don't leave a stuck alert if the mode unmounts
    };
  }, [enabled, signal]);

  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📵 Phone Focus Mode</Text>
          <Text style={styles.sub}>
            {enabled
              ? 'On — put your phone down. Wander off and your big screen goes red.'
              : 'Leave the Sidecar open; if you navigate away I’ll nudge you and flag it on your Context View.'}
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
