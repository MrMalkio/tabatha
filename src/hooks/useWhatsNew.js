// ============================================================
// Tabatha — "What's New" hook (FIX-11).
// Compares the running manifest version against the stored
// `_lastSeenVersion` (chrome.storage.local) and decides whether to surface
// the WhatsNewModal:
//   • Fresh install (no _lastSeenVersion): seed it silently to the current
//     version — the user shouldn't get a changelog wall on first run.
//   • Stored version older than current: show the modal ONCE, then mark
//     _lastSeenVersion = current on dismiss.
//   • Same (or newer) stored version: no-op.
// Auto-refresh after a companion update is handled elsewhere
// (companionService._handleUpdateReady → chrome.runtime.reload); this layer
// only owns the changelog surface.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { isVersionNewer } from '../utils/semver.js';

export const LAST_SEEN_KEY = '_lastSeenVersion';

// Pure decision function — no chrome.* here so it is trivially testable.
// Returns one of:
//   { action: 'seed', version }  → fresh install; write version, no modal
//   { action: 'show', version }  → newer than last-seen; show modal for `version`
//   { action: 'noop' }           → nothing to do
export function decideWhatsNew({ current, lastSeen }) {
  if (!current) return { action: 'noop' };
  // Fresh install: no record of a previously-seen version.
  if (lastSeen === undefined || lastSeen === null || lastSeen === '') {
    return { action: 'seed', version: current };
  }
  if (isVersionNewer(lastSeen, current)) {
    return { action: 'show', version: current };
  }
  return { action: 'noop' };
}

async function readCurrentVersion() {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return null;
  }
}

async function readLastSeen() {
  try {
    const result = await chrome.storage.local.get(LAST_SEEN_KEY);
    return result[LAST_SEEN_KEY];
  } catch {
    return undefined;
  }
}

async function writeLastSeen(version) {
  try {
    await chrome.storage.local.set({ [LAST_SEEN_KEY]: version });
  } catch {
    /* best-effort; a failed write just means we re-prompt next time */
  }
}

// Load the generated changelog.json (Vite copies public/ → dist/, so it lives
// at the extension root). Best-effort: the modal renders even with an empty
// list, and the decision to show is independent of the fetch succeeding.
async function loadChangelog() {
  try {
    const url = chrome.runtime.getURL('changelog.json');
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data?.releases) ? data.releases : [];
  } catch {
    return [];
  }
}

export function useWhatsNew() {
  const [visible, setVisible] = useState(false);
  const [version, setVersion] = useState(null);
  const [releases, setReleases] = useState([]);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // run the decision exactly once per mount
    ranRef.current = true;

    let cancelled = false;
    (async () => {
      const current = await readCurrentVersion();
      const lastSeen = await readLastSeen();
      const decision = decideWhatsNew({ current, lastSeen });

      if (decision.action === 'seed') {
        await writeLastSeen(decision.version);
        return; // silent — no modal on fresh install
      }
      if (decision.action !== 'show') return;

      const list = await loadChangelog();
      if (cancelled) return;
      setReleases(list);
      setVersion(decision.version);
      setVisible(true);
    })();

    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback(async () => {
    setVisible(false);
    const current = await readCurrentVersion();
    if (current) await writeLastSeen(current);
  }, []);

  return { visible, version, releases, dismiss };
}
