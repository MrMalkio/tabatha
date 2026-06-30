// ============================================================
// Tabatha — useSyncStatus (Workstream A4)
//
// Single source of truth for "is sync healthy?" derivation, shared by the
// Settings sync pill and the sidebar sync chip. The pure deriveSyncState()
// is unit-tested; the hook wraps it over the _lastSyncSuccess /
// _syncDiagnostics chrome.storage keys + the auth signed-in flag.
//
// States: signed_out | error | fresh | stale | never
//   signed_out — not signed in (overrides all)
//   error      — most recent diagnostic is a failure newer than last success
//   fresh      — last success < FRESH_WINDOW_MS ago
//   stale      — last success exists but older than that
//   never      — signed in, no success ever recorded
// ============================================================

// The only static import is `react` (a resolvable dependency), NOT the UI
// import chain (useChromeStorage → logger → …). That keeps the pure
// deriveSyncState() importable under node:test. The hook reads the two
// chrome.storage keys directly with its own listener.
import { useState, useEffect } from 'react';

export const FRESH_WINDOW_MS = 10 * 60 * 1000;

function isFailureKind(kind) {
  return !!kind && (kind.includes('failed') || kind.startsWith('no_'));
}

// Pure: derive the sync state + presentation tokens from raw inputs.
export function deriveSyncState({ isSignedIn, lastSyncSuccess, syncDiagnostics, now = Date.now() }) {
  const recentEvent = Array.isArray(syncDiagnostics) ? syncDiagnostics[0] : null;
  const lastSyncMs = lastSyncSuccess ? new Date(lastSyncSuccess).getTime() : 0;
  const recentFailure = recentEvent && isFailureKind(recentEvent.kind);
  const recentFailureNewer = recentEvent && new Date(recentEvent.at).getTime() > lastSyncMs;

  const state = !isSignedIn ? 'signed_out'
    : recentFailureNewer && recentFailure ? 'error'
    : lastSyncSuccess && (now - lastSyncMs) < FRESH_WINDOW_MS ? 'fresh'
    : lastSyncSuccess ? 'stale'
    : 'never';

  const presentation = {
    signed_out: { color: '#888', bg: 'rgba(136,136,136,0.15)', label: '○ Offline', tip: 'Not signed in. Open Settings → Sync & Account to sign in.' },
    error: { color: '#ff9800', bg: 'rgba(255,152,0,0.15)', label: '⚠ Sync error', tip: recentEvent?.detail || 'Most recent sync attempt reported an error. See Settings → Sync & Account.' },
    fresh: { color: '#34A853', bg: 'rgba(52,168,83,0.15)', label: '● Synced', tip: lastSyncSuccess ? 'Last synced ' + new Date(lastSyncSuccess).toLocaleTimeString() : 'Synced' },
    stale: { color: '#aaa', bg: 'rgba(170,170,170,0.15)', label: '◐ Stale', tip: lastSyncSuccess ? 'Last synced ' + new Date(lastSyncSuccess).toLocaleString() + ' — may be over 10 min ago.' : 'Stale' },
    never: { color: '#ff9800', bg: 'rgba(255,152,0,0.15)', label: '⚠ Never', tip: 'No successful sync recorded yet.' },
  }[state];

  return {
    state,
    label: presentation.label,
    color: presentation.color,
    bg: presentation.bg,
    tip: presentation.tip,
    detail: recentFailure ? (recentEvent?.detail || null) : null,
    lastSyncSuccess: lastSyncSuccess || null,
    recentEvent: recentEvent || null,
  };
}

/**
 * useSyncStatus — reactive sync-health hook. Reads _syncDiagnostics +
 * _lastSyncSuccess from chrome.storage.local and re-derives on change.
 *
 * @param {boolean} [isSignedIn]  Pass the auth flag if the caller already has
 *   it (Settings does, via useAuth). If omitted/undefined, the hook detects
 *   sign-in cheaply from the presence of any `sb-*` session key in
 *   chrome.storage.local — so lightweight surfaces (sidebar) need not mount
 *   the full auth hook + its realtime subscription.
 * @returns derived sync state (see deriveSyncState).
 */
export function useSyncStatus(isSignedIn) {
  const [syncDiagnostics, setSyncDiagnostics] = useState([]);
  const [lastSyncSuccess, setLastSyncSuccess] = useState(null);
  const [detectedSignedIn, setDetectedSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const local = globalThis.chrome?.storage?.local;
    if (!local) return undefined;

    const refresh = () => local.get(null).then((all) => {
      if (cancelled) return;
      setSyncDiagnostics(Array.isArray(all?._syncDiagnostics) ? all._syncDiagnostics : []);
      setLastSyncSuccess(all?._lastSyncSuccess ?? null);
      setDetectedSignedIn(Object.keys(all || {}).some((k) => k.startsWith('sb-')));
    }).catch(() => { /* best effort */ });

    refresh();

    const onChanged = (changes, area) => {
      if (area !== 'local') return;
      if ('_syncDiagnostics' in changes) setSyncDiagnostics(Array.isArray(changes._syncDiagnostics.newValue) ? changes._syncDiagnostics.newValue : []);
      if ('_lastSyncSuccess' in changes) setLastSyncSuccess(changes._lastSyncSuccess.newValue ?? null);
      if (Object.keys(changes).some((k) => k.startsWith('sb-'))) refresh();
    };
    globalThis.chrome?.storage?.onChanged?.addListener?.(onChanged);
    return () => {
      cancelled = true;
      globalThis.chrome?.storage?.onChanged?.removeListener?.(onChanged);
    };
  }, []);

  const signedIn = isSignedIn === undefined ? detectedSignedIn : isSignedIn;
  return deriveSyncState({ isSignedIn: signedIn, lastSyncSuccess, syncDiagnostics });
}
