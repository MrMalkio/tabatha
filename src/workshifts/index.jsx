import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/global.css';
import { useChromeStorage, sendMessage, useTheme } from '../hooks/useChromeStorage';
import { GlassCard } from '../components/ui/GlassCard';
import { formatTime } from '../utils/formatTime';
import { computeWorkAnalytics, analyticsToCsv, dayKey } from '../utils/workAnalytics';
// NB-01/NB-02: server-backed 3-mode schedule view (self / manage / requests).
import { ScheduleView } from './ScheduleView.jsx';

// ── Stub marker style ──
// Any feature that is scaffolded but not yet functional uses this style
const STUB_STYLE = {
  color: '#ffab40',
  fontStyle: 'italic',
  opacity: 0.7,
};
const STUB_BADGE = { fontSize: '8px', padding: '1px 5px', borderRadius: '3px', background: '#ffab4022', color: '#ffab40', fontWeight: 700, marginLeft: '6px', letterSpacing: '0.05em' };

function fmtDuration(ms) {
  if (!ms || ms < 0) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ═══════════════════════════════════════
// Work Shifts Page
// ═══════════════════════════════════════
function WorkShifts() {
  const [theme] = useTheme();
  const [clockSession] = useChromeStorage('clockSession', { active: false });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() =>
    (typeof window !== 'undefined' && window.location.hash === '#live') ? 'live' : 'list'
  ); // 'list' | 'live' | 'weekly' | 'schedule' | 'analytics'
  const [selectedShift, setSelectedShift] = useState(null);

  // Load history from background
  useEffect(() => {
    sendMessage('GET_CLOCK_HISTORY').then(res => {
      if (res?.history) setHistory(res.history);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // ── Computed stats ──
  const stats = useMemo(() => {
    if (history.length === 0) return { totalWork: 0, totalBreak: 0, avgShift: 0, shifts: 0, thisWeek: 0, thisWeekMs: 0 };
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    let totalWork = 0, totalBreak = 0, thisWeekMs = 0, thisWeekCount = 0;
    for (const s of history) {
      totalWork += s.workMs || 0;
      totalBreak += s.breakMs || 0;
      if (new Date(s.clockedInAt) >= weekStart) {
        thisWeekMs += s.workMs || 0;
        thisWeekCount++;
      }
    }
    return {
      totalWork,
      totalBreak,
      avgShift: history.length > 0 ? totalWork / history.length : 0,
      shifts: history.length,
      thisWeek: thisWeekCount,
      thisWeekMs,
    };
  }, [history]);

  // ── Weekly grouping ──
  const weeklyGroups = useMemo(() => {
    const groups = {};
    for (const s of history) {
      const date = new Date(s.clockedInAt);
      const weekKey = getWeekKey(date);
      if (!groups[weekKey]) groups[weekKey] = { label: weekKey, shifts: [], totalWork: 0, totalBreak: 0 };
      groups[weekKey].shifts.push(s);
      groups[weekKey].totalWork += s.workMs || 0;
      groups[weekKey].totalBreak += s.breakMs || 0;
    }
    return Object.values(groups).sort((a, b) => b.label.localeCompare(a.label));
  }, [history]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--color-border)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>⏱️</span>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Work Shifts</h1>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Tabatha v{chrome.runtime.getManifest?.()?.version || '?'}-α</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['list', 'live', 'weekly', 'schedule', 'analytics'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              background: view === v ? 'var(--color-accent-primary)' : 'var(--color-surface)',
              color: view === v ? '#000' : 'var(--color-text-primary)',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              padding: '4px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
              textTransform: 'capitalize',
            }}>{v === 'analytics' ? '📊 Analytics' : v === 'weekly' ? '📅 Weekly' : v === 'schedule' ? '📋 Schedule' : v === 'live' ? '🟢 Live Stints' : '📋 All Shifts'}</button>
          ))}
          <button onClick={() => chrome.tabs.create({ url: 'home.html' })} style={{
            background: 'var(--color-surface)', color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            padding: '4px 12px', fontSize: '11px', cursor: 'pointer',
          }}>← Dashboard</button>
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: '900px', margin: '0 auto' }}>
        {/* Live Clock Status */}
        {clockSession?.active && (
          <GlassCard style={{ padding: '14px 18px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '16px' }}>🟢</span>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>Currently Clocked In</div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Since {fmtTime(clockSession.clockedInAt)}</div>
              </div>
            </div>
            {clockSession.onBreak && (
              <span style={{ fontSize: '10px', padding: '2px 8px', background: '#ffa72622', color: '#ffa726', borderRadius: '10px', fontWeight: 600 }}>On Break</span>
            )}
          </GlassCard>
        )}

        {/* Stats Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
          <StatCard label="This Week" value={fmtDuration(stats.thisWeekMs)} sub={`${stats.thisWeek} shifts`} />
          <StatCard label="Total Work" value={fmtDuration(stats.totalWork)} sub={`${stats.shifts} shifts`} />
          <StatCard label="Avg Shift" value={fmtDuration(stats.avgShift)} sub="per session" />
          <StatCard label="Total Break" value={fmtDuration(stats.totalBreak)} sub="cumulative" />
        </div>

        {/* View Content */}
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {view === 'list' && (
              <ShiftListView history={history} loading={loading} selectedShift={selectedShift} onSelect={setSelectedShift} />
            )}
            {view === 'live' && (
              <LiveStintsView />
            )}
            {view === 'weekly' && (
              <WeeklyView groups={weeklyGroups} />
            )}
            {view === 'schedule' && (
              <ScheduleView />
            )}
            {view === 'analytics' && (
              <AnalyticsView history={history} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Stat Card ──
function StatCard({ label, value, sub }) {
  return (
    <GlassCard style={{ padding: '14px', textAlign: 'center' }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>{label}</div>
      <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{sub}</div>
    </GlassCard>
  );
}

// ── Shift List View ──
function ShiftListView({ history, loading, selectedShift, onSelect }) {
  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Loading...</div>;
  if (history.length === 0) return (
    <GlassCard style={{ padding: '40px', textAlign: 'center' }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>📭</div>
      <div style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No work shifts yet. Clock in from the Dashboard to start tracking.</div>
    </GlassCard>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {history.map((shift, i) => {
        const isSelected = selectedShift === i;
        return (
          <motion.div key={i} layout onClick={() => onSelect(isSelected ? null : i)} style={{ cursor: 'pointer' }}>
            <GlassCard style={{ padding: '12px 16px', border: isSelected ? '1px solid var(--color-accent-primary)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px' }}>🕐</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{fmtDate(shift.clockedInAt)}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                      {fmtTime(shift.clockedInAt)} → {fmtTime(shift.clockedOutAt)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>{fmtDuration(shift.workMs)}</div>
                  {shift.breakMs > 0 && (
                    <div style={{ fontSize: '9px', color: '#ffa726' }}>{fmtDuration(shift.breakMs)} break</div>
                  )}
                </div>
              </div>

              {/* Expanded details */}
              <AnimatePresence>
                {isSelected && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
                    <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '10px', paddingTop: '10px', fontSize: '11px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <div><span style={{ color: 'var(--color-text-muted)' }}>Total:</span> {fmtDuration(shift.totalMs)}</div>
                        <div><span style={{ color: 'var(--color-text-muted)' }}>Work:</span> {fmtDuration(shift.workMs)}</div>
                        <div><span style={{ color: 'var(--color-text-muted)' }}>Breaks:</span> {(shift.breaks || []).length} ({fmtDuration(shift.breakMs)})</div>
                      </div>
                      {(shift.breaks || []).length > 0 && (
                        <div>
                          <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Break Log</div>
                          {shift.breaks.map((b, j) => (
                            <div key={j} style={{ fontSize: '10px', color: 'var(--color-text-muted)', padding: '2px 0' }}>
                              ☕ {fmtTime(b.start)} → {fmtTime(b.end)} ({fmtDuration(new Date(b.end) - new Date(b.start))})
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Stub: Shift Notes */}
                      <div style={{ marginTop: '8px', padding: '6px 10px', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--color-border)' }}>
                        <span style={STUB_STYLE}>📝 Shift notes</span><span style={STUB_BADGE}>COMING SOON</span>
                      </div>

                      {/* Break notes — retroactive editing */}
                      {(shift.breaks || []).length > 0 && (
                        <BreakNotes shiftIndex={i} breaks={shift.breaks} />
                      )}

                      {/* Stub: Associated Focus Items */}
                      <div style={{ marginTop: '6px', padding: '6px 10px', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--color-border)' }}>
                        <span style={STUB_STYLE}>🎯 Focus items during this shift</span><span style={STUB_BADGE}>COMING SOON</span>
                      </div>

                      {/* Stub: Edit/Delete */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                        <button disabled style={{ ...stubBtnStyle, flex: 1 }}>✏️ Edit Shift <span style={STUB_BADGE}>SOON</span></button>
                        <button disabled style={{ ...stubBtnStyle, ...stubBtnDanger, flex: 1 }}>🗑 Delete <span style={STUB_BADGE}>SOON</span></button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Weekly View ──
function WeeklyView({ groups }) {
  if (groups.length === 0) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>No data yet</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {groups.map(week => (
        <GlassCard key={week.label} style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>📅 Week of {week.label}</div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-accent-primary)' }}>{fmtDuration(week.totalWork)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {week.shifts.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '4px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span>{fmtDate(s.clockedInAt)} — {fmtTime(s.clockedInAt)} → {fmtTime(s.clockedOutAt)}</span>
                <span style={{ fontWeight: 600 }}>{fmtDuration(s.workMs)}</span>
              </div>
            ))}
          </div>
          {/* Stub: Weekly Summary Export */}
          <div style={{ marginTop: '8px', textAlign: 'center' }}>
            <button disabled style={stubBtnStyle}>📤 Export Week <span style={STUB_BADGE}>COMING SOON</span></button>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════
// Analytics View (NB-04 P1+P2) — real self-analytics from local data.
// Every user sees their OWN analytics (no org gate); cross-member views are P3.
// All metrics are computed by the pure util src/utils/workAnalytics.js from
// clock history + focus engine history + intent history. CSS-only bars, no
// chart lib — matches src/home/AnalyticsDashboard.jsx.
// ═══════════════════════════════════════
const RANGE_OPTIONS = [
  { id: 'week', label: 'This week' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
];

const sectionTitle = {
  fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '10px',
};

const barWidth = (val, max) => (max > 0 ? `${Math.max(4, (val / max) * 100)}%` : '4%');

function AnalyticsView({ history }) {
  const [range, setRange] = useState('week');
  const [focusHistory, setFocusHistory] = useState([]);
  const [intentHistory] = useChromeStorage('intentHistory', []);

  // Focus items: engine history (resolved) + queue/active (in-flight) union,
  // same picture AnalyticsDashboard uses.
  useEffect(() => {
    sendMessage('GET_FOCUS_ENGINE').then(res => {
      const eng = res?.focusEngine;
      if (!eng) return;
      setFocusHistory([...(eng.history || []), ...Object.values(eng.items || {})]);
    }).catch(() => {});
  }, []);

  const a = useMemo(() => computeWorkAnalytics({
    sessions: history || [],
    focusHistory,
    intentHistory: intentHistory || [],
    range,
  }), [history, focusHistory, intentHistory, range]);

  const exportCsv = useCallback(() => {
    const blob = new Blob([analyticsToCsv(a)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `tabatha-work-analytics-${range}-${dayKey(Date.now())}.csv`;
    document.body.appendChild(el);
    el.click();
    el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [a, range]);

  if ((history || []).length === 0) {
    return (
      <GlassCard style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>📊</div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No shift data yet. Clock in from the Dashboard and analytics will build themselves.</div>
      </GlassCard>
    );
  }

  const activeDays = a.dailyHours.filter(d => d.workMs > 0).length;
  const avgPerActiveDay = activeDays > 0 ? a.totals.workMs / activeDays : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Range selector */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Range</span>
        {RANGE_OPTIONS.map(r => (
          <button key={r.id} onClick={() => setRange(r.id)} style={{
            background: range === r.id ? 'var(--color-accent-primary)' : 'var(--color-surface)',
            color: range === r.id ? '#000' : 'var(--color-text-primary)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            padding: '3px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
          }}>{r.label}</button>
        ))}
      </div>

      {/* In-range summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        <StatCard label="Work (range)" value={fmtDuration(a.totals.workMs)} sub={`${a.totals.shifts} shift${a.totals.shifts === 1 ? '' : 's'}`} />
        <StatCard label="Avg / Active Day" value={fmtDuration(avgPerActiveDay)} sub={`${activeDays} active day${activeDays === 1 ? '' : 's'}`} />
        <StatCard label="Breaks" value={a.breaks.count} sub={`avg ${fmtDuration(a.breaks.avgMs)}`} />
        <StatCard label="Ctx Switches" value={a.switching.total} sub={`${a.switching.perHour.toFixed(1)}/h · ${a.switching.avgPerShift.toFixed(1)}/shift`} />
      </div>

      {/* Daily hours */}
      <GlassCard style={{ padding: '20px' }}>
        <div style={sectionTitle}>📈 Daily Hours</div>
        <DailyHoursChart days={a.dailyHours} />
      </GlassCard>

      {/* Weekly comparison */}
      <GlassCard style={{ padding: '20px' }}>
        <div style={sectionTitle}>📊 Weekly Comparison (last {a.weekly.length} week{a.weekly.length === 1 ? '' : 's'})</div>
        {a.weekly.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '8px' }}>No weekly data yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {a.weekly.map(w => {
              const max = Math.max(...a.weekly.map(x => x.workMs), 1);
              return (
                <div key={w.weekKey} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', width: '72px', flexShrink: 0 }}>Wk {w.weekKey.slice(5)}</span>
                  <div style={{ flex: 1, position: 'relative', height: '18px', background: 'var(--color-surface)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: barWidth(w.workMs, max), height: '100%', background: 'var(--color-accent-primary)', borderRadius: '3px', opacity: 0.7, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-accent-primary)', minWidth: '52px', textAlign: 'right' }}>{fmtDuration(w.workMs)}</span>
                  <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', minWidth: '46px', textAlign: 'right' }}>{w.shifts} shift{w.shifts === 1 ? '' : 's'}</span>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Peak productivity hours */}
      <GlassCard style={{ padding: '20px' }}>
        <div style={sectionTitle}>⏰ Peak Productivity Hours</div>
        <HourBars values={a.peakHours} fmt={(ms) => `${fmtDuration(ms)} worked`} />
      </GlassCard>

      {/* Break patterns */}
      <GlassCard style={{ padding: '20px' }}>
        <div style={sectionTitle}>☕ Break Patterns</div>
        {a.breaks.count === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '8px' }}>No breaks taken in this range</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '18px', marginBottom: '12px', fontSize: '11px' }}>
              <span><b style={{ color: '#ffa726' }}>{a.breaks.count}</b> break{a.breaks.count === 1 ? '' : 's'}</span>
              <span><b style={{ color: '#ffa726' }}>{fmtDuration(a.breaks.avgMs)}</b> avg duration</span>
              <span><b style={{ color: '#ffa726' }}>{fmtDuration(a.breaks.totalMs)}</b> total</span>
            </div>
            <HourBars values={a.breaks.byHour} color="#ffa726" fmt={(n) => `${n} break${n === 1 ? '' : 's'}`} />
          </>
        )}
      </GlassCard>

      {/* Focus integration (P2) */}
      <GlassCard style={{ padding: '20px' }}>
        <div style={sectionTitle}>🎯 Time per Focus (during shifts)</div>
        {a.perFocus.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '8px' }}>No focus activity overlapped your shifts in this range</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {a.perFocus.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', width: '16px', textAlign: 'right' }}>{i + 1}.</span>
                <div style={{ flex: 1, position: 'relative', height: '18px', background: 'var(--color-surface)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: barWidth(f.ms, a.perFocus[0]?.ms || 1), height: '100%', background: 'var(--color-accent-primary)', borderRadius: '3px', opacity: 0.7, transition: 'width 0.3s' }} />
                  <span style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 40px)' }}>{f.label}</span>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-accent-primary)', minWidth: '48px', textAlign: 'right' }}>{fmtDuration(f.ms)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Future: needs a productive/distracting category mapping (P4) */}
        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--color-border)' }}>
          <span style={STUB_STYLE}>Distraction time vs productive time</span><span style={STUB_BADGE}>COMING SOON</span>
        </div>
      </GlassCard>

      {/* Reporting */}
      <GlassCard style={{ padding: '20px' }}>
        <div style={sectionTitle}>📤 Reporting</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={exportCsv} style={{
            background: 'var(--color-accent-primary)', color: '#000',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
          }}>⬇ Export CSV</button>
          <button disabled style={stubBtnStyle}>Export PDF Timesheet <span style={STUB_BADGE}>SOON</span></button>
          <button disabled style={stubBtnStyle}>Sync to Cloud <span style={STUB_BADGE}>SOON</span></button>
        </div>
        <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
          CSV covers the selected range: daily hours, weekly comparison, peak hours, breaks, time per focus, and context switching.
        </div>
      </GlassCard>
    </div>
  );
}

// ── Daily hours: vertical stacked bars (work + break) ──
function DailyHoursChart({ days }) {
  const max = Math.max(...days.map(d => d.workMs + d.breakMs), 1);
  const many = days.length > 10;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: many ? '2px' : '6px', height: '120px' }}>
        {days.map(d => {
          const workPct = (d.workMs / max) * 100;
          const breakPct = (d.breakMs / max) * 100;
          return (
            <div key={d.date} title={`${d.label}: ${fmtDuration(d.workMs)} work${d.breakMs > 0 ? ` + ${fmtDuration(d.breakMs)} break` : ''}${d.shifts ? ` · ${d.shifts} shift${d.shifts === 1 ? '' : 's'}` : ''}`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', cursor: 'default' }}>
              {d.breakMs > 0 && (
                <div style={{ height: `${Math.max(breakPct, 1)}%`, background: '#ffa726', borderRadius: '2px 2px 0 0', opacity: 0.65 }} />
              )}
              <div style={{
                height: `${d.workMs > 0 ? Math.max(workPct, 2) : 0}%`,
                background: 'var(--color-accent-primary)',
                borderRadius: d.breakMs > 0 ? '0 0 2px 2px' : '2px',
                opacity: 0.75, minHeight: d.workMs > 0 ? '2px' : 0,
                transition: 'height 0.3s',
              }} />
              {d.workMs === 0 && d.breakMs === 0 && (
                <div style={{ height: '2px', background: 'var(--color-surface)', borderRadius: '2px' }} />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: many ? '2px' : '6px', marginTop: '4px' }}>
        {days.map((d, i) => (
          <div key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: '8px', color: 'var(--color-text-muted)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {many ? ((i === 0 || d.date.endsWith('01') || i % 5 === 0) ? d.date.slice(8) : '') : d.label.split(',')[0]}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '9px', color: 'var(--color-text-muted)' }}>
        <span><span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--color-accent-primary)', borderRadius: '2px', opacity: 0.75, marginRight: '4px' }} />Work</span>
        <span><span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#ffa726', borderRadius: '2px', opacity: 0.65, marginRight: '4px' }} />Break</span>
      </div>
    </div>
  );
}

// ── 24 hour-of-day mini bars (peak hours + break-by-hour) ──
function HourBars({ values, color = 'var(--color-accent-primary)', fmt }) {
  const max = Math.max(...values, 1);
  const total = values.reduce((x, y) => x + y, 0);
  if (total === 0) {
    return <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '8px' }}>No activity in this range</div>;
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '64px' }}>
        {values.map((v, h) => (
          <div key={h} title={`${String(h).padStart(2, '0')}:00 — ${fmt ? fmt(v) : v}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', cursor: 'default' }}>
            <div style={{
              height: v > 0 ? `${Math.max((v / max) * 100, 3)}%` : '2px',
              background: v > 0 ? color : 'var(--color-surface)',
              borderRadius: '2px', opacity: v > 0 ? 0.75 : 1, transition: 'height 0.3s',
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
        {values.map((_, h) => (
          <div key={h} style={{ flex: 1, textAlign: 'center', fontSize: '8px', color: 'var(--color-text-muted)' }}>
            {h % 6 === 0 ? h : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stub button styles ──
const stubBtnStyle = {
  background: 'var(--color-surface)',
  color: 'var(--color-text-muted)',
  border: '1px dashed var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 12px',
  fontSize: '11px',
  cursor: 'not-allowed',
  opacity: 0.6,
};
const stubBtnDanger = {
  borderColor: '#ef535044',
  color: '#ef535088',
};

// ── Helper: week key ──
function getWeekKey(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

// ── Break Notes (retroactive editing) ──
function BreakNotes({ shiftIndex, breaks }) {
  const [notes, setNotes] = useState({});
  const [editing, setEditing] = useState(null);
  const [noteInput, setNoteInput] = useState('');

  const saveNote = (breakIdx) => {
    setNotes(prev => ({ ...prev, [`${shiftIndex}-${breakIdx}`]: noteInput }));
    setEditing(null);
    setNoteInput('');
    // In production this would persist via sendMessage
  };

  return (
    <div style={{ marginTop: '6px' }}>
      <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Break Notes <span style={{ fontWeight: 400, fontStyle: 'italic' }}>(optional)</span></div>
      {breaks.map((b, j) => {
        const key = `${shiftIndex}-${j}`;
        const note = notes[key] || b.note || '';
        return (
          <div key={j} style={{ fontSize: '10px', padding: '3px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>☕ Break {j + 1}:</span>
            {editing === j ? (
              <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                <input type="text" value={noteInput} onChange={e => setNoteInput(e.target.value)}
                  placeholder="What were you doing?"
                  onKeyDown={e => { if (e.key === 'Enter') saveNote(j); if (e.key === 'Escape') setEditing(null); }}
                  autoFocus
                  style={{ flex: 1, background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '3px', padding: '2px 6px', color: 'var(--color-text-primary)', fontSize: '10px', outline: 'none' }}
                />
                <button onClick={() => saveNote(j)} style={{ background: 'var(--color-accent-primary)', border: 'none', color: '#000', borderRadius: '3px', padding: '1px 6px', fontSize: '9px', cursor: 'pointer' }}>✓</button>
              </div>
            ) : (
              <span onClick={() => { setEditing(j); setNoteInput(note); }} style={{ cursor: 'pointer', color: note ? 'var(--color-text-primary)' : '#ffab40', fontStyle: note ? 'normal' : 'italic' }}>
                {note || '+ Add note'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Schedule View ──
// NB-01/NB-02: extracted to ./ScheduleView.jsx (three modes: self / manage /
// requests, server-backed via migration 027 with the legacy local
// `workSchedule` key kept as an offline cache).

// ═══════════════════════════════════════
// Live Stints — all of this user's installs and their clock state, with the
// ability to clock any (or all abandoned) out. Resolves the "ghost stint"
// problem: an install that clocked in and vanished leaves a row stuck
// 'clocked_in' that nothing else could reach.
// ═══════════════════════════════════════
const CLASS_ICON = { business: '💼', professional: '👔', work: '🏗', personal: '🏠' };
const BROWSER_ICON = { desktop_companion: '💻', mobile_ios: '📱', mobile_android: '📱', tabatha_web: '🌐' };

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function installRank(i) {
  const active = i.clock_state === 'clocked_in' || i.clock_state === 'on_break';
  if (active && i.online && !i.stale) return 0;   // live shift
  if (active && i.stale) return 1;                 // abandoned shift
  return 2;                                        // idle / clocked out
}

function LiveStintsView() {
  const [data, setData] = useState({ installs: [], selfBrowserProfileId: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);       // browser_profile_id being acted on, or 'all'
  const [editing, setEditing] = useState(null); // browser_profile_id whose end-time picker is open
  const [endInput, setEndInput] = useState('');
  const [msg, setMsg] = useState('');

  const refresh = useCallback(() => {
    sendMessage('LIST_LIVE_STINTS').then(res => {
      setData({ installs: res?.installs || [], selfBrowserProfileId: res?.selfBrowserProfileId || null });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 10000);
    return () => clearInterval(iv);
  }, [refresh]);

  const flash = (text) => { setMsg(text); setTimeout(() => setMsg(''), 4000); };

  const doClockOut = async (inst, endTime) => {
    setBusy(inst.browser_profile_id);
    const res = await sendMessage('CLOCK_OUT_INSTALL', { browser_profile_id: inst.browser_profile_id, end_time: endTime || null });
    setBusy(null); setEditing(null);
    if (res?.error) flash('⚠ ' + res.error);
    else flash(res?.mode === 'reconstructed' ? '✓ Reconstructed stint saved to history'
      : res?.mode === 'remote' ? '✓ Asked that install to clock itself out'
      : '✓ Clocked out');
    refresh();
  };

  const doDismiss = async (inst) => {
    setBusy(inst.browser_profile_id);
    const res = await sendMessage('DISMISS_INSTALL', { browser_profile_id: inst.browser_profile_id });
    setBusy(null);
    flash(res?.error ? '⚠ ' + res.error : '✓ Dismissed offline install');
    refresh();
  };

  const clearAllOffline = async () => {
    if (!window.confirm('Clean up every offline install? Open shifts are reconstructed (ending at their last heartbeat, attributed to your matching real profile); the rest are dismissed. Live installs are untouched.')) return;
    setBusy('all');
    const res = await sendMessage('CLEAR_ALL_OFFLINE');
    setBusy(null);
    flash(res?.error ? '⚠ ' + res.error : `✓ Reconciled ${res?.reconciled || 0}, dismissed ${res?.dismissed || 0}`);
    refresh();
  };

  const installs = useMemo(() => [...data.installs].sort((a, b) => installRank(a) - installRank(b)), [data.installs]);
  const offlineCount = installs.filter(i => i.stale && i.browser_profile_id !== data.selfBrowserProfileId).length;

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Loading installs…</div>;

  if (installs.length === 0) return (
    <GlassCard style={{ padding: '40px', textAlign: 'center' }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>🖥️</div>
      <div style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No install activity yet. Once you clock in, your installs appear here.</div>
    </GlassCard>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '24px' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {msg || `${installs.length} install(s)${offlineCount ? ` · ${offlineCount} offline` : ''}`}
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={refresh} style={miniBtn}>↻ Refresh</button>
          {offlineCount > 0 && (
            <button onClick={clearAllOffline} disabled={busy === 'all'} style={{ ...miniBtn, borderColor: '#ffa726', color: '#ffa726' }}>
              {busy === 'all' ? '…' : `🧹 Clean up all offline (${offlineCount})`}
            </button>
          )}
        </div>
      </div>

      {installs.map(i => {
        const active = i.clock_state === 'clocked_in' || i.clock_state === 'on_break';
        const live = i.online && !i.stale;
        const abandoned = active && i.stale;
        const isSelf = i.browser_profile_id === data.selfBrowserProfileId;
        const name = i.profile_name || `Install ${i.browser_profile_id?.slice(0, 6) || '—'}`;
        const icon = BROWSER_ICON[i.browser] || CLASS_ICON[i.classification] || '🖥';
        const badge = active
          ? (live ? { t: i.clock_state === 'on_break' ? '☕ on break (live)' : '🟢 clocked in (live)', c: '#66bb6a' }
                  : { t: i.clock_state === 'on_break' ? '⚪ abandoned (was on break)' : '⚪ abandoned', c: '#ffa726' })
          : { t: '⚪ clocked out', c: 'var(--color-text-muted)' };

        return (
          <GlassCard key={i.browser_profile_id} style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span style={{ fontSize: '16px' }}>{icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {name}
                    {isSelf && <span style={{ ...tag, background: '#42a5f522', color: '#42a5f5' }}>this install</span>}
                    {i.classification && <span style={tag}>{i.classification}</span>}
                    {i.machine_id && <span style={{ ...tag, opacity: 0.7 }}>🖥 {i.machine_id.slice(0, 6)}</span>}
                  </div>
                  <div style={{ fontSize: '10px', color: badge.c }}>
                    {badge.t}
                    {active && i.clocked_in_at && <span style={{ color: 'var(--color-text-muted)' }}> · since {fmtTime(i.clocked_in_at)} {fmtDate(i.clocked_in_at)}</span>}
                    {i.last_heartbeat_at && <span style={{ color: 'var(--color-text-muted)' }}> · last seen {fmtTime(i.last_heartbeat_at)}</span>}
                  </div>
                </div>
              </div>

              {active && (
                <button
                  onClick={() => {
                    if (abandoned) { setEditing(i.browser_profile_id); setEndInput(toLocalInput(i.last_heartbeat_at)); }
                    else doClockOut(i);
                  }}
                  disabled={busy === i.browser_profile_id}
                  style={{ ...miniBtn, borderColor: '#ef5350', color: '#ef5350', flexShrink: 0 }}
                >
                  {busy === i.browser_profile_id ? '…' : isSelf ? '⏹ Clock out' : abandoned ? '⏹ Reconcile' : '⏹ Clock out'}
                </button>
              )}
              {!active && !isSelf && i.stale && (
                <button
                  onClick={() => doDismiss(i)}
                  disabled={busy === i.browser_profile_id}
                  title="This offline install has no open shift — remove its stale chip"
                  style={{ ...miniBtn, flexShrink: 0 }}
                >
                  {busy === i.browser_profile_id ? '…' : '✕ Dismiss'}
                </button>
              )}
            </div>

            {editing === i.browser_profile_id && (
              <div style={{ marginTop: '10px', borderTop: '1px solid var(--color-border)', paddingTop: '10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                  This shift was abandoned. Set when it should have ended (defaults to its last heartbeat). The stint is reconstructed and attributed to your matching real profile.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <input type="datetime-local" value={endInput} onChange={e => setEndInput(e.target.value)}
                    min={toLocalInput(i.clocked_in_at)} max={toLocalInput(new Date().toISOString())}
                    style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: '3px', color: 'var(--color-text-primary)', padding: '3px 6px', fontSize: '11px' }} />
                  <button onClick={() => doClockOut(i, endInput ? new Date(endInput).toISOString() : null)} style={{ ...miniBtn, borderColor: '#66bb6a', color: '#66bb6a' }}>✓ Confirm</button>
                  <button onClick={() => setEditing(null)} style={miniBtn}>Cancel</button>
                </div>
              </div>
            )}
          </GlassCard>
        );
      })}
    </div>
  );
}

const miniBtn = {
  background: 'var(--color-surface)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
};
const tag = {
  fontSize: '8px', padding: '1px 5px', borderRadius: '3px',
  background: 'var(--color-surface)', color: 'var(--color-text-muted)',
  fontWeight: 700, letterSpacing: '0.04em', textTransform: 'capitalize'
};

// ── Mount ──
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<WorkShifts />);
