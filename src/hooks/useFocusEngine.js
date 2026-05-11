import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { sendMessage } from './useChromeStorage';

/**
 * useFocusEngine — React hook for the Focus Engine.
 * Provides active focus, queue, history, and all actions.
 * Runs a local interval for live countdown/countup display.
 */

const EMPTY_ENGINE = { activeFocusId: null, items: {}, history: [] };

export function useFocusEngine() {
  const [engine, setEngine] = useState(EMPTY_ENGINE);
  const tickRef = useRef(null);
  const [tick, setTick] = useState(0); // forces re-render every second

  // Load initial state
  useEffect(() => {
    sendMessage('GET_FOCUS_ENGINE').then(res => {
      if (res?.focusEngine) setEngine(res.focusEngine);
    }).catch(() => {});
  }, []);

  // Listen for updates from background
  useEffect(() => {
    const listener = (message) => {
      if (message.type === 'FOCUS_ENGINE_UPDATED') {
        sendMessage('GET_FOCUS_ENGINE').then(res => {
          if (res?.focusEngine) setEngine(res.focusEngine);
        }).catch(() => {});
      }
    };
    
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, []);

  // Tick every second for live countdown/countup
  useEffect(() => {
    tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  // Derived: active focus with computed time
  const activeFocus = useMemo(() => {
    if (!engine.activeFocusId) return null;
    const item = engine.items[engine.activeFocusId];
    if (!item) return null;

    // Calculate live elapsed
    let liveElapsed = item.elapsedMs || 0;
    if ((item.focusState === 'active' || item.focusState === 'drifted') && item.lastResumedAt) {
      liveElapsed += (Date.now() - new Date(item.lastResumedAt).getTime());
    }

    const totalTimerMs = (item.timerMinutes || 15) * 60 * 1000;
    const remainingMs = Math.max(0, totalTimerMs - liveElapsed);
    const overMs = Math.max(0, liveElapsed - totalTimerMs);

    return {
      ...item,
      liveElapsedMs: liveElapsed,
      remainingMs,
      overMs,
      isOver: liveElapsed > totalTimerMs,
    };
  }, [engine, tick]);

  // Derived: all items (excluding active)
  const allItems = useMemo(() => {
    return Object.values(engine.items)
      .filter(i => i.id !== engine.activeFocusId)
      .map(item => {
        let liveElapsed = item.elapsedMs || 0;
        if ((item.focusState === 'active' || item.focusState === 'drifted') && item.lastResumedAt) {
          liveElapsed += (Date.now() - new Date(item.lastResumedAt).getTime());
        }
        return { ...item, liveElapsedMs: liveElapsed };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [engine, tick]);

  const history = engine.history || [];

  // Actions
  const actions = useMemo(() => ({
    startFocus: (label, timerMinutes = 15, tags = {}) =>
      sendMessage('START_FOCUS', { label, timerMinutes, tags }),
    
    addFocus: (label, timerMinutes = 15, tags = {}) =>
      sendMessage('ADD_FOCUS', { label, timerMinutes, tags }),
    
    switchFocus: (focusId) =>
      sendMessage('SWITCH_FOCUS', { focusId }),
    
    completeFocus: (focusId) =>
      sendMessage('COMPLETE_FOCUS', { focusId }),
    
    extendTimer: (focusId, extraMinutes = 5) =>
      sendMessage('EXTEND_FOCUS_TIMER', { focusId, extraMinutes }),
    
    setFunnelStage: (focusId, stage) =>
      sendMessage('SET_FUNNEL_STAGE', { focusId, stage }),
    
    updateTags: (focusId, tags) =>
      sendMessage('UPDATE_FOCUS_TAGS', { focusId, tags }),

    updateFocus: (focusId, updates) =>
      sendMessage('UPDATE_FOCUS', { focusId, ...updates }),

    renameFocus: (focusId, newLabel) =>
      sendMessage('RENAME_FOCUS', { focusId, newLabel }),

    pauseFocus: (focusId) =>
      sendMessage('PAUSE_FOCUS', { focusId }),

    resumeFocus: (focusId) =>
      sendMessage('RESUME_FOCUS', { focusId }),
  }), []);

  return { activeFocus, allItems, history, actions, engine };
}

/**
 * Format milliseconds to a human-readable timer string.
 * Returns countdown format (MM:SS) or countup (+MM:SS).
 */
export function formatTimer(ms, isOver = false) {
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const str = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return isOver ? `+${str}` : str;
}

export function formatElapsed(ms) {
  if (!ms || ms < 1000) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// Funnel stage metadata
export const FUNNEL_STAGES = {
  unsorted: { label: 'Unsorted', icon: '📥', color: '#888' },
  todo: { label: 'Todo', icon: '📋', color: '#64b5f6' },
  addressing: { label: 'Addressing', icon: '⚡', color: '#ab47bc' },
  focus: { label: 'Focus', icon: '🎯', color: '#ff9800' },
  roadblocked: { label: 'Roadblocked', icon: '🚧', color: '#ef5350' },
  resolved: { label: 'Resolved', icon: '✅', color: '#66bb6a' },
  complete: { label: 'Complete', icon: '🏁', color: '#4caf50' },
};
