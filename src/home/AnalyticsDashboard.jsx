import React, { useMemo } from 'react';
import { GlassCard } from '../components/ui/GlassCard';

/**
 * AnalyticsDashboard — Visual productivity analytics.
 * Shows: daily breakdown, top focuses, context distribution, streak, and trends.
 * Uses data from focuses, intents, time tracking, and org registry.
 */
export function AnalyticsDashboard({ allItems, timeTracking, intentHistory, orgData, clockSession }) {
  // ── Computed metrics ──
  const metrics = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    
    // Today's focuses
    const todayFocuses = (allItems || []).filter(item => {
      const ts = item.startedAt || item.createdAt;
      return ts && ts.startsWith(todayStr);
    });

    // Total focus time today (from time tracking)
    let todayFocusMs = 0;
    if (timeTracking) {
      Object.values(timeTracking).forEach(tt => {
        if (tt.date === todayStr) todayFocusMs += (tt.totalTime || 0);
      });
    }

    // Intent completion rate (last 7 days)
    const recentIntents = (intentHistory || []).filter(i => new Date(i.createdAt || i.startedAt) >= weekAgo);
    const resolvedCount = recentIntents.filter(i => i.stage === 'resolved' || i.status === 'completed').length;
    const completionRate = recentIntents.length > 0 ? Math.round((resolvedCount / recentIntents.length) * 100) : 0;

    // Top focus labels (most frequent)
    const labelCounts = {};
    (allItems || []).forEach(item => {
      const label = item.label || item.name;
      if (label) labelCounts[label] = (labelCounts[label] || 0) + 1;
    });
    const topFocuses = Object.entries(labelCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    // Context distribution (realms)
    const realmCounts = { business: 0, personal: 0, unset: 0 };
    (allItems || []).forEach(item => {
      const realm = item.tags?.realm;
      if (realm === 'business') realmCounts.business++;
      else if (realm === 'personal') realmCounts.personal++;
      else realmCounts.unset++;
    });

    // Streak — consecutive days with activity
    let streak = 0;
    const daySet = new Set();
    (intentHistory || []).forEach(i => {
      const d = (i.createdAt || i.startedAt || '').split('T')[0];
      if (d) daySet.add(d);
    });
    const checkDate = new Date(now);
    while (true) {
      const ds = checkDate.toISOString().split('T')[0];
      if (daySet.has(ds)) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
      else break;
    }

    // Task stats from org
    const totalTasks = orgData?.taskList?.length || 0;
    const openTasks = orgData?.taskList?.filter(t => t.status !== 'complete')?.length || 0;

    return {
      todayFocuses: todayFocuses.length,
      todayFocusMin: Math.round(todayFocusMs / 60000),
      completionRate,
      resolvedCount,
      recentTotal: recentIntents.length,
      topFocuses,
      realmCounts,
      streak,
      totalTasks,
      openTasks,
    };
  }, [allItems, timeTracking, intentHistory, orgData]);

  const formatMin = (m) => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;

  const statCard = (icon, label, value, sub) => (
    <GlassCard style={{ padding: '12px', textAlign: 'center', flex: '1 1 100px', minWidth: '100px' }}>
      <div style={{ fontSize: '18px', marginBottom: '4px' }}>{icon}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-accent-primary)', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>{label}</div>
      {sub && <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{sub}</div>}
    </GlassCard>
  );

  const barWidth = (val, max) => max > 0 ? `${Math.max(4, (val / max) * 100)}%` : '4%';

  return (
    <div>
      {/* Stat cards row */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {statCard('🎯', 'Focuses Today', metrics.todayFocuses)}
        {statCard('⏱', 'Focus Time', formatMin(metrics.todayFocusMin))}
        {statCard('✅', 'Completion (7d)', `${metrics.completionRate}%`, `${metrics.resolvedCount}/${metrics.recentTotal}`)}
        {statCard('🔥', 'Streak', `${metrics.streak}d`)}
        {statCard('📋', 'Open Tasks', metrics.openTasks, `of ${metrics.totalTasks}`)}
      </div>

      {/* Top focuses bar chart */}
      <GlassCard style={{ padding: '14px', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>🔝 Top Focuses</div>
        {metrics.topFocuses.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '8px' }}>No focus data yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {metrics.topFocuses.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', width: '16px', textAlign: 'right' }}>{i + 1}.</span>
                <div style={{ flex: 1, position: 'relative', height: '18px', background: 'var(--color-surface)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: barWidth(f.count, metrics.topFocuses[0]?.count || 1), height: '100%', background: 'var(--color-accent-primary)', borderRadius: '3px', opacity: 0.7, transition: 'width 0.3s' }} />
                  <span style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 40px)' }}>{f.label}</span>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-accent-primary)', minWidth: '20px', textAlign: 'right' }}>{f.count}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Context Distribution */}
      <GlassCard style={{ padding: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>📊 Context Distribution</div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          {[
            { label: 'Business', icon: '💼', count: metrics.realmCounts.business, color: '#4A90D9' },
            { label: 'Personal', icon: '🏠', count: metrics.realmCounts.personal, color: '#66bb6a' },
            { label: 'Unset', icon: '❓', count: metrics.realmCounts.unset, color: '#888' },
          ].map(r => {
            const total = metrics.realmCounts.business + metrics.realmCounts.personal + metrics.realmCounts.unset;
            const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
            return (
              <div key={r.label} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '16px' }}>{r.icon}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: r.color }}>{pct}%</div>
                <div style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{r.label} ({r.count})</div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
