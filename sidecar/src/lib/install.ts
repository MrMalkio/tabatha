// PWA install-prompt capture (Plan 040 Epic 5 / "install CTA"). Web-only —
// mirrors push.ts's feature-detection style. `beforeinstallprompt` only
// fires on the app's own origin (per the spec), so this lives entirely in
// the Sidecar itself; the promo site just deep-links here.
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export interface InstallPromptState {
  /** A captured `beforeinstallprompt` event is ready to fire — show the button. */
  available: boolean;
  /** The app is already running as an installed PWA (or just got installed). */
  installed: boolean;
  /** Safari/iOS has no `beforeinstallprompt` — show the manual "Share" hint instead. */
  isIOS: boolean;
  /** Fires the native install prompt. Resolves the user's choice, or null if unavailable. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>;
}

function isStandaloneNow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {
    /* ignore */
  }
  // iOS Safari's PWA flag — not covered by the display-mode media query there.
  return !!(navigator as any)?.standalone;
}

function detectIOS(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Captures the browser's install prompt so a UI button can fire it on
 * demand (Chrome/Edge/Android only — the spec-mandated CTA). iOS Safari
 * never fires `beforeinstallprompt`; callers should render the manual
 * "Share → Add to Home Screen" hint when `isIOS && !installed`.
 */
export function useInstallPrompt(): InstallPromptState {
  const [deferred, setDeferred] = useState<any | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => isStandaloneNow());

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | null> => {
    if (!deferred) return null;
    try {
      deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice?.outcome === 'accepted') setInstalled(true);
      return choice?.outcome ?? null;
    } catch {
      setDeferred(null);
      return null;
    }
  }, [deferred]);

  return {
    available: !!deferred && !installed,
    installed,
    isIOS: detectIOS(),
    promptInstall,
  };
}
