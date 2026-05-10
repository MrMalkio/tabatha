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

export function LogsPanel({ intentHistory, tabs, timeTracking, allItems }) {
  const [filterDate, setFilterDate] = useState('');
  const [filterIntent, setFilterIntent] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMinDuration, setFilterMinDuration] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const logs = useMemo(() => {
    const list = [];
    Object.entries(tabs).forEach(([id, tab]) => {
      const duration = (timeTracking.byTab || {})[id] || 0;
      if (duration > 0 || tab.context) {
        list.push({
          id: `tab-${id}`, date: new Date().toISOString().split('T')[0],
          type: 'Active Tab', intent: tab.context || 'None',
          category: tab.category || 'Uncategorized',
          domain: tab.url ? new URL(tab.url).hostname : 'Unknown',
          duration, title: tab.title || tab.url, status: 'Active'
        });
      }
    });
    if (intentHistory && Array.isArray(intentHistory)) {
      intentHistory.forEach((entry, idx) => {
        list.push({
          id: `hist-${idx}`, date: new Date(entry.timestamp).toISOString().split('T')[0],
          type: 'History', intent: entry.context || 'None',
          category: entry.category || 'Uncategorized',
          domain: entry.url ? new URL(entry.url).hostname : 'Unknown',
          duration: entry.duration || 0, title: entry.title || entry.url || 'Unknown',
          status: 'Archived'
        });
      });
    }
    return list.sort((a, b) => new Date(b.date) - new Date(a.date) || b.duration - a.duration);
  }, [tabs, timeTracking, intentHistory]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (filterDate && log.date !== filterDate) return false;
      if (filterIntent && !log.intent.toLowerCase().includes(filterIntent.toLowerCase())) return false;
      if (filterCategory && !log.category.toLowerCase().includes(filterCategory.toLowerCase())) return false;
      if (filterMinDuration) { if (log.duration < parseInt(filterMinDuration) * 60000) return false; }
      return true;
    });
  }, [logs, filterDate, filterIntent, filterCategory, filterMinDuration]);

  const uniqueCategories = useMemo(() => Array.from(new Set(logs.map(l => l.category))).sort(), [logs]);
  const hasFilters = filterDate || filterIntent || filterCategory || filterMinDuration;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
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
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '10px' }}>Date</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '10px' }}>Intent</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '10px' }}>Cat</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '10px' }}>Domain</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '10px', textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>No logs found.</td></tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', fontSize: '10px' }}>{log.date}</td>
                    <td style={{ padding: '5px 10px', fontWeight: 500 }}>{log.intent}</td>
                    <td style={{ padding: '5px 10px' }}><span style={{ padding: '1px 4px', background: 'var(--color-border)', borderRadius: '3px', fontSize: '9px' }}>{log.category}</span></td>
                    <td style={{ padding: '5px 10px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.title}>{log.domain}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--color-accent-primary)', fontSize: '10px' }}>{formatDuration(log.duration)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </motion.div>
  );
}
