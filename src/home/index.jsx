import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/global.css';
import { useChromeStorage, sendMessage, useTheme } from '../hooks/useChromeStorage';
import { useFocusEngine, formatTimer, formatElapsed, FUNNEL_STAGES } from '../hooks/useFocusEngine';
import { FlipClock, CLOCK_DEFAULTS } from '../components/clock/FlipClock';
import { GlassCard } from '../components/ui/GlassCard';
import { PopButton } from '../components/ui/PopButton';
import { Tooltip } from '../components/ui/Tooltip';
import { TagPicker } from '../components/ui/TagPicker';
import { SessionList } from './SessionList';

function formatTime(ms) {
  if (!ms || ms < 1000) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const CATEGORY_ICONS = {
  work: '💼', media: '🎵', meeting: '📹', reference: '📚',
  messaging: '💬', email: '📧', learning: '🎓', entertainment: '🎮', unknown: '❓',
};

// ── FocusBar ──
function FocusBar({ activeFocus, actions, onAddAnother }) {
  const [addInput, setAddInput] = useState('');
  const [showTags, setShowTags] = useState(false);

  if (!activeFocus) return null;

  const timerColor = activeFocus.isOver ? '#ef5350' : 'var(--color-accent-primary)';
  const timerText = activeFocus.isOver
    ? formatTimer(activeFocus.overMs, true)
    : formatTimer(activeFocus.remainingMs);
  const funnel = FUNNEL_STAGES[activeFocus.funnelStage] || FUNNEL_STAGES.unsorted;

  return (
    <GlassCard style={{ padding: '16px', marginBottom: '12px', position: 'relative', overflow: 'visible' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-accent-primary)', fontWeight: 600 }}>
              {activeFocus.focusState === 'drifted' ? '⚠️ DRIFTED' : '🎯 CURRENT FOCUS'}
            </span>
            <Tooltip text={funnel.label}>
              <span style={{ fontSize: '12px', background: funnel.color + '22', color: funnel.color, padding: '1px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '10px' }}>
                {funnel.icon} {funnel.label}
              </span>
            </Tooltip>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>{activeFocus.label}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span>{activeFocus.associatedTabIds?.length || 0} tabs</span>
            <span>{formatElapsed(activeFocus.liveElapsedMs)} elapsed</span>
            {activeFocus.contextSwitchCount > 0 && <span>{activeFocus.contextSwitchCount} switches</span>}
          </div>
          {activeFocus.tags?.realm && (
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              {activeFocus.tags.realm === 'business' ? '💼' : '🏠'} {[activeFocus.tags.client, activeFocus.tags.project, activeFocus.tags.task].filter(Boolean).join(' › ')}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: timerColor, fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
            {timerText}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {activeFocus.isOver ? 'over time' : 'remaining'}
          </div>
        </div>
      </div>
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
        <Tooltip text="Mark as done">
          <button onClick={() => actions.completeFocus()} style={btnStyle('#66bb6a')}>✓ Complete</button>
        </Tooltip>
        <Tooltip text="Add 5 more minutes">
          <button onClick={() => actions.extendTimer(null, 5)} style={btnStyle('var(--color-accent-primary)')}>+5m</button>
        </Tooltip>
        <Tooltip text="Tag with client/project">
          <button onClick={() => setShowTags(!showTags)} style={btnStyle('var(--color-text-muted)')}>🏷</button>
        </Tooltip>
      </div>
      {showTags && (
        <div style={{ marginTop: '8px' }}>
          <TagPicker tags={activeFocus.tags || {}} onChange={(tags) => actions.updateTags(null, tags)} compact={false} />
        </div>
      )}
      {/* Quick add */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
        <input
          type="text" placeholder="Add another focus..." value={addInput}
          onChange={e => setAddInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && addInput.trim()) { onAddAnother(addInput.trim()); setAddInput(''); }}}
          style={{ flex: 1, background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', color: 'var(--color-text-primary)', fontSize: '12px', outline: 'none' }}
        />
        <Tooltip text="Add without interrupting current focus">
          <button onClick={() => { if (addInput.trim()) { onAddAnother(addInput.trim()); setAddInput(''); }}} style={btnStyle('var(--color-accent-secondary)')}>+ Add</button>
        </Tooltip>
      </div>
    </GlassCard>
  );
}

const btnStyle = (color) => ({
  background: 'transparent', border: `1px solid ${color}`, color,
  borderRadius: 'var(--radius-sm)', padding: '3px 10px', fontSize: '11px',
  cursor: 'pointer', fontWeight: 600,
});

// ── FocusQueue ──
function FocusQueue({ items, actions }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: 600 }}>
        Queued ({items.length})
      </div>
      {items.map(item => {
        const funnel = FUNNEL_STAGES[item.funnelStage] || FUNNEL_STAGES.unsorted;
        return (
          <GlassCard key={item.id} style={{ padding: '8px 12px', marginBottom: '4px', cursor: 'pointer' }} onClick={() => actions.switchFocus(item.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span style={{ fontSize: '10px', color: funnel.color }}>{funnel.icon}</span>
                <span style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{item.focusState}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                <Tooltip text="Switch to this focus">
                  <button onClick={(e) => { e.stopPropagation(); actions.switchFocus(item.id); }} style={btnStyle('var(--color-accent-primary)')}>▶</button>
                </Tooltip>
                <Tooltip text="Mark as done">
                  <button onClick={(e) => { e.stopPropagation(); actions.completeFocus(item.id); }} style={btnStyle('#66bb6a')}>✓</button>
                </Tooltip>
              </div>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

// ── FocusHistory ──
function FocusHistory({ history }) {
  const [expanded, setExpanded] = useState(false);
  if (!history || history.length === 0) return null;
  const shown = expanded ? history.slice(0, 20) : history.slice(0, 3);
  return (
    <div style={{ marginBottom: '12px' }}>
      <button onClick={() => setExpanded(!expanded)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: '6px' }}>
        History ({history.length}) {expanded ? '▲' : '▼'}
      </button>
      {shown.map((item, i) => (
        <div key={item.id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--color-border)', fontSize: '12px' }}>
          <span style={{ color: item.focusState === 'drifted' ? '#ef5350' : 'var(--color-text-primary)' }}>
            {item.focusState === 'drifted' ? '⚠️' : '✅'} {item.label}
          </span>
          <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{formatElapsed(item.elapsedMs)}</span>
        </div>
      ))}
    </div>
  );
}

// ── FocusInput (when no focus is set) ──
function FocusInput({ onStart }) {
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);
  const handleSubmit = () => {
    if (input.trim()) { onStart(input.trim()); setInput(''); }
    else { setShake(true); setTimeout(() => setShake(false), 600); }
  };
  return (
    <motion.div animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : {}} transition={{ duration: 0.4 }} style={{ marginBottom: '16px' }}>
      <GlassCard style={{ padding: '16px' }}>
        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '8px' }}>
          What are you focusing on?
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input type="text" placeholder="e.g. Ship Tabatha v1.0" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={{ flex: 1, background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--color-text-primary)', fontSize: '14px', outline: 'none' }}
          />
          <PopButton onClick={handleSubmit} size="sm">Set Focus</PopButton>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ════════════════════════════════════════════
// Main Home Component
// ════════════════════════════════════════════
function Home() {
  const [theme, setTheme] = useTheme();
  const [tabs] = useChromeStorage('tabs', {});
  const [timeTracking] = useChromeStorage('timeTracking', { byTab: {}, byCategory: {} });
  const [clockSettings] = useChromeStorage('clockSettings', CLOCK_DEFAULTS);
  const { activeFocus, allItems, history, actions } = useFocusEngine();
  const [activePanel, setActivePanel] = useState('time');

  useEffect(() => {
    const interval = setInterval(() => { sendMessage('GET_TIME_TRACKING'); }, 5000);
    return () => clearInterval(interval);
  }, []);

  const tabCount = Object.keys(tabs).length;
  const totalActiveTime = useMemo(() => Object.values(timeTracking.byTab || {}).reduce((a, b) => a + b, 0), [timeTracking]);

  const sessions = useMemo(() => {
    const contextMap = {};
    Object.entries(tabs).forEach(([id, tab]) => {
      const ctx = tab.context || tab.category || 'unknown';
      if (!contextMap[ctx]) { contextMap[ctx] = { id: ctx, context: tab.context, category: tab.category || 'unknown', icon: CATEGORY_ICONS[tab.category] || '📄', title: tab.context || (tab.category ? tab.category.charAt(0).toUpperCase() + tab.category.slice(1) : 'Uncategorized'), tabCount: 0, totalTime: 0, active: false }; }
      contextMap[ctx].tabCount++;
      contextMap[ctx].totalTime += (timeTracking.byTab || {})[id] || 0;
    });
    return Object.values(contextMap).map(s => ({ ...s, timeStr: formatTime(s.totalTime), active: s.totalTime > 0 })).sort((a, b) => b.totalTime - a.totalTime);
  }, [tabs, timeTracking]);

  const categoryBreakdown = useMemo(() => {
    const byCat = {};
    Object.entries(tabs).forEach(([id, tab]) => { const cat = tab.category || 'unknown'; byCat[cat] = (byCat[cat] || 0) + ((timeTracking.byTab || {})[id] || 0); });
    return Object.entries(byCat).map(([cat, time]) => ({ cat, icon: CATEGORY_ICONS[cat] || '📄', name: cat.charAt(0).toUpperCase() + cat.slice(1), time, timeStr: formatTime(time) })).sort((a, b) => b.time - a.time);
  }, [tabs, timeTracking]);

  const cycleTheme = () => { const themes = ['pop-art', 'corporate']; setTheme(themes[(themes.indexOf(theme) + 1) % themes.length]); };
  const navTabs = [{ id: 'time', label: '⏱ Time' }, { id: 'tabs', label: '📑 Tabs' }, { id: 'contexts', label: '🗂 Contexts' }];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 0, fontFamily: "'Inter', system-ui, sans-serif", transition: 'background-color 0.3s ease, color 0.3s ease' }}>
      {theme === 'pop-art' && (<div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.03, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '12px 12px' }} />)}

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '1100px', padding: '24px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, letterSpacing: '0.02em' }}>{getGreeting()}</h1>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
              {tabCount} tab{tabCount !== 1 ? 's' : ''} open · {formatTime(totalActiveTime)} active today
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-accent-primary)', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7 }}>v1.0.0-α</span>
            <Tooltip text="Switch theme">
              <button onClick={cycleTheme} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', padding: '6px 10px', fontSize: '14px', cursor: 'pointer', backdropFilter: 'var(--surface-blur)' }}>
                {theme === 'pop-art' ? '🎨' : '🏢'}
              </button>
            </Tooltip>
            <Tooltip text="Open settings">
              <button onClick={() => { if (chrome?.runtime?.openOptionsPage) chrome.runtime.openOptionsPage(); }} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', padding: '6px 10px', fontSize: '14px', cursor: 'pointer', backdropFilter: 'var(--surface-blur)' }}>⚙️</button>
            </Tooltip>
          </div>
        </div>

        {/* FlipClock */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} style={{ marginBottom: '24px' }}>
          <FlipClock settings={clockSettings} />
        </motion.div>

        {/* Focus Engine */}
        {activeFocus ? (
          <>
            <FocusBar activeFocus={activeFocus} actions={actions} onAddAnother={(label) => actions.addFocus(label)} />
            <FocusQueue items={allItems} actions={actions} />
            <FocusHistory history={history} />
          </>
        ) : (
          <FocusInput onStart={(label) => actions.startFocus(label)} />
        )}

        {/* Nav Tabs */}
        <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
          {navTabs.map(tab => (
            <Tooltip key={tab.id} text={`View ${tab.label.replace(/[^\w\s]/g, '').trim()} panel`}>
              <button onClick={() => setActivePanel(tab.id)} style={{ background: 'transparent', border: 'none', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', color: activePanel === tab.id ? 'var(--color-accent-primary)' : 'var(--color-text-muted)', fontWeight: activePanel === tab.id ? 600 : 400, borderBottom: activePanel === tab.id ? '2px solid var(--color-accent-primary)' : '2px solid transparent', transition: 'color 0.15s, border-color 0.15s', marginBottom: '-1px' }}>{tab.label}</button>
            </Tooltip>
          ))}
        </div>

        {/* Panels */}
        <AnimatePresence mode="wait">
          {activePanel === 'time' && (
            <motion.div key="time" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <GlassCard style={{ padding: '16px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Active Today</div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-accent-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatTime(totalActiveTime)}</div>
                </GlassCard>
                <GlassCard style={{ padding: '16px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Open Tabs</div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-accent-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{tabCount}</div>
                </GlassCard>
              </div>
              {categoryBreakdown.length > 0 && (
                <GlassCard style={{ padding: '16px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)', marginBottom: '12px', fontWeight: 600 }}>Time by Category</div>
                  {categoryBreakdown.map(cat => (
                    <div key={cat.cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '13px' }}>
                      <span>{cat.icon} {cat.name}</span>
                      <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{cat.timeStr}</span>
                    </div>
                  ))}
                </GlassCard>
              )}
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)', marginBottom: '10px', fontWeight: 600 }}>Active Sessions</div>
              <SessionList sessions={sessions} timeTracking={timeTracking} />
            </motion.div>
          )}
          {activePanel === 'tabs' && (
            <motion.div key="tabs" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {Object.entries(tabs).length === 0 ? (
                <GlassCard style={{ padding: '24px', textAlign: 'center' }}><p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No tracked tabs yet.</p></GlassCard>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Object.entries(tabs).map(([id, tab]) => (
                    <GlassCard key={id} style={{ padding: '12px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {CATEGORY_ICONS[tab.category] || '📄'} {tab.title || 'Untitled'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{tab.context || 'No context'} {tab.locked ? '🔒' : ''}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, marginLeft: '12px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-accent-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatTime((timeTracking.byTab || {})[id] || 0)}</span>
                          <Tooltip text="Focus this tab">
                            <button onClick={() => sendMessage('FOCUS_TAB', { tabId: parseInt(id) })} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', fontSize: '12px', cursor: 'pointer' }}>↗</button>
                          </Tooltip>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </motion.div>
          )}
          {activePanel === 'contexts' && (
            <motion.div key="contexts" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {sessions.length === 0 ? (
                <GlassCard style={{ padding: '24px', textAlign: 'center' }}><p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No active contexts.</p></GlassCard>
              ) : (
                sessions.map(session => (
                  <GlassCard key={session.id} style={{ padding: '16px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{session.icon} {session.title}</div>
                      <span style={{ fontSize: '12px', color: 'var(--color-accent-primary)', fontWeight: 600 }}>{session.timeStr}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{session.tabCount} tab{session.tabCount !== 1 ? 's' : ''} · {session.category}</div>
                  </GlassCard>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Home />);
