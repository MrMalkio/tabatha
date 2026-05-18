import React, { useState, useMemo } from 'react';
import { Tooltip } from '../components/ui/Tooltip';

const DAYS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Generate last 365 days as YYYY-MM-DD strings
function getLast365Days() {
  const days = [];
  const now = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

// Color scale — 5 levels (empty, L1, L2, L3, L4)
function getColors() {
  return {
    empty: 'var(--color-surface)',
    border: 'var(--color-border)',
    levels: [
      'var(--color-surface)',          // 0
      'rgba(var(--accent-rgb, 59,130,246), 0.2)',  // low
      'rgba(var(--accent-rgb, 59,130,246), 0.4)',  // medium
      'rgba(var(--accent-rgb, 59,130,246), 0.65)', // high
      'var(--color-accent-primary)',                // max
    ],
  };
}

function getLevel(value, max) {
  if (!value || value === 0) return 0;
  const ratio = value / Math.max(max, 1);
  if (ratio < 0.15) return 1;
  if (ratio < 0.4) return 2;
  if (ratio < 0.7) return 3;
  return 4;
}

function formatHeatmapValue(value, view) {
  if (view === 'followthrough') return `${value} follow-through ${value === 1 ? 'action' : 'actions'}`;
  const h = Math.floor(value / 3600000);
  const m = Math.floor((value % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ActivityHeatmap({ timeTracking, clockHistory, focusHistory, companionSessions }) {
  const [view, setView] = useState('browser'); // browser | overall | followthrough
  const days = useMemo(() => getLast365Days(), []);

  // Aggregate data per day
  const dailyData = useMemo(() => {
    const map = {};
    days.forEach(d => map[d] = { browser: 0, desktop: 0, completions: 0 });

    // Browser time — from timeTracking (aggregate byTab values)
    if (timeTracking?.byTab) {
      const today = new Date().toISOString().split('T')[0];
      const totalMs = Object.values(timeTracking.byTab).reduce((a, b) => a + (b || 0), 0);
      if (map[today]) map[today].browser += totalMs;
    }

    // Clock history — daily work time
    if (clockHistory && Array.isArray(clockHistory)) {
      clockHistory.forEach(session => {
        if (!session.clockInAt) return;
        const day = new Date(session.clockInAt).toISOString().split('T')[0];
        if (map[day]) map[day].browser += (session.workMs || 0);
      });
    }

    // Companion sessions — desktop time
    if (companionSessions && Array.isArray(companionSessions)) {
      companionSessions.forEach(s => {
        if (!s.start) return;
        const day = new Date(s.start).toISOString().split('T')[0];
        const dur = s.end ? new Date(s.end) - new Date(s.start) : 0;
        if (map[day]) map[day].desktop += dur;
      });
    }

    // Focus completions + checkpoint notes — follow-through
    if (focusHistory && Array.isArray(focusHistory)) {
      focusHistory.forEach(entry => {
        // Count completions
        if (entry.completedAt) {
          const day = new Date(entry.completedAt).toISOString().split('T')[0];
          if (map[day]) map[day].completions += 1;
        }
        // Count CPN submissions
        if (entry.checkpoint && Array.isArray(entry.checkpoint)) {
          entry.checkpoint.forEach(cpn => {
            if (!cpn.at) return;
            const day = new Date(cpn.at).toISOString().split('T')[0];
            if (map[day]) map[day].completions += 1;
          });
        }
      });
    }

    return map;
  }, [days, timeTracking, clockHistory, companionSessions, focusHistory]);

  // Get values for current view
  const values = useMemo(() => {
    return days.map(d => {
      const data = dailyData[d] || { browser: 0, desktop: 0, completions: 0 };
      if (view === 'browser') return { date: d, value: data.browser };
      if (view === 'overall') return { date: d, value: data.browser + data.desktop };
      return { date: d, value: data.completions };
    });
  }, [days, dailyData, view]);

  const maxValue = useMemo(() => Math.max(...values.map(v => v.value), 1), [values]);
  const colors = getColors();

  // Build weeks (columns of 7 days)
  const weeks = useMemo(() => {
    const w = [];
    // Pad start to align with day of week
    const firstDayOfWeek = new Date(days[0]).getDay(); // 0=Sun
    const padded = Array(firstDayOfWeek).fill(null).concat(values);
    for (let i = 0; i < padded.length; i += 7) {
      w.push(padded.slice(i, i + 7));
    }
    return w;
  }, [values, days]);

  // Month labels
  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const firstDay = week.find(d => d !== null);
      if (firstDay) {
        const month = new Date(firstDay.date).getMonth();
        if (month !== lastMonth) {
          labels.push({ weekIndex: wi, label: MONTHS[month] });
          lastMonth = month;
        }
      }
    });
    return labels;
  }, [weeks]);

  const CELL_SIZE = 11;
  const CELL_GAP = 2;

  const viewTabs = [
    { id: 'browser', label: '🌐 Browser', color: '#64b5f6' },
    { id: 'overall', label: '📊 Overall', color: 'var(--color-accent-primary)' },
    { id: 'followthrough', label: '✅ Follow-Through', color: '#66bb6a' },
  ];

  return (
    <div style={{ marginBottom: '12px' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {viewTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              style={{
                background: view === tab.id ? tab.color + '22' : 'transparent',
                border: `1px solid ${view === tab.id ? tab.color : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-sm)',
                color: view === tab.id ? tab.color : 'var(--color-text-muted)',
                padding: '2px 8px', fontSize: '10px', cursor: 'pointer', fontWeight: 600,
              }}
            >{tab.label}</button>
          ))}
        </div>
        <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>Last 365 days</span>
      </div>

      {/* Heatmap grid */}
      <div style={{ display: 'flex', gap: '0', overflow: 'hidden' }}>
        {/* Day labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${CELL_GAP}px`, marginRight: '4px', paddingTop: '16px' }}>
          {DAYS.map((d, i) => (
            <div key={i} style={{ height: `${CELL_SIZE}px`, fontSize: '9px', color: 'var(--color-text-muted)', lineHeight: `${CELL_SIZE}px`, textAlign: 'right', width: '20px' }}>{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          {/* Month labels */}
          <div style={{ height: '14px', position: 'relative', marginBottom: '2px' }}>
            {monthLabels.map((m, i) => (
              <span key={i} style={{ position: 'absolute', left: `${m.weekIndex * (CELL_SIZE + CELL_GAP)}px`, fontSize: '9px', color: 'var(--color-text-muted)' }}>{m.label}</span>
            ))}
          </div>

          {/* Cells */}
          <div style={{ display: 'flex', gap: `${CELL_GAP}px` }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: `${CELL_GAP}px` }}>
                {week.map((cell, di) => {
                  if (cell === null) return <div key={di} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
                  const level = getLevel(cell.value, maxValue);
                  const d = new Date(cell.date);
                  const dayName = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  const displayValue = cell.value > 0 ? formatHeatmapValue(cell.value, view) : 'No activity';
                  return (
                    <Tooltip key={di} text={`${dayName} — ${displayValue}`}>
                      <div style={{
                        width: CELL_SIZE, height: CELL_SIZE,
                        borderRadius: '2px',
                        background: colors.levels[level],
                        border: `1px solid ${level > 0 ? 'transparent' : colors.border}`,
                        cursor: 'pointer',
                        transition: 'transform 0.1s',
                      }}
                      onMouseEnter={e => e.target.style.transform = 'scale(1.3)'}
                      onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                      />
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', marginTop: '4px' }}>
        <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>Less</span>
        {colors.levels.map((c, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: '2px', background: c, border: i === 0 ? `1px solid ${colors.border}` : '1px solid transparent' }} />
        ))}
        <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>More</span>
      </div>
    </div>
  );
}
