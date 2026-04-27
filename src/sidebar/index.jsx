import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/global.css';
import { useChromeStorage, sendMessage, useTheme } from '../hooks/useChromeStorage';
import { useFocusEngine, formatTimer, formatElapsed, FUNNEL_STAGES } from '../hooks/useFocusEngine';
import { GlassCard } from '../components/ui/GlassCard';
import { Tooltip } from '../components/ui/Tooltip';

function formatTime(ms) {
  if (!ms || ms < 1000) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const CAT_ICONS = { work:'💼', media:'🎵', meeting:'📹', reference:'📚', messaging:'💬', email:'📧', learning:'🎓', entertainment:'🎮', unknown:'❓' };

const btn = (color) => ({
  background:'transparent', border:`1px solid ${color}`, color,
  borderRadius:'var(--radius-sm)', padding:'2px 7px', fontSize:'10px',
  cursor:'pointer', fontWeight:600, lineHeight:'16px',
});

// ═══════════════════════════════════════
// Sidebar
// ═══════════════════════════════════════
function Sidebar() {
  const [theme] = useTheme();
  const [tabs] = useChromeStorage('tabs', {});
  const [timeTracking] = useChromeStorage('timeTracking', { byTab:{} });
  const [clockSession] = useChromeStorage('clockSession', { active:false });
  const [parkedTabs] = useChromeStorage('parkedTabs', []);
  const [sugarBox] = useChromeStorage('sugarBox', []);
  const [settings] = useChromeStorage('settings', {});
  const { activeFocus, allItems, history, actions } = useFocusEngine();
  const [panel, setPanel] = useState('focus');
  const [search, setSearch] = useState('');
  const [focusInput, setFocusInput] = useState('');

  useEffect(() => {
    const iv = setInterval(() => sendMessage('GET_TIME_TRACKING'), 5000);
    return () => clearInterval(iv);
  }, []);

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
    { id:'tabs', label:'📑' },
    { id:'stash', label:'📦' },
  ];

  const handleStartFocus = () => {
    if (focusInput.trim()) { actions.startFocus(focusInput.trim()); setFocusInput(''); }
  };

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', backgroundColor:'var(--color-bg-base)', color:'var(--color-text-primary)', fontFamily:"'Inter',system-ui,sans-serif", fontSize:'12px' }}>

      {/* ── Header ── */}
      <div style={{ padding:'8px 10px 0', borderBottom:'1px solid var(--color-border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
          <Tooltip text="Tabatha Attention OS"><span style={{ fontSize:'13px', fontWeight:700 }}>Tabatha</span></Tooltip>
          <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
            <Tooltip text={`${tabCount} tabs · ${formatTime(totalTime)} active`}>
              <span style={{ fontSize:'9px', color:'var(--color-text-muted)' }}>{tabCount}t · {formatTime(totalTime)}</span>
            </Tooltip>
            <Tooltip text="Open settings">
              <button onClick={() => chrome?.runtime?.openOptionsPage?.()} style={{ background:'none', border:'none', fontSize:'12px', cursor:'pointer', padding:'0 2px', color:'var(--color-text-muted)' }}>⚙️</button>
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
          <div style={{ display:'flex', gap:'3px' }}>
            {clockSession?.active && (
              <Tooltip text={clockSession.onBreak ? 'Resume work' : 'Take break'}>
                <button onClick={() => sendMessage('TOGGLE_BREAK')} style={btn(clockSession.onBreak ? '#ffa726' : 'var(--color-text-muted)')}>{clockSession.onBreak ? '▶' : '☕'}</button>
              </Tooltip>
            )}
            <Tooltip text={clockSession?.active ? 'Clock out' : 'Clock in'}>
              <button onClick={() => sendMessage(clockSession?.active ? 'CLOCK_OUT' : 'CLOCK_IN')} style={btn(clockSession?.active ? '#ef5350' : '#66bb6a')}>{clockSession?.active ? '⏹' : '▶'}</button>
            </Tooltip>
          </div>
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
                    <Tooltip text="Complete focus"><button onClick={() => actions.completeFocus()} style={btn('#66bb6a')}>✓ Done</button></Tooltip>
                    <Tooltip text="+5 minutes"><button onClick={() => actions.extendTimer(null,5)} style={btn('var(--color-accent-primary)')}>+5m</button></Tooltip>
                  </div>
                </GlassCard>
              ) : (
                <GlassCard style={{ padding:'10px', marginBottom:'6px' }}>
                  <div style={{ fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-text-muted)', fontWeight:600, marginBottom:'4px' }}>Set Focus</div>
                  <div style={{ display:'flex', gap:'4px' }}>
                    <input type="text" placeholder="What are you working on?" value={focusInput} onChange={e => setFocusInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleStartFocus()}
                      style={{ flex:1, background:'transparent', border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)', padding:'5px 8px', color:'var(--color-text-primary)', fontSize:'11px', outline:'none' }}
                    />
                    <Tooltip text="Start focus timer"><button onClick={handleStartFocus} style={btn('var(--color-accent-primary)')}>▶</button></Tooltip>
                  </div>
                </GlassCard>
              )}

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
                        </div>
                        <div style={{ display:'flex', gap:'3px', flexShrink:0 }}>
                          <Tooltip text="Switch to this"><button onClick={() => actions.switchFocus(item.id)} style={btn('var(--color-accent-primary)')}>▶</button></Tooltip>
                          <Tooltip text="Complete"><button onClick={() => actions.completeFocus(item.id)} style={btn('#66bb6a')}>✓</button></Tooltip>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* History */}
              {history && history.length > 0 && (
                <div>
                  <div style={{ fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-text-muted)', fontWeight:600, marginBottom:'4px' }}>History</div>
                  {history.slice(0,5).map((item,i) => (
                    <div key={item.id||i} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid var(--color-border)', fontSize:'10px' }}>
                      <span style={{ color: item.focusState==='drifted' ? '#ef5350' : 'var(--color-text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                        {item.focusState==='drifted' ? '⚠️' : '✅'} {item.label}
                      </span>
                      <span style={{ color:'var(--color-text-muted)', fontVariantNumeric:'tabular-nums', flexShrink:0, marginLeft:'6px' }}>{formatElapsed(item.elapsedMs)}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
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
