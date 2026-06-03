import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/global.css';
import { useChromeStorage, sendMessage, useTheme } from '../hooks/useChromeStorage';
import { useInstallIdentity } from '../hooks/useInstallIdentity';
import { useOtherProfiles } from '../hooks/useOtherProfiles';
import { useFocusEngine, formatTimer, formatElapsed, FUNNEL_STAGES } from '../hooks/useFocusEngine';
import { GlassCard } from '../components/ui/GlassCard';
import { Tooltip } from '../components/ui/Tooltip';
import { StagePicker } from '../components/ui/StagePicker';
import { TagPicker } from '../components/ui/TagPicker';
import { useOrgData } from '../hooks/useOrgData';
import { formatTime } from '../utils/formatTime';
import { CheckpointTimeline } from '../components/CheckpointTimeline';

const CAT_ICONS = { work:'💼', media:'🎵', meeting:'📹', reference:'📚', messaging:'💬', email:'📧', learning:'🎓', entertainment:'🎮', unknown:'❓' };

const btn = (color) => ({
  background:'transparent', border:`1px solid ${color}`, color,
  borderRadius:'var(--radius-sm)', padding:'2px 7px', fontSize:'10px',
  cursor:'pointer', fontWeight:600, lineHeight:'16px',
});

// ═══════════════════════════════════════
// GroupsList — compact groups for sidebar
// ═══════════════════════════════════════
function GroupsList({ tabs }) {
  const [groups, setGroups] = useState({});
  useEffect(() => {
    sendMessage('GET_SAVED_GROUPS').then(r => { if (r?.savedGroups) setGroups(r.savedGroups); }).catch(() => {});
  }, [tabs]);

  const entries = Object.values(groups);
  if (entries.length === 0) return <div style={{ fontSize:'10px', color:'var(--color-text-muted)', padding:'8px 0' }}>No tab groups. Create groups in Chrome or Tabatha.</div>;

  const GROUP_COLORS = { grey:'#9e9e9e', blue:'#4285f4', red:'#ea4335', yellow:'#fbbc04', green:'#34a853', pink:'#f538a0', purple:'#a142f4', cyan:'#24c1e0', orange:'#fa903e' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
      {entries.map(g => (
        <div key={g.id} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'5px 6px', background:'var(--color-surface)', borderRadius:'var(--radius-sm)', border:'1px solid var(--color-border)', borderLeft:`3px solid ${GROUP_COLORS[g.color]||'var(--color-accent-primary)'}` }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'11px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.title || 'Untitled Group'}</div>
            <div style={{ fontSize:'9px', color:'var(--color-text-muted)' }}>{g.tabCount} tab{g.tabCount!==1?'s':''}{g.collapsed ? ' · collapsed' : ''}</div>
          </div>
          <span style={{ fontSize:'9px', padding:'1px 5px', borderRadius:'3px', background:(GROUP_COLORS[g.color]||'#888')+'22', color:GROUP_COLORS[g.color]||'#888', fontWeight:600 }}>{g.color}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════
// SidebarTasksPanel — compact task CRUD
// ═══════════════════════════════════════
function SidebarTasksPanel() {
  const [tasks] = useChromeStorage('tasks', []);
  const [newName, setNewName] = useState('');

  const active = useMemo(() => (tasks || []).filter(t => t.status !== 'completed'), [tasks]);
  const completed = useMemo(() => (tasks || []).filter(t => t.status === 'completed'), [tasks]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await sendMessage('CREATE_TASK', { name: newName.trim() });
    setNewName('');
  };

  const handleComplete = (taskId) => sendMessage('UPDATE_TASK', { taskId, updates: { status: 'completed', completedAt: new Date().toISOString() } });
  const handleReopen = (taskId) => sendMessage('UPDATE_TASK', { taskId, updates: { status: 'active', completedAt: null } });

  return (
    <motion.div key="tasks" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.12}}>
      {/* Quick create */}
      <div style={{ display:'flex', gap:'4px', marginBottom:'6px' }}>
        <input type="text" placeholder="New task..." value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          style={{ flex:1, background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)', padding:'5px 8px', fontSize:'11px', color:'var(--color-text-primary)', outline:'none', boxSizing:'border-box' }}
        />
        <Tooltip text="Create task"><button onClick={handleCreate} style={btn('var(--color-accent-primary)')}>+</button></Tooltip>
      </div>

      {/* Active tasks */}
      <div style={{ fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-text-muted)', fontWeight:600, marginBottom:'4px' }}>Active ({active.length})</div>
      {active.length === 0 ? (
        <div style={{ fontSize:'10px', color:'var(--color-text-muted)', padding:'8px 0' }}>No active tasks.</div>
      ) : active.map(task => (
        <div key={task.id} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'4px 6px', marginBottom:'2px', background:'var(--color-surface)', borderRadius:'var(--radius-sm)', border:'1px solid var(--color-border)' }}>
          <Tooltip text="Mark complete">
            <button onClick={() => handleComplete(task.id)} style={{ background:'transparent', border:'1px solid var(--color-border)', borderRadius:'3px', width:'14px', height:'14px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'8px', color:'var(--color-text-muted)', padding:0 }}>○</button>
          </Tooltip>
          <span style={{ fontSize:'11px', fontWeight:500, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.name}</span>
        </div>
      ))}

      {/* Completed — collapsed */}
      {completed.length > 0 && (
        <div style={{ marginTop:'8px' }}>
          <div style={{ fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-text-muted)', fontWeight:600, marginBottom:'4px' }}>Done ({completed.length})</div>
          {completed.slice(0, 5).map(task => (
            <div key={task.id} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'3px 6px', marginBottom:'2px', opacity:0.5 }}>
              <Tooltip text="Reopen">
                <button onClick={() => handleReopen(task.id)} style={{ background:'transparent', border:'1px solid var(--color-border)', borderRadius:'3px', width:'14px', height:'14px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'8px', color:'#66bb6a', padding:0 }}>✓</button>
              </Tooltip>
              <span style={{ fontSize:'10px', textDecoration:'line-through', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.name}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════
// Sidebar
// ═══════════════════════════════════════
function Sidebar() {
  const [theme] = useTheme();
  const [tabs] = useChromeStorage('tabs', {});
  const [timeTracking] = useChromeStorage('timeTracking', { byTab:{} });
  const [clockSession] = useChromeStorage('clockSession', { active:false });
  const { isPersonal } = useInstallIdentity();
  const otherProfiles = useOtherProfiles();

  const guardedClockToggle = () => {
    if (clockSession?.active) {
      sendMessage('CLOCK_OUT');
      return;
    }
    const stacking = otherProfiles.filter(p =>
      p.classification !== 'personal' &&
      (p.clock_state === 'clocked_in' || p.clock_state === 'on_break')
    );
    if (stacking.length > 0) {
      const lines = stacking.map(p => `  • ${p.profile_name || 'unnamed install'} (${p.classification || 'unknown'}) — ${p.clock_state === 'on_break' ? 'on break' : 'clocked in'}`).join('\n');
      const ok = window.confirm(`You're already clocked in on:\n${lines}\n\nClocking in here adds a second concurrent shift. Hours can stack and double-count. Continue?`);
      if (!ok) return;
    }
    sendMessage('CLOCK_IN');
  };
  const [parkedTabs] = useChromeStorage('parkedTabs', []);
  const [sugarBox] = useChromeStorage('sugarBox', []);
  const [settings] = useChromeStorage('settings', {});
  const { activeFocus, allItems, history, actions, engine } = useFocusEngine();
  const orgData = useOrgData();
  const [panel, setPanel] = useState('focus');
  const [search, setSearch] = useState('');
  const [focusInput, setFocusInput] = useState('');
  const [focusTimer, setFocusTimer] = useState(15);
  const [showNewIntent, setShowNewIntent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editTimer, setEditTimer] = useState(15);
  const [editFunnel, setEditFunnel] = useState('unsorted');
  const [editTags, setEditTags] = useState({});
  // Plan 025: Checkpoint Progress Notes
  const [showCheckpoint, setShowCheckpoint] = useState(false);
  const [cpnText, setCpnText] = useState('');
  const [isCheckpointStale, setIsCheckpointStale] = useState(false);
  // Plan 037: Checkpoint Timeline
  const [showTimeline, setShowTimeline] = useState(false);
  // Feature #186: Window count
  const [windowCount, setWindowCount] = useState(0);

  useEffect(() => {
    const tabIds = activeFocus?.associatedTabIds || [];
    if (!tabIds.length) { setWindowCount(0); return; }
    (async () => {
      const wins = new Set();
      for (const tid of tabIds) {
        try { const t = await chrome.tabs.get(tid); wins.add(t.windowId); } catch { /* closed */ }
      }
      setWindowCount(wins.size);
    })();
  }, [activeFocus?.associatedTabIds?.length]);

  const { knownClients, knownProjects } = useMemo(() => {
    const cls = new Set(['Self']);
    const pjs = new Set();
    for (const item of Object.values(engine?.items || {})) {
      if (item.tags?.client) cls.add(item.tags.client);
      if (item.tags?.project) pjs.add(item.tags.project);
    }
    orgData.clientList.forEach(c => cls.add(c.name));
    orgData.projectList.forEach(p => pjs.add(p.name));
    return { knownClients: [...cls], knownProjects: [...pjs] };
  }, [engine, orgData.clientList, orgData.projectList]);

  const openEdit = () => {
    setEditLabel(activeFocus.label);
    setEditTimer(activeFocus.timerMinutes || 15);
    setEditFunnel(activeFocus.funnelStage || 'unsorted');
    setEditTags(activeFocus.tags || {});
    setEditing(true);
  };

  const saveEdit = async () => {
    const resp = await actions.updateFocus(activeFocus.id, {
      label: editLabel, timerMinutes: editTimer, funnelStage: editFunnel, tags: editTags,
    });
    if (resp?.error) {
      if (resp.needsConfirm) {
        if (window.confirm(`⚠️ ${resp.error}`)) {
          await actions.updateFocus(activeFocus.id, { label: editLabel, timerMinutes: editTimer, funnelStage: editFunnel, tags: editTags, confirmed: true });
        } else return;
      } else { alert(`🚫 ${resp.error}`); return; }
    }
    setEditing(false);
  };

  const persistOrg = (key, data) => chrome.storage.local.set({ [key]: data });

  // Plan 025: Staleness check for CPN
  useEffect(() => {
    if (!activeFocus?.id) { setIsCheckpointStale(false); return; }
    sendMessage('GET_CHECKPOINT_STATUS', { focusId: activeFocus.id }).then(res => {
      setIsCheckpointStale(res?.isStale || false);
    }).catch(() => {});
  }, [activeFocus?.id, activeFocus?.lastCheckpointAt]);

  const submitCheckpoint = async (level) => {
    const noteRequired = level === 'stuck';
    if (noteRequired && !cpnText.trim()) return;
    await sendMessage('SAVE_CHECKPOINT_NOTE', {
      focusId: activeFocus.id,
      text: cpnText,
      progressLevel: level,
      triggeredBy: 'sidebar'
    });
    setCpnText('');
    setShowCheckpoint(false);
  };

  // Time tracking data arrives reactively via useChromeStorage — no polling needed

  const tabCount = Object.keys(tabs).length;
  const totalTime = useMemo(() => Object.values(timeTracking.byTab || {}).reduce((a,b) => a+b, 0), [timeTracking]);

  // Clock elapsed
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!clockSession?.active) { setElapsed(''); return; }
    const tick = () => {
      const start = new Date(clockSession.clockedInAt).getTime();
      let brk = 0;
      for (const b of clockSession.breaks || []) brk += new Date(b.end).getTime() - new Date(b.start).getTime();
      if (clockSession.onBreak && clockSession.breakStartedAt) brk += Date.now() - new Date(clockSession.breakStartedAt).getTime();
      const w = Date.now() - start - brk;
      const h = Math.floor(w/3600000), m = Math.floor((w%3600000)/60000), s = Math.floor((w%60000)/1000);
      setElapsed(`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [clockSession]);

  // Filtered tabs
  const filteredTabs = useMemo(() => {
    let entries = Object.entries(tabs);
    if (search) {
      const t = search.toLowerCase();
      entries = entries.filter(([,tab]) => (tab.title||'').toLowerCase().includes(t) || (tab.url||'').toLowerCase().includes(t) || (tab.context||'').toLowerCase().includes(t));
    }
    return entries.sort(([aId], [bId]) => ((timeTracking.byTab||{})[bId]||0) - ((timeTracking.byTab||{})[aId]||0));
  }, [tabs, timeTracking, search]);

  // Now item
  const nowItem = useMemo(() => {
    const all = [...(activeFocus ? [activeFocus] : []), ...(allItems || [])];
    const active = all.filter(i => i.focusState === 'active' || i.focusState === 'paused');
    if (!active.length) return null;
    return active.sort((a,b) => ((a.priority||10)-(b.priority||10)))[0];
  }, [activeFocus, allItems]);

  const panels = [
    { id:'focus', label:'🎯' },
    { id:'tasks', label:'📋' },
    { id:'tabs', label:'📑' },
    { id:'groups', label:'📌' },
    { id:'stash', label:'📦' },
  ];

  const handleStartFocus = () => {
    if (focusInput.trim()) { actions.startFocus(focusInput.trim(), focusTimer); setFocusInput(''); setShowNewIntent(false); }
  };

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', backgroundColor:'var(--color-bg-base)', color:'var(--color-text-primary)', fontFamily:"'Inter',system-ui,sans-serif", fontSize:'12px' }}>

      {/* ── Header ── */}
      <div style={{ padding:'8px 10px 0', borderBottom:'1px solid var(--color-border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
          <Tooltip text="Tabatha Attention OS"><span style={{ fontSize:'13px', fontWeight:700 }}>Tabatha</span></Tooltip>
          {settings.profileLabel && (
            <span style={{ fontSize:'9px', fontWeight:600, padding:'1px 6px', borderRadius:'6px', background:'var(--color-accent-primary)', color:'#000', marginLeft:'4px', letterSpacing:'0.02em' }}>{settings.profileLabel}</span>
          )}
          <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
            <Tooltip text={`${tabCount} tabs · ${formatTime(totalTime)} active`}>
              <span style={{ fontSize:'9px', color:'var(--color-text-muted)' }}>{tabCount}t · {formatTime(totalTime)}</span>
            </Tooltip>
            <Tooltip text="Open settings">
              <button onClick={() => chrome?.runtime?.openOptionsPage?.()} style={{ background:'none', border:'none', fontSize:'12px', cursor:'pointer', padding:'0 2px', color:'var(--color-text-muted)' }}>⚙️</button>
            </Tooltip>
            <Tooltip text="Work Shifts">
              <button onClick={() => chrome?.tabs?.create?.({ url: chrome.runtime.getURL('workshifts.html') })} style={{ background:'none', border:'none', fontSize:'12px', cursor:'pointer', padding:'0 2px', color:'var(--color-text-muted)' }}>⏱️</button>
            </Tooltip>
            <Tooltip text="Open dashboard">
              <button onClick={() => chrome?.tabs?.create?.({ url: chrome.runtime.getURL('home.html') })} style={{ background:'none', border:'none', fontSize:'12px', cursor:'pointer', padding:'0 2px', color:'var(--color-text-muted)' }}>🏠</button>
            </Tooltip>
          </div>
        </div>

        {/* Clock status — compact */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'3px 0 5px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <Tooltip text={clockSession?.active ? 'Clocked in' : 'Clocked out'}>
              <span style={{ fontSize:'10px' }}>{clockSession?.active ? '🟢' : '⚪'}</span>
            </Tooltip>
            {clockSession?.active && elapsed && (
              <span style={{ fontSize:'11px', fontWeight:700, fontVariantNumeric:'tabular-nums', color: clockSession.onBreak ? '#ffa726' : 'var(--color-accent-primary)' }}>{elapsed}</span>
            )}
            {clockSession?.onBreak && <span style={{ fontSize:'8px', background:'#ffa72622', color:'#ffa726', padding:'0 4px', borderRadius:'2px', fontWeight:600 }}>BRK</span>}
          </div>
          {!isPersonal && (
            <div style={{ display:'flex', gap:'3px' }}>
              {clockSession?.active && (
                <Tooltip text={clockSession.onBreak ? 'Resume work' : 'Take break'}>
                  <button onClick={() => sendMessage('TOGGLE_BREAK')} style={btn(clockSession.onBreak ? '#ffa726' : 'var(--color-text-muted)')}>{clockSession.onBreak ? '▶' : '☕'}</button>
                </Tooltip>
              )}
              <Tooltip text={clockSession?.active ? 'Clock out' : 'Clock in'}>
                <button onClick={guardedClockToggle} style={btn(clockSession?.active ? '#ef5350' : '#66bb6a')}>{clockSession?.active ? '⏹' : '▶'}</button>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Nav */}
        <div style={{ display:'flex', gap:0 }}>
          {panels.map(p => (
            <Tooltip key={p.id} text={p.id.charAt(0).toUpperCase()+p.id.slice(1)}>
              <button onClick={() => setPanel(p.id)} style={{
                flex:1, background:'transparent', border:'none', padding:'5px 0', fontSize:'12px', cursor:'pointer',
                color: panel===p.id ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                fontWeight: panel===p.id ? 600 : 400,
                borderBottom: panel===p.id ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
              }}>{p.label}</button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'6px 8px' }}>
        <AnimatePresence mode="wait">

          {/* ── FOCUS PANEL ── */}
          {panel === 'focus' && (
            <motion.div key="focus" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.12}}>

              {/* Now Bar */}
              {nowItem && (
                <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'6px 8px', marginBottom:'6px', borderLeft:'3px solid var(--color-accent-primary)', background:'var(--color-surface)', borderRadius:'var(--radius-sm)' }}>
                  <span style={{ fontSize:'8px', fontWeight:700, color:'var(--color-accent-primary)', textTransform:'uppercase', letterSpacing:'0.08em' }}>NOW</span>
                  <span style={{ fontSize:'11px', fontWeight:600, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{nowItem.label}</span>
                  {nowItem.priority && nowItem.priority <= 10 && (
                    <Tooltip text={`Priority ${nowItem.priority}`}>
                      <span style={{ fontSize:'8px', background: nowItem.priority<=3 ? '#ff6b6b22' : nowItem.priority<=6 ? '#ffa72622' : '#66bb6a22', color: nowItem.priority<=3 ? '#ff6b6b' : nowItem.priority<=6 ? '#ffa726' : '#66bb6a', padding:'0 4px', borderRadius:'2px', fontWeight:600 }}>P{nowItem.priority}</span>
                    </Tooltip>
                  )}
                </div>
              )}

              {/* Active Focus */}
              {activeFocus ? (
                <GlassCard style={{ padding:'10px', marginBottom:'6px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'8px' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'4px', marginBottom:'3px' }}>
                        <span style={{ fontSize:'8px', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-accent-primary)', fontWeight:600 }}>
                          {activeFocus.focusState === 'drifted' ? '⚠️ DRIFTED' : '🎯 FOCUS'}
                        </span>
                        <Tooltip text={FUNNEL_STAGES[activeFocus.funnelStage]?.label}>
                          <span style={{ fontSize:'8px', background:(FUNNEL_STAGES[activeFocus.funnelStage]?.color||'#888')+'22', color:FUNNEL_STAGES[activeFocus.funnelStage]?.color, padding:'0 4px', borderRadius:'2px', fontWeight:600 }}>
                            {FUNNEL_STAGES[activeFocus.funnelStage]?.icon}
                          </span>
                        </Tooltip>
                      </div>
                      <div style={{ fontSize:'13px', fontWeight:600, marginBottom:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{activeFocus.label}</div>
                      <div style={{ fontSize:'9px', color:'var(--color-text-muted)', display:'flex', gap:'8px' }}>
                        <span>{activeFocus.associatedTabIds?.length||0} tabs</span>
                        {windowCount > 0 && <span>{windowCount} {windowCount === 1 ? 'win' : 'wins'}</span>}
                        <span>{formatElapsed(activeFocus.liveElapsedMs)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:'20px', fontWeight:700, color: activeFocus.isOver ? '#ef5350' : 'var(--color-accent-primary)', fontVariantNumeric:'tabular-nums', fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>
                        {activeFocus.isOver ? formatTimer(activeFocus.overMs, true) : formatTimer(activeFocus.remainingMs)}
                      </div>
                      <div style={{ fontSize:'8px', color:'var(--color-text-muted)', marginTop:'1px' }}>{activeFocus.isOver ? 'over' : 'left'}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'4px', marginTop:'8px', flexWrap:'wrap' }}>
                    <Tooltip text="Mark as resolved"><button onClick={() => actions.completeFocus(activeFocus.id)} style={btn('#66bb6a')}>✓ Resolved</button></Tooltip>
                    {activeFocus.focusState === 'active' ? (
                      <Tooltip text="Pause focus"><button onClick={() => actions.pauseFocus(activeFocus.id)} style={btn('#ffa726')}>⏸ Pause</button></Tooltip>
                    ) : activeFocus.focusState === 'paused' ? (
                      <Tooltip text="Resume focus"><button onClick={() => actions.resumeFocus(activeFocus.id)} style={btn('#66bb6a')}>▶ Resume</button></Tooltip>
                    ) : null}
                    <Tooltip text="+5 minutes"><button onClick={() => actions.extendTimer(activeFocus.id,5)} style={btn('var(--color-accent-primary)')}>+5m</button></Tooltip>
                    <Tooltip text="Edit focus details"><button onClick={openEdit} style={btn('var(--color-text-muted)')}>✏️</button></Tooltip>
                    <Tooltip text="Checkpoint note"><button onClick={() => setShowCheckpoint(p => !p)} style={btn(isCheckpointStale ? '#ffa726' : 'var(--color-text-muted)')}>📋{isCheckpointStale ? '🟠' : ''}</button></Tooltip>
                    {(activeFocus.checkpoint || []).length > 0 && (
                      <Tooltip text="View/edit checkpoint timeline"><button onClick={() => setShowTimeline(p => !p)} style={btn(showTimeline ? 'var(--color-accent-primary)' : 'var(--color-text-muted)')}>📊</button></Tooltip>
                    )}
                    <Tooltip text={activeFocus.offDevice ? 'Off-device ON — idle suppressed' : 'Mark as off-device — idle won\'t pause this focus'}>
                      <button onClick={() => sendMessage('UPDATE_FOCUS', { focusId: activeFocus.id, offDevice: !activeFocus.offDevice })} style={btn(activeFocus.offDevice ? '#ef5350' : 'var(--color-text-muted)')}>{activeFocus.offDevice ? '📴' : '📱'}</button>
                    </Tooltip>
                    <Tooltip text="Add a sub-focus or queued intent">
                      <button onClick={() => setShowNewIntent(true)} style={btn('var(--color-text-muted)')}>📌 Sub</button>
                    </Tooltip>
                  </div>
                  {/* Stage picker */}
                  <div style={{ marginTop:'6px' }}>
                    <StagePicker compact currentStage={activeFocus.funnelStage} onChange={(stage) => actions.updateFocus(activeFocus.id, { funnelStage: stage })} />
                  </div>
                  {/* Inline edit panel */}
                  <AnimatePresence>
                    {editing && (
                      <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.15 }} style={{ overflow:'hidden' }}>
                        <div style={{ marginTop:'8px', padding:'8px', background:'var(--color-surface)', borderRadius:'var(--radius-sm)', border:'1px solid var(--color-border)', display:'flex', flexDirection:'column', gap:'6px' }}>
                          <div>
                            <label style={{ fontSize:'8px', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:'1px' }}>Label</label>
                            <input value={editLabel} onChange={e => setEditLabel(e.target.value)} style={{ width:'100%', padding:'3px 6px', fontSize:'11px', borderRadius:'var(--radius-sm)', border:'1px solid var(--color-border)', background:'var(--color-bg-base)', color:'var(--color-text-primary)', outline:'none', boxSizing:'border-box' }} />
                          </div>
                          <div style={{ display:'flex', gap:'6px' }}>
                            <div style={{ flex:'0 0 55px' }}>
                              <label style={{ fontSize:'8px', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:'1px' }}>Timer</label>
                              <input type="number" value={editTimer} onChange={e => setEditTimer(parseInt(e.target.value) || 15)} min={1} style={{ width:'100%', padding:'3px 6px', fontSize:'11px', borderRadius:'var(--radius-sm)', border:'1px solid var(--color-border)', background:'var(--color-bg-base)', color:'var(--color-text-primary)', outline:'none', boxSizing:'border-box' }} />
                            </div>
                            <div style={{ flex:1 }}>
                              <label style={{ fontSize:'8px', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:'1px' }}>Stage</label>
                              <select value={editFunnel} onChange={e => setEditFunnel(e.target.value)} style={{ width:'100%', padding:'3px 6px', fontSize:'11px', borderRadius:'var(--radius-sm)', border:'1px solid var(--color-border)', background:'var(--color-bg-base)', color:'var(--color-text-primary)', outline:'none' }}>
                                {Object.entries(FUNNEL_STAGES).map(([key, val]) => (
                                  <option key={key} value={key}>{val.icon} {val.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize:'8px', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:'2px' }}>Project / Client</label>
                            <TagPicker tags={editTags} onChange={setEditTags} compact clients={knownClients} projects={knownProjects} tasks={[]} onPersist={persistOrg} orgData={orgData} />
                          </div>
                          <div style={{ display:'flex', gap:'4px' }}>
                            <button onClick={saveEdit} style={btn('#66bb6a')}>💾 Save</button>
                            <button onClick={() => setEditing(false)} style={{ background:'transparent', border:'none', color:'var(--color-text-muted)', cursor:'pointer', fontSize:'10px', padding:'2px' }}>✕ Cancel</button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Plan 037: Checkpoint Timeline */}
                  <AnimatePresence>
                    {showTimeline && (
                      <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.15 }} style={{ overflow:'hidden' }}>
                        <CheckpointTimeline
                          activeFocus={activeFocus}
                          sendMessage={sendMessage}
                          onAddNote={() => { setShowTimeline(false); setShowCheckpoint(true); }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Plan 025: Inline Checkpoint Note form */}
                  <AnimatePresence>
                    {showCheckpoint && (
                      <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.15 }} style={{ overflow:'hidden' }}>
                        <div style={{ marginTop:'8px', padding:'8px', background:'var(--color-surface)', borderRadius:'var(--radius-sm)', border:'1px solid var(--color-border)', display:'flex', flexDirection:'column', gap:'6px' }}>
                          <label style={{ fontSize:'8px', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>📋 Checkpoint Note</label>
                          <textarea value={cpnText} onChange={e => setCpnText(e.target.value)} placeholder="What have you accomplished since your last checkpoint?" rows={3} style={{ width:'100%', padding:'4px 6px', fontSize:'11px', borderRadius:'var(--radius-sm)', border:'1px solid var(--color-border)', background:'var(--color-bg-base)', color:'var(--color-text-primary)', outline:'none', resize:'none', boxSizing:'border-box' }} />
                          <div style={{ fontSize:'8px', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Submit with progress:</div>
                          <div style={{ display:'flex', gap:'3px', flexWrap:'wrap' }}>
                            <button onClick={() => submitCheckpoint('none')} style={btn('#9e9e9e')}>😐 None</button>
                            <button onClick={() => submitCheckpoint('little')} style={btn('#29b6f6')}>📈 Little</button>
                            <button onClick={() => submitCheckpoint('lot')} style={btn('#66bb6a')}>🚀 A Lot</button>
                            <button onClick={() => submitCheckpoint('almost_done')} style={btn('#ffd54f')}>🏁 Done</button>
                            <button onClick={() => submitCheckpoint('stuck')} style={btn('#ef5350')}>🚧 Stuck</button>
                          </div>
                          <button onClick={() => setShowCheckpoint(false)} style={{ background:'transparent', border:'none', color:'var(--color-text-muted)', cursor:'pointer', fontSize:'10px', padding:'2px' }}>✕ Cancel</button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </GlassCard>
              ) : null}

              {/* New Intent Creator — always available */}
              <GlassCard style={{ padding:'8px', marginBottom:'6px' }}>
                <div
                  onClick={() => setShowNewIntent(p => !p)}
                  style={{ display:'flex', alignItems:'center', gap:'4px', cursor:'pointer', userSelect:'none' }}
                >
                  <span style={{ fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-text-muted)', fontWeight:600 }}>
                    {activeFocus ? '+ New Intent' : '🎯 Set Focus'}
                  </span>
                  <span style={{ fontSize:'8px', color:'var(--color-text-muted)', transform: showNewIntent ? 'rotate(180deg)' : 'rotate(0)', transition:'transform 0.15s' }}>▼</span>
                </div>
                {(showNewIntent || !activeFocus) && (
                  <div style={{ marginTop:'6px' }}>
                    <div style={{ display:'flex', gap:'4px', marginBottom:'4px' }}>
                      <input type="text" placeholder="What are you focusing on?" value={focusInput} onChange={e => setFocusInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleStartFocus()}
                        style={{ flex:1, background:'transparent', border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)', padding:'5px 8px', color:'var(--color-text-primary)', fontSize:'11px', outline:'none' }}
                      />
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                        <input type="number" value={focusTimer} onChange={e => setFocusTimer(Math.max(1, parseInt(e.target.value) || 15))} min={1}
                          style={{ width:'36px', background:'transparent', border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)', padding:'3px', color:'var(--color-text-primary)', fontSize:'10px', outline:'none', textAlign:'center' }}
                        />
                        <span style={{ fontSize:'7px', color:'var(--color-text-muted)' }}>min</span>
                      </div>
                      <Tooltip text="Start focus"><button onClick={handleStartFocus} style={btn('var(--color-accent-primary)')}>▶</button></Tooltip>
                    </div>
                  </div>
                )}
              </GlassCard>

              {/* Queue */}
              {allItems && allItems.length > 0 && (
                <div style={{ marginBottom:'6px' }}>
                  <div style={{ fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-text-muted)', fontWeight:600, marginBottom:'4px' }}>Queue ({allItems.length})</div>
                  {allItems.slice(0,5).map(item => {
                    const f = FUNNEL_STAGES[item.funnelStage] || FUNNEL_STAGES.unsorted;
                    return (
                      <div key={item.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 6px', marginBottom:'2px', background:'var(--color-surface)', borderRadius:'var(--radius-sm)', border:'1px solid var(--color-border)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'4px', flex:1, minWidth:0 }}>
                          <span style={{ fontSize:'9px', color:f.color }}>{f.icon}</span>
                          <span style={{ fontSize:'11px', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.label}</span>
                          <select
                            value={item.priority || 5}
                            onChange={(e) => { e.stopPropagation(); actions.updateFocus(item.id, { priority: Number(e.target.value) }); }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              background:'transparent', border:'1px solid rgba(255,255,255,0.1)',
                              color: (item.priority||5) <= 2 ? '#ff6b6b' : (item.priority||5) <= 4 ? '#ffa726' : '#66bb6a',
                              fontSize:'8px', fontWeight:600, padding:'1px 2px', borderRadius:'2px', cursor:'pointer', flexShrink:0
                            }}
                            title="Priority"
                          >
                            <option value={1}>P1</option>
                            <option value={2}>P2</option>
                            <option value={3}>P3</option>
                            <option value={4}>P4</option>
                            <option value={5}>P5</option>
                          </select>
                        </div>
                        <div style={{ display:'flex', gap:'3px', flexShrink:0 }}>
                          <Tooltip text="Switch to this"><button onClick={() => actions.switchFocus(item.id)} style={btn('var(--color-accent-primary)')}>▶</button></Tooltip>
                          <Tooltip text="Mark as resolved"><button onClick={() => actions.completeFocus(item.id)} style={btn('#66bb6a')}>✓</button></Tooltip>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Backburner Dock */}
              {(() => {
                const bb = (allItems || []).filter(i => i.backburneredAt);
                if (bb.length === 0) return null;
                return (
                  <div style={{ marginBottom:'6px' }}>
                    <div style={{ fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.1em', color:'#ff9800', fontWeight:600, marginBottom:'4px' }}>🔥 Backburner ({bb.length})</div>
                    {bb.map(item => (
                      <div key={item.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 6px', marginBottom:'2px', background:'rgba(255,152,0,0.06)', borderRadius:'var(--radius-sm)', border:'1px solid rgba(255,152,0,0.2)' }}>
                        <span style={{ fontSize:'11px', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>🔥 {item.label}</span>
                        <div style={{ display:'flex', gap:'3px', flexShrink:0 }}>
                          <Tooltip text="Resume"><button onClick={() => sendMessage('RESUME_BACKBURNER', { focusId: item.id })} style={btn('#66bb6a')}>▶</button></Tooltip>
                          <Tooltip text="Snooze"><button onClick={() => sendMessage('SNOOZE_BACKBURNER', { focusId: item.id, snoozeMinutes: 10 })} style={btn('#ffa726')}>⏰</button></Tooltip>
                          <Tooltip text="Dismiss"><button onClick={() => sendMessage('DISMISS_BACKBURNER', { focusId: item.id })} style={btn('#ef5350')}>✕</button></Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* History */}
              {history && history.length > 0 && (
                <div>
                  <div style={{ fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-text-muted)', fontWeight:600, marginBottom:'4px' }}>History</div>
                  {history.slice(0,5).map((item,i) => (
                    <div key={item.id||i} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid var(--color-border)', fontSize:'10px' }}>
                      <span style={{ color: item.focusState==='drifted' ? '#ef5350' : 'var(--color-text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                        {item.focusState==='drifted' ? '⚠️' : item.funnelStage === 'resolved' ? '🏁' : '✅'} {item.label}
                      </span>
                      <span style={{ color:'var(--color-text-muted)', fontVariantNumeric:'tabular-nums', flexShrink:0, marginLeft:'6px' }}>{formatElapsed(item.elapsedMs)}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── TASKS PANEL ── */}
          {panel === 'tasks' && (
            <SidebarTasksPanel />
          )}

          {/* ── TABS PANEL ── */}
          {panel === 'tabs' && (
            <motion.div key="tabs" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.12}}>
              <input type="text" placeholder="Search tabs..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ width:'100%', background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)', padding:'5px 8px', fontSize:'11px', color:'var(--color-text-primary)', outline:'none', boxSizing:'border-box', marginBottom:'6px' }}
              />
              {filteredTabs.length === 0 ? (
                <div style={{ textAlign:'center', padding:'16px', color:'var(--color-text-muted)', fontSize:'11px' }}>{search ? 'No matches.' : 'No tracked tabs.'}</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                  {filteredTabs.map(([id, tab]) => {
                    const time = (timeTracking.byTab||{})[id] || 0;
                    return (
                      <Tooltip key={id} text={tab.url || 'No URL'} position="bottom">
                        <div onClick={() => sendMessage('FOCUS_TAB', { tabId: parseInt(id) })} style={{
                          display:'flex', alignItems:'center', gap:'6px', padding:'5px 6px', borderRadius:'var(--radius-sm)', cursor:'pointer',
                          background:'var(--color-surface)', border:'1px solid var(--color-border)', transition:'background 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background='var(--color-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background='var(--color-surface)'}
                        >
                          <span style={{ fontSize:'11px' }}>{CAT_ICONS[tab.category]||'📄'}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:'11px', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tab.title || 'Untitled'}</div>
                            {tab.context && <div style={{ fontSize:'9px', color:'var(--color-text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tab.context}</div>}
                          </div>
                          <span style={{ fontSize:'9px', fontWeight:600, flexShrink:0, color: time > 0 ? 'var(--color-accent-primary)' : 'var(--color-text-muted)', fontVariantNumeric:'tabular-nums' }}>{formatTime(time)}</span>
                        </div>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ── GROUPS PANEL ── */}
          {panel === 'groups' && (
            <motion.div key="groups" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.12}}>
              <div style={{ fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-text-muted)', fontWeight:600, marginBottom:'6px' }}>📌 Tab Groups</div>
              <GroupsList tabs={tabs} />
            </motion.div>
          )}

          {/* ── STASH PANEL ── */}
          {panel === 'stash' && (
            <motion.div key="stash" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.12}}>
              {/* Parked */}
              <div style={{ fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-text-muted)', fontWeight:600, marginBottom:'4px' }}>🅿️ Parked ({parkedTabs.length})</div>
              {parkedTabs.length === 0 ? (
                <div style={{ fontSize:'10px', color:'var(--color-text-muted)', padding:'8px 0' }}>No parked tabs.</div>
              ) : parkedTabs.slice(0,10).map((tab, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'4px 6px', marginBottom:'2px', background:'var(--color-surface)', borderRadius:'var(--radius-sm)', border:'1px solid var(--color-border)' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'10px', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tab.title || 'Untitled'}</div>
                  </div>
                  <Tooltip text="Restore tab">
                    <button onClick={() => { chrome?.tabs?.create?.({ url: tab.url }); sendMessage('REMOVE_PARKED_TAB', { index: i }); }} style={btn('var(--color-accent-primary)')}>↗</button>
                  </Tooltip>
                </div>
              ))}

              {/* Sugar Box */}
              <div style={{ fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-text-muted)', fontWeight:600, marginTop:'10px', marginBottom:'4px' }}>🍬 Sugar Box ({sugarBox.length})</div>
              {sugarBox.length === 0 ? (
                <div style={{ fontSize:'10px', color:'var(--color-text-muted)', padding:'8px 0' }}>No treats saved.</div>
              ) : sugarBox.slice(0,10).map((item, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'4px 6px', marginBottom:'2px', background:'var(--color-surface)', borderRadius:'var(--radius-sm)', border:'1px solid var(--color-border)' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'10px', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.title || 'Untitled'}</div>
                  </div>
                  <Tooltip text="Open treat">
                    <button onClick={() => chrome?.tabs?.create?.({ url: item.url })} style={btn('#ffa726')}>🍬</button>
                  </Tooltip>
                </div>
              ))}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Sidebar />);
