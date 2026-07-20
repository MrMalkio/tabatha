import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Btn } from '../ui/kit';
import { colors, radius } from '../lib/theme';

export default function LoginScreen() {
  const { signInWithGoogle, signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sendLink = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setErr(null);
    const { error } = await signInWithMagicLink(email.trim());
    setBusy(false);
    if (error) setErr(error);
    else setSent(true);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.logo}>Tabby</Text>
        <Text style={styles.sub}>Sidecar</Text>
        <Text style={styles.tag}>
          Your queue, your intent — from your phone.
        </Text>

        <View style={styles.form}>
          <Btn label="Continue with Google" onPress={signInWithGoogle} filled />

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.or}>or</Text>
            <View style={styles.line} />
          </View>

          {sent ? (
            <View style={styles.sentBox}>
              <Text style={styles.sentText}>
                ✉️ Check your email — tap the link to sign in.
              </Text>
              <Text style={styles.sentSub}>{email}</Text>
              <Btn
                label="Use a different email"
                small
                color={colors.textMuted}
                onPress={() => {
                  setSent(false);
                  setEmail('');
                }}
              />
            </View>
          ) : (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                inputMode="email"
                style={styles.input}
                onSubmitEditing={sendLink}
              />
              {busy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Btn label="Send magic link" onPress={sendLink} />
              )}
            </>
          )}
          {err && <Text style={styles.err}>{err}</Text>}
        </View>

        <Text style={styles.inviteHint}>
          New here? Sign in with the email your invite was sent to, then enter your code.
        </Text>

        <Text style={styles.footer}>Synced to your Tabatha account</Text>
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
  form: { width: '100%', marginTop: 34, gap: 14 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.textMuted, fontSize: 12 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
  },
  sentBox: { gap: 10, alignItems: 'center' },
  sentText: { color: colors.textPrimary, fontSize: 15, textAlign: 'center' },
  sentSub: { color: colors.accent, fontSize: 13 },
  err: { color: colors.red, fontSize: 13, textAlign: 'center' },
  inviteHint: { color: colors.textMuted, fontSize: 12, marginTop: 22, textAlign: 'center' },
  footer: { color: colors.textMuted, fontSize: 12, marginTop: 40 },
});
