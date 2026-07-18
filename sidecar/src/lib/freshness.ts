import { useEffect } from 'react';
import { Platform } from 'react-native';

// Stale-bundle guard (v0.6.0, born from the 2026-07-18 "stuck Sidecar"
// incident): an installed PWA can keep one loaded page alive for days, so a
// user can be running a bundle several deploys old — including the broken
// v0.4.1 bundle that crashed the Focus screen. The Worker already serves
// index.html with max-age=0/must-revalidate; the missing piece is the app
// ever *asking* again. This hook re-fetches index.html whenever the app
// returns to the foreground, compares the entry-bundle hash against the one
// actually running, and hard-reloads when they differ. Throttled so a
// flapping visibilitychange can't reload-loop.

const CHECK_MIN_INTERVAL_MS = 60_000;
let lastCheck = 0;

async function checkForNewBundle(): Promise<void> {
  const now = Date.now();
  if (now - lastCheck < CHECK_MIN_INTERVAL_MS) return;
  lastCheck = now;
  try {
    const res = await fetch('/sidecar/', { cache: 'no-store' });
    if (!res.ok) return;
    const html = await res.text();
    const served = html.match(/\/_expo\/static\/js\/web\/(entry-[a-f0-9]+\.js)/)?.[1];
    if (!served) return;
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const running = scripts
      .map((s) => (s as HTMLScriptElement).src.match(/(entry-[a-f0-9]+\.js)/)?.[1])
      .find(Boolean);
    // Only reload when we can positively identify BOTH sides and they differ —
    // never reload on a parse miss.
    if (running && served !== running) {
      window.location.reload();
    }
  } catch {
    /* offline / transient — try again next foreground */
  }
}

/** Mount once at the root. Web/PWA only; native no-ops. */
export function useStaleBundleReload(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVis = () => {
      if (!document.hidden) checkForNewBundle();
    };
    document.addEventListener('visibilitychange', onVis);
    // Also check shortly after initial mount — catches the "reopened the PWA
    // and it restored the old page without firing visibilitychange" path.
    const t = setTimeout(checkForNewBundle, 5_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(t);
    };
  }, []);
}
