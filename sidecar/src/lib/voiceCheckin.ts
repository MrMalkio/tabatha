// Proactive voice check-ins v1 (Plan 040 Addendum 7, binding — ships in
// 0.7.0). Tabatha ASKS ("How's ⟨label⟩ going?" via speechSynthesis),
// auto-opens the mic (lib/speech.ts owns capture), and this module turns
// the answer into a deterministic command — extend / pause / resume /
// resolve / checkpoint-with-level. NO LLM anywhere in this path: the parse
// is a fixed keyword table (see parseVoiceCommand) so what you say maps to
// exactly one predictable write, and every write renders a visible
// confirmation strip in the component (voice writes must never be silent).
//
// TESTS: sidecar/tests/voice-parse.test.mjs mirrors parseVoiceCommand +
// inferProgressLevel + isQuietNowHHMM verbatim (same mirror convention as
// timer-math.test.mjs — this file's top-level `react-native` import makes
// it un-importable under plain `node --test`). If you change the parser
// here, update the mirror and re-run the test file.
import { Platform } from 'react-native';

import { isAudioBusy, claimAudio, releaseAudio } from './audioGate';

// ── Settings shape (settings.sidecar.voiceCheckin) ─────────────────────
// Written through AuthContext.saveSidecarSettings → `update_profile_settings`
// RPC — a distinct key under `sidecar`, sent as the full object (shallow
// merge at the sidecar level replaces the whole voiceCheckin value).

export interface VoiceCheckinSettings {
  /** Master toggle for the PROACTIVE spoken prompt. Default OFF — Tabatha
   * speaking up unprompted must be opt-in. The manual 🎤 button ignores
   * this (explicitly user-initiated). */
  enabled: boolean;
  /** Minutes without a checkpoint on the active focus before she asks. */
  staleMinutes: number;
}

export const VOICE_CHECKIN_DEFAULTS: VoiceCheckinSettings = {
  enabled: false,
  staleMinutes: 30,
};

export function mergeVoiceCheckinSettings(
  raw: Partial<VoiceCheckinSettings> | null | undefined
): VoiceCheckinSettings {
  const merged = { ...VOICE_CHECKIN_DEFAULTS, ...(raw || {}) };
  if (!Number.isFinite(merged.staleMinutes) || merged.staleMinutes < 1) {
    merged.staleMinutes = VOICE_CHECKIN_DEFAULTS.staleMinutes;
  }
  return merged;
}

// ── Deterministic transcript parser (v1 rules, Addendum 7) ─────────────
//
//   verb routes (case-insensitive, checked in this order):
//     /(?:extend|add)\s+(\d+)\s*min/  → { kind:'extend', minutes:N }
//     /^pause/                        → { kind:'pause' }
//     /^resume/                       → { kind:'resume' }
//     /^(done|finished|resolve)/      → { kind:'resolve' }   (prefix match,
//                                        so "resolved"/"finished it" count)
//     anything else                   → { kind:'checkpoint', text, level }
//
//   checkpoint progress level from keywords (first match wins):
//     stuck → 'stuck' · almost → 'almost_done' ·
//     a lot | great | huge → 'lot' · little → 'little' · else 'none'
//   (levels are the PROGRESS_LEVELS keys in data/checkpoints.ts)

export type VoiceCommand =
  | { kind: 'extend'; minutes: number }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'resolve' }
  | { kind: 'checkpoint'; text: string; level: string };

export function inferProgressLevel(text: string): string {
  const t = text.toLowerCase();
  if (/\bstuck\b/.test(t)) return 'stuck';
  if (/\balmost\b/.test(t)) return 'almost_done';
  if (/\ba lot\b|\bgreat\b|\bhuge\b/.test(t)) return 'lot';
  if (/\blittle\b/.test(t)) return 'little';
  return 'none';
}

export function parseVoiceCommand(transcript: string): VoiceCommand | null {
  const text = (transcript || '').trim();
  if (!text) return null;

  const extend = /(?:extend|add)\s+(\d+)\s*min/i.exec(text);
  if (extend) {
    const minutes = parseInt(extend[1], 10);
    if (Number.isFinite(minutes) && minutes > 0) return { kind: 'extend', minutes };
  }
  if (/^pause/i.test(text)) return { kind: 'pause' };
  if (/^resume/i.test(text)) return { kind: 'resume' };
  if (/^(?:done|finished|resolve)/i.test(text)) return { kind: 'resolve' };

  return { kind: 'checkpoint', text, level: inferProgressLevel(text) };
}

// ── Quiet hours (Epic 8 shape, read-only) ──────────────────────────────
// The nudges card (Koda, Epic 8 v1) stores `settings.sidecar.nudges.
// quietHoursStart/quietHoursEnd` as "HH:MM" strings. We only READ that
// shape here — never write it — and skip silently (return false) when it's
// absent or malformed, per the spec's "read-only check; skip silently if
// absent". Wraps past midnight when start > end, matching the server-side
// nudge semantics ("no nudges during quiet hours").

function hhmmToMinutes(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function isQuietNowHHMM(
  start: unknown,
  end: unknown,
  at: Date = new Date()
): boolean {
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (s == null || e == null || s === e) return false;
  const now = at.getHours() * 60 + at.getMinutes();
  return s < e ? now >= s && now < e : now >= s || now < e;
}

// ── TTS (web-only, chaperone-aware) ────────────────────────────────────

export function ttsSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof (window as any).speechSynthesis !== 'undefined' &&
    typeof (window as any).SpeechSynthesisUtterance !== 'undefined'
  );
}

/**
 * Speak one line via `window.speechSynthesis`. Returns false (without
 * speaking) when TTS is unsupported OR another audio channel holds the
 * gate — i.e. a chaperone line is mid-play; the chaperone always wins the
 * channel (Addendum 7). Claims the 'tts' gate channel for the utterance's
 * lifetime; `onDone` fires exactly once on end/error so callers can chain
 * "speak then auto-listen".
 */
export function speak(text: string, onDone?: () => void): boolean {
  if (!ttsSupported() || isAudioBusy('tts')) return false;
  try {
    const synth = (window as any).speechSynthesis;
    const Utterance = (window as any).SpeechSynthesisUtterance;
    synth.cancel(); // never queue behind a stale utterance
    const u = new Utterance(text);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      releaseAudio('tts');
      onDone?.();
    };
    u.onend = finish;
    u.onerror = finish;
    claimAudio('tts');
    synth.speak(u);
    // Safety valve: some browsers drop onend for cancelled/empty utterances.
    setTimeout(finish, Math.max(4000, text.length * 120));
    return true;
  } catch {
    releaseAudio('tts');
    return false;
  }
}

/** Stop any in-flight check-in TTS (e.g. component unmount). */
export function cancelSpeech(): void {
  if (!ttsSupported()) return;
  try {
    (window as any).speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
  releaseAudio('tts');
}
