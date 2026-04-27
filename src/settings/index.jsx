import React, { useState, useMemo, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { motion } from 'framer-motion';
import '../styles/global.css';
import { useChromeStorage, sendMessage, useTheme } from '../hooks/useChromeStorage';
import { FlipClock, CLOCK_DEFAULTS } from '../components/clock/FlipClock';
import { GlassCard } from '../components/ui/GlassCard';
import { PopButton } from '../components/ui/PopButton';
import { Tooltip } from '../components/ui/Tooltip';
import { TagPicker } from '../components/ui/TagPicker';
import { FUNNEL_STAGES } from '../hooks/useFocusEngine';

// ── Styles ──
const NAV_WIDTH = 220;
const sectionLabel = { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '10px', marginTop: '16px' };
const fieldRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '13px' };
const fieldLabel = { color: 'var(--color-text-primary)', fontWeight: 500 };
const inputStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', padding: '4px 8px', fontSize: '12px', outline: 'none', width: '120px' };
const selectStyle = { ...inputStyle, width: '140px' };
const toggleStyle = (on) => ({ width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: on ? 'var(--color-accent-primary)' : 'var(--color-border)', position: 'relative', transition: 'background 0.2s' });
const toggleDot = (on) => ({ position: 'absolute', top: '2px', left: on ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' });

const SECTIONS = [
  { id: 'appearance', label: '🎨 Appearance' },
  { id: 'clock', label: '🕐 FlipClock' },
  { id: 'focus', label: '🎯 Focus Engine' },
  { id: 'intent', label: '🚪 Intent-Popup' },
  { id: 'time', label: '⏱ Time Tracking' },
  { id: 'export', label: '📤 Export & Agents' },
  { id: 'tags', label: '🏷 Tags & Associations' },
  { id: 'parked', label: '🅿️ Parked Tabs' },
  { id: 'sugarbox', label: '🍬 Sugar Box' },
  { id: 'stats', label: '📊 Stats & History' },
  { id: 'privacy', label: '🔒 Privacy & Capture' },
  { id: 'about', label: 'ℹ️ About' },
];

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={toggleStyle(value)}>
      <span style={toggleDot(value)} />
    </button>
  );
}

function Settings() {
  const [theme, setTheme] = useTheme();
  const [activeSection, setActiveSection] = useState('appearance');
  const [settings, setSettings] = useChromeStorage('settings', {});
  const [clockSettings, setClockSettings] = useChromeStorage('clockSettings', CLOCK_DEFAULTS);
  const [parkedTabs] = useChromeStorage('parkedTabs', []);
  const [sugarBox] = useChromeStorage('sugarBox', []);
  const [skippedDomains, setSkippedDomains] = useChromeStorage('skippedDomains', []);
  const [intentHistory] = useChromeStorage('intentHistory', []);

  const updateSetting = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));
  const updateClock = (key, val) => setClockSettings(prev => ({ ...prev, [key]: val }));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex' }}>
      {/* Left Nav */}
      <nav style={{ width: NAV_WIDTH, minWidth: NAV_WIDTH, borderRight: '1px solid var(--color-border)', padding: '16px 0', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', background: 'var(--color-surface)', backdropFilter: 'var(--surface-blur)' }}>
        <div style={{ padding: '8px 16px 16px', borderBottom: '1px solid var(--color-border)', marginBottom: '8px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>⚙️ Settings</div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Tabatha v1.0.0-alpha</div>
        </div>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            display: 'block', width: '100%', textAlign: 'left', background: activeSection === s.id ? 'var(--color-accent-primary)11' : 'transparent',
            border: 'none', borderLeft: activeSection === s.id ? '3px solid var(--color-accent-primary)' : '3px solid transparent',
            color: activeSection === s.id ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
            padding: '8px 16px', fontSize: '12px', cursor: 'pointer', fontWeight: activeSection === s.id ? 600 : 400, transition: 'all 0.15s',
          }}>{s.label}</button>
        ))}
      </nav>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', minHeight: '100vh' }}>
        {/* Settings Panel */}
        <div style={{ flex: 1, padding: '24px 32px', maxWidth: '480px', overflowY: 'auto' }}>
          <motion.div key={activeSection} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>

            {activeSection === 'appearance' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Appearance</h2>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Theme</span>
                  <select value={theme} onChange={e => setTheme(e.target.value)} style={selectStyle}>
                    <option value="pop-art">🎨 Pop Art (Dark/Neon)</option>
                    <option value="corporate">🏢 Corporate (Light/Clean)</option>
                  </select>
                </div>
                <div style={sectionLabel}>Identity</div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Your Name</span>
                  <input type="text" placeholder="e.g. Marcus" value={settings.userName || ''} onChange={e => updateSetting('userName', e.target.value)} style={inputStyle} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Default Realm</span>
                  <select value={settings.defaultRealm || 'professional'} onChange={e => updateSetting('defaultRealm', e.target.value)} style={selectStyle}>
                    <option value="business">💼 Business</option>
                    <option value="professional">👔 Professional</option>
                    <option value="work">🏗 Work</option>
                    <option value="personal">🏠 Personal</option>
                  </select>
                </div>
              </div>
            )}

            {activeSection === 'clock' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>FlipClock</h2>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Time Format</span>
                  <select value={clockSettings.is24Hour ? '24' : '12'} onChange={e => updateClock('is24Hour', e.target.value === '24')} style={selectStyle}>
                    <option value="12">12 Hour</option>
                    <option value="24">24 Hour</option>
                  </select>
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Show Seconds</span>
                  <Toggle value={clockSettings.showClockSeconds !== false} onChange={v => updateClock('showClockSeconds', v)} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Scale</span>
                  <input type="range" min="0.3" max="1.5" step="0.1" value={clockSettings.scale || 1.0} onChange={e => updateClock('scale', parseFloat(e.target.value))} style={{ width: '120px' }} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Text Color</span>
                  <input type="color" value={clockSettings.textColor || '#e0e0e0'} onChange={e => updateClock('textColor', e.target.value)} style={{ width: '40px', height: '24px', border: 'none', cursor: 'pointer' }} />
                </div>
                <div style={sectionLabel}>Countdown</div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Show Countdown</span>
                  <Toggle value={!!clockSettings.showCountdown} onChange={v => updateClock('showCountdown', v)} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Mode</span>
                  <select value={clockSettings.countdownMode || 'daily'} onChange={e => updateClock('countdownMode', e.target.value)} style={selectStyle}>
                    <option value="daily">End of Day</option>
                    <option value="custom">Custom Time</option>
                  </select>
                </div>
                {clockSettings.countdownMode === 'custom' && (
                  <div style={fieldRow}>
                    <span style={fieldLabel}>Target Time</span>
                    <input type="time" value={clockSettings.customCountdownTarget || '17:00'} onChange={e => updateClock('customCountdownTarget', e.target.value)} style={inputStyle} />
                  </div>
                )}
              </div>
            )}

            {activeSection === 'focus' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Focus Engine</h2>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Default Timer (minutes)</span>
                  <input type="number" min="1" max="120" value={settings.focusTimerMinutes || 15} onChange={e => updateSetting('focusTimerMinutes', parseInt(e.target.value))} style={inputStyle} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Auto-associate tabs</span>
                  <Toggle value={settings.autoAssociateTabs !== false} onChange={v => updateSetting('autoAssociateTabs', v)} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Drift notification</span>
                  <Toggle value={settings.driftNotification !== false} onChange={v => updateSetting('driftNotification', v)} />
                </div>
                <div style={sectionLabel}>Funnel Stages</div>
                {Object.entries(FUNNEL_STAGES).map(([key, stage]) => (
                  <div key={key} style={{ ...fieldRow, padding: '4px 0' }}>
                    <span style={{ fontSize: '12px' }}>{stage.icon} {stage.label}</span>
                    <span style={{ fontSize: '10px', color: stage.color, fontWeight: 600 }}>{key}</span>
                  </div>
                ))}
              </div>
            )}

            {activeSection === 'intent' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Intent-Popup (Gatekeeper)</h2>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Enable overlay</span>
                  <Toggle value={settings.gatekeeperEnabled !== false} onChange={v => updateSetting('gatekeeperEnabled', v)} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Side Quest default (min)</span>
                  <input type="number" min="1" max="30" value={settings.sideQuestMinutes || 5} onChange={e => updateSetting('sideQuestMinutes', parseInt(e.target.value))} style={inputStyle} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Inherit items shown</span>
                  <input type="number" min="0" max="10" value={settings.inheritItemCount || 3} onChange={e => updateSetting('inheritItemCount', parseInt(e.target.value))} style={inputStyle} />
                </div>
                <div style={sectionLabel}>Skipped Domains</div>
                {skippedDomains.length === 0 ? (
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>No domains skipped yet.</p>
                ) : (
                  skippedDomains.map((d, i) => (
                    <div key={i} style={{ ...fieldRow, padding: '4px 0' }}>
                      <span style={{ fontSize: '12px' }}>{d}</span>
                      <button onClick={() => setSkippedDomains(prev => prev.filter((_, j) => j !== i))} style={{ background: 'transparent', border: '1px solid #ef5350', color: '#ef5350', borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>Remove</button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeSection === 'time' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Time Tracking</h2>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Idle threshold (minutes)</span>
                  <input type="number" min="1" max="60" value={settings.idleThresholdMinutes || 5} onChange={e => updateSetting('idleThresholdMinutes', parseInt(e.target.value))} style={inputStyle} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Context timer (minutes)</span>
                  <input type="number" min="1" max="120" value={settings.globalTimerMinutes || 15} onChange={e => updateSetting('globalTimerMinutes', parseInt(e.target.value))} style={inputStyle} />
                </div>
              </div>
            )}

            {activeSection === 'export' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Export & Agents</h2>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Auto-export</span>
                  <Toggle value={!!settings.autoExportEnabled} onChange={v => updateSetting('autoExportEnabled', v)} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Export interval (min)</span>
                  <input type="number" min="5" max="1440" value={settings.autoExportIntervalMinutes || 60} onChange={e => updateSetting('autoExportIntervalMinutes', parseInt(e.target.value))} style={inputStyle} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Export path</span>
                  <input type="text" value={settings.exportPath || 'Tabatha'} onChange={e => updateSetting('exportPath', e.target.value)} style={inputStyle} />
                </div>
              </div>
            )}

            {activeSection === 'tags' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Tags & Associations</h2>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                  Tags help you drill down on what each focus item relates to.
                </p>
                <div style={sectionLabel}>Preview</div>
                <TagPicker tags={{ realm: 'business', client: 'Example Co', project: 'Tabatha', task: '' }} onChange={() => {}} compact={false} />
              </div>
            )}

            {activeSection === 'parked' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Parked Tabs</h2>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Tabs you saved for later from the Intent-Popup. Click to reopen.</p>
                {parkedTabs.length === 0 ? (
                  <GlassCard style={{ padding: '24px', textAlign: 'center' }}><p style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>No parked tabs.</p></GlassCard>
                ) : (
                  parkedTabs.map((tab, i) => (
                    <div key={i} style={{ ...fieldRow, cursor: 'pointer' }} onClick={() => { window.open(tab.url, '_blank'); }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.title || tab.url}</div>
                        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Parked {new Date(tab.parkedAt).toLocaleDateString()}</div>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--color-accent-primary)', cursor: 'pointer' }}>↗ Open</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeSection === 'sugarbox' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Sugar Box</h2>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Distractions saved for later as rewards. Enjoy responsibly.</p>
                {sugarBox.length === 0 ? (
                  <GlassCard style={{ padding: '24px', textAlign: 'center' }}><p style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>Sugar Box is empty. Stay focused! 🎯</p></GlassCard>
                ) : (
                  sugarBox.map((item, i) => (
                    <div key={i} style={{ ...fieldRow, cursor: 'pointer' }} onClick={() => { window.open(item.url, '_blank'); }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🍬 {item.title || item.url}</div>
                        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Saved {new Date(item.addedAt).toLocaleDateString()}</div>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--color-accent-primary)', cursor: 'pointer' }}>↗ Enjoy</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeSection === 'stats' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Stats & History</h2>
                <div style={sectionLabel}>Intent-Popup Stats</div>
                {(() => {
                  const counts = { continue: 0, side_quest: 0, sugar_box: 0, park: 0, nevermind: 0, skip_domain: 0, inherit: 0 };
                  intentHistory.forEach(e => { if (counts[e.action] !== undefined) counts[e.action]++; });
                  const total = intentHistory.length;
                  const focusWins = counts.nevermind;
                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                        <GlassCard style={{ padding: '12px', textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>{total}</div>
                          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Total Decisions</div>
                        </GlassCard>
                        <GlassCard style={{ padding: '12px', textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: 700, color: '#66bb6a' }}>{focusWins}</div>
                          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Focus Wins (Nevermind)</div>
                        </GlassCard>
                      </div>
                      <div style={sectionLabel}>Breakdown</div>
                      {Object.entries(counts).map(([action, count]) => (
                        <div key={action} style={fieldRow}>
                          <span style={{ fontSize: '12px', textTransform: 'capitalize' }}>{action.replace(/_/g, ' ')}</span>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-accent-primary)' }}>{count}</span>
                        </div>
                      ))}
                    </>
                  );
                })()}
                <div style={sectionLabel}>Recent History</div>
                {intentHistory.slice(0, 15).map((entry, i) => (
                  <div key={i} style={{ ...fieldRow, padding: '3px 0' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '11px', fontWeight: 500 }}>{entry.action.replace(/_/g, ' ')} — {entry.domain}</div>
                      {entry.context && <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>"{entry.context}"</div>}
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', flexShrink: 0 }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}

            {activeSection === 'privacy' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Privacy & Capture</h2>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>All capture features are OFF by default. Incognito tabs are never captured.</p>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Screenshot capture</span>
                  <Toggle value={!!settings.screenshotCapture} onChange={v => updateSetting('screenshotCapture', v)} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Keystroke analytics</span>
                  <Toggle value={!!settings.keystrokeAnalytics} onChange={v => updateSetting('keystrokeAnalytics', v)} />
                </div>
              </div>
            )}

            {activeSection === 'about' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>About Tabatha</h2>
                <div style={fieldRow}><span style={fieldLabel}>Version</span><span>v1.0.0-alpha</span></div>
                <div style={fieldRow}><span style={fieldLabel}>Codename</span><span>Attention Operating System</span></div>
                <div style={fieldRow}><span style={fieldLabel}>Ecosystem</span><span>Flux Family</span></div>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '16px', lineHeight: 1.5 }}>
                  Tabatha is a context-driven tab manager that maintains intention, tracks time, and supports follow-through across browsing sessions. Part of the Flux ecosystem.
                </p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Live Preview Panel */}
        <div style={{ flex: 1, padding: '24px', borderLeft: '1px solid var(--color-border)', background: 'var(--color-bg-base)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', overflowY: 'auto' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '16px', width: '100%' }}>
            Live Preview
          </div>

          {activeSection === 'appearance' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <GlassCard style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>GlassCard Component</div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Sample content card</div>
              </GlassCard>
              <div style={{ display: 'flex', gap: '8px' }}>
                <PopButton size="sm">PopButton</PopButton>
                <PopButton size="sm" variant="secondary">Secondary</PopButton>
              </div>
              <Tooltip text="This is a Tooltip preview" position="bottom">
                <span style={{ fontSize: '12px', color: 'var(--color-accent-primary)', cursor: 'pointer', textDecoration: 'underline' }}>Hover for Tooltip</span>
              </Tooltip>
            </div>
          )}

          {activeSection === 'clock' && (
            <div style={{ transform: `scale(${Math.min(1, (clockSettings.scale || 0.7))})`, transformOrigin: 'top center' }}>
              <FlipClock settings={clockSettings} />
            </div>
          )}

          {activeSection === 'focus' && (
            <div style={{ width: '100%' }}>
              <GlassCard style={{ padding: '16px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--color-accent-primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>🎯 CURRENT FOCUS</div>
                    <div style={{ fontSize: '15px', fontWeight: 600 }}>Sample Focus Item</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>3 tabs · 12m elapsed</div>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-accent-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {String(settings.focusTimerMinutes || 15).padStart(2, '0')}:00
                  </div>
                </div>
              </GlassCard>
              <GlassCard style={{ padding: '10px 12px', opacity: 0.7 }}>
                <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>⚠️ Drifted Focus (preview)</span>
                  <span style={{ color: '#ef5350', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>+02:30</span>
                </div>
              </GlassCard>
            </div>
          )}

          {activeSection === 'intent' && (
            <div style={{ width: '340px', background: '#1a1a1a', borderRadius: '16px', padding: '28px', textAlign: 'center', border: '1px solid #333' }}>
              <h3 style={{ fontSize: '20px', color: '#fff', margin: '0 0 6px' }}>Why are you here?</h3>
              <p style={{ color: '#888', fontSize: '12px', marginBottom: '14px' }}>Define your intent to proceed.</p>
              <div style={{ textAlign: 'left', fontSize: '9px', textTransform: 'uppercase', color: '#555', letterSpacing: '0.1em', marginBottom: '6px', fontWeight: 600 }}>Inherit from active focus</div>
              <div style={{ background: '#252525', border: '1px solid #333', borderRadius: '8px', padding: '8px 10px', marginBottom: '12px', textAlign: 'left', fontSize: '12px', color: '#aaa' }}>🎯 Sample Focus Item <span style={{ fontSize: '9px', background: '#333', padding: '1px 4px', borderRadius: '3px', marginLeft: '6px' }}>focus</span></div>
              <input type="text" placeholder="What are you working on?" disabled style={{ width: '100%', padding: '9px', background: '#333', border: '1px solid #444', borderRadius: '8px', color: '#888', fontSize: '12px', boxSizing: 'border-box', marginBottom: '10px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button style={{ gridColumn: 'span 2', padding: '9px', background: '#fff', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '12px' }}>Continue</button>
                <button style={{ padding: '8px', background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '8px', fontSize: '11px' }}>⚔️ Side Quest</button>
                <button style={{ padding: '8px', background: '#3c1f1f', color: '#ff6b6b', border: '1px solid #5c2b2b', borderRadius: '8px', fontSize: '11px' }}>🍬 Sugar Box</button>
                <button style={{ gridColumn: 'span 2', padding: '8px', background: 'transparent', color: '#888', border: '1px solid #444', borderRadius: '8px', fontSize: '11px' }}>🚫 Nevermind</button>
              </div>
              <div style={{ marginTop: '10px', fontSize: '10px', color: '#555' }}>Skip intent for this domain</div>
            </div>
          )}

          {activeSection === 'tags' && (
            <div style={{ width: '100%' }}>
              <GlassCard style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>Association Tag Display</div>
                <div style={{ fontSize: '13px' }}>💼 Example Co › Tabatha › v1.0 Alpha</div>
              </GlassCard>
            </div>
          )}

          {activeSection === 'stats' && (
            <div style={{ width: '100%' }}>
              <GlassCard style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', fontWeight: 700, color: '#66bb6a' }}>{intentHistory.filter(e => e.action === 'nevermind').length}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Times you chose focus over distraction</div>
              </GlassCard>
            </div>
          )}

          {(activeSection === 'parked' || activeSection === 'sugarbox') && (
            <div style={{ width: '100%', textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>{activeSection === 'parked' ? '🅿️' : '🍬'}</div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>{activeSection === 'parked' ? parkedTabs.length : sugarBox.length}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>{activeSection === 'parked' ? 'tabs parked' : 'items saved'}</div>
            </div>
          )}

          {(activeSection === 'time' || activeSection === 'export' || activeSection === 'privacy' || activeSection === 'about') && (
            <div style={{ width: '100%', textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>
                {activeSection === 'time' ? '⏱' : activeSection === 'export' ? '📤' : activeSection === 'privacy' ? '🔒' : 'ℹ️'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                {activeSection === 'about' ? 'Tabatha — Attention Operating System' : 'Preview available when components are active'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Settings />);
