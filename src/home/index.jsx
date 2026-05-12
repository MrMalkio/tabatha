import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { ComboInput } from '../components/ui/ComboInput';
import { StagePicker } from '../components/ui/StagePicker';
import { SessionList } from './SessionList';
import { LogsPanel } from './LogsPanel';
import { ActivityHeatmap } from './ActivityHeatmap';
import { ProjectsClientsPanel } from './ProjectsClientsPanel';
import { InitiativesPanel } from './InitiativesPanel';
import { LinkMergeModal } from '../components/ui/LinkMergeModal';
import { CommandPalette } from '../components/ui/CommandPalette';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { useKeyboardShortcuts, ShortcutsHelp } from '../components/ui/KeyboardShortcuts';
import { VoiceInput } from '../components/ui/VoiceInput';
import { useOrgData } from '../hooks/useOrgData';

import { formatTime } from '../utils/formatTime';
import { logger } from '../services/logger';
import CompanionStatus from '../components/CompanionStatus';
import UnifiedTimeline from '../components/UnifiedTimeline';

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
function FocusBar({ activeFocus, actions, onAddAnother, clients, projects, tasks, onPersist, orgData }) {
  const [addInput, setAddInput] = useState('');
  const [showTags, setShowTags] = useState(false);
  const [addMode, setAddMode] = useState(null); // null | 'intent' | 'subfocus'
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editTimer, setEditTimer] = useState(15);
  const [editFunnel, setEditFunnel] = useState('unsorted');
  const [editTags, setEditTags] = useState({});

  if (!activeFocus) return null;

  const isPaused = activeFocus.focusState === 'paused';
  const timerColor = isPaused ? '#ffa726' : activeFocus.isOver ? '#ef5350' : 'var(--color-accent-primary)';
  const timerText = isPaused
    ? formatTimer(activeFocus.liveElapsedMs > (activeFocus.timerMinutes || 15) * 60000 ? activeFocus.liveElapsedMs - (activeFocus.timerMinutes || 15) * 60000 : (activeFocus.timerMinutes || 15) * 60000 - activeFocus.liveElapsedMs, activeFocus.liveElapsedMs > (activeFocus.timerMinutes || 15) * 60000)
    : activeFocus.isOver
      ? formatTimer(activeFocus.overMs, true)
      : formatTimer(activeFocus.remainingMs);
  const funnel = FUNNEL_STAGES[activeFocus.funnelStage] || FUNNEL_STAGES.unsorted;

  const handleQuickAdd = (label) => {
    if (!label?.trim()) return;
    onAddAnother(label.trim());
    setAddInput('');
    setAddMode(null);
  };

  const openEdit = () => {
    setEditLabel(activeFocus.label);
    setEditTimer(activeFocus.timerMinutes || 15);
    setEditFunnel(activeFocus.funnelStage || 'unsorted');
    setEditTags(activeFocus.tags || {});
    setEditing(true);
  };

  const saveEdit = async () => {
    const resp = await actions.updateFocus(activeFocus.id, {
      label: editLabel,
      timerMinutes: editTimer,
      funnelStage: editFunnel,
      tags: editTags,
    });
    if (resp?.error) {
      if (resp.needsConfirm) {
        if (window.confirm(`⚠️ ${resp.error}`)) {
          await actions.updateFocus(activeFocus.id, { label: editLabel, timerMinutes: editTimer, funnelStage: editFunnel, tags: editTags, confirmed: true });
        } else {
          return; // User cancelled — don't close editor
        }
      } else {
        alert(`🚫 ${resp.error}`);
        return;
      }
    }
    setEditing(false);
  };

  return (
    <GlassCard style={{ padding: '16px', marginBottom: '12px', position: 'relative', overflow: 'visible', borderLeft: isPaused ? '3px solid #ffa726' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: isPaused ? '#ffa726' : 'var(--color-accent-primary)', fontWeight: 600 }}>
              {isPaused ? '⏸ PAUSED' : activeFocus.focusState === 'drifted' ? '⚠️ DRIFTED' : '🎯 CURRENT FOCUS'}
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
          <div style={{ fontSize: '9px', color: isPaused ? '#ffa726' : 'var(--color-text-muted)', marginTop: '2px' }}>
            {isPaused ? 'paused' : activeFocus.isOver ? 'over time' : 'remaining'}
          </div>
        </div>
      </div>
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
        {isPaused ? (
          <Tooltip text="Resume this focus">
            <button onClick={() => actions.resumeFocus(activeFocus.id)} style={btnStyle('#66bb6a')}>▶ Resume</button>
          </Tooltip>
        ) : (
          <>
            <Tooltip text="Mark as resolved">
              <button onClick={() => actions.completeFocus(activeFocus.id)} style={btnStyle('#66bb6a')}>✓ Resolved</button>
            </Tooltip>
            <Tooltip text="Add 5 more minutes">
              <button onClick={() => actions.extendTimer(activeFocus.id, 5)} style={btnStyle('var(--color-accent-primary)')}>+5m</button>
            </Tooltip>
            <Tooltip text="Pause focus — timer stops, you can start a new focus">
              <button onClick={() => actions.pauseFocus(activeFocus.id)} style={btnStyle('#ffa726')}>⏸ Pause</button>
            </Tooltip>
          </>
        )}
        <Tooltip text="Edit label, timer, or funnel stage">
          <button onClick={openEdit} style={btnStyle(editing ? 'var(--color-accent-primary)' : 'var(--color-text-muted)')}>✏️ Edit</button>
        </Tooltip>
        <Tooltip text="Tag with client/project">
          <button onClick={() => setShowTags(!showTags)} style={btnStyle('var(--color-text-muted)')}>🏷</button>
        </Tooltip>
        <Tooltip text="Add a new intent">
          <button onClick={() => setAddMode(addMode === 'intent' ? null : 'intent')} style={btnStyle(addMode === 'intent' ? 'var(--color-accent-primary)' : 'var(--color-text-muted)')}>+ Intent</button>
        </Tooltip>
      </div>
      {/* Inline edit panel */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
            <div style={{ marginTop: '10px', padding: '10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '2 1 180px' }}>
                <label style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '2px' }}>Label</label>
                <input value={editLabel} onChange={e => setEditLabel(e.target.value)} style={{ width: '100%', padding: '4px 8px', fontSize: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', outline: 'none' }} />
              </div>
              <div style={{ flex: '0 0 70px' }}>
                <label style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '2px' }}>Timer (m)</label>
                <input type="number" value={editTimer} onChange={e => setEditTimer(parseInt(e.target.value) || 15)} min={1} style={{ width: '100%', padding: '4px 8px', fontSize: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', outline: 'none' }} />
              </div>
              <div style={{ flex: '0 0 120px' }}>
                <label style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '2px' }}>Stage</label>
                <select value={editFunnel} onChange={e => setEditFunnel(e.target.value)} style={{ width: '100%', padding: '4px 8px', fontSize: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', outline: 'none' }}>
                  {Object.entries(FUNNEL_STAGES).map(([key, val]) => (
                    <option key={key} value={key}>{val.icon} {val.label}</option>
                  ))}
                </select>
              </div>
              <button onClick={saveEdit} style={btnStyle('#66bb6a')}>💾 Save</button>
              <button onClick={() => setEditing(false)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '12px', padding: '4px' }}>✕</button>
            </div>
            <div style={{ marginTop: '8px' }}>
              <label style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '4px' }}>Project / Client</label>
              <TagPicker tags={editTags} onChange={setEditTags} compact={false} clients={clients} projects={projects} tasks={tasks} onPersist={onPersist} orgData={orgData} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {showTags && (
        <div style={{ marginTop: '8px' }}>
          <TagPicker tags={activeFocus.tags || {}} onChange={(tags) => actions.updateTags(null, tags)} compact={false} clients={clients} projects={projects} tasks={tasks} onPersist={onPersist} orgData={orgData} />
        </div>
      )}
      {/* Quick add — enhanced with ComboInput */}
      {addMode && (
        <div style={{ marginTop: '10px', display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <ComboInput
              value={addInput}
              onChange={setAddInput}
              options={[]} 
              placeholder={addMode === 'intent' ? 'New intent name...' : 'Sub-focus name...'}
              onSubmit={handleQuickAdd}
              size="sm"
              icon={addMode === 'intent' ? '🎯' : '📌'}
              allowCreate={false}
            />
          </div>
          <Tooltip text={`Add ${addMode} without interrupting current focus`}>
            <button onClick={() => handleQuickAdd(addInput)} style={btnStyle('var(--color-accent-secondary)')}>+ Add</button>
          </Tooltip>
          <button onClick={() => { setAddMode(null); setAddInput(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '12px', padding: '4px' }}>✕</button>
        </div>
      )}
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
          <GlassCard key={item.id} style={{ padding: '8px 12px', marginBottom: '4px', borderLeft: item.focusState === 'paused' ? '3px solid #ffa726' : `3px solid ${funnel.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => item.focusState === 'paused' ? actions.resumeFocus(item.id) : actions.switchFocus(item.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span style={{ fontSize: '10px', color: funnel.color }}>{funnel.icon}</span>
                <span style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                {item.focusState === 'paused' && <span style={{ fontSize: '9px', color: '#ffa726' }}>⏸</span>}
                <span style={{ fontSize: '10px', color: funnel.color, textTransform: 'capitalize' }}>{item.funnelStage || 'unsorted'}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                {item.focusState === 'paused' ? (
                  <Tooltip text="Resume this focus">
                    <button onClick={(e) => { e.stopPropagation(); actions.resumeFocus(item.id); }} style={btnStyle('#ffa726')}>▶ Resume</button>
                  </Tooltip>
                ) : (
                  <Tooltip text="Switch to this focus">
                    <button onClick={(e) => { e.stopPropagation(); actions.switchFocus(item.id); }} style={btnStyle('var(--color-accent-primary)')}>▶</button>
                  </Tooltip>
                )}
                <Tooltip text="Mark as resolved">
                  <button onClick={(e) => { e.stopPropagation(); actions.completeFocus(item.id); }} style={btnStyle('#66bb6a')}>✓</button>
                </Tooltip>
              </div>
            </div>
            {/* Compact stage picker */}
            <div style={{ marginTop: '4px' }} onClick={(e) => e.stopPropagation()}>
              <StagePicker compact currentStage={item.funnelStage} onChange={(stage) => actions.updateFocus(item.id, { funnelStage: stage })} />
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

// ── CollapsibleSection ──
function CollapsibleSection({ id, title, icon, defaultOpen = true, children, collapsedSections, toggleSection, compact }) {
  const isOpen = collapsedSections ? !collapsedSections.includes(id) : defaultOpen;

  return (
    <div id={`section-${id}`} style={{ marginBottom: isOpen ? '12px' : (compact ? '0' : '4px') }}>
      <button
        onClick={() => toggleSection?.(id)}
        style={{
          background: 'transparent', border: 'none', color: 'var(--color-text-muted)',
          fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em',
          fontWeight: 600, cursor: 'pointer', padding: compact && !isOpen ? '0' : '2px 0',
          marginBottom: isOpen ? '6px' : '0', display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
        }}
      >
        <span style={{ fontSize: '12px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
        {icon && <span style={{ fontSize: '11px' }}>{icon}</span>}
        {title}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
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
            {item.focusState === 'drifted' ? '⚠️' : item.funnelStage === 'resolved' ? '🏁' : '✅'} {item.label}
            {item.funnelStage && <span style={{ fontSize: '9px', marginLeft: '4px', color: 'var(--color-text-muted)' }}>({item.funnelStage})</span>}
          </span>
          <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{formatElapsed(item.elapsedMs)}</span>
        </div>
      ))}
    </div>
  );
}

// ── FocusInput (when no focus is set) ──
function FocusInput({ onStart, orgData, clients, projects }) {
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);
  const [pending, setPending] = useState(false);
  const [showTagSetup, setShowTagSetup] = useState(false);
  const [tags, setTags] = useState({ realm: 'personal', client: 'Self' });
  const [timer, setTimer] = useState(15);
  const [taskInput, setTaskInput] = useState('');
  const [selectedTasks, setSelectedTasks] = useState([]); // array of task name strings

  const taskOptions = useMemo(() => {
    if (!orgData) return [];
    return orgData.taskList.filter(t => t.status !== 'completed').map(t => t.name);
  }, [orgData]);

  const addTask = (name) => {
    if (!name?.trim()) return;
    const trimmed = name.trim();
    if (!selectedTasks.includes(trimmed)) {
      setSelectedTasks(prev => [...prev, trimmed]);
      // Persist to org registry
      if (orgData) orgData.findOrCreateTask(trimmed);
    }
    setTaskInput('');
  };

  const removeTask = (name) => {
    setSelectedTasks(prev => prev.filter(t => t !== name));
  };

  const handleSubmit = async () => {
    if (!input.trim()) {
      setShake(true);
      setTimeout(() => setShake(false), 600);
      return;
    }
    setPending(true);
    try {
      // Merge selected tasks into tags
      const finalTags = { ...tags };
      if (selectedTasks.length > 0) {
        finalTags.tasks = selectedTasks;
        finalTags.task = selectedTasks[0]; // primary task
      }
      const result = await onStart(input.trim(), timer, finalTags);
      console.log('[Tabatha] FocusInput startFocus result:', result);
      if (result?.error) {
        console.error('[Tabatha] FocusInput error:', result.error);
      }
      setInput('');
      setTags({ realm: 'personal', client: 'Self' });
      setSelectedTasks([]);
      setShowTagSetup(false);
    } catch(e) {
      console.error('[Tabatha] FocusInput exception:', e);
    } finally {
      setTimeout(() => setPending(false), 500);
    }
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
            disabled={pending}
            style={{ flex: 1, background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--color-text-primary)', fontSize: '14px', outline: 'none', opacity: pending ? 0.5 : 1 }}
          />
          <VoiceInput onResult={(text) => setInput(prev => prev ? `${prev} ${text}` : text)} size="sm" disabled={pending} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
            <input type="number" value={timer} onChange={e => setTimer(Math.max(1, parseInt(e.target.value) || 15))} min={1}
              style={{ width: '48px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px', color: 'var(--color-text-primary)', fontSize: '12px', outline: 'none', textAlign: 'center' }}
            />
            <span style={{ fontSize: '8px', color: 'var(--color-text-muted)' }}>min</span>
          </div>
          <PopButton onClick={handleSubmit} size="sm" disabled={pending}>{pending ? '⏳ Setting…' : 'Set Focus'}</PopButton>
        </div>
        {/* Quick realm toggle + tag setup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '2px' }}>
            {['personal', 'business'].map(r => (
              <button
                key={r}
                onClick={() => setTags(t => ({ ...t, realm: r, client: r === 'personal' && !t.client ? 'Self' : t.client }))}
                style={{
                  background: tags.realm === r ? 'var(--color-accent-primary)' : 'transparent',
                  color: tags.realm === r ? '#fff' : 'var(--color-text-muted)',
                  border: `1px solid ${tags.realm === r ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-sm)', fontSize: '10px', padding: '2px 8px',
                  cursor: 'pointer', fontWeight: 500,
                }}
              >
                {r === 'business' ? '💼' : '🏠'} {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          {tags.client && (
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>→ {tags.client}</span>
          )}
          <button
            onClick={() => setShowTagSetup(!showTagSetup)}
            style={{ background: 'transparent', border: 'none', color: 'var(--color-accent-primary)', fontSize: '10px', cursor: 'pointer', fontWeight: 600, marginLeft: 'auto' }}
          >
            {showTagSetup ? 'Less ▲' : 'More ▼'}
          </button>
        </div>

        {/* Multi-task picker */}
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '3px' }}>Tasks for this focus</div>
          {/* Selected tasks as chips */}
          {selectedTasks.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
              {selectedTasks.map(name => (
                <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', background: 'var(--color-accent-primary)18', border: '1px solid var(--color-accent-primary)44', color: 'var(--color-text-primary)', padding: '1px 6px', borderRadius: '10px' }}>
                  ✏️ {name}
                  <button onClick={() => removeTask(name)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '8px', padding: '0 1px', lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          {/* Task input with autocomplete */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <ComboInput
              value={taskInput}
              onChange={setTaskInput}
              options={taskOptions.filter(t => !selectedTasks.includes(t))}
              placeholder="Add a task..."
              onSubmit={(val) => addTask(val)}
              size="sm"
              icon="✏️"
              allowCreate={true}
            />
            <button onClick={() => addTask(taskInput)} disabled={!taskInput.trim()}
              style={{ background: 'transparent', border: '1px solid var(--color-border)', color: taskInput.trim() ? 'var(--color-accent-primary)' : 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontSize: '10px', cursor: 'pointer', fontWeight: 600, opacity: taskInput.trim() ? 1 : 0.4 }}>+</button>
          </div>
        </div>

        {showTagSetup && (
          <div style={{ marginTop: '8px' }}>
            <TagPicker tags={tags} onChange={setTags} compact={false} clients={clients || []} projects={projects || []} tasks={taskOptions} orgData={orgData}
              onPersist={(field, value) => {
                if (!orgData) return;
                if (field === 'client') orgData.findOrCreateClient(value);
                else if (field === 'project') orgData.findOrCreateProject(value);
                else if (field === 'task') orgData.findOrCreateTask(value);
              }}
            />
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}

// ════════════════════════════════════════════
// TasksPanel — Task management
// ════════════════════════════════════════════

function TasksPanel({ actions, allItems, onLinkRequest, orgData }) {
  const [tasks, setTasks] = useChromeStorage('tasks', []);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newClient, setNewClient] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('active'); // 'active' | 'completed' | 'all'
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAsanaGid, setEditAsanaGid] = useState('');

  const projectOptions = useMemo(() => orgData?.projectList?.filter(p => !p.archived).map(p => p.name) || [], [orgData]);
  const clientOptions = useMemo(() => orgData?.clientList?.filter(c => !c.archived).map(c => c.name) || [], [orgData]);

  // Auto-fill cascade: project → client
  const handleProjectSelect = (val) => {
    setNewProject(val);
    if (val && orgData) {
      const proj = orgData.projectList.find(p => p.name.toLowerCase() === val.toLowerCase());
      if (proj?.clientId) {
        const cli = orgData.org.clients[proj.clientId];
        if (cli && !cli.archived) setNewClient(cli.name);
      }
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const payload = { name: newName.trim(), description: newDesc.trim() };
    if (newProject.trim()) payload.project = newProject.trim();
    if (newClient.trim()) payload.client = newClient.trim();
    await sendMessage('CREATE_TASK', payload);
    // Also persist to org registry
    if (orgData) {
      const taskId = orgData.findOrCreateTask(newName.trim());
      if (newProject.trim()) orgData.findOrCreateProject(newProject.trim());
      if (newClient.trim()) orgData.findOrCreateClient(newClient.trim());
    }
    setNewName('');
    setNewDesc('');
    setNewProject('');
    setNewClient('');
    setShowCreate(false);
  };

  const handleComplete = async (taskId) => {
    await sendMessage('UPDATE_TASK', { taskId, updates: { status: 'completed', completedAt: new Date().toISOString() } });
  };

  const handleReopen = async (taskId) => {
    await sendMessage('UPDATE_TASK', { taskId, updates: { status: 'active', completedAt: null } });
  };

  const handleDelete = async (taskId) => {
    // Search both legacy and org tasks
    const legacyTask = tasks.find(t => t.id === taskId);
    const orgTask = (orgData?.taskList || []).find(t => t.id === taskId);
    const task = legacyTask || orgTask;
    if (!window.confirm(`Delete task "${task?.name || 'this task'}"? This cannot be undone.`)) return;
    if (legacyTask) {
      await sendMessage('DELETE_TASK', { taskId });
    }
    if (orgTask && orgData?.archiveEntity) {
      await orgData.archiveEntity('tasks', taskId);
    }
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditName(task.name);
    setEditDesc(task.description || '');
    setEditAsanaGid(task.asanaGid || '');
  };

  const saveEdit = async () => {
    if (editingId && editName.trim()) {
      const updates = { name: editName.trim(), description: editDesc.trim() };
      if (editAsanaGid.trim()) updates.asanaGid = editAsanaGid.trim();
      await sendMessage('UPDATE_TASK', { taskId: editingId, updates });
    }
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const handleStartIntent = async (task) => {
    await actions.startFocus(task.name, null, { task: task.id });
  };

  // Task-specific stage stages (subset of focus stages)
  const TASK_STAGES = {
    unsorted: { icon: '📥', label: 'Unsorted', color: '#9e9e9e' },
    backlog: { icon: '📋', label: 'Backlog', color: '#78909c' },
    todo: { icon: '📝', label: 'Todo', color: '#64b5f6' },
    focus: { icon: '🎯', label: 'Focused', color: '#ffa726' },
    addressing: { icon: '⚡', label: 'Addressing', color: '#66bb6a' },
    roadblocked: { icon: '🚧', label: 'Roadblocked', color: '#ef5350' },
  };

  const handleStageChange = async (taskId, stage) => {
    const resp = await sendMessage('UPDATE_TASK', { taskId, updates: { funnelStage: stage } });
    if (resp?.error) {
      if (resp.needsConfirm) {
        if (window.confirm(`⚠️ ${resp.error}`)) {
          await sendMessage('UPDATE_TASK', { taskId, updates: { funnelStage: stage }, confirmed: true });
        }
      } else {
        alert(`🚫 ${resp.error}`);
      }
    }
  };

  // Merge legacy tasks + org registry tasks into one unified list
  const mergedTasks = useMemo(() => {
    const legacyIds = new Set(tasks.map(t => t.id));
    // Normalize org task status: 'open' → 'active', 'complete' → 'completed'
    const normalizeStatus = (s) => {
      if (s === 'open' || !s) return 'active';
      if (s === 'complete') return 'completed';
      return s;
    };
    const orgTasks = (orgData?.taskList || [])
      .filter(t => !legacyIds.has(t.id)) // avoid duplicates
      .map(t => ({ ...t, status: normalizeStatus(t.status), source: 'org' }));
    return [...tasks.map(t => ({ ...t, source: 'legacy' })), ...orgTasks];
  }, [tasks, orgData?.taskList]);

  const filtered = useMemo(() => {
    if (filter === 'all') return mergedTasks;
    return mergedTasks.filter(t => t.status === filter);
  }, [mergedTasks, filter]);

  // Find linked intents for each task
  const getLinkedIntents = (taskId) => {
    return (allItems || []).filter(item => item.tags?.task === taskId);
  };

  const btnStyle = (active) => ({
    background: active ? 'var(--color-accent-primary)' : 'transparent',
    color: active ? '#000' : 'var(--color-text-muted)',
    border: '1px solid var(--color-border)', borderRadius: '4px',
    padding: '2px 8px', fontSize: '10px', cursor: 'pointer', fontWeight: 600,
  });

  const actionBtn = { background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', cursor: 'pointer' };

  return (
    <motion.div key="tasks" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['active', 'completed', 'all'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={btnStyle(filter === f)}>
              {f === 'active' ? '📋' : f === 'completed' ? '✅' : '📁'} {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{
          background: 'var(--color-accent-primary)', border: 'none', color: '#000',
          borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600,
        }}>+ New Task</button>
      </div>

      {/* Create form — now with optional Project/Client */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: '10px' }}>
            <GlassCard style={{ padding: '12px' }}>
              <input type="text" placeholder="Task name..." value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
                style={{ width: '100%', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '6px 10px', color: 'var(--color-text-primary)', fontSize: '12px', outline: 'none', marginBottom: '6px', boxSizing: 'border-box' }}
              />
              <input type="text" placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                style={{ width: '100%', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '4px 10px', color: 'var(--color-text-primary)', fontSize: '11px', outline: 'none', marginBottom: '6px', boxSizing: 'border-box' }}
              />
              {/* Optional project/client */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                <ComboInput
                  label="Project (optional)"
                  value={newProject}
                  onChange={handleProjectSelect}
                  options={projectOptions}
                  placeholder="Select project..."
                  icon="📁"
                />
                <ComboInput
                  label="Client (optional)"
                  value={newClient}
                  onChange={setNewClient}
                  options={clientOptions}
                  placeholder="Select client..."
                  icon="👤"
                />
              </div>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowCreate(false)} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleCreate} disabled={!newName.trim()} style={{ background: 'var(--color-accent-primary)', border: 'none', color: '#000', borderRadius: '4px', padding: '3px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 600, opacity: newName.trim() ? 1 : 0.5 }}>Create</button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task list */}
      {filtered.length === 0 ? (
        <GlassCard style={{ padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: 0 }}>
            {filter === 'completed' ? 'No completed tasks yet.' : 'No tasks yet. Create one to organize your intents.'}
          </p>
        </GlassCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map(task => {
            const linked = getLinkedIntents(task.id);
            const isCompleted = task.status === 'completed';
            const isEditing = editingId === task.id;
            return (
              <GlassCard key={task.id} style={{ padding: '10px 14px', opacity: isCompleted ? 0.65 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <button onClick={() => isCompleted ? handleReopen(task.id) : handleComplete(task.id)}
                      style={{ background: 'transparent', border: `1.5px solid ${isCompleted ? '#66bb6a' : 'var(--color-border)'}`, borderRadius: '50%', width: '16px', height: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#66bb6a', padding: 0, flexShrink: 0 }}>
                      {isCompleted ? '✓' : ''}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <>
                          <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                            style={{ width: '100%', background: 'transparent', border: '1px solid var(--color-accent-primary)', borderRadius: '3px', padding: '2px 6px', color: 'var(--color-text-primary)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                          />
                          <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description..."
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                            style={{ width: '100%', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '3px', padding: '2px 6px', color: 'var(--color-text-muted)', fontSize: '10px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }}
                          />
                          <input value={editAsanaGid} onChange={e => setEditAsanaGid(e.target.value)} placeholder="Asana GID (optional)"
                            style={{ width: '100%', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '3px', padding: '2px 6px', color: 'var(--color-text-muted)', fontSize: '10px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }}
                          />
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, textDecoration: isCompleted ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{task.name}</div>
                            {!isCompleted && (() => {
                              const stage = TASK_STAGES[task.funnelStage || 'unsorted'] || TASK_STAGES.unsorted;
                              return <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '3px', background: stage.color + '22', color: stage.color, fontWeight: 600, flexShrink: 0 }}>{stage.icon} {stage.label}</span>;
                            })()}
                          </div>
                          {task.description && <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{task.description}</div>}
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {linked.length > 0 && (
                      <Tooltip text={`${linked.length} linked intent${linked.length !== 1 ? 's' : ''}`}>
                        <span style={{ fontSize: '9px', background: 'var(--color-accent-primary)22', color: 'var(--color-accent-primary)', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>🔗 {linked.length}</span>
                      </Tooltip>
                    )}
                    {isEditing ? (
                      <>
                        <button onClick={saveEdit} style={{ ...actionBtn, borderColor: '#66bb6a', color: '#66bb6a' }}>✓ Save</button>
                        <button onClick={cancelEdit} style={actionBtn}>✕</button>
                      </>
                    ) : (
                      <>
                        {!isCompleted && (
                          <Tooltip text="Start a focus from this task">
                            <button onClick={() => handleStartIntent(task)} style={actionBtn}>🎯</button>
                          </Tooltip>
                        )}
                        <Tooltip text="Edit task">
                          <button onClick={() => startEdit(task)} style={actionBtn}>✏️</button>
                        </Tooltip>
                        <Tooltip text="Link to intent">
                          <button onClick={() => onLinkRequest?.(task, 'task')} style={actionBtn}>🔗</button>
                        </Tooltip>
                        <Tooltip text="Delete task">
                          <button onClick={() => handleDelete(task.id)} style={{ background: 'transparent', border: 'none', color: '#ef535088', fontSize: '11px', cursor: 'pointer', padding: '0 2px' }}>🗑</button>
                        </Tooltip>
                      </>
                    )}
                  </div>
                </div>
                {/* Task Stage Picker — shown for non-completed tasks */}
                {!isCompleted && (
                  <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                    {Object.entries(TASK_STAGES).map(([key, stage]) => (
                      <button key={key} onClick={() => handleStageChange(task.id, key)}
                        style={{ background: (task.funnelStage || 'unsorted') === key ? stage.color + '33' : 'transparent', border: `1px solid ${(task.funnelStage || 'unsorted') === key ? stage.color : 'var(--color-border)'}`, color: (task.funnelStage || 'unsorted') === key ? stage.color : 'var(--color-text-muted)', borderRadius: '3px', padding: '1px 5px', fontSize: '8px', cursor: 'pointer', fontWeight: (task.funnelStage || 'unsorted') === key ? 600 : 400 }}>
                        {stage.icon} {stage.label}
                      </button>
                    ))}
                  </div>
                )}
                {linked.length > 0 && (
                  <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {linked.map(intent => (
                      <span key={intent.id} style={{ fontSize: '9px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '1px 6px', borderRadius: '3px' }}>🎯 {intent.label}</span>
                    ))}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ════════════════════════════════════════════
// IntentsPanel — All intents (separate from tabs)
// ════════════════════════════════════════════

function IntentsPanel({ intentHistory, allItems, tabs, timeTracking, actions, onLinkRequest }) {
  const [expanded, setExpanded] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [linkingTabFor, setLinkingTabFor] = useState(null);

  const handleLinkTab = async (focusId, tabId) => {
    await sendMessage('ASSOCIATE_TAB_WITH_FOCUS', { focusId, tabId: parseInt(tabId) });
    setLinkingTabFor(null);
  };

  // Build intents from focus items + history
  const intents = useMemo(() => {
    const map = {};

    // 1. Focus items are the primary source
    allItems.forEach(item => {
      map[item.id] = {
        id: item.id,
        label: item.label,
        funnelStage: item.funnelStage || 'unsorted',
        focusState: item.focusState,
        createdAt: item.createdAt,
        isFocusItem: true,
        associatedTabIds: item.associatedTabIds || [],
        tags: item.tags || {},
      };
    });

    // 2. History intents that aren't already focus items
    if (intentHistory) {
      const focusLabels = new Set(allItems.map(i => i.label.toLowerCase()));
      const seen = new Set();
      intentHistory.forEach(entry => {
        if (entry.context && !focusLabels.has(entry.context.toLowerCase()) && !seen.has(entry.context.toLowerCase())) {
          seen.add(entry.context.toLowerCase());
          const histId = `hist_${entry.context.replace(/\s/g, '_').slice(0, 20)}`;
          if (!map[histId]) {
            map[histId] = {
              id: histId,
              label: entry.context,
              funnelStage: 'unsorted',
              focusState: null,
              createdAt: entry.timestamp,
              isFocusItem: false,
              associatedTabIds: [],
              tags: {},
            };
          }
        }
      });
    }

    return Object.values(map).sort((a, b) => {
      // Active first, then by creation date
      if (a.focusState === 'active' && b.focusState !== 'active') return -1;
      if (b.focusState === 'active' && a.focusState !== 'active') return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [allItems, intentHistory]);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const handleRename = async (id) => {
    if (editLabel.trim()) {
      await sendMessage('RENAME_FOCUS', { focusId: id, newLabel: editLabel.trim() });
    }
    setEditingId(null);
  };

  return (
    <motion.div key="intents" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
      {intents.length === 0 ? (
        <GlassCard style={{ padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎯</div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: '0 0 8px' }}>No intents yet.</p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>
            Intents appear here when you:<br/>
            • <strong>Set a focus</strong> from the input above<br/>
            • <strong>Navigate to a site</strong> and fill out the Intent-Popup<br/>
            • <strong>Inherit</strong> an active focus when visiting a new page
          </p>
        </GlassCard>
      ) : (
        intents.map(intent => {
          const funnel = FUNNEL_STAGES[intent.funnelStage] || FUNNEL_STAGES.unsorted;
          const assocTabs = (() => {
            // Match by explicit association
            const byId = intent.associatedTabIds
              .map(tid => ({ id: tid, ...(tabs[tid] || {}) }))
              .filter(t => t.title || t.url);
            const seenIds = new Set(byId.map(t => String(t.id)));
            // Also match tabs whose intent field matches this focus label
            Object.entries(tabs).forEach(([tid, tab]) => {
              if (!seenIds.has(tid) && tab.intent && tab.intent.toLowerCase() === intent.label.toLowerCase()) {
                byId.push({ id: parseInt(tid), ...tab });
                seenIds.add(tid);
              }
            });
            return byId;
          })();
          const totalTime = intent.associatedTabIds.reduce((sum, tid) => sum + ((timeTracking.byTab || {})[tid] || 0), 0);
          const isExpanded = expanded[intent.id];
          const isLinkingTab = linkingTabFor === intent.id;
          const linkedIds = new Set(assocTabs.map(t => String(t.id)));
          const unlinkedTabs = Object.entries(tabs).filter(([tid]) => !linkedIds.has(tid));

          return (
            <GlassCard key={intent.id} style={{ padding: '12px 14px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggle(intent.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '14px' }}>
                    {(FUNNEL_STAGES[intent.funnelStage] || FUNNEL_STAGES.unsorted).icon}
                  </span>
                  {intent.focusState === 'active' && <span style={{ fontSize: '9px' }} title="Currently active">🎯</span>}
                  {intent.focusState === 'paused' && <span style={{ fontSize: '9px' }} title="Paused">⏸</span>}
                  {editingId === intent.id ? (
                    <input
                      autoFocus
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onBlur={() => handleRename(intent.id)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(intent.id); if (e.key === 'Escape') setEditingId(null); }}
                      onClick={e => e.stopPropagation()}
                      style={{ background: 'transparent', border: '1px solid var(--color-accent-primary)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '13px', padding: '2px 6px', outline: 'none', flex: 1 }}
                    />
                  ) : (
                    <span style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{intent.label}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span onClick={(e) => { e.stopPropagation(); if (!isExpanded) toggle(intent.id); }} style={{ fontSize: '9px', background: funnel.color + '22', color: funnel.color, padding: '1px 5px', borderRadius: '3px', fontWeight: 600, cursor: 'pointer' }} title="Click to change stage">{funnel.icon} {funnel.label}</span>
                  {assocTabs.length > 0 && <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{assocTabs.length} tab{assocTabs.length !== 1 ? 's' : ''}</span>}
                  {totalTime > 0 && <span style={{ fontSize: '10px', color: 'var(--color-accent-primary)', fontWeight: 600 }}>{formatTime(totalTime)}</span>}
                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{isExpanded ? '▼' : '▶'}</span>
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <Tooltip text="Edit intent label">
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(intent.id); setEditLabel(intent.label); }} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>✏️ Rename</button>
                    </Tooltip>
                    <Tooltip text="Link to Task or Merge Intent">
                      <button onClick={(e) => { e.stopPropagation(); onLinkRequest?.(intent, 'intent'); }} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>🔗 Link/Merge</button>
                    </Tooltip>
                    <Tooltip text="Link an open tab to this intent">
                      <button onClick={(e) => { e.stopPropagation(); setLinkingTabFor(isLinkingTab ? null : intent.id); }} style={{ background: isLinkingTab ? 'var(--color-accent-primary)22' : 'transparent', border: `1px solid ${isLinkingTab ? 'var(--color-accent-primary)' : 'var(--color-border)'}`, color: isLinkingTab ? 'var(--color-accent-primary)' : 'var(--color-text-muted)', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>📄 Link Tab</button>
                    </Tooltip>
                    {intent.focusState !== 'active' && (
                      <Tooltip text="Switch to this focus">
                        <button onClick={(e) => { e.stopPropagation(); actions.switchFocus(intent.id); }} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>🎯 Focus</button>
                      </Tooltip>
                    )}
                    <Tooltip text="Mark as resolved">
                      <button onClick={(e) => { e.stopPropagation(); actions.completeFocus(intent.id); }} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>✅ Resolved</button>
                    </Tooltip>
                  </div>

                  {/* Inline Tab Picker */}
                  {isLinkingTab && (
                    <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'var(--color-bg-base)', borderRadius: '4px', border: '1px solid var(--color-border)', maxHeight: '120px', overflowY: 'auto' }}>
                      <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '4px' }}>Select a tab to link</div>
                      {unlinkedTabs.length === 0 ? (
                        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>All tabs already linked</div>
                      ) : unlinkedTabs.slice(0, 15).map(([tid, tab]) => (
                        <div key={tid} onClick={() => handleLinkTab(intent.id, tid)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', color: 'var(--color-text-primary)' }}>
                          {tab.favIconUrl && <img src={tab.favIconUrl} style={{ width: 12, height: 12 }} alt="" />}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.customTitle || tab.title || tab.url}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Funnel Stage Editor — always shown */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Stage</div>
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                      {Object.entries(FUNNEL_STAGES).map(([key, stage]) => (
                        <button key={key} onClick={async (e) => {
                          e.stopPropagation();
                          if (intent.isFocusItem) {
                            // Existing focus item — update stage via state machine
                            const resp = await actions.updateFocus(intent.id, { funnelStage: key });
                            if (resp?.error) {
                              if (resp.needsConfirm) {
                                // Backward transition or resolved rollback — ask for confirmation
                                if (window.confirm(`⚠️ ${resp.error}`)) {
                                  await actions.updateFocus(intent.id, { funnelStage: key, confirmed: true });
                                }
                              } else {
                                // Hard blocked (e.g. can't roll back to unsorted)
                                alert(`🚫 ${resp.error}`);
                              }
                            }
                          } else if (key === 'addressing') {
                            // "Addressing" = start & activate immediately
                            await actions.startFocus(intent.label, null, intent.tags);
                          } else {
                            // Other stages — add as queued focus, then set stage
                            const resp = await sendMessage('ADD_FOCUS', { label: intent.label, tags: intent.tags });
                            if (resp?.newFocusId) {
                              actions.updateFocus(resp.newFocusId, { funnelStage: key });
                            }
                          }
                        }}
                          style={{ background: intent.funnelStage === key ? stage.color + '33' : 'transparent', border: `1px solid ${intent.funnelStage === key ? stage.color : 'var(--color-border)'}`, color: intent.funnelStage === key ? stage.color : 'var(--color-text-muted)', borderRadius: '4px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer', fontWeight: intent.funnelStage === key ? 600 : 400 }}>
                          {stage.icon} {stage.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {assocTabs.length > 0 ? (
                    assocTabs.map(tab => (
                      <div key={tab.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '11px' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: 'var(--color-text-muted)' }}>
                          {tab.favIconUrl && <img src={tab.favIconUrl} style={{ width: 12, height: 12, marginRight: 4, verticalAlign: 'middle' }} alt="" />}
                          {tab.customTitle || tab.title || tab.url || `Tab ${tab.id}`}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--color-accent-primary)', fontWeight: 600, flexShrink: 0, marginLeft: '8px' }}>{formatTime((timeTracking.byTab || {})[tab.id] || 0)}</span>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0' }}>No tabs associated yet.</p>
                  )}
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                    Created: {new Date(intent.createdAt).toLocaleString()}
                    {intent.tags?.realm && <span> · {intent.tags.realm}</span>}
                  </div>
                </div>
              )}
            </GlassCard>
          );
        })
      )}
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
  const [settings] = useChromeStorage('settings', {});
  const [parkedTabs] = useChromeStorage('parkedTabs', []);
  const [sugarBox] = useChromeStorage('sugarBox', []);
  const [clockHistory] = useChromeStorage('clockHistory', []);
  const [companionRecentSessions] = useChromeStorage('companionRecentSessions', []);
  const [intentChangeLog] = useChromeStorage('intentChangeLog', []);
  const { activeFocus, allItems, history, actions, engine } = useFocusEngine();
  const orgData = useOrgData();
  const [activePanel, setActivePanel] = useState('logs');
  const [expandedSession, setExpandedSession] = useState(null);
  const [linkModalConfig, setLinkModalConfig] = useState({ isOpen: false, targetItem: null, type: null });
  const [recentlyClosed, setRecentlyClosed] = useState([]);
  const [welcomeBack, setWelcomeBack] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState([]);

  // Load collapsed state from storage
  useEffect(() => {
    chrome?.storage?.local?.get?.('collapsedSections', (result) => {
      if (result?.collapsedSections) setCollapsedSections(result.collapsedSections);
    });
  }, []);

  const toggleSection = useCallback((id) => {
    setCollapsedSections(prev => {
      const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id];
      chrome?.storage?.local?.set?.({ collapsedSections: next });
      return next;
    });
  }, []);

  // Listen for welcome back broadcasts
  useEffect(() => {
    const handler = (msg) => {
      if (msg?.type === 'WELCOME_BACK' && msg.idleDurationMs > 60000) {
        const mins = Math.round(msg.idleDurationMs / 60000);
        setWelcomeBack(`Welcome back! You were away for ${mins}m`);
        setTimeout(() => setWelcomeBack(null), 3000);
      }
    };
    chrome?.runtime?.onMessage?.addListener(handler);
    return () => chrome?.runtime?.onMessage?.removeListener(handler);
  }, []);

  const handleLinkRequest = (targetItem, type) => {
    setLinkModalConfig({ isOpen: true, targetItem, type });
  };

  useEffect(() => {
    const fetchRecentlyClosed = () => {
      if (chrome?.sessions?.getRecentlyClosed) {
        chrome.sessions.getRecentlyClosed({ maxResults: 10 }, (sessions) => {
          setRecentlyClosed(sessions.filter(s => s.tab).map(s => s.tab));
        });
      }
    };
    
    fetchRecentlyClosed();
    
    // Listen for changes to recently closed tabs
    const handleClosed = () => fetchRecentlyClosed();
    if (chrome?.tabs?.onRemoved) {
      chrome.tabs.onRemoved.addListener(handleClosed);
    }
    
    // Clock session and time tracking data arrive reactively via useChromeStorage — no polling needed
    return () => {
      // cleanup
      if (chrome?.tabs?.onRemoved) {
        chrome.tabs.onRemoved.removeListener(handleClosed);
      }
    };
  }, []);

  const tabCount = Object.keys(tabs).length;
  const totalActiveTime = useMemo(() => Object.values(timeTracking.byTab || {}).reduce((a, b) => a + b, 0), [timeTracking]);

  const sessions = useMemo(() => {
    const contextMap = {};
    Object.entries(tabs).forEach(([id, tab]) => {
      const ctx = tab.context || tab.category || 'unknown';
      if (!contextMap[ctx]) { contextMap[ctx] = { id: ctx, context: tab.context, category: tab.category || 'unknown', icon: CATEGORY_ICONS[tab.category] || '📄', title: tab.context || (tab.category ? tab.category.charAt(0).toUpperCase() + tab.category.slice(1) : 'Uncategorized'), tabCount: 0, totalTime: 0, active: false, tabIds: [] }; }
      contextMap[ctx].tabCount++;
      contextMap[ctx].totalTime += (timeTracking.byTab || {})[id] || 0;
      contextMap[ctx].tabIds.push(id);
    });
    return Object.values(contextMap).map(s => ({ ...s, timeStr: formatTime(s.totalTime), active: s.totalTime > 0 })).sort((a, b) => b.totalTime - a.totalTime);
  }, [tabs, timeTracking]);

  const categoryBreakdown = useMemo(() => {
    const byCat = {};
    Object.entries(tabs).forEach(([id, tab]) => { const cat = tab.category || 'unknown'; byCat[cat] = (byCat[cat] || 0) + ((timeTracking.byTab || {})[id] || 0); });
    return Object.entries(byCat).map(([cat, time]) => ({ cat, icon: CATEGORY_ICONS[cat] || '📄', name: cat.charAt(0).toUpperCase() + cat.slice(1), time, timeStr: formatTime(time) })).sort((a, b) => b.time - a.time);
  }, [tabs, timeTracking]);

  // Extract unique client/project names from all focus items for autocomplete
  const { knownClients, knownProjects } = useMemo(() => {
    const cls = new Set(['Self']);
    const pjs = new Set();
    const allFocusItems = [...Object.values(engine?.items || {}), ...(engine?.history || [])];
    for (const item of allFocusItems) {
      if (item.tags?.client) cls.add(item.tags.client);
      if (item.tags?.project) pjs.add(item.tags.project);
    }
    // Merge from persistent org registry
    orgData.clientList.forEach(c => cls.add(c.name));
    orgData.projectList.forEach(p => pjs.add(p.name));
    return { knownClients: [...cls], knownProjects: [...pjs] };
  }, [engine, orgData.clientList, orgData.projectList]);

  const THEMES = ['pop-art', 'corporate', 'midnight', 'matcha', 'terminal', 'sakura', 'blueprint', 'neo-brutalism', 'glass-ocean', 'retro-pixel', 'solarized-warm', 'high-contrast-dark'];
  const THEME_ICONS = { 'pop-art':'🎨', corporate:'🏢', midnight:'🌙', matcha:'🍵', terminal:'💻', sakura:'🌸', blueprint:'📐', 'neo-brutalism':'🟨', 'glass-ocean':'🌊', 'retro-pixel':'👾', 'solarized-warm':'📖', 'high-contrast-dark':'⚫' };
  const cycleTheme = () => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
  const [intentHistory] = useChromeStorage('intentHistory', []);
  const [clockSession] = useChromeStorage('clockSession', { active: false });
  const navTabs = [{ id: 'intents', label: '🎯 Intents' }, { id: 'tasks', label: '📋 Tasks' }, { id: 'projects', label: '🏢 Projects' }, { id: 'org', label: '🏛️ Org' }, { id: 'logs', label: '⏱ Logs' }, { id: 'tabs', label: '📑 Tabs' }, { id: 'contexts', label: '🗂 Sessions' }, { id: 'stashed', label: '📦 Stashed' }];

  // ── Command Palette state ──
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── Keyboard Shortcuts ──
  const { showHelp: showShortcuts, setShowHelp: setShowShortcuts } = useKeyboardShortcuts({
    onAction: (action) => {
      if (action === 'palette') setPaletteOpen(v => !v);
      else if (action === 'focus') window.scrollTo(0, 0);
      else if (action === 'break') sendMessage('TOGGLE_BREAK');
      else if (action === 'theme') cycleTheme();
      else if (action.startsWith('tab:')) setActivePanel(action.replace('tab:', ''));
    }
  });

  // Clock-in/out helpers — fire the message; useChromeStorage reactively updates the UI
  const [clockDebug, setClockDebug] = useState('(no action yet)');
  const handleClockIn = async () => {
    setClockDebug('Sending CLOCK_IN...');
    const res = await sendMessage('CLOCK_IN');
    setClockDebug('CLOCK_IN → ' + JSON.stringify(res));
    if (res?.error) logger.error('CLOCK', 'Clock-in failed', res);
  };
  const handleClockOut = async () => {
    setClockDebug('Sending CLOCK_OUT...');
    const res = await sendMessage('CLOCK_OUT');
    setClockDebug('CLOCK_OUT → ' + JSON.stringify(res));
    if (res?.error) logger.error('CLOCK', 'Clock-out failed', res);
  };
  const handleToggleBreak = async () => {
    setClockDebug('Sending TOGGLE_BREAK...');
    const res = await sendMessage('TOGGLE_BREAK');
    setClockDebug('TOGGLE_BREAK → ' + JSON.stringify(res));
    if (res?.error) logger.error('CLOCK', 'Toggle-break failed', res);
  };

  // Live clock session timer
  const [clockElapsed, setClockElapsed] = useState('');
  const [lastSession, setLastSession] = useState(null);
  const [recentShifts, setRecentShifts] = useState([]);

  // Fetch last session and recent shifts
  useEffect(() => {
    sendMessage('GET_LAST_SESSION').then(res => {
      if (res?.lastSession) setLastSession(res.lastSession);
    }).catch(() => {});
    sendMessage('GET_CLOCK_HISTORY').then(res => {
      if (res?.history) setRecentShifts(res.history.slice(0, 5));
    }).catch(() => {});
  }, [clockSession?.active]); // refresh when clock state changes

  useEffect(() => {
    if (!clockSession?.active) { setClockElapsed(''); return; }
    const tick = () => {
      const start = new Date(clockSession.clockedInAt).getTime();
      let breakMs = 0;
      for (const b of clockSession.breaks || []) {
        breakMs += new Date(b.end).getTime() - new Date(b.start).getTime();
      }
      if (clockSession.onBreak && clockSession.breakStartedAt) {
        breakMs += Date.now() - new Date(clockSession.breakStartedAt).getTime();
      }
      const worked = Date.now() - start - breakMs;
      const h = Math.floor(worked / 3600000);
      const m = Math.floor((worked % 3600000) / 60000);
      const s = Math.floor((worked % 60000) / 1000);
      setClockElapsed(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [clockSession]);

  // Current highest priority focus item for NowBar
  const nowItem = useMemo(() => {
    if (!allItems || allItems.length === 0) return null;
    const active = allItems.filter(i => i.focusState === 'active' || i.focusState === 'paused');
    if (active.length === 0) return null;
    // Sort by priority (1=highest) then by active first
    return active.sort((a, b) => ((a.priority || 10) - (b.priority || 10)) || (a.focusState === 'active' ? -1 : 1))[0];
  }, [allItems]);

  const clockScale = clockSettings?.scale || 1;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 0, fontFamily: "'Inter', system-ui, sans-serif", transition: 'background-color 0.3s ease, color 0.3s ease' }}>
      {theme === 'pop-art' && (<div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.03, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '12px 12px' }} />)}

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '1100px', padding: '8px 32px 0' }}>
        {/* Header Row — Greeting (left) | Clock (center) | Right Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '16px', flexWrap: 'nowrap' }}>
          
          {/* Left — Greeting */}
          <div style={{ flex: '1 1 0', minWidth: 0 }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getGreeting()}{settings.userName ? `, ${settings.userName}` : ''}</h1>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {tabCount} tab{tabCount !== 1 ? 's' : ''} open · {formatTime(totalActiveTime)} active today
              {settings.profileLabel && (
                <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '6px', background: 'var(--color-accent-primary)', color: '#000', letterSpacing: '0.02em' }}>{settings.profileLabel}</span>
              )}
            </p>
          </div>

          {/* Center — FlipClock */}
          <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '56px', overflow: 'visible' }}>
            <div style={{ transform: `scale(${clockScale})`, transformOrigin: 'center' }}>
              <FlipClock settings={clockSettings} />
            </div>
          </div>

          {/* Right — Utilities */}
          <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {sugarBox.length > 0 && (
              <Tooltip text={`${sugarBox.length} item${sugarBox.length !== 1 ? 's' : ''} in Sugar Box`}>
                <button onClick={() => setActivePanel('stashed')} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', padding: '3px 7px', fontSize: '11px', cursor: 'pointer', backdropFilter: 'var(--surface-blur)' }}>🍬 {sugarBox.length}</button>
              </Tooltip>
            )}
            {parkedTabs.length > 0 && (
              <Tooltip text={`${parkedTabs.length} parked tab${parkedTabs.length !== 1 ? 's' : ''}`}>
                <button onClick={() => setActivePanel('stashed')} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', padding: '3px 7px', fontSize: '11px', cursor: 'pointer', backdropFilter: 'var(--surface-blur)' }}>🅿️ {parkedTabs.length}</button>
              </Tooltip>
            )}
            <CompanionStatus compact />
            <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-accent-primary)', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.6 }}>v{chrome.runtime.getManifest?.()?.version || '?'}-α</span>
            <Tooltip text={`Theme: ${theme} — click to cycle`}>
              <button onClick={cycleTheme} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', padding: '5px 8px', fontSize: '13px', cursor: 'pointer', backdropFilter: 'var(--surface-blur)' }}>
                {THEME_ICONS[theme] || '🎨'}
              </button>
            </Tooltip>
            <Tooltip text="Open settings">
              <button onClick={() => { if (chrome?.runtime?.openOptionsPage) chrome.runtime.openOptionsPage(); }} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', padding: '5px 8px', fontSize: '13px', cursor: 'pointer', backdropFilter: 'var(--surface-blur)' }}>⚙️</button>
            </Tooltip>
          </div>
        </div>

        {/* ═══ Collapsible: Shift Controls ═══ */}
        <CollapsibleSection id="shift" title="Shift Controls" icon="⏱️" collapsedSections={collapsedSections} toggleSection={toggleSection}>
          <GlassCard style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {clockSession?.active ? '🟢 Clocked In' : '⚪ Clocked Out'}
                {clockSession?.onBreak && <span style={{ fontSize: '9px', background: '#ffa72622', color: '#ffa726', padding: '2px 6px', borderRadius: '4px' }}>ON BREAK</span>}
              </div>
              {clockSession?.active ? (
                <div style={{ fontSize: '14px', fontWeight: 700, color: clockSession.onBreak ? '#ffa726' : 'var(--color-accent-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {clockElapsed || '0:00:00'}
                </div>
              ) : (
                lastSession && (
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--color-border)' }}>|</span>
                    Last stint: <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{(() => { const h = Math.floor(lastSession.workMs / 3600000); const m = Math.floor((lastSession.workMs % 3600000) / 60000); return h > 0 ? `${h}h ${m}m` : `${m}m`; })()}</span>
                  </div>
                )
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {clockSession?.active && (
                <Tooltip text={clockSession.onBreak ? 'End break and resume' : 'Start a break'}>
                  <button onClick={handleToggleBreak} style={{ background: clockSession.onBreak ? '#ffa72622' : 'transparent', border: `1px solid ${clockSession.onBreak ? '#ffa726' : 'var(--color-border)'}`, borderRadius: 'var(--radius-sm)', color: clockSession.onBreak ? '#ffa726' : 'var(--color-text-muted)', padding: '4px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                    {clockSession.onBreak ? '▶ Resume' : '☕ Break'}
                  </button>
                </Tooltip>
              )}
              <Tooltip text={clockSession?.active ? 'Clock out' : 'Clock in'}>
                <button onClick={clockSession?.active ? handleClockOut : handleClockIn} style={{ background: clockSession?.active ? '#ef535022' : '#66bb6a22', border: `1px solid ${clockSession?.active ? '#ef5350' : '#66bb6a'}`, borderRadius: 'var(--radius-sm)', color: clockSession?.active ? '#ef5350' : '#66bb6a', padding: '4px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                  {clockSession?.active ? '⏹ Clock Out' : '▶ Clock In'}
                </button>
              </Tooltip>
              <Tooltip text="View Shifts">
                <button onClick={() => chrome.tabs.create({ url: 'workshifts.html' })} style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>⏱️ Shifts</button>
              </Tooltip>
            </div>
          </GlassCard>
        </CollapsibleSection>

        {/* Debug Bar — only visible when debug mode is ON in settings */}
        {settings.debugMode && (
          <div style={{ background: '#1a1a2e', color: '#0f0', fontFamily: 'monospace', fontSize: '10px', padding: '6px 10px', marginBottom: '8px', borderRadius: '4px', wordBreak: 'break-all' }}>
            <div>clockSession: {JSON.stringify(clockSession)}</div>
            <div>lastAction: {clockDebug}</div>
          </div>
        )}

        {/* ═══ Collapsible: Now Bar ═══ */}
        {nowItem && (
          <CollapsibleSection id="nowbar" title="Now" icon="🎯" collapsedSections={collapsedSections} toggleSection={toggleSection}>
            <GlassCard style={{ padding: '8px 14px', borderLeft: '3px solid var(--color-accent-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-accent-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>NOW</span>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{nowItem.label}</span>
                  {nowItem.priority && nowItem.priority <= 10 && (
                    <Tooltip text={`Priority ${nowItem.priority} of 10`}>
                      <span style={{ fontSize: '9px', background: nowItem.priority <= 3 ? '#ff6b6b22' : nowItem.priority <= 6 ? '#ffa72622' : '#66bb6a22', color: nowItem.priority <= 3 ? '#ff6b6b' : nowItem.priority <= 6 ? '#ffa726' : '#66bb6a', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>P{nowItem.priority}</span>
                    </Tooltip>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                    {FUNNEL_STAGES[nowItem.funnelStage]?.icon} {FUNNEL_STAGES[nowItem.funnelStage]?.label}
                  </span>
                </div>
              </div>
            </GlassCard>
          </CollapsibleSection>
        )}

        {/* ═══ Collapsible: Focus Engine ═══ */}
        <CollapsibleSection id="focus" title="Focus Engine" icon="🔍" collapsedSections={collapsedSections} toggleSection={toggleSection}>
          {activeFocus ? (
            <>
              <FocusBar activeFocus={activeFocus} actions={actions} onAddAnother={(label) => actions.addFocus(label)} clients={knownClients} projects={knownProjects}
              tasks={orgData.taskList.filter(t => t.status !== 'completed').map(t => t.name)}
              orgData={orgData}
              onPersist={(field, value) => {
                if (field === 'client') orgData.findOrCreateClient(value);
                else if (field === 'project') orgData.findOrCreateProject(value);
                else if (field === 'task') orgData.findOrCreateTask(value);
              }}
            />
              {/* When paused, show FocusInput to set a new focus */}
              {activeFocus.focusState === 'paused' && (
                <FocusInput onStart={(label, timer, tags) => actions.startFocus(label, timer, tags)} orgData={orgData} clients={knownClients} projects={knownProjects} />
              )}
              <FocusQueue items={allItems} actions={actions} />
              <FocusHistory history={history} />
            </>
          ) : (
            <FocusInput onStart={(label, timer, tags) => actions.startFocus(label, timer, tags)} orgData={orgData} clients={knownClients} projects={knownProjects} />
          )}
        </CollapsibleSection>

        {/* ═══ Activity Heatmap ═══ */}
        <CollapsibleSection id="heatmap" title="Activity" icon="📊" collapsedSections={collapsedSections} toggleSection={toggleSection}>
          <ActivityHeatmap
            timeTracking={timeTracking}
            clockHistory={clockHistory}
            focusHistory={history}
            companionSessions={companionRecentSessions}
          />
        </CollapsibleSection>

        {/* ═══ Analytics Dashboard ═══ */}
        <CollapsibleSection id="analytics" title="Analytics" icon="📈" collapsedSections={collapsedSections} toggleSection={toggleSection}>
          <AnalyticsDashboard
            allItems={allItems}
            timeTracking={timeTracking}
            intentHistory={intentHistory}
            orgData={orgData}
            clockSession={clockSession}
          />
        </CollapsibleSection>

        {/* ═══ Collapsible: Context Activity Bar ═══ */}
        <CollapsibleSection id="activity" title="Context Activity" icon="📊" compact collapsedSections={collapsedSections} toggleSection={toggleSection}>
          <UnifiedTimeline compact={false} />
        </CollapsibleSection>

        {/* ═══ Collapsible: Nav Tabs ═══ */}
        <CollapsibleSection id="panels" title="Panels" icon="📋" collapsedSections={collapsedSections} toggleSection={toggleSection}>
        <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
          {navTabs.map(tab => (
            <Tooltip key={tab.id} text={`View ${tab.label.replace(/[^\w\s]/g, '').trim()} panel`}>
              <button onClick={() => setActivePanel(tab.id)} style={{ background: 'transparent', border: 'none', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', color: activePanel === tab.id ? 'var(--color-accent-primary)' : 'var(--color-text-muted)', fontWeight: activePanel === tab.id ? 600 : 400, borderBottom: activePanel === tab.id ? '2px solid var(--color-accent-primary)' : '2px solid transparent', transition: 'color 0.15s, border-color 0.15s', marginBottom: '-1px' }}>{tab.label}</button>
            </Tooltip>
          ))}
        </div>

        {/* Panels */}
        <AnimatePresence mode="wait">
          {activePanel === 'intents' && (
            <IntentsPanel intentHistory={intentHistory} allItems={allItems} tabs={tabs} timeTracking={timeTracking} actions={actions} onLinkRequest={handleLinkRequest} />
          )}
          {activePanel === 'tasks' && (
            <TasksPanel actions={actions} allItems={allItems} onLinkRequest={handleLinkRequest} orgData={orgData} />
          )}
          {activePanel === 'projects' && (
            <ProjectsClientsPanel orgData={orgData} />
          )}
          {activePanel === 'org' && (
            <InitiativesPanel orgData={orgData} />
          )}
          {activePanel === 'logs' && (
            <LogsPanel 
              intentHistory={intentHistory} 
              tabs={tabs} 
              timeTracking={timeTracking} 
              allItems={allItems}
              clockHistory={clockHistory}
              focusHistory={history}
              intentChangeLog={intentChangeLog}
            />
          )}
          {activePanel === 'tabs' && (
            <motion.div key="tabs" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {/* Active Tabs — 2-column grid */}
              <h3 style={{ fontSize: '13px', margin: '0 0 10px 0', color: 'var(--color-text-muted)' }}>Active Tabs ({Object.entries(tabs).length})</h3>
              {Object.entries(tabs).length === 0 ? (
                <GlassCard style={{ padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>📑</div>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: '0 0 8px' }}>No tracked tabs yet.</p>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>
                    Tabs appear here when Tabatha detects your open browser tabs.<br/>
                    Make sure the extension is loaded and you have tabs open.
                  </p>
                </GlassCard>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '16px' }}>
                  {Object.entries(tabs).map(([id, tab]) => (
                    <GlassCard key={id} style={{ padding: '8px 10px', cursor: 'pointer', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={tab.customTitle ? `Original: ${tab.title}` : ''}>
                            {CATEGORY_ICONS[tab.category] || '📄'} {tab.customTitle || tab.title || 'Untitled'}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.context || 'No context'} {tab.locked ? '🔒' : ''}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-accent-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatTime((timeTracking.byTab || {})[id] || 0)}</span>
                          <Tooltip text="Rename this tab">
                            <button onClick={() => {
                              const newTitle = prompt('Rename tab:', tab.customTitle || tab.title);
                              if (newTitle !== null && newTitle.trim()) sendMessage('RENAME_TAB', { tabId: parseInt(id), newTitle: newTitle.trim() });
                            }} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', padding: '1px 4px', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                          </Tooltip>
                          <Tooltip text="Focus this tab">
                            <button onClick={() => sendMessage('FOCUS_TAB', { tabId: parseInt(id) })} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', padding: '1px 4px', fontSize: '11px', cursor: 'pointer' }}>↗</button>
                          </Tooltip>
                          <Tooltip text="Link tab to an intent">
                            <button onClick={() => handleLinkRequest(tab, 'tab')} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', padding: '1px 4px', fontSize: '11px', cursor: 'pointer' }}>🔗</button>
                          </Tooltip>
                          <Tooltip text="Close this tab">
                            <button onClick={() => chrome.tabs.remove(parseInt(id))} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', padding: '1px 4px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                          </Tooltip>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}

              {/* Recently Closed — compact list below */}
              {recentlyClosed.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '11px', margin: '0 0 6px 0', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recently Closed ({recentlyClosed.length})</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {recentlyClosed.map(tab => {
                      let domain = '';
                      try { domain = new URL(tab.url).hostname.replace(/^www\./, ''); } catch(e) { domain = tab.url; }
                      return (
                        <div key={tab.sessionId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer', gap: '8px' }} onClick={() => chrome.sessions.restore(tab.sessionId)}>
                          <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {tab.title || 'Untitled'}
                            </span>
                            <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', flexShrink: 0, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {domain}
                            </span>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); chrome.sessions.restore(tab.sessionId); }} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', fontSize: '11px', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>↩</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
          {activePanel === 'contexts' && (
            <motion.div key="contexts" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {sessions.length === 0 ? (
                <GlassCard style={{ padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>🗂</div>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: '0 0 8px' }}>No active contexts.</p>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>
                    Contexts group tabs by their assigned intent or category.<br/>
                    Set context on tabs via the Intent-Popup when visiting sites.
                  </p>
                </GlassCard>
              ) : (
                sessions.map(session => (
                  <GlassCard key={session.id} style={{ padding: '16px', marginBottom: '10px', cursor: 'pointer' }} onClick={() => setExpandedSession(prev => prev === session.id ? null : session.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expandedSession === session.id ? '10px' : 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{session.icon} {session.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--color-accent-primary)', fontWeight: 600 }}>{session.timeStr}</span>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{expandedSession === session.id ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{session.tabCount} tab{session.tabCount !== 1 ? 's' : ''} · {session.category}</div>
                    {expandedSession === session.id && session.tabIds && (
                      <div style={{ marginTop: '10px', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }} onClick={e => e.stopPropagation()}>
                        {session.tabIds.map(tabId => {
                          const tab = tabs[tabId];
                          if (!tab) return null;
                          return (
                            <div key={tabId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--color-border)', fontSize: '12px' }}>
                              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {CATEGORY_ICONS[tab.category] || '📄'} {tab.title || 'Untitled'}
                              </div>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0, marginLeft: '8px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--color-accent-primary)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatTime((timeTracking.byTab || {})[tabId] || 0)}</span>
                                {/* Move to another session */}
                                <Tooltip text="Move to another session">
                                  <select
                                    defaultValue=""
                                    onChange={async (e) => {
                                      const newCtx = e.target.value;
                                      if (!newCtx) return;
                                      await sendMessage('UPDATE_TAB_CONTEXT', { tabId: parseInt(tabId), context: newCtx });
                                      e.target.value = '';
                                    }}
                                    style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', padding: '1px 3px', fontSize: '9px', cursor: 'pointer', maxWidth: '80px' }}
                                  >
                                    <option value="">Move…</option>
                                    {sessions.filter(s => s.id !== session.id).map(s => (
                                      <option key={s.id} value={s.id}>{s.title}</option>
                                    ))}
                                  </select>
                                </Tooltip>
                                <Tooltip text="Focus this tab">
                                  <button onClick={() => sendMessage('FOCUS_TAB', { tabId: parseInt(tabId) })} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', padding: '1px 5px', fontSize: '11px', cursor: 'pointer' }}>↗</button>
                                </Tooltip>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </GlassCard>
                ))
              )}
            </motion.div>
          )}
          {activePanel === 'stashed' && (
            <motion.div key="stashed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {parkedTabs.length === 0 && sugarBox.length === 0 ? (
                <GlassCard style={{ padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>📦</div>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: '0 0 8px' }}>Nothing stashed yet.</p>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>
                    Items appear here when you:<br/>
                    • Click <strong>🅿️ Park</strong> in the Intent-Popup to save a tab for later<br/>
                    • Click <strong>🍬 Sugar Box</strong> to save a site as a reward
                  </p>
                </GlassCard>
              ) : (
                <>
                  {parkedTabs.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '8px' }}>🅿️ Parked Tabs ({parkedTabs.length})</div>
                      {parkedTabs.map((tab, i) => (
                        <GlassCard key={i} style={{ padding: '10px 14px', marginBottom: '6px', cursor: 'pointer' }} onClick={() => window.open(tab.url, '_blank')}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.title || tab.url}</div>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Parked {new Date(tab.parkedAt).toLocaleDateString()}</span>
                                {tab.context && <span style={{ fontSize: '9px', padding: '0 4px', borderRadius: '3px', background: 'var(--color-accent-primary)22', color: 'var(--color-accent-primary)', fontWeight: 600 }}>{tab.context}</span>}
                                {tab.source === 'auto-park' && <span style={{ fontSize: '8px', color: '#ffa726', fontWeight: 600 }}>⏸ AUTO</span>}
                              </div>
                              {tab.note && (
                                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px', padding: '3px 6px', background: '#ffa72611', borderRadius: '3px', borderLeft: '2px solid #ffa726', fontStyle: 'italic' }}>
                                  📝 {tab.note.length > 80 ? tab.note.slice(0, 80) + '…' : tab.note}
                                </div>
                              )}
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--color-accent-primary)', flexShrink: 0, marginLeft: '8px' }}>↗ Open</span>
                          </div>
                        </GlassCard>
                      ))}
                    </div>
                  )}
                  {sugarBox.length > 0 && (
                    <div>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '8px' }}>🍬 Sugar Box ({sugarBox.length})</div>
                      {sugarBox.map((item, i) => (
                        <GlassCard key={i} style={{ padding: '10px 14px', marginBottom: '6px', cursor: 'pointer' }} onClick={() => window.open(item.url, '_blank')}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🍬 {item.title || item.url}</div>
                              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Saved {new Date(item.addedAt).toLocaleDateString()}</div>
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--color-accent-primary)', flexShrink: 0, marginLeft: '8px' }}>↗ Enjoy</span>
                          </div>
                        </GlassCard>
                      ))}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </CollapsibleSection>
        {/* ─── Footer: Recent Stints ─── */}
        {recentShifts.length > 0 && (
          <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '1px solid var(--color-border)', opacity: 0.7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Recent Stints</span>
              <button onClick={() => chrome.tabs.create({ url: 'workshifts.html' })} style={{ background: 'none', border: 'none', color: 'var(--color-accent-primary)', fontSize: '9px', cursor: 'pointer', fontWeight: 600, opacity: 0.8 }}>View All →</button>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {recentShifts.slice(0, 5).map((s, i) => (
                <span key={i} style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span>{new Date(s.clockedInAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-accent-primary)' }}>{(() => { const h = Math.floor((s.workMs||0) / 3600000); const m = Math.floor(((s.workMs||0) % 3600000) / 60000); return h > 0 ? `${h}h ${m}m` : `${m}m`; })()}</span>
                  {i < recentShifts.slice(0, 5).length - 1 && <span style={{ color: 'var(--color-border)' }}>·</span>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <LinkMergeModal 
        isOpen={linkModalConfig.isOpen} 
        onClose={() => setLinkModalConfig({ ...linkModalConfig, isOpen: false })} 
        targetItem={linkModalConfig.targetItem} 
        type={linkModalConfig.type} 
      />

      {/* Welcome Back Flash */}
      <AnimatePresence>
        {welcomeBack && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ duration: 0.4 }}
            style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10000, background: 'var(--color-surface)', border: '1px solid var(--color-accent-primary)', borderRadius: 'var(--radius-lg)', padding: '20px 40px', backdropFilter: 'blur(16px)', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
          >
            <div style={{ fontSize: '24px', marginBottom: '6px' }}>👋</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>{welcomeBack}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command Palette — Ctrl+K */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={actions}
        allItems={allItems}
        tabs={tabs}
        orgData={orgData}
        onNavigate={(target) => {
          // Force-expand the relevant section if collapsed
          const expandSection = (sectionId) => {
            setCollapsedSections(prev => {
              if (prev.includes(sectionId)) {
                const next = prev.filter(s => s !== sectionId);
                chrome?.storage?.local?.set?.({ collapsedSections: next });
                return next;
              }
              return prev;
            });
          };

          if (target === 'focus') {
            expandSection('focus');
            setTimeout(() => document.getElementById('section-focus')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
          } else if (target === 'theme') {
            cycleTheme();
          } else if (target === 'clock') {
            expandSection('shift');
            setTimeout(() => document.getElementById('section-shift')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
          } else {
            // Tab panels: intents, tasks, projects, org, logs
            expandSection('panels');
            setActivePanel(target);
            setTimeout(() => document.getElementById('section-panels')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
          }
        }}
      />

      {/* Keyboard Shortcuts Help — Ctrl+/ */}
      <ShortcutsHelp isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Home />);
