import { useState, useEffect, useCallback, useRef } from 'react';

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

  // Track latest value in a ref so the update callback never captures stale state
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  const update = useCallback((newValue) => {
    const resolved = typeof newValue === 'function' ? newValue(valueRef.current) : newValue;
    setValue(resolved);

    if (isChromeExtension) {
      chrome.storage.local.set({ [key]: resolved });
    } else {
      localStorage.setItem(`tabatha_${key}`, JSON.stringify(resolved));
    }
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
          console.error(`[Tabatha] sendMessage('${type}') error:`, chrome.runtime.lastError.message);
          resolve({ error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || {});
      });
    } catch (err) {
      console.error(`[Tabatha] sendMessage('${type}') threw:`, err);
      resolve({ error: err.message });
    }
  });
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
