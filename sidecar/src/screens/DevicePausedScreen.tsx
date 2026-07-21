import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Btn } from '../ui/kit';
import { colors } from '../lib/theme';

// Device management (migration 045) — client-side honor of the `paused`
// flag another one of the user's own devices set on THIS device's
// browser_profiles row (via Settings → Devices, DevicesCard.tsx). Wins over
// the whole app (mounted from app/index.tsx, same tier as the invite gate).
//
// 0.13.3: this screen now offers "Resume this device" directly. The original
// design ("only way out is Sign out — unpause from another device") caused a
// real lockout on 2026-07-21: Malkio paused the device he was signed into,
// couldn't manage it from the extension (no device UI there yet), paused his
// other devices while trying, and had to sign out of everything to recover.
// Pause is the user's own soft flag on their own row, not a security
// boundary — same-account self-rescue is always safe, and RLS already
// permits it (DevicesCard updates sibling rows with this same session).
export default function DevicePausedScreen() {
  const { session, signOut, browserProfileId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resume = async () => {
    if (!browserProfileId) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from('browser_profiles')
      .update({ paused: false })
      .eq('id', browserProfileId);
    setBusy(false);
    if (error) setErr('Could not resume — check your connection and try again.');
    // Success needs no navigation: useOwnDeviceStatus has a realtime
    // subscription on this row, so the paused gate drops on its own.
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.emoji}>⏸️</Text>
        <Text style={styles.title}>This device is paused</Text>
        <Text style={styles.sub}>
          Paused from Settings → Devices on one of your devices. You can resume
          right here, or from any other signed-in device.
        </Text>
        <View style={{ marginTop: 20 }}>
          <Btn label={busy ? 'Resuming…' : '▶ Resume this device'} color={colors.accent} onPress={resume} />
        </View>
        {err && <Text style={styles.err}>{err}</Text>}
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
  err: { color: colors.red, fontSize: 13, marginTop: 12, textAlign: 'center' },
  signedInBox: { marginTop: 44, alignItems: 'center', gap: 10 },
  signedInText: { color: colors.textMuted, fontSize: 12 },
});
