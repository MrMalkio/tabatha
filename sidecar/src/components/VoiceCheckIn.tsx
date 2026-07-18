// Proactive voice check-ins v1 (Plan 040 Addendum 7 / Malkio directive).
// Tabatha ASKS at the right moment ("How's ⟨label⟩ going?" over
// speechSynthesis), auto-opens the mic, and applies the answer to real
// records through the SAME action/checkpoint paths the buttons use.
//
// Triggers:
//   (a) manual — the "🎙 Check in" button (always available where speech
//       capture is supported; ignores the master toggle since the user
//       initiated it; skips the TTS prompt and just listens);
//   (b) proactive — active focus + no checkpoint for `staleMinutes` +
//       document visible + `settings.sidecar.voiceCheckin.enabled` (default
//       OFF — proactive speech is opt-in) + not inside Epic 8 quiet hours
//       (read-only peek at settings.sidecar.nudges; skipped silently when
//       absent) → speak the prompt, then auto-listen when TTS finishes.
//       Re-prompts at most once per staleness window.
//
// Every applied action renders the confirmation strip below the button for
// 6 seconds — voice writes must never be silent. Undo semantics per action:
//   checkpoint → delete the inserted row (useCheckpoints.remove(id));
//   pause      → inverse: actions.resume(focus.id);
//   resume     → inverse: actions.pause(focus.id);
//   resolve    → inverse: restore the pre-resolve funnel stage
//                (actions.updateFocus) + actions.resume(focus.id). The
//                `completed_at` stamp is left behind — harmless: visibility
//                is driven by focus_state/funnel_stage, both restored;
//   extend     → NO inverse. actions.extend(id, -N) is not allowed (it
//                would emit a bogus negative `extend` focus_event onto the
//                Addendum 6 timeline), so the strip says "adjust in the
//                edit panel" instead of offering Undo.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useCheckpoints, PROGRESS_LEVELS } from '../data/checkpoints';
import { startedAtOf, type FocusItem, type useFocus } from '../data/focus';
import { useVoiceCapture } from '../lib/speech';
import {
  cancelSpeech,
  isQuietNowHHMM,
  mergeVoiceCheckinSettings,
  parseVoiceCommand,
  speak,
  ttsSupported,
} from '../lib/voiceCheckin';
import { colors, radius } from '../lib/theme';

const CONFIRM_MS = 6000;
/** How often the proactive staleness check re-evaluates. */
const PROACTIVE_TICK_MS = 60000;

type Confirmation = {
  text: string;
  /** Undo handler; null → no Undo offered (extend). */
  undo: (() => void | Promise<void>) | null;
  /** Extra hint rendered when undo is unavailable. */
  hint?: string;
};

export default function VoiceCheckIn({
  focus,
  actions,
}: {
  focus: FocusItem;
  actions: ReturnType<typeof useFocus>['actions'];
}) {
  const { profile } = useAuth();
  const profileId = profile?.id ?? null;
  const { notes, add, remove } = useCheckpoints(profileId, focus.client_id);

  const settings = mergeVoiceCheckinSettings(profile?.settings?.sidecar?.voiceCheckin);
  const nudges = profile?.settings?.sidecar?.nudges || null;

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [transcript, setTranscript] = useState('');
  const [prompted, setPrompted] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPromptAt = useRef(0);

  const showConfirmation = useCallback((c: Confirmation) => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmation(c);
    confirmTimer.current = setTimeout(() => setConfirmation(null), CONFIRM_MS);
  }, []);

  // Refs so the capture-end callback always sees current focus/actions
  // without re-creating the recognizer mid-listen.
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const applyTranscript = useCallback(
    async (text: string) => {
      const cmd = parseVoiceCommand(text);
      const f = focusRef.current;
      const act = actionsRef.current;
      if (!cmd || !f) return;

      switch (cmd.kind) {
        case 'extend':
          act.extend(f.id, cmd.minutes);
          showConfirmation({
            text: `✓ Extended +${cmd.minutes}m`,
            undo: null,
            hint: 'To adjust, use ✏️ Update focus',
          });
          break;
        case 'pause':
          act.pause(f.id);
          showConfirmation({ text: '✓ Paused', undo: () => act.resume(f.id) });
          break;
        case 'resume':
          act.resume(f.id);
          showConfirmation({ text: '✓ Resumed', undo: () => act.pause(f.id) });
          break;
        case 'resolve': {
          const prevStage = f.funnel_stage;
          await act.resolve(f.id);
          showConfirmation({
            text: '✓ Resolved',
            undo: async () => {
              await act.updateFocus(f.id, { funnelStage: prevStage });
              await act.resume(f.id);
            },
          });
          break;
        }
        case 'checkpoint': {
          const id = await add(cmd.text, cmd.level);
          const lv = PROGRESS_LEVELS.find((l) => l.key === cmd.level);
          showConfirmation({
            text: `✓ Added checkpoint${lv && lv.key !== 'none' ? ` (${lv.icon} ${lv.label})` : ''}`,
            undo: id ? () => remove(id) : null,
          });
          break;
        }
      }
    },
    [add, remove, showConfirmation]
  );

  // Capture: stream the live transcript for display; apply on session end.
  const finalRef = useRef('');
  const voice = useVoiceCapture((text, isFinal) => {
    setTranscript(text);
    if (isFinal) finalRef.current = text;
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  // Recognition sessions end on silence (Chrome auto-stops) or via the
  // button. `listening` false-edge = session over → parse & apply once.
  // The apply is deferred ~450ms because a manual stop() flips `listening`
  // immediately while the recognizer's LAST final onresult can still land a
  // few ms later — finalRef keeps receiving it, so reading after the grace
  // window catches the complete utterance.
  const wasListening = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (wasListening.current && !voice.listening) {
      setPrompted(false);
      timer = setTimeout(() => {
        const text = finalRef.current.trim();
        finalRef.current = '';
        setTranscript('');
        if (text) applyTranscript(text);
      }, 450);
    }
    wasListening.current = voice.listening;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [voice.listening, applyTranscript]);

  const startListening = useCallback(() => {
    finalRef.current = '';
    setTranscript('');
    voiceRef.current.start();
  }, []);

  // (a) Manual check-in — user-initiated, so no TTS prompt and no gating on
  // the proactive master toggle.
  const onManual = () => {
    if (voice.listening) {
      voice.stop();
      return;
    }
    startListening();
  };

  // (b) Proactive — checkpoint staleness while the app is visible.
  useEffect(() => {
    if (!settings.enabled) return;
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!voice.supported || !ttsSupported()) return;

    const tick = () => {
      const f = focusRef.current;
      if (!f || f.focus_state !== 'active') return;
      if (document.visibilityState !== 'visible') return;
      if (voiceRef.current.listening) return;
      // Epic 8 quiet hours (read-only; silently inert when shape absent).
      if (isQuietNowHHMM(nudges?.quietHoursStart, nudges?.quietHoursEnd)) return;

      const staleMs = settings.staleMinutes * 60000;
      const latestNote = notes.length
        ? new Date(notes[0].created_at).getTime()
        : NaN;
      const baseline = Number.isFinite(latestNote)
        ? Math.max(latestNote, startedAtOf(f))
        : startedAtOf(f);
      if (Date.now() - baseline < staleMs) return;
      // At most one prompt per staleness window.
      if (Date.now() - lastPromptAt.current < staleMs) return;

      lastPromptAt.current = Date.now();
      // speak() refuses (returns false) while a chaperone line holds the
      // audio gate — in that case we simply skip this tick and retry later.
      const spoke = speak(`How's ${f.label} going?`, () => {
        // Auto-listen once she finishes asking.
        if (!voiceRef.current.listening) {
          setPrompted(true);
          startListening();
        }
      });
      if (!spoke) lastPromptAt.current = 0; // didn't actually prompt; retry next tick
    };

    const iv = setInterval(tick, PROACTIVE_TICK_MS);
    tick();
    return () => clearInterval(iv);
    // notes/nudges/settings are re-read on change; focus via ref.
  }, [
    settings.enabled,
    settings.staleMinutes,
    voice.supported,
    notes,
    nudges?.quietHoursStart,
    nudges?.quietHoursEnd,
    startListening,
  ]);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      cancelSpeech();
    },
    []
  );

  // No SpeechRecognition (e.g. iOS Safari) → render nothing, same graceful
  // no-op convention as MicButton.
  if (!voice.supported) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={onManual}
          style={[styles.btn, voice.listening && styles.btnActive]}
          accessibilityLabel={voice.listening ? 'Stop voice check-in' : 'Start voice check-in'}
        >
          <Text style={[styles.btnText, voice.listening && { color: colors.red }]}>
            {voice.listening ? (prompted ? '🎤 Listening… (answer her)' : '🎤 Listening… tap to stop') : '🎙 Check in'}
          </Text>
        </Pressable>
        {voice.listening && !!transcript && (
          <Text style={styles.transcript} numberOfLines={2}>
            “{transcript}”
          </Text>
        )}
      </View>
      {voice.listening && (
        <Text style={styles.hint}>
          Say: “extend 10 minutes” · “pause” · “resume” · “done” · or just describe your progress
        </Text>
      )}
      {confirmation && (
        <View style={styles.confirmStrip}>
          <Text style={styles.confirmText}>{confirmation.text}</Text>
          {confirmation.undo ? (
            <Pressable
              onPress={async () => {
                const u = confirmation.undo!;
                setConfirmation(null);
                await u();
              }}
            >
              <Text style={styles.undoText}>Undo</Text>
            </Pressable>
          ) : (
            !!confirmation.hint && <Text style={styles.confirmHint}>{confirmation.hint}</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btnActive: { borderColor: colors.red, backgroundColor: 'rgba(239,83,80,0.08)' },
  btnText: { fontSize: 12, fontWeight: '600', color: colors.accent },
  transcript: { flex: 1, fontSize: 12, fontStyle: 'italic', color: colors.textMuted },
  hint: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  confirmStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(102,187,106,0.4)',
    backgroundColor: 'rgba(102,187,106,0.08)',
  },
  confirmText: { flex: 1, fontSize: 12, color: colors.green, fontWeight: '600' },
  confirmHint: { fontSize: 11, color: colors.textMuted },
  undoText: { fontSize: 12, fontWeight: '700', color: colors.accent, textDecorationLine: 'underline' },
});
