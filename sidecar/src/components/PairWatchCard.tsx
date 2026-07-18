import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { colors, radius } from '../lib/theme';

// Plan 041 §6.3 — "Pair a watch". Mints a 6-digit, 5-minute, single-use code
// via the pair-watch edge function (user JWT); the raw code exists only in
// this component's state for the countdown window, never persisted or logged.

export default function PairWatchCard() {
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
      const res = await fetch(`${SUPABASE_URL}/functions/v1/pair-watch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: 'mint', deviceLabel: 'Galaxy Watch' }),
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
      <Text style={styles.title}>⌚ Pair a watch</Text>
      <Text style={styles.sub}>
        Open Tabby Watch on your watch, choose Pair, and enter this code. Codes last 5 minutes
        and work once.
      </Text>
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
