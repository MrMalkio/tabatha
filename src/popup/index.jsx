import React, { useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { motion } from 'framer-motion';
import '../styles/global.css';
import { useChromeStorage, sendMessage, useTheme } from '../hooks/useChromeStorage';

// ════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════
const CATEGORY_ICONS = {
  work: '💼', media: '🎵', meeting: '📹', reference: '📚',
  messaging: '💬', email: '📧', learning: '🎓', entertainment: '🎮', unknown: '❓',
};

function formatTime(ms) {
  if (!ms || ms < 1000) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ════════════════════════════════════════════
// Popup Component — Quick Search & Switch
// ════════════════════════════════════════════
function Popup() {
  const [theme] = useTheme();
  const [tabs] = useChromeStorage('tabs', {});
  const [timeTracking] = useChromeStorage('timeTracking', { byTab: {} });
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTabs = useMemo(() => {
    let entries = Object.entries(tabs);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      entries = entries.filter(([, t]) =>
        (t.title || '').toLowerCase().includes(term) ||
        (t.url || '').toLowerCase().includes(term)
      );
    }
    // Sort by last active
    entries.sort(([, a], [, b]) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0));
    return entries.slice(0, 15); // Cap at 15 for popup
  }, [tabs, searchTerm]);

  return (
    <div style={{
      width: '400px', height: '500px', display: 'flex', flexDirection: 'column',
      backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
      fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        padding: '12px', borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-surface)', backdropFilter: 'var(--surface-blur)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em' }}>⚡ Quick Switch</span>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{Object.keys(tabs).length} tabs</span>
        </div>
        <input
          type="text"
          placeholder="Search tabs... (Ctrl+Space)"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          autoFocus
          style={{
            width: '100%', background: 'transparent', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: '13px',
            color: 'var(--color-text-primary)', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tab List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {filteredTabs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)', fontSize: '12px' }}>
            {searchTerm ? 'No matching tabs.' : 'No open tabs.'}
          </div>
        ) : (
          filteredTabs.map(([id, tab], i) => {
            const activeTime = (timeTracking.byTab || {})[id] || 0;
            const icon = CATEGORY_ICONS[tab.category] || '📄';
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15, delay: i * 0.02 }}
                onClick={() => {
                  sendMessage('FOCUS_TAB', { tabId: parseInt(id) });
                  window.close();
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer', marginBottom: '2px',
                  transition: 'background-color 0.1s ease-out',
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tab.title || 'Untitled'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tab.context || new URL(tab.url || 'about:blank').hostname}
                  </div>
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 600, flexShrink: 0,
                  color: activeTime > 0 ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatTime(activeTime)}
                </span>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Mount
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Popup />);
