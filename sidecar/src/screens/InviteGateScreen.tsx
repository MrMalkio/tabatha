import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Btn } from '../ui/kit';
import { colors, radius } from '../lib/theme';
import { isPlausibleInviteCode } from '../lib/inviteCode';

// Invite-signup gate — shown when a session exists but the account has no
// Tabatha profile row yet (AuthContext#needsInvite). Tabatha is invite-only
// while the extension is unlisted; this is the only door in for a new
// account until it ships to the web store.
export default function InviteGateScreen() {
  const { session, redeemInvite, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !isPlausibleInviteCode(code)) return;
    setBusy(true);
    setErr(null);
    const res = await redeemInvite(code);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error || 'That code isn’t valid or was already used.');
    }
    // On success, needsInvite flips to false via AuthContext state and
    // app/index.tsx re-renders straight into the normal app — nothing
    // further to do here.
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.logo}>Tabby</Text>
        <Text style={styles.sub}>Sidecar</Text>
        <Text style={styles.tag}>Tabatha is invite-only right now — enter your invite code.</Text>

        <View style={styles.form}>
          <TextInput
            value={code}
            onChangeText={(v) => {
              setCode(v);
              if (err) setErr(null);
            }}
            placeholder="Invite code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            style={styles.input}
            onSubmitEditing={submit}
          />
          {busy ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Btn label="Redeem" onPress={submit} disabled={!isPlausibleInviteCode(code)} />
          )}
          {err && <Text style={styles.err}>{err}</Text>}
        </View>

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
  logo: { fontSize: 44, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1 },
  sub: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.accent,
    marginTop: -6,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  tag: { color: colors.textMuted, fontSize: 14, marginTop: 14, textAlign: 'center' },
  form: { width: '100%', marginTop: 30, gap: 14 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: 'monospace',
  },
  err: { color: colors.red, fontSize: 13, textAlign: 'center' },
  signedInBox: { marginTop: 44, alignItems: 'center', gap: 10 },
  signedInText: { color: colors.textMuted, fontSize: 12 },
});
