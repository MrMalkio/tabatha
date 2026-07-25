import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { logger } from '../services/logger';
import { sanitizeIntentHistory, sanitizeIntentPresets } from '../utils/focusDataSanitize';

/**
 * useChromeStorage – Reactive hook for chrome.storage.local
 * Falls back to localStorage in dev (non-extension) environments.
 */
const isChromeExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export function useChromeStorage(key, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const defaultRef = useRef(defaultValue);

  // Initial load
  useEffect(() => {
    if (isChromeExtension) {
      chrome.storage.local.get(key, (result) => {
        if (result[key] !== undefined) {
          setValue(result[key]);
        }
      });
    } else {
      try {
        const stored = localStorage.getItem(`tabatha_${key}`);
        if (stored) setValue(JSON.parse(stored));
      } catch { /* ignore */ }
    }
  }, [key]);

  // Listen for changes from other contexts (background, sidebar, popup)
  useEffect(() => {
    if (!isChromeExtension) return;

    const listener = (changes, area) => {
      if (area === 'local' && changes[key]) {
        setValue(changes[key].newValue ?? defaultRef.current);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);

  const update = useCallback((newValue) => {
    // Functional setState guarantees `prev` is the latest committed state.
    // The previous valueRef-based approach could be one render stale, which
    // racing writes (e.g. an eager-init useEffect colliding with a user
    // edit on the same key) could clobber. We perform the chrome.storage
    // write inside the updater so it always pairs with the freshly-derived
    // value — idempotent if React StrictMode double-invokes.
    setValue((prev) => {
      const resolved = typeof newValue === 'function' ? newValue(prev) : newValue;
      if (isChromeExtension) {
        chrome.storage.local.set({ [key]: resolved });
      } else {
        try { localStorage.setItem(`tabatha_${key}`, JSON.stringify(resolved)); } catch { /* ignore */ }
      }
      return resolved;
    });
  }, [key]);

  return [value, update];
}

/**
 * sendMessage – Promise-wrapped chrome.runtime.sendMessage
 */
export function sendMessage(type, payload = {}) {
  if (!isChromeExtension || !chrome.runtime?.sendMessage) {
    console.warn(`[Tabatha Dev] sendMessage('${type}') – no chrome.runtime`);
    return Promise.resolve({});
  }
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        // MUST check lastError or Chrome silently swallows the error
        if (chrome.runtime.lastError) {
          logger.warn('MSG', `sendMessage('${type}') error: ${chrome.runtime.lastError.message}`);
          resolve({ error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || {});
      });
    } catch (err) {
      logger.error('MSG', `sendMessage('${type}') threw: ${err.message}`, { type });
      resolve({ error: err.message });
    }
  });
}

/**
 * useIntentHistory / useIntentPresets — 6.7.76 (gatekeeper-sanitize-gap).
 *
 * Sanitized wrappers around useChromeStorage('intentHistory'/'intentPresets')
 * for the React surfaces that read these keys directly (settings/index.jsx,
 * home/index.jsx). Both keys carry the same legacy-corruption risk the
 * 6.7.69 InPop fix addressed for focusEngine/tabs (see
 * src/utils/focusDataSanitize.js's header) but were never wired into that
 * fix — they're a wholly separate storage key. Left raw, a corrupted entry
 * doesn't just render "[object Object]" here: home/index.jsx's IntentsPanel
 * calls `context.toLowerCase()` on `entry.context`, and settings/index.jsx
 * renders `p.label`/`getIntentContext(entry)` as a bare JSX child — both
 * throw (TypeError / "Objects are not valid as a React child") on an
 * object-valued field, so this is a crash risk, not just a display bug.
 *
 * Same self-healing contract as the rest of focusDataSanitize.js:
 * sanitize on every read, and write the repaired value back so a corrupted
 * install heals itself the next time either panel renders.
 */
export function useIntentHistory() {
  const [raw, setRaw] = useChromeStorage('intentHistory', []);
  const { history, healed } = useMemo(() => sanitizeIntentHistory(raw), [raw]);

  useEffect(() => {
    if (healed) setRaw(history);
  }, [healed, history, setRaw]);

  return [history, setRaw];
}

export function useIntentPresets() {
  const [raw, setRaw] = useChromeStorage('intentPresets', { persistent: [] });
  const { presets, healed } = useMemo(() => sanitizeIntentPresets(raw), [raw]);

  useEffect(() => {
    if (healed) setRaw(presets);
  }, [healed, presets, setRaw]);

  return [presets, setRaw];
}

/**
 * useTheme – Theme switching hook synced to chrome.storage
 */
export function useTheme() {
  const [theme, setTheme] = useChromeStorage('tabatha_theme', 'pop-art');

  useEffect(() => {
    if (theme === 'pop-art') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  return [theme, setTheme];
}
