import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '../components/ui/GlassCard';
import { Tooltip } from '../components/ui/Tooltip';

function formatDuration(ms) {
  if (!ms || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const inputStyle = {
  padding: '3px 6px', fontSize: '11px', borderRadius: '3px',
  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text-primary)', outline: 'none',
};

// Log type configuration
const LOG_TYPES = {
  tab:     { icon: '📄', label: 'Tab Activity', color: '#42a5f5' },
  intent:  { icon: '🎯', label: 'Intent Change', color: '#ab47bc' },
  focus:   { icon: '🔍', label: 'Focus Session', color: '#ff9800' },
  clock:   { icon: '⏱️', label: 'Clock Stint', color: '#66bb6a' },
  break:   { icon: '☕', label: 'Break', color: '#ffa726' },
  context: { icon: '🏷️', label: 'Context Set', color: '#26a69a' },
  blocked: { icon: '🚫', label: 'Blocked Site', color: '#ef5350' },
  task:    { icon: '✅', label: 'Task Update', color: '#4caf50' },
};

export function LogsPanel({ intentHistory, tabs, timeTracking, allItems, clockHistory, focusHistory, intentChangeLog }) {
  const [filterDate, setFilterDate] = useState('');
  const [filterIntent, setFilterIntent] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMinDuration, setFilterMinDuration] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [activeTypes, setActiveTypes] = useState(new Set(Object.keys(LOG_TYPES)));

  const toggleType = (type) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const logs = useMemo(() => {
    const list = [];

    // 1. Tab Activity (active tabs with time)
    Object.entries(tabs).forEach(([id, tab]) => {
      const duration = (timeTracking.byTab || {})[id] || 0;
      if (duration > 0 || tab.context) {
        let domain = '';
        try { domain = new URL(tab.url).hostname; } catch(e) { domain = 'unknown'; }
        list.push({
          id: `tab-${id}`, logType: 'tab',
          date: new Date().toISOString(),
          label: tab.customTitle || tab.title || tab.url || 'Untitled',
          intent: tab.context || tab.intent || '',
          category: tab.category || '',
          domain, duration,
        });
      }
    });

    // 2. Intent Change (from intentHistory)
    if (intentHistory && Array.isArray(intentHistory)) {
      intentHistory.forEach((entry, idx) => {
        let domain = '';
        try { domain = new URL(entry.url).hostname; } catch(e) { domain = ''; }
        list.push({
          id: `intent-${idx}`, logType: 'intent',
          date: entry.timestamp || entry.changedAt || new Date().toISOString(),
          label: entry.context || entry.title || 'Intent set',
          intent: entry.context || '',
          category: entry.category || '',
          domain, duration: entry.duration || 0,
        });
      });
    }

    // 3. Focus Session (from focusHistory)
    if (focusHistory && Array.isArray(focusHistory)) {
      focusHistory.forEach((entry, idx) => {
        list.push({
          id: `focus-${idx}`, logType: 'focus',
          date: entry.completedAt || entry.createdAt || new Date().toISOString(),
          label: entry.label || 'Focus session',
          intent: entry.label || '',
          category: entry.funnelStage || '',
          domain: '', duration: entry.elapsedMs || 0,
        });
      });
    }

    // 4. Clock Stint (from clockHistory)
    if (clockHistory && Array.isArray(clockHistory)) {
      clockHistory.forEach((stint, idx) => {
        const dur = stint.endTime && stint.startTime ? new Date(stint.endTime) - new Date(stint.startTime) : 0;
        list.push({
          id: `clock-${idx}`, logType: stint.type === 'break' ? 'break' : 'clock',
          date: stint.startTime || new Date().toISOString(),
          label: stint.type === 'break' ? `Break${stint.note ? ': ' + stint.note : ''}` : `Clock stint`,
          intent: stint.focusLabel || '',
          category: stint.type || 'work',
          domain: '', duration: dur,
        });
      });
    }

    // 5. Context Set (from intentChangeLog)
    if (intentChangeLog && Array.isArray(intentChangeLog)) {
      intentChangeLog.forEach((entry, idx) => {
        let domain = '';
        try { domain = new URL(entry.url).hostname; } catch(e) {}
        list.push({
          id: `ctx-${idx}`, logType: 'context',
          date: entry.timestamp || new Date().toISOString(),
          label: `${entry.from || '(none)'} → ${entry.to || '(none)'}`,
          intent: entry.to || '',
          category: entry.source || 'manual',
          domain, duration: 0,
        });
      });
    }

    // Sort by date descending
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [tabs, timeTracking, intentHistory, focusHistory, clockHistory, intentChangeLog]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (!activeTypes.has(log.logType)) return false;
      if (filterDate && !log.date.startsWith(filterDate)) return false;
      if (filterIntent && !log.intent.toLowerCase().includes(filterIntent.toLowerCase())) return false;
      if (filterCategory && !log.category.toLowerCase().includes(filterCategory.toLowerCase())) return false;
      if (filterMinDuration && log.duration < parseInt(filterMinDuration) * 60000) return false;
      return true;
    });
  }, [logs, activeTypes, filterDate, filterIntent, filterCategory, filterMinDuration]);

  const visibleLogs = filteredLogs.slice(0, visibleCount);
  const hasMore = filteredLogs.length > visibleCount;

  const uniqueCategories = useMemo(() => Array.from(new Set(logs.map(l => l.category).filter(Boolean))).sort(), [logs]);
  const hasFilters = filterDate || filterIntent || filterCategory || filterMinDuration;

  // Count by type
  const typeCounts = useMemo(() => {
    const counts = {};
    Object.keys(LOG_TYPES).forEach(k => counts[k] = 0);
    logs.forEach(l => { if (counts[l.logType] !== undefined) counts[l.logType]++; });
    return counts;
  }, [logs]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
      {/* Type filter chips */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {Object.entries(LOG_TYPES).map(([key, cfg]) => {
          const isActive = activeTypes.has(key);
          const count = typeCounts[key];
          return (
            <button key={key} onClick={() => toggleType(key)} style={{
              background: isActive ? cfg.color + '22' : 'transparent',
              border: `1px solid ${isActive ? cfg.color : 'var(--color-border)'}`,
              color: isActive ? cfg.color : 'var(--color-text-muted)',
              borderRadius: '10px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer',
              fontWeight: isActive ? 600 : 400, display: 'flex', alignItems: 'center', gap: '3px',
              opacity: count === 0 ? 0.4 : 1,
              transition: 'all 0.15s ease',
            }}>
              {cfg.icon} {cfg.label} {count > 0 && <span style={{ fontSize: '9px', opacity: 0.7 }}>({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Compact filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <Tooltip text={filtersOpen ? 'Hide filters' : 'Show filters'}>
          <button onClick={() => setFiltersOpen(!filtersOpen)} style={{
            background: hasFilters ? 'var(--color-accent-primary)22' : 'var(--color-surface)',
            border: `1px solid ${hasFilters ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
            borderRadius: '4px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer',
            color: hasFilters ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
          }}>🔍{hasFilters ? ` (${[filterDate, filterIntent, filterCategory, filterMinDuration].filter(Boolean).length})` : ''}</button>
        </Tooltip>
        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''}</span>
        {hasFilters && (
          <button onClick={() => { setFilterDate(''); setFilterIntent(''); setFilterCategory(''); setFilterMinDuration(''); }}
            style={{ background: 'transparent', border: 'none', color: '#ef5350', fontSize: '10px', cursor: 'pointer', padding: 0 }}>✕ Clear</button>
        )}
      </div>

      <AnimatePresence>
        {filtersOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '6px 8px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...inputStyle, width: '120px' }} />
              <input type="text" placeholder="Intent..." value={filterIntent} onChange={e => setFilterIntent(e.target.value)} style={{ ...inputStyle, width: '100px' }} />
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inputStyle, width: '110px' }}>
                <option value="">All cats</option>
                {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" min="0" placeholder="Min m" value={filterMinDuration} onChange={e => setFilterMinDuration(e.target.value)} style={{ ...inputStyle, width: '60px' }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <GlassCard style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', backdropFilter: 'var(--surface-blur)', zIndex: 1, boxShadow: '0 1px 0 var(--color-border)' }}>
              <tr>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '10px', width: '24px' }}></th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '10px' }}>Date</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '10px' }}>Details</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '10px' }}>Intent</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '10px', textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>No logs found.</td></tr>
              ) : (
                visibleLogs.map(log => {
                  const cfg = LOG_TYPES[log.logType] || LOG_TYPES.tab;
                  const dateStr = (() => {
                    try {
                      const d = new Date(log.date);
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    } catch { return log.date; }
                  })();
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '5px 6px 5px 10px', textAlign: 'center' }}>
                        <span title={cfg.label} style={{ fontSize: '12px' }}>{cfg.icon}</span>
                      </td>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', fontSize: '10px' }}>{dateStr}</td>
                      <td style={{ padding: '5px 10px', fontWeight: 500, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.label}>
                        {log.label}
                        {log.domain && <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', marginLeft: '4px' }}>({log.domain})</span>}
                      </td>
                      <td style={{ padding: '5px 10px' }}>
                        {log.intent && <span style={{ padding: '1px 4px', background: cfg.color + '22', color: cfg.color, borderRadius: '3px', fontSize: '9px', fontWeight: 600 }}>{log.intent}</span>}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--color-accent-primary)', fontSize: '10px' }}>
                        {log.duration > 0 ? formatDuration(log.duration) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Load more */}
      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <button onClick={() => setVisibleCount(prev => prev + 50)} style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: '4px', padding: '4px 16px', fontSize: '11px', cursor: 'pointer',
            color: 'var(--color-text-muted)',
          }}>
            Load more ({filteredLogs.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </motion.div>
  );
}
