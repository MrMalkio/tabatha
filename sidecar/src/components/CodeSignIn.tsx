import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { colors, radius } from '../lib/theme';
import { isValidPairingCode, isValidRedeemSession, normalizePairingCode } from '../lib/codeSignIn';
import { PAIRED_DEVICE_NAME_KEY } from '../lib/device';

// "Sign in with a code" — TV-browser sign-in (CeeCee design: reuse the
// deployed pair-watch device-pairing backend, zero new backend). A
// signed-in phone/desktop mints a 6-digit single-use 5-minute code via
// PairWatchCard ("Sign in with a code" mode); the TV browser types it in
// here and redeems it unauthenticated (pair-watch's `redeem` action has
// verify_jwt=false — same transport style as lib/feedback.ts /
// data/integrations.ts: fetch with the anon apikey header, no Authorization
// header since there's no session yet on this device).
//
// On success, supabase.auth.setSession() hands the returned
// access_token/refresh_token to supabase-js, which persists the session and
// fires onAuthStateChange — AuthContext's existing listener (AuthContext.tsx)
// takes it from there exactly like any other sign-in: it loads the profile,
// and if this account somehow has no profile row it surfaces `needsInvite`
// (the invite gate screen). That's correct, unmodified behavior — this
// component does not special-case it.
//
// Collapsed by default under the main sign-in options (LoginScreen mounts
// this below Google / magic link) so it doesn't compete with the primary
// flow on phones, but reads clearly on a TV remote: large numeric input,
// autofocus on expand, Enter submits.

export default function CodeSignIn() {
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const toggle = () => {
    setErr(null);
    setExpanded((e) => !e);
  };

  const submit = async () => {
    if (busy) return;
    const normalized = normalizePairingCode(code);
    if (!isValidPairingCode(normalized)) {
      setErr('Enter the 6-digit code shown on your phone.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/pair-watch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: 'redeem', code: normalized }),
      });
      const body = await res.json().catch(() => ({}) as unknown);
      if (!res.ok || !isValidRedeemSession(body)) {
        throw new Error('invalid code');
      }
      // Stash the pairing device's chosen name BEFORE setSession fires the
      // onAuthStateChange listener that triggers AuthContext's
      // registerDevice() — that upsert reads this key synchronously off
      // AsyncStorage to name itself, then clears it (see registerDevice).
      if (body.device_label) {
        await AsyncStorage.setItem(PAIRED_DEVICE_NAME_KEY, body.device_label).catch(() => {});
      }
      const { error } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      if (error) throw error;
      // Success — leave `expanded` as-is; AuthContext's onAuthStateChange
      // listener swaps this whole screen out once `session` flips, so there
      // is no local "signed in" state to reset here.
      setCode('');
    } catch {
      setErr(
        'Code invalid or expired — get a fresh one from Settings → Pair a device on your phone.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.header} onPress={toggle} accessibilityRole="button">
        <Text style={styles.headerText}>📺 Sign in with a code</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.body}>
          <Text style={styles.sub}>
            On your phone: Settings → Pair a device → choose TV, then type the code here.
          </Text>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(v) => setCode(v.replace(/[^0-9 ]/g, '').slice(0, 7))}
            placeholder="000000"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            inputMode="numeric"
            autoFocus
            maxLength={7}
            style={styles.input}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          {busy ? (
            <ActivityIndicator color={colors.accent} style={styles.spinner} />
          ) : (
            <Pressable style={styles.btn} onPress={submit}>
              <Text style={styles.btnTxt}>Submit</Text>
            </Pressable>
          )}
          {err && <Text style={styles.err}>{err}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  chevron: { fontSize: 11, color: colors.textMuted },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  sub: { fontSize: 12, color: colors.textMuted },
  input: {
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
  },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentDim,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnTxt: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  spinner: { marginTop: 2 },
  err: { color: colors.red, fontSize: 12 },
});
