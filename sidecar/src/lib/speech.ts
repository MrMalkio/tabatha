// Web Speech API wrapper — mic-to-text capture for the Sidecar (Plan 040
// Epic 1 / feature #165 Voice Notes). Web-only: Android/desktop Chrome
// expose `webkitSpeechRecognition` (or the unprefixed `SpeechRecognition`);
// iOS Safari has neither, so `speechCaptureSupported()` returns false there
// and callers should render nothing / a disabled hint rather than a mic
// button. No server STT here — that's a deferred iOS fallback.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export interface SpeechCaptureHandlers {
  /** Fired on every interim + final chunk with the cumulative transcript for this session. */
  onTranscript?: (text: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export interface SpeechCaptureController {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getRecognitionCtor(): any | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Feature-detect only — does not request microphone permission. */
export function speechCaptureSupported(): boolean {
  return getRecognitionCtor() != null;
}

/**
 * Low-level controller around the browser's SpeechRecognition. Requesting
 * `.start()` is what triggers the mic-permission prompt; a denial surfaces
 * via `onError('not-allowed')`.
 */
export function createSpeechCapture(handlers: SpeechCaptureHandlers): SpeechCaptureController | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  try {
    recognition.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  } catch {
    /* ignore */
  }

  let finalText = '';

  recognition.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result?.[0]?.transcript || '';
      if (result.isFinal) {
        finalText = (finalText + ' ' + transcript).trim();
        handlers.onTranscript?.(finalText, true);
      } else {
        interim += transcript;
      }
    }
    if (interim) handlers.onTranscript?.((finalText + ' ' + interim).trim(), false);
  };

  recognition.onerror = (event: any) => {
    handlers.onError?.(event?.error || 'unknown');
  };

  recognition.onend = () => {
    handlers.onEnd?.();
  };

  return {
    start: () => {
      finalText = '';
      try {
        recognition.start();
      } catch {
        // already listening — ignore (Safari/Chrome throw InvalidStateError)
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * React hook: mic capture that streams a cumulative transcript back to the
 * caller via `onTranscript`. Callers own the text field — this hook only
 * ever reports what was heard this session; composing it onto any
 * pre-existing field text is the caller's job (see FocusScreen).
 */
export function useVoiceCapture(onTranscript: (text: string, isFinal: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<SpeechCaptureController | null>(null);
  const supported = speechCaptureSupported();

  const start = useCallback(() => {
    if (!supported || listening) return;
    setError(null);
    const controller = createSpeechCapture({
      onTranscript,
      onEnd: () => setListening(false),
      onError: (e) => {
        setError(e);
        setListening(false);
      },
    });
    if (!controller) return;
    controllerRef.current = controller;
    controller.start();
    setListening(true);
  }, [supported, listening, onTranscript]);

  const stop = useCallback(() => {
    controllerRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  return { supported, listening, error, start, stop };
}
