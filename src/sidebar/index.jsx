import React, { useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/global.css';
import { useChromeStorage, sendMessage, useTheme } from '../hooks/useChromeStorage';
import { GlassCard } from '../components/ui/GlassCard';
import { PopButton } from '../components/ui/PopButton';

// ════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════
function formatTime(ms) {
  if (!ms || ms < 1000) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const CATEGORY_ICONS = {
  work: '💼', media: '🎵', meeting: '📹', reference: '📚',
  messaging: '💬', email: '📧', learning: '🎓', entertainment: '🎮', unknown: '❓',
};

const PRIORITY_COLORS = {
  critical: 'var(--color-accent-secondary)', high: '#ff8844',
  medium: 'var(--color-accent-tertiary)', low: 'var(--color-accent-primary)', none: 'transparent',
};

// ════════════════════════════════════════════
// Sidebar Component
// ════════════════════════════════════════════
function Sidebar() {
  const [theme] = useTheme();
  const [tabs] = useChromeStorage('tabs', {});
  const [timeTracking] = useChromeStorage('timeTracking', { byTab: {} });
  const [categories] = useChromeStorage('categories', {});
  const [activePanel, setActivePanel] = useState('tabs');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('lastActive');

  const tabEntries = useMemo(() => {
    let entries = Object.entries(tabs);

    // Filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      entries = entries.filter(([, t]) =>
        (t.title || '').toLowerCase().includes(term) ||
        (t.url || '').toLowerCase().includes(term) ||
        (t.context || '').toLowerCase().includes(term)
      );
    }

    // Sort
    entries.sort(([aId, a], [bId, b]) => {
      switch (sortBy) {
        case 'activeTime':
          return ((timeTracking.byTab || {})[bId] || 0) - ((timeTracking.byTab || {})[aId] || 0);
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'priority': {
          const order = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
          return (order[a.priority] || 4) - (order[b.priority] || 4);
        }
        default: // lastActive
          return new Date(b.lastActive || 0) - new Date(a.lastActive || 0);
      }
    });

    return entries;
  }, [tabs, timeTracking, searchTerm, sortBy]);

  const contextGroups = useMemo(() => {
    const groups = {};
    Object.entries(tabs).forEach(([id, tab]) => {
      const ctx = tab.context || 'No Context';
      if (!groups[ctx]) groups[ctx] = [];
      groups[ctx].push({ id, ...tab });
    });
    return groups;
  }, [tabs]);

  const panels = [
    { id: 'tabs', label: 'Tabs' },
    { id: 'contexts', label: 'Contexts' },
  ];

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>

      {/* Header */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.03em' }}>Tabatha</span>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{Object.keys(tabs).length} tabs</span>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search tabs..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            width: '100%', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: '12px',
            color: 'var(--color-text-primary)', outline: 'none', boxSizing: 'border-box',
            backdropFilter: 'var(--surface-blur)',
          }}
        />

        {/* Nav */}
        <div style={{ display: 'flex', gap: '0', marginTop: '8px' }}>
          {panels.map(p => (
            <button
              key={p.id}
              onClick={() => setActivePanel(p.id)}
              style={{
                flex: 1, background: 'transparent', border: 'none', padding: '6px 0',
                fontSize: '12px', cursor: 'pointer',
                color: activePanel === p.id ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                fontWeight: activePanel === p.id ? 600 : 400,
                borderBottom: activePanel === p.id ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        <AnimatePresence mode="wait">
          {activePanel === 'tabs' && (
            <motion.div key="tabs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {tabEntries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)', fontSize: '12px' }}>
                  {searchTerm ? 'No tabs match your search.' : 'No tracked tabs.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {tabEntries.map(([id, tab]) => {
                    const activeTime = (timeTracking.byTab || {})[id] || 0;
                    const icon = CATEGORY_ICONS[tab.category] || '📄';
                    return (
                      <div
                        key={id}
                        onClick={() => sendMessage('FOCUS_TAB', { tabId: parseInt(id) })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                          backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
                          transition: 'background-color 0.15s ease-out',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-surface)'}
                      >
                        {/* Priority dot */}
                        <div style={{
                          width: '3px', height: '28px', borderRadius: '2px', flexShrink: 0,
                          backgroundColor: PRIORITY_COLORS[tab.priority] || 'transparent',
                        }} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {icon} {tab.title || 'Untitled'}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            {tab.context || 'No context'} {tab.locked ? '🔒' : ''} {tab.urlLocked ? '🔗' : ''}
                          </div>
                        </div>

                        <span style={{
                          fontSize: '10px', fontWeight: 600, flexShrink: 0,
                          color: activeTime > 0 ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {formatTime(activeTime)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activePanel === 'contexts' && (
            <motion.div key="contexts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {Object.entries(contextGroups).map(([ctx, ctxTabs]) => (
                <GlassCard key={ctx} className="p-3" style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{ctx}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{ctxTabs.length}</span>
                  </div>
                  {ctxTabs.map(tab => (
                    <div
                      key={tab.id}
                      onClick={() => sendMessage('FOCUS_TAB', { tabId: parseInt(tab.id) })}
                      style={{ fontSize: '11px', padding: '4px 0', cursor: 'pointer', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {CATEGORY_ICONS[tab.category] || '📄'} {tab.title || 'Untitled'}
                    </div>
                  ))}
                </GlassCard>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Mount
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Sidebar />);
