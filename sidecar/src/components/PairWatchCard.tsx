import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { colors, radius } from '../lib/theme';

// Plan 041 §6.3 — "Pair a device". Mints a 6-digit, 5-minute, single-use code
// via the pair-watch edge function (user JWT); the raw code exists only in
// this component's state for the countdown window, never persisted or logged.
//
// Generalized (TV-sign-in follow-on, CeeCee design): the same code now also
// redeems on a TV browser via CodeSignIn.tsx's "Sign in with a code" flow —
// zero new backend, pair-watch's `redeem` action doesn't care which surface
// asks for the session. The device-label picker below just tags the mint so
// Settings/audit views can tell watches and TVs apart; it has no effect on
// redemption.

type DeviceKind = 'watch' | 'tv' | 'other';

const DEVICE_OPTIONS: { key: DeviceKind; label: string; mintLabel: string }[] = [
  { key: 'watch', label: 'Watch', mintLabel: 'Galaxy Watch' },
  { key: 'tv', label: 'TV', mintLabel: 'TV' },
  { key: 'other', label: 'Other', mintLabel: 'Other device' },
];

export default function PairWatchCard() {
  const [device, setDevice] = useState<DeviceKind>('watch');
  // Device management (migration 045) — optional free-text name, so a paired
  // device can register with something more useful than its generic
  // chip default ("Living-room TV" instead of just "TV"). Passed straight
  // through to mint as deviceLabel; redeem hands it back to the redeeming
  // device (see pair-watch/index.ts) which stashes it for its first
  // registerDevice() upsert (CodeSignIn.tsx → lib/device.ts's
  // PAIRED_DEVICE_NAME_KEY).
  const [customName, setCustomName] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const mint = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const chipDefault = DEVICE_OPTIONS.find((d) => d.key === device)?.mintLabel || 'Other device';
      const deviceLabel = customName.trim() || chipDefault;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/pair-watch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: 'mint', deviceLabel }),
      });
      const body = await res.json();
      if (!res.ok || !body.code) throw new Error(body.error || 'Pairing service unavailable');
      setCode(body.code);
      setLeft(body.expiresInSeconds || 300);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => {
        setLeft((s) => {
          if (s <= 1) {
            if (timer.current) clearInterval(timer.current);
            setCode(null);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (e: any) {
      setErr(e?.message || 'Could not create a pairing code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>⌚📺 Pair a device</Text>
      <Text style={styles.sub}>
        Works for Tabby Watch and TV sign-in. On the TV, choose &ldquo;Sign in with a code&rdquo;.
        Codes last 5 minutes and work once.
      </Text>
      {!code && (
        <>
          <View style={styles.deviceRow}>
            {DEVICE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => setDevice(opt.key)}
                disabled={busy}
                style={[styles.deviceChip, device === opt.key && styles.deviceChipActive]}
              >
                <Text
                  style={[styles.deviceChipText, device === opt.key && styles.deviceChipTextActive]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={customName}
            onChangeText={setCustomName}
            editable={!busy}
            placeholder={
              DEVICE_OPTIONS.find((d) => d.key === device)?.mintLabel || 'Device name'
            }
            placeholderTextColor={colors.textMuted}
            style={styles.nameInput}
          />
        </>
      )}
      {code ? (
        <View style={styles.codeWrap}>
          <Text style={styles.code}>{code.slice(0, 3) + ' ' + code.slice(3)}</Text>
          <Text style={styles.count}>
            expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </Text>
        </View>
      ) : (
        <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={mint} disabled={busy}>
          <Text style={styles.btnTxt}>{busy ? 'Creating code…' : 'Get pairing code'}</Text>
        </Pressable>
      )}
      {err && <Text style={styles.err}>{err}</Text>}
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
  title: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  deviceRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  deviceChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deviceChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
  },
  deviceChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  deviceChipTextActive: { color: colors.accent },
  nameInput: {
    marginTop: 10,
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 13,
  },
  codeWrap: { alignItems: 'center', paddingVertical: 10 },
  code: { fontSize: 34, fontWeight: '800', color: colors.accent, letterSpacing: 6 },
  count: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  btn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.accentDim,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnTxt: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  err: { color: colors.red, fontSize: 12, marginTop: 6 },
});
