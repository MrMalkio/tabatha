import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Btn, Card, SectionLabel } from '../ui/kit';
import { colors, radius } from '../lib/theme';
import { deviceLabel } from '../lib/device';
import { enablePush, disablePush, pushPermission, pushSupported } from '../lib/push';

const REALMS = ['professional', 'work', 'business', 'personal'];

export default function SettingsScreen() {
  const { profile, session, signOut, saveSidecarSettings } = useAuth();
  const sc = profile?.settings?.sidecar || {};

  const [realm, setRealm] = useState(sc.defaultRealm || profile?.default_realm || 'professional');
  const [timer, setTimer] = useState(String(sc.defaultTimer || 15));
  const [dayReset, setDayReset] = useState(String(sc.dayResetHour ?? 0));
  const [pushOn, setPushOn] = useState(pushPermission() === 'granted' && !!sc.pushEnabled);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  useEffect(() => {
    setPushOn(pushPermission() === 'granted' && !!sc.pushEnabled);
  }, [sc.pushEnabled]);

  const onTogglePush = async (v: boolean) => {
    if (!profile) return;
    if (v) {
      const res = await enablePush(profile.id);
      if (res.ok) {
        setPushOn(true);
        setPushMsg('Notifications enabled.');
        await saveSidecarSettings({ pushEnabled: true });
      } else {
        setPushOn(false);
        setPushMsg(
          res.error === 'push-not-configured'
            ? 'Push not configured on the server yet.'
            : res.error === 'denied'
              ? 'Permission denied in the browser.'
              : res.error === 'unsupported'
                ? 'This browser/device doesn’t support web push.'
                : `Couldn’t enable: ${res.error}`
        );
      }
    } else {
      await disablePush(profile.id);
      setPushOn(false);
      setPushMsg('Notifications disabled.');
      await saveSidecarSettings({ pushEnabled: false });
    }
  };

  const saveDefaults = async () => {
    let dr = parseInt(dayReset, 10);
    if (!Number.isFinite(dr) || dr < 0 || dr > 23) dr = 0;
    await saveSidecarSettings({
      defaultRealm: realm,
      defaultTimer: parseInt(timer, 10) || 15,
      dayResetHour: dr,
    });
    setPushMsg('Saved.');
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Account</SectionLabel>
        <Text style={styles.name}>{profile?.display_name || 'Tabatha User'}</Text>
        <Text style={styles.email}>{session?.user?.email}</Text>
        <Text style={styles.device}>📱 {deviceLabel()}</Text>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Notifications</SectionLabel>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Focus & checkpoint modals</Text>
            <Text style={styles.rowSub}>
              Get the same timer / checkpoint nudges you’d see on the extension.
            </Text>
          </View>
          <Switch
            value={pushOn}
            onValueChange={onTogglePush}
            disabled={!pushSupported()}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor="#fff"
          />
        </View>
        {!pushSupported() && (
          <Text style={styles.hint}>
            On iPhone, add this page to your Home Screen first to allow push.
          </Text>
        )}
        {pushMsg && <Text style={styles.msg}>{pushMsg}</Text>}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Defaults for new intents</SectionLabel>
        <Text style={styles.rowTitle}>Realm</Text>
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
              <Text style={{ fontSize: 12, color: realm === r ? colors.accent : colors.textMuted }}>
                {r}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View>
            <Text style={[styles.rowTitle, { marginTop: 12 }]}>Default timer (min)</Text>
            <TextInput value={timer} onChangeText={setTimer} keyboardType="number-pad" inputMode="numeric" style={styles.input} />
          </View>
          <View>
            <Text style={[styles.rowTitle, { marginTop: 12 }]}>Day resets at (hr)</Text>
            <TextInput value={dayReset} onChangeText={setDayReset} keyboardType="number-pad" inputMode="numeric" style={styles.input} />
          </View>
        </View>
        <Text style={styles.rowSub}>The Context View’s day countdown (of 1440 min) counts down to this hour.</Text>
        <View style={{ marginTop: 12 }}>
          <Btn label="Save defaults" onPress={saveDefaults} filled />
        </View>
      </Card>

      <Btn label="Sign out" color={colors.red} onPress={signOut} />
      <Text style={styles.version}>Tabby Sidecar v0.2.0</Text>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  name: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  email: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  device: { fontSize: 12, color: colors.accent, marginTop: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  hint: { fontSize: 12, color: colors.amber, marginTop: 10 },
  msg: { fontSize: 12, color: colors.accent, marginTop: 10 },
  realmRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  realmPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  input: {
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
    width: 100,
    marginTop: 6,
  },
  version: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 20 },
});
