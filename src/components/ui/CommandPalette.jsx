import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * CommandPalette — Global fuzzy search + quick action menu.
 * Triggered by Ctrl+K / Cmd+K.
 * Searches across: focuses, intents, tasks, projects, clients, tabs, settings.
 */
export function CommandPalette({ isOpen, onClose, actions, allItems, tabs, orgData, onNavigate }) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Fuzzy match helper
  const fuzzyMatch = useCallback((text, q) => {
    if (!q) return true;
    const lower = text.toLowerCase();
    const qLower = q.toLowerCase();
    // Simple substring + word-start match
    if (lower.includes(qLower)) return true;
    // Character-by-character fuzzy
    let qi = 0;
    for (let i = 0; i < lower.length && qi < qLower.length; i++) {
      if (lower[i] === qLower[qi]) qi++;
    }
    return qi === qLower.length;
  }, []);

  const fuzzyScore = useCallback((text, q) => {
    if (!q) return 0;
    const lower = text.toLowerCase();
    const qLower = q.toLowerCase();
    if (lower === qLower) return 100;
    if (lower.startsWith(qLower)) return 90;
    if (lower.includes(qLower)) return 70;
    return 30; // fuzzy char match
  }, []);

  // Build results
  const results = useMemo(() => {
    const items = [];

    // Actions (always available, filtered by query)
    const staticActions = [
      { type: 'action', icon: '🎯', label: 'Set new focus', action: () => { onNavigate?.('focus'); onClose(); } },
      { type: 'action', icon: '☕', label: 'Take a break', action: () => { actions?.toggleBreak?.(); onClose(); } },
      { type: 'action', icon: '⏱', label: 'Clock in/out', action: () => { onNavigate?.('clock'); onClose(); } },
      { type: 'action', icon: '📋', label: 'Create new task', action: () => { onNavigate?.('tasks'); onClose(); } },
      { type: 'action', icon: '🏢', label: 'View projects', action: () => { onNavigate?.('projects'); onClose(); } },
      { type: 'action', icon: '🏛️', label: 'View org hierarchy', action: () => { onNavigate?.('org'); onClose(); } },
      { type: 'action', icon: '⚙️', label: 'Open settings', action: () => { window.open(chrome.runtime.getURL('settings.html')); onClose(); } },
      { type: 'action', icon: '🎨', label: 'Switch theme', action: () => { onNavigate?.('theme'); onClose(); } },
    ];
    
    for (const a of staticActions) {
      if (fuzzyMatch(a.label, query)) items.push({ ...a, score: fuzzyScore(a.label, query) });
    }

    // Focuses / Intents
    if (allItems) {
      for (const item of allItems.slice(0, 50)) {
        const label = item.label || item.name || 'Unnamed';
        if (fuzzyMatch(label, query)) {
          items.push({ type: 'focus', icon: item.type === 'intent' ? '🎯' : '🔵', label, subtitle: item.focusState || item.stage || '', score: fuzzyScore(label, query), action: () => { onClose(); } });
        }
      }
    }

    // Tasks from org registry
    if (orgData?.taskList) {
      for (const task of orgData.taskList.slice(0, 30)) {
        if (fuzzyMatch(task.name, query)) {
          items.push({ type: 'task', icon: '✏️', label: task.name, subtitle: task.status, score: fuzzyScore(task.name, query), action: () => { onNavigate?.('tasks'); onClose(); } });
        }
      }
    }

    // Projects
    if (orgData?.projectList) {
      for (const proj of orgData.projectList.slice(0, 20)) {
        if (fuzzyMatch(proj.name, query)) {
          items.push({ type: 'project', icon: '📁', label: proj.name, subtitle: 'Project', score: fuzzyScore(proj.name, query), action: () => { onNavigate?.('projects'); onClose(); } });
        }
      }
    }

    // Clients
    if (orgData?.clientList) {
      for (const cli of orgData.clientList.slice(0, 20)) {
        if (fuzzyMatch(cli.name, query)) {
          items.push({ type: 'client', icon: '👤', label: cli.name, subtitle: 'Client', score: fuzzyScore(cli.name, query), action: () => { onNavigate?.('projects'); onClose(); } });
        }
      }
    }

    // Open tabs
    if (tabs) {
      const tabArr = Object.values(tabs).slice(0, 30);
      for (const tab of tabArr) {
        const label = tab.title || tab.url || 'Tab';
        if (fuzzyMatch(label, query)) {
          items.push({ type: 'tab', icon: '📑', label, subtitle: tab.context || '', score: fuzzyScore(label, query), action: () => { chrome.tabs.update(Number(tab.tabId || tab.id), { active: true }); onClose(); } });
        }
      }
    }

    // Sort by score (highest first), limit to 15
    return items.sort((a, b) => b.score - a.score).slice(0, 15);
  }, [query, allItems, orgData, tabs, actions, onClose, onNavigate, fuzzyMatch, fuzzyScore]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' && results[selectedIdx]) { results[selectedIdx].action(); return; }
  };

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIdx];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', paddingTop: '15vh',
        }}
      >
        <motion.div
          initial={{ y: -20, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -20, opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          onClick={e => e.stopPropagation()}
          style={{
            width: '540px', maxWidth: '90vw', maxHeight: '60vh',
            background: 'var(--color-bg-base)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg, 12px)', overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '16px', color: 'var(--color-text-muted)' }}>🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Search focuses, tasks, tabs, actions..."
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--color-text-primary)', fontSize: '15px', fontWeight: 500,
              }}
            />
            <kbd style={{ fontSize: '10px', color: 'var(--color-text-muted)', background: 'var(--color-surface)', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--color-border)' }}>ESC</kbd>
          </div>

          {/* Results */}
          <div ref={listRef} style={{ maxHeight: '340px', overflowY: 'auto' }}>
            {results.length === 0 && query && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                No results for "{query}"
              </div>
            )}
            {results.map((r, i) => (
              <div
                key={`${r.type}-${r.label}-${i}`}
                onClick={r.action}
                onMouseEnter={() => setSelectedIdx(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 16px', cursor: 'pointer',
                  background: selectedIdx === i ? 'var(--color-accent-primary)15' : 'transparent',
                  borderLeft: selectedIdx === i ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{ fontSize: '15px', width: '22px', textAlign: 'center' }}>{r.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.label}
                  </div>
                  {r.subtitle && (
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '1px' }}>{r.subtitle}</div>
                  )}
                </div>
                <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{r.type}</span>
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
            <span>↑↓ Navigate</span>
            <span>⏎ Select</span>
            <span>ESC Close</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
