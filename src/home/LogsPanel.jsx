import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '../components/ui/GlassCard';
import { Tooltip } from '../components/ui/Tooltip';

// Formats ms into HH:MM:SS
function formatDuration(ms) {
  if (!ms || ms < 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function LogsPanel({ intentHistory, tabs, timeTracking, allItems }) {
  const [filterDate, setFilterDate] = useState('');
  const [filterIntent, setFilterIntent] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMinDuration, setFilterMinDuration] = useState('');

  // Transform data into a flat log format
  // We can merge data from intentHistory and current active tabs to show comprehensive logs
  const logs = useMemo(() => {
    const list = [];
    
    // Process current tabs
    Object.entries(tabs).forEach(([id, tab]) => {
      const duration = (timeTracking.byTab || {})[id] || 0;
      if (duration > 0 || tab.context) {
        list.push({
          id: `tab-${id}`,
          date: new Date().toISOString().split('T')[0], // Today
          type: 'Active Tab',
          intent: tab.context || 'None',
          category: tab.category || 'Uncategorized',
          domain: tab.url ? new URL(tab.url).hostname : 'Unknown',
          duration,
          title: tab.title || tab.url,
          status: 'Active'
        });
      }
    });

    // Process history
    if (intentHistory && Array.isArray(intentHistory)) {
      intentHistory.forEach((entry, idx) => {
        list.push({
          id: `hist-${idx}`,
          date: new Date(entry.timestamp).toISOString().split('T')[0],
          type: 'History',
          intent: entry.context || 'None',
          category: entry.category || 'Uncategorized',
          domain: entry.url ? new URL(entry.url).hostname : 'Unknown',
          duration: entry.duration || 0, // History might have duration if saved
          title: entry.title || entry.url || 'Unknown',
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
      if (filterMinDuration) {
        const minMs = parseInt(filterMinDuration) * 60000;
        if (log.duration < minMs) return false;
      }
      return true;
    });
  }, [logs, filterDate, filterIntent, filterCategory, filterMinDuration]);

  // Unique categories for dropdown
  const uniqueCategories = useMemo(() => {
    const cats = new Set(logs.map(l => l.category));
    return Array.from(cats).sort();
  }, [logs]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
      <GlassCard style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)', marginBottom: '12px', fontWeight: 600 }}>Filters</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Date</label>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', outline: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Intent Search</label>
            <input type="text" placeholder="Search intent..." value={filterIntent} onChange={e => setFilterIntent(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', outline: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Category</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', outline: 'none' }}>
              <option value="">All Categories</option>
              {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Min Duration (mins)</label>
            <input type="number" min="0" placeholder="e.g. 5" value={filterMinDuration} onChange={e => setFilterMinDuration(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', outline: 'none' }} />
          </div>
        </div>
      </GlassCard>

      <GlassCard style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', backdropFilter: 'var(--surface-blur)', zIndex: 1, boxShadow: '0 1px 0 var(--color-border)' }}>
              <tr>
                <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Date</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Intent</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Category</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Domain / Detail</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>No logs found matching your filters.</td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>{log.date}</td>
                    <td style={{ padding: '8px 16px', fontWeight: 500 }}>{log.intent}</td>
                    <td style={{ padding: '8px 16px' }}><span style={{ padding: '2px 6px', background: 'var(--color-border)', borderRadius: '4px', fontSize: '10px' }}>{log.category}</span></td>
                    <td style={{ padding: '8px 16px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.title}>{log.domain}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--color-accent-primary)' }}>{formatDuration(log.duration)}</td>
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
