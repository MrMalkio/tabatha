// Plan 040 Epic 5 — "Notes-simple" capture mode. A dead-simple default
// surface positioned like a Notes app: type or speak → it becomes an
// intent. No tabs, no cards, minimal chrome. Product framing: "a Notes app
// that's secretly an attention OS" — the full extension-parity view (tabs,
// checkpoints, queue, backburner…) is one tap away via "Full view".
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useFocus, elapsedMsOf, isSidecarSourced } from '../data/focus';
import { useVoiceCapture } from '../lib/speech';
import { useInstallPrompt } from '../lib/install';
import { MicButton } from '../ui/kit';
import { colors, radius, formatTimer } from '../lib/theme';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return now;
}

export default function SimpleScreen({ onFullView }: { onFullView: () => void }) {
  const { profile, browserProfileId } = useAuth();
  const { currentFocus, createIntent, loading } = useFocus(profile?.id ?? null, browserProfileId);
  const now = useNow();
  const install = useInstallPrompt();

  const defaultRealm = profile?.settings?.sidecar?.defaultRealm || profile?.default_realm || 'professional';
  const defaultTimer = profile?.settings?.sidecar?.defaultTimer || 15;

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const confirmTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voice capture (#165 / Epic 1) — same pattern as FocusScreen's label mic:
  // base text is whatever was already typed, the live transcript appends.
  const baseRef = useRef('');
  const voice = useVoiceCapture((t) => {
    setText(baseRef.current ? `${baseRef.current} ${t}` : t);
  });
  const onMic = () => {
    if (voice.listening) {
      voice.stop();
      return;
    }
    baseRef.current = text.trim();
    voice.start();
  };

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    // Off-computer by default — createIntent always tags sidecar-sourced
    // intents `_off: true` (data/focus.ts), which is exactly right here:
    // a Notes-simple capture is definitionally "not at the desk".
    await createIntent(text.trim(), defaultTimer, defaultRealm);
    setText('');
    setBusy(false);
    setConfirmed(true);
    if (confirmTimeout.current) clearTimeout(confirmTimeout.current);
    confirmTimeout.current = setTimeout(() => setConfirmed(false), 2200);
  };

  useEffect(
    () => () => {
      if (confirmTimeout.current) clearTimeout(confirmTimeout.current);
    },
    []
  );

  const cf = currentFocus;
  const cfElapsed = cf ? elapsedMsOf(cf, now) : 0;
  let remaining: number | null = null;
  let over = false;
  if (cf && isSidecarSourced(cf)) {
    remaining = (cf.timer_minutes || 15) * 60000 - cfElapsed;
    over = remaining < 0;
  }

  return (
    <View style={styles.root}>
      <Pressable
        onPress={onFullView}
        style={styles.fullViewBtn}
        accessibilityLabel="Switch to full view"
      >
        <Text style={styles.fullViewTxt}>⤢ Full view</Text>
      </Pressable>

      <View style={styles.center}>
        <Text style={styles.brand}>Tabby</Text>
        <Text style={styles.prompt}>What's on your mind?</Text>

        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type or tap the mic…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            onSubmitEditing={submit}
            editable={!busy}
            autoFocus
          />
          <MicButton listening={voice.listening} supported={voice.supported} onPress={onMic} />
        </View>

        <Pressable
          onPress={submit}
          disabled={busy || !text.trim()}
          style={[styles.submitBtn, (busy || !text.trim()) && { opacity: 0.4 }]}
        >
          {busy ? <ActivityIndicator color="#04121A" /> : <Text style={styles.submitTxt}>Capture</Text>}
        </Pressable>

        <Text style={[styles.confirm, !confirmed && { opacity: 0 }]}>On it. ✓</Text>
      </View>

      <View style={styles.footer}>
        {!loading && cf && (
          <View style={styles.currentRow}>
            <Text style={styles.currentLabel} numberOfLines={1}>
              {cf.label}
            </Text>
            {remaining != null && (
              <Text style={[styles.currentTimer, { color: over ? colors.red : colors.accent }]}>
                {formatTimer(Math.abs(remaining))}
                {over ? ' over' : ''}
              </Text>
            )}
          </View>
        )}

        {install.available && (
          <Pressable onPress={install.promptInstall} style={styles.installBtn}>
            <Text style={styles.installTxt}>📲 Install Tabby</Text>
          </Pressable>
        )}
        {!install.available && !install.installed && install.isIOS && (
          <Text style={styles.iosHint}>Share → Add to Home Screen to install</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  fullViewBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    zIndex: 2,
  },
  fullViewTxt: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  brand: { fontSize: 15, fontWeight: '800', color: colors.accent, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6 },
  prompt: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 24 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 18,
    color: colors.textPrimary,
    fontSize: 19,
  },
  submitBtn: {
    marginTop: 18,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 32,
    paddingVertical: 14,
    minWidth: 160,
    alignItems: 'center',
  },
  submitTxt: { fontSize: 16, fontWeight: '700', color: '#04121A' },
  confirm: { marginTop: 16, fontSize: 14, fontWeight: '600', color: colors.green },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 10,
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 480,
    justifyContent: 'center',
  },
  currentLabel: { fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  currentTimer: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  installBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  installTxt: { fontSize: 12, fontWeight: '700', color: colors.accent },
  iosHint: { fontSize: 11, color: colors.textMuted },
});
