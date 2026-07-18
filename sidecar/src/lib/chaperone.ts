// Personality Interrupts v0 (Plan 040 Epic 10 / feature #182 v0 slice) —
// pre-recorded audio lines played by the Context View when the phone-away
// signal fires. Theatrical only: config-gated, no AI, no real actions ever
// taken. Rides the existing `browser_profile_status`/`phoneAway` realtime
// signal that Phone Focus Mode already produces — no new channel.
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export type ChaperoneScenario = 'pickup' | 'repeat' | 'return';

export interface ChaperoneSettings {
  enabled: boolean;
  /** Personality pack id — folder name under /sidecar/chaperone/. */
  pack: string;
  /** Hour-of-day window (0-23, local time) to stay silent; wraps past midnight if start > end. */
  quietHours?: { start: number; end: number } | null;
}

export const DEFAULT_CHAPERONE_SETTINGS: ChaperoneSettings = {
  enabled: false,
  pack: 'classic',
  quietHours: null,
};

/** How often to re-nag with the 'repeat' line while the phone stays away. */
const REPEAT_INTERVAL_MS = 45000;

function audioSrc(pack: string, scenario: ChaperoneScenario): string {
  return `/sidecar/chaperone/${pack}/${scenario}.wav`;
}

function isQuietHours(quietHours: ChaperoneSettings['quietHours'], at: Date = new Date()): boolean {
  if (!quietHours) return false;
  const { start, end } = quietHours;
  if (start == null || end == null || start === end) return false;
  const h = at.getHours();
  return start < end ? h >= start && h < end : h >= start || h < end;
}

function mergeSettings(settings: Partial<ChaperoneSettings> | null | undefined): ChaperoneSettings {
  return { ...DEFAULT_CHAPERONE_SETTINGS, ...(settings || {}) };
}

let lastAudio: any = null;

/**
 * Play one pre-recorded Chaperone line. Web-only (HTMLAudioElement); no-op
 * on native, when disabled, or during quiet hours. Empty threats are
 * theater — this only ever plays audio, nothing else.
 */
export function playChaperoneLine(
  scenario: ChaperoneScenario,
  settings: Partial<ChaperoneSettings> | null | undefined
): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof (window as any).Audio === 'undefined') {
    return false;
  }
  const merged = mergeSettings(settings);
  if (!merged.enabled) return false;
  if (isQuietHours(merged.quietHours)) return false;

  try {
    if (lastAudio) {
      try {
        lastAudio.pause();
        lastAudio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    const Audio = (window as any).Audio;
    const audio = new Audio(audioSrc(merged.pack, scenario));
    lastAudio = audio;
    const playPromise = audio.play?.();
    if (playPromise?.catch) {
      // Autoplay can be blocked before the user has interacted with the
      // page — this is theater, not a critical path, so we just drop it.
      playPromise.catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The one integration point for ContextView: fires `'pickup'` on the
 * false→true edge of `phoneAway`, nags with `'repeat'` every
 * `REPEAT_INTERVAL_MS` while it stays true, and fires `'return'` on the
 * true→false edge. Pass the SAME `phoneAway` boolean ContextView already
 * computes — no new realtime wiring needed here.
 */
export function useChaperoneOnPhoneAway(
  phoneAway: boolean,
  settings: Partial<ChaperoneSettings> | null | undefined
) {
  const prevRef = useRef(phoneAway);
  const repeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = phoneAway;
    if (!prev && phoneAway) {
      playChaperoneLine('pickup', settingsRef.current);
      if (repeatTimerRef.current) clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = setInterval(() => {
        playChaperoneLine('repeat', settingsRef.current);
      }, REPEAT_INTERVAL_MS);
    } else if (prev && !phoneAway) {
      if (repeatTimerRef.current) {
        clearInterval(repeatTimerRef.current);
        repeatTimerRef.current = null;
      }
      playChaperoneLine('return', settingsRef.current);
    }
  }, [phoneAway]);

  useEffect(
    () => () => {
      if (repeatTimerRef.current) clearInterval(repeatTimerRef.current);
    },
    []
  );
}
