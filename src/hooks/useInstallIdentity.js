// ============================================================
// React hook over the install identity stored in chrome.storage.local
// under `_browserProfile`. See src/services/installIdentity.js.
//
// Exposes:
//   identity         — full object or null while loading
//   isPersonal       — convenience: classification === 'personal'
//   isReady          — true once localId is materialised
//   setClassification(value)
//   setProfileName(value)
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChromeStorage, sendMessage } from './useChromeStorage';
import { VALID_CLASSIFICATIONS } from '../services/installIdentity';

const DEFAULT = {
  localId: null,
  supabaseId: null,
  classification: 'professional',
  profileName: '',
  createdAt: null,
  lastSeenAt: null
};

function generateLocalId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* ignore */ }
  return 'tba-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

export function useInstallIdentity() {
  const [identity, update] = useChromeStorage('_browserProfile', DEFAULT);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'

  // Eagerly initialise localId + createdAt on first mount if missing, so the
  // UI is responsive from first paint and edits don't race the background.
  useEffect(() => {
    if (identity && !identity.localId) {
      const now = new Date().toISOString();
      update((cur) => ({
        ...DEFAULT,
        ...(cur || {}),
        localId: cur?.localId || generateLocalId(),
        createdAt: cur?.createdAt || now
      }));
    }
  }, [identity?.localId, update]);

  // After an edit, push to the cloud right away so the user gets immediate
  // feedback (otherwise they wait for the next debounce / 5m alarm and
  // wonder if it took). We swallow errors silently — the diagnostic panel
  // surfaces them anyway.
  const flushToCloud = useCallback(async () => {
    setSaveState('saving');
    try {
      const res = await sendMessage('SYNC_NOW');
      setSaveState(res?.success ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
    setTimeout(() => setSaveState('idle'), 1800);
  }, []);

  const setClassification = useCallback((classification) => {
    if (!VALID_CLASSIFICATIONS.includes(classification)) return;
    update((cur) => ({ ...DEFAULT, ...(cur || {}), classification }));
    flushToCloud();
  }, [update, flushToCloud]);

  const setProfileName = useCallback((profileName) => {
    update((cur) => ({ ...DEFAULT, ...(cur || {}), profileName: String(profileName || '').slice(0, 200) }));
  }, [update]);

  // Called explicitly on blur of the name input so we don't ping the cloud
  // on every keystroke. Callers who want auto-flush wire it themselves.
  const commitProfileName = useCallback(() => {
    flushToCloud();
  }, [flushToCloud]);

  return useMemo(() => ({
    identity,
    isPersonal: identity?.classification === 'personal',
    isReady: !!identity?.localId,
    saveState,
    setClassification,
    setProfileName,
    commitProfileName,
    validClassifications: VALID_CLASSIFICATIONS
  }), [identity, saveState, setClassification, setProfileName, commitProfileName]);
}
