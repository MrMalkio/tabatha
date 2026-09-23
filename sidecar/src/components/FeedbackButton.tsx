import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { submitFeedback, type FeedbackKind } from '../lib/feedback';
import { SIDECAR_VERSION } from '../lib/device';
import { colors } from '../lib/theme';

/**
 * TR-14 — non-intrusive quick-feedback affordance for the Sidecar.
 *
 * A small persistent 💬 icon (mounted in the app header, index.tsx) that opens
 * a lightweight bug/idea composer. Reuses the same proven `submitFeedback()`
 * path the Settings feedback card uses — no new backend, no new payload shape;
 * `feedback.ts` auto-tags the surface via platformSurface() so these land in
 * Asana distinguished from the extension surfaces. Nothing overlays primary
 * content at rest — the modal only appears on tap.
 */
export default function FeedbackButton({ profileId }: { profileId: string | null }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { kind: 'sent' | 'queued' | 'error'; text: string }
    | null
  >(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setResult(null);
    setText('');
    setKind('bug');
  };

  const onSubmit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await submitFeedback({
        kind,
        text,
        version: SIDECAR_VERSION,
        profileId,
      });
      if (res.status === 'sent') {
        setResult({ kind: 'sent', text: 'Sent — thanks!' });
        setText('');
      } else if (res.status === 'queued') {
        setResult({
          kind: 'queued',
          text: 'Saved — we’ll send it once the pipeline is live.',
        });
        setText('');
      } else {
        setResult({ kind: 'error', text: res.reason });
      }
    } catch (e) {
      setResult({ kind: 'error', text: e instanceof Error ? e.message : 'Could not send.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.trigger}
        accessibilityLabel="Send feedback"
        accessibilityRole="button"
        hitSlop={8}>
        <Text style={styles.triggerIcon}>💬</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Send feedback</Text>
              <Pressable onPress={close} hitSlop={8}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.kindRow}>
              {(['bug', 'feature'] as FeedbackKind[]).map((k) => {
                const on = k === kind;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setKind(k)}
                    style={[styles.kindChip, on && styles.kindChipOn]}>
                    <Text style={[styles.kindChipTxt, on && styles.kindChipTxtOn]}>
                      {k === 'bug' ? '🐛 Bug' : '💡 Idea'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={styles.input}
              placeholder={kind === 'bug' ? 'What went wrong?' : 'What would make this better?'}
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              editable={!busy}
            />

            {result && (
              <Text
                style={[
                  styles.result,
                  result.kind === 'error' && { color: colors.textMuted },
                ]}>
                {result.text}
              </Text>
            )}

            <Pressable
              onPress={onSubmit}
              disabled={busy || !text.trim()}
              style={[styles.submit, (busy || !text.trim()) && styles.submitDisabled]}>
              <Text style={styles.submitTxt}>{busy ? 'Sending…' : 'Send'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  triggerIcon: { fontSize: 13 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  close: { fontSize: 16, color: colors.textMuted, fontWeight: '700' },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  kindChipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  kindChipTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  kindChipTxtOn: { color: colors.accent },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: colors.bgBase,
    textAlignVertical: 'top',
  },
  result: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.5 },
  submitTxt: { color: colors.bgBase, fontWeight: '800', fontSize: 14 },
});
