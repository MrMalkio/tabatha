import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Btn } from '../ui/kit';
import { colors } from '../lib/theme';

// Device management (migration 045) — client-side honor of the `paused`
// flag another one of the user's own devices set on THIS device's
// browser_profiles row (via Settings → Devices, DevicesCard.tsx). Wins over
// the whole app (mounted from app/index.tsx, same tier as the invite gate)
// until unpaused from elsewhere; the only way out from here is Sign out.
export default function DevicePausedScreen() {
  const { session, signOut } = useAuth();
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.emoji}>⏸️</Text>
        <Text style={styles.title}>This device is paused</Text>
        <Text style={styles.sub}>
          Resume it from Settings → Devices on another signed-in device.
        </Text>
        <View style={styles.signedInBox}>
          <Text style={styles.signedInText}>Signed in as {session?.user?.email}</Text>
          <Btn label="Sign out" small color={colors.textMuted} onPress={signOut} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  sub: { color: colors.textMuted, fontSize: 14, marginTop: 10, textAlign: 'center' },
  signedInBox: { marginTop: 44, alignItems: 'center', gap: 10 },
  signedInText: { color: colors.textMuted, fontSize: 12 },
});
