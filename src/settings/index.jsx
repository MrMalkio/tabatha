import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { supabase, redeemInviteToken, createOrganization } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { getLogs, clearLogs } from '../services/logger';
import UrlRulesSection from './UrlRulesSection';
import CortexPanel from './CortexPanel';
import { useInstallIdentity } from '../hooks/useInstallIdentity';
import { TeamActivityPanel } from './TeamActivityPanel';
import { ChangelogView } from '../components/ui/ChangelogView';
import { SettingsSearch } from './SettingsSearch';

// FIX-11: Settings → About changelog view. Reads the same generated
// changelog.json that the newtab "What's New" modal uses (Vite copies
// public/ → dist/, so it resolves at the extension root).
function AboutChangelog() {
  const [releases, setReleases] = useState([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = chrome.runtime.getURL('changelog.json');
        const resp = await fetch(url);
        if (!resp.ok) return;
        const data = await resp.json();
        if (!cancelled && Array.isArray(data?.releases)) setReleases(data.releases);
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (releases.length === 0) return null;
  const limit = expanded ? undefined : 3;

  return (
    <div style={{ marginTop: '24px' }} data-search-id="about-changelog">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>📜 Changelog</h3>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-accent-primary)', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
        >
          {expanded ? 'Show recent only' : `Show all (${releases.length})`}
        </button>
      </div>
      <ChangelogView releases={releases} limit={limit} />
    </div>
  );
}

function getIntentContext(entry) {
  return entry?.context ?? entry?.newContext ?? '';
}

function isIntentChangeEntry(entry) {
  return entry?.action === 'change'
    || entry?.oldIntent !== undefined
    || entry?.newIntent !== undefined
    || entry?.oldContext !== undefined
    || entry?.newContext !== undefined;
}

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
  { id: 'lifecycle', label: '🧠 Focus Lifecycle' },
  { id: 'intent', label: '🚪 Intent-Popup' },
  { id: 'urlrules', label: '🔗 URL Rules' },
  { id: 'blocked', label: '🚫 Blocked Sites' },
  { id: 'time', label: '⏱ Time Tracking' },
  { id: 'export', label: '📤 Export & Agents' },
  { id: 'workclock', label: '⏱️ Work Clock' },
  { id: 'followthrough', label: '📋 Follow-through' },
  { id: 'tags', label: '🏷 Tags & Associations' },
  { id: 'parked', label: '🅿️ Parked Tabs' },
  { id: 'sugarbox', label: '🍬 Sugar Box' },
  { id: 'stats', label: '📊 Stats & History' },
  { id: 'sync', label: '☁️ Sync & Account' },
  { id: 'privacy', label: '🔒 Privacy & Capture' },
  { id: 'webhooks', label: '🔗 Webhooks' },
  { id: 'desktop', label: '🖥️ Desktop Activity' },
  { id: 'integrations', label: '🔌 Integrations' },
  { id: 'developer', label: '🛠 Developer' },
  { id: 'about', label: 'ℹ️ About' },
];

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={toggleStyle(value)}>
      <span style={toggleDot(value)} />
    </button>
  );
}

const LOG_COLORS = { error: '#ef5350', warn: '#ffa726', info: '#42a5f5', debug: '#66bb6a' };
// ── DesktopActivityPanel ──
function DesktopActivityPanel({ settings, updateSetting }) {
  const [companionSessions, setCompanionSessions] = useChromeStorage('companionRecentSessions', []);
  const [trimFrom, setTrimFrom] = useState('01:00');
  const [trimTo, setTrimTo] = useState('09:00');
  const [confirmTrim, setConfirmTrim] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const todayStr = new Date().toLocaleDateString();
  const hiddenRanges = settings.hiddenActivityRanges || [];

  const todaySessions = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayEnd = dayStart + 86400000;
    return (companionSessions || []).filter(s => {
      const ts = new Date(s.started_at || s.startedAt).getTime();
      return ts >= dayStart && ts < dayEnd;
    });
  }, [companionSessions]);

  const handleTrim = () => {
    if (!confirmTrim) { setConfirmTrim(true); return; }
    const [fh, fm] = trimFrom.split(':').map(Number);
    const [th, tm] = trimTo.split(':').map(Number);
    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), fh, fm).getTime();
    const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), th, tm).getTime();
    const updated = (companionSessions || []).filter(s => {
      const ts = new Date(s.started_at || s.startedAt).getTime();
      return !(ts >= rangeStart && ts < rangeEnd);
    });
    const removed = (companionSessions || []).length - updated.length;
    setCompanionSessions(updated);
    setConfirmTrim(false);
    flash(`✓ Deleted ${removed} switch(es) between ${trimFrom} – ${trimTo}.`);
  };

  const handleHide = () => {
    if (!confirmHide) { setConfirmHide(true); return; }
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const newRange = { date: dateStr, from: trimFrom, to: trimTo };
    const ranges = [...(settings.hiddenActivityRanges || []), newRange];
    updateSetting('hiddenActivityRanges', ranges);
    setConfirmHide(false);
    flash(`✓ Hidden ${trimFrom} – ${trimTo} from today's activity bar. Data preserved.`);
  };

  const handleUnhide = (index) => {
    const ranges = [...(settings.hiddenActivityRanges || [])];
    ranges.splice(index, 1);
    updateSetting('hiddenActivityRanges', ranges);
    flash('✓ Range unhidden.');
  };

  const handleClearToday = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayEnd = dayStart + 86400000;
    const updated = (companionSessions || []).filter(s => {
      const ts = new Date(s.started_at || s.startedAt).getTime();
      return !(ts >= dayStart && ts < dayEnd);
    });
    const removed = (companionSessions || []).length - updated.length;
    setCompanionSessions(updated);
    setConfirmClear(false);
    flash(`✓ Cleared ${removed} switch(es) from today.`);
  };

  const flash = (msg) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const cancelAll = () => { setConfirmTrim(false); setConfirmHide(false); setConfirmClear(false); };

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>🖥️ Context Activity</h2>

      {statusMsg && (
        <div style={{ padding: '8px 12px', marginBottom: '12px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 500, background: 'rgba(52,168,83,0.15)', color: '#34A853', border: '1px solid #34A85333' }}>
          {statusMsg}
        </div>
      )}

      {/* ── Timeline Display ── */}
      <div style={sectionLabel}>Timeline Display</div>
      <Tooltip text="Filter the homepage activity bar to only show activity starting at or after this hour. Useful to hide overnight noise." position="bottom">
        <div style={fieldRow} data-search-id="desktop-day-start">
          <span style={fieldLabel}>Day start time</span>
          <input type="time" value={settings.activityDayStartTime || '00:00'} onChange={e => updateSetting('activityDayStartTime', e.target.value)} style={inputStyle} />
        </div>
      </Tooltip>
      <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '4px 0 16px', lineHeight: 1.5 }}>
        The homepage "Context Activity — Today" bar will only show activity starting at or after this time.
      </p>

      {/* ── Min Duration Filter ── */}
      <div style={sectionLabel}>Minimum Switch Duration</div>
      <div style={fieldRow} data-search-id="desktop-min-duration">
        <span style={fieldLabel}>Ignore switches under (seconds)</span>
        <input type="number" min="0" max="60" step="1"
          value={settings.activityMinDurationSec ?? 0}
          onChange={e => updateSetting('activityMinDurationSec', parseInt(e.target.value) || 0)}
          style={{ ...inputStyle, width: '70px', textAlign: 'center' }}
        />
      </div>
      <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '4px 0 16px', lineHeight: 1.5 }}>
        Rapid app/tab switches shorter than this threshold are filtered out. Adjacent same-category sessions merge into one continuous block. Set 0 to show all. Recommended: 2-3 seconds.
      </p>

      {/* ── Today's Data ── */}
      <div style={sectionLabel} data-search-id="desktop-today-data">Today's Data ({todaySessions.length} switches)</div>
      <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '-6px 0 10px', lineHeight: 1.5 }}>
        Today: {todayStr}. Total stored: {(companionSessions || []).length} switches. Use the tools below to clean up false or overnight activity.
      </p>

      {/* Range picker */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600 }}>From</span>
          <input type="time" value={trimFrom} onChange={e => { setTrimFrom(e.target.value); cancelAll(); }} style={{ ...inputStyle, width: '100px' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600 }}>To</span>
          <input type="time" value={trimTo} onChange={e => { setTrimTo(e.target.value); cancelAll(); }} style={{ ...inputStyle, width: '100px' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <button onClick={handleTrim} style={{ padding: '6px 14px', background: confirmTrim ? '#ffa726' : 'var(--color-surface)', color: confirmTrim ? '#000' : 'var(--color-text-primary)', border: `1px solid ${confirmTrim ? '#ffa726' : 'var(--color-border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600, fontSize: '11px', transition: 'all 0.15s' }}>
          {confirmTrim ? '⚠ Confirm Delete Range' : '✂ Delete Range'}
        </button>
        <button onClick={handleHide} style={{ padding: '6px 14px', background: confirmHide ? '#42a5f5' : 'var(--color-surface)', color: confirmHide ? '#fff' : 'var(--color-text-primary)', border: `1px solid ${confirmHide ? '#42a5f5' : 'var(--color-border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600, fontSize: '11px', transition: 'all 0.15s' }}>
          {confirmHide ? '⚠ Confirm Hide Range' : '👁 Hide Range'}
        </button>
      </div>
      <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '2px 0 12px', lineHeight: 1.5 }}>
        <strong>Delete</strong> permanently removes data. <strong>Hide</strong> keeps data but filters it from the activity bar. Both affect the selected time range for today only.
      </p>

      {/* Hidden ranges management */}
      {hiddenRanges.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Hidden ranges</span>
          {hiddenRanges.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', fontSize: '11px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{r.date}: {r.from} – {r.to}</span>
              <button onClick={() => handleUnhide(i)} style={{ padding: '2px 6px', background: 'transparent', color: '#42a5f5', border: '1px solid #42a5f5', borderRadius: '4px', cursor: 'pointer', fontSize: '9px', fontWeight: 600 }}>Unhide</button>
            </div>
          ))}
        </div>
      )}

      {/* Clear all today */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button onClick={handleClearToday} style={{ padding: '6px 14px', background: confirmClear ? '#ef5350' : 'transparent', color: confirmClear ? '#fff' : '#ef5350', border: '1px solid #ef5350', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600, fontSize: '11px', transition: 'all 0.15s' }}>
          {confirmClear ? '⚠ Confirm Clear All Today' : '🗑 Clear All Today'}
        </button>
        {(confirmTrim || confirmHide || confirmClear) && (
          <button onClick={cancelAll} style={{ padding: '6px 10px', background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '11px' }}>Cancel</button>
        )}
      </div>
    </div>
  );
}

function DeveloperPanel({ settings, updateSetting }) {
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refreshLogs = async () => {
    const filter = logFilter === 'all' ? undefined : { level: logFilter };
    const result = await getLogs(filter);
    setLogs(result.reverse()); // newest first
  };

  useEffect(() => {
    refreshLogs();
    if (!autoRefresh) return;
    const iv = setInterval(refreshLogs, 2000);
    return () => clearInterval(iv);
  }, [logFilter, autoRefresh]);

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>🛠 Developer</h2>

      <div style={fieldRow} data-search-id="developer-debug-mode">
        <span style={fieldLabel}>Debug Mode</span>
        <Toggle value={!!settings.debugMode} onChange={v => updateSetting('debugMode', v)} />
      </div>
      <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '4px 0 16px', lineHeight: 1.5 }}>
        Shows a diagnostic bar on the Dashboard with raw state and message responses. Useful for debugging service worker communication.
      </p>

      <div style={{ ...sectionLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} data-search-id="developer-event-log">
        <span>Event Log ({logs.length})</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <select value={logFilter} onChange={e => setLogFilter(e.target.value)} style={{ ...inputStyle, width: '90px', fontSize: '10px', padding: '2px 4px' }}>
            <option value="all">All</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <button onClick={refreshLogs} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>↻</button>
          <button onClick={async () => { await clearLogs(); setLogs([]); }} style={{ background: '#ef535022', border: '1px solid #ef5350', borderRadius: 'var(--radius-sm)', color: '#ef5350', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>Clear</button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <Toggle value={autoRefresh} onChange={setAutoRefresh} />
        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Auto-refresh (2s)</span>
      </div>

      <div style={{ maxHeight: '400px', overflowY: 'auto', background: '#0d0d0d', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontFamily: 'monospace', fontSize: '10px' }}>
        {logs.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#555' }}>No logs yet</div>
        ) : logs.map((entry, i) => (
          <div key={i} style={{ padding: '4px 8px', borderBottom: '1px solid #1a1a1a', color: LOG_COLORS[entry.level] || '#ccc', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ color: '#555', flexShrink: 0, minWidth: '60px' }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
            <span style={{ fontWeight: 700, minWidth: '36px', textTransform: 'uppercase', flexShrink: 0 }}>{entry.level}</span>
            <span style={{ color: '#888', minWidth: '70px', flexShrink: 0 }}>[{entry.source}]</span>
            <span style={{ color: '#ddd', flex: 1 }}>
              {entry.message}
              {entry.data && <span style={{ color: '#666', marginLeft: '6px' }}>{JSON.stringify(entry.data).slice(0, 120)}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Plan 036 — Intelligent Focus Lifecycle settings.
function FocusLifecyclePanel({ settings, updateSetting }) {
  const [dismissals, setDismissals] = useState(null);
  const [loadingDismissals, setLoadingDismissals] = useState(false);

  const DEFAULT_MEETING_DOMAINS = [
    'meet.google.com', 'zoom.us', 'teams.microsoft.com', 'teams.live.com',
    'webex.com', 'app.webex.com', 'whereby.com', 'around.co'
  ];
  const meetingDomains = settings.meetingDomains ?? DEFAULT_MEETING_DOMAINS;

  // Local draft keeps newlines while typing (filter(Boolean) on the saved value
  // was eating empty lines as the user pressed Enter to start a new line).
  const [domainDraft, setDomainDraft] = useState(null); // null = not editing
  const domainValue = domainDraft !== null ? domainDraft : meetingDomains.join('\n');
  const commitDomains = (raw) => {
    setDomainDraft(null);
    updateSetting('meetingDomains', raw.split('\n').map(s => s.trim()).filter(Boolean));
  };

  const loadDismissals = async () => {
    setLoadingDismissals(true);
    try {
      const res = await sendMessage('GET_AUTO_FOCUS_DISMISSALS');
      setDismissals(res?.dismissals || {});
    } catch { setDismissals({}); }
    setLoadingDismissals(false);
  };

  const clearDismissals = async () => {
    await sendMessage('CLEAR_AUTO_FOCUS_DISMISSALS');
    setDismissals({});
  };

  const textareaStyle = { ...inputStyle, width: '100%', minHeight: '88px', fontFamily: 'monospace', resize: 'vertical' };

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>🧠 Focus Lifecycle</h2>
      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Controls how Tabatha detects idleness, suggests focuses automatically, and notices when you drift off-task.
      </p>

      {/* ── Idle Behaviour ── */}
      <div style={sectionLabel}>Idle Behaviour</div>
      <Tooltip text="Master switch. When OFF, going idle never pauses or prompts about any focus — including off-device focuses. Turn off if you prefer to manage focus state manually." position="bottom">
        <div style={fieldRow} data-search-id="lifecycle-auto-pause">
          <span style={fieldLabel}>Auto-pause on idle</span>
          <Toggle value={settings.autoPauseEnabled !== false} onChange={v => updateSetting('autoPauseEnabled', v)} />
        </div>
      </Tooltip>
      {settings.autoPauseEnabled !== false && (
        <>
          <Tooltip text="When idle is detected, show a prompt ('Yes, on task / I diverged / Pause') instead of silently pausing. Turn off to restore the old hard-pause behaviour." position="bottom">
            <div style={{ ...fieldRow, paddingLeft: '12px' }}>
              <span style={{ ...fieldLabel, color: 'var(--color-text-muted)' }}>↳ Prompt before pausing</span>
              <Toggle value={settings.idleConfirmationEnabled !== false} onChange={v => updateSetting('idleConfirmationEnabled', v)} />
            </div>
          </Tooltip>
        </>
      )}
      <div style={fieldRow} data-search-id="lifecycle-idle-threshold">
        <span style={fieldLabel}>Idle threshold (minutes)</span>
        <input type="number" min="1" max="30" value={settings.idleThresholdMinutes ?? 5} onChange={e => updateSetting('idleThresholdMinutes', parseInt(e.target.value) || 5)} style={inputStyle} />
      </div>
      <Tooltip text="How recently the desktop companion must have seen activity (e.g. typing in another app) for Tabatha to suppress a Chrome idle pause." position="bottom">
        <div style={fieldRow} data-search-id="lifecycle-companion-grace">
          <span style={fieldLabel}>Companion grace (minutes)</span>
          <input type="number" min="1" max="30" value={settings.companionIdleGraceMinutes ?? 5} onChange={e => updateSetting('companionIdleGraceMinutes', parseInt(e.target.value) || 5)} style={inputStyle} />
        </div>
      </Tooltip>
      <div style={fieldRow} data-search-id="lifecycle-auto-resume">
        <span style={fieldLabel}>Auto-resume on return</span>
        <Toggle value={settings.autoResumeOnReturn !== false} onChange={v => updateSetting('autoResumeOnReturn', v)} />
      </div>
      <Tooltip text="When you mark an intent resolved, pull the most recently paused intent from the queue into focus. Turn OFF to leave nothing active on resolve — the queue stays paused until you pick the next intent yourself." position="bottom">
        <div style={fieldRow} data-search-id="lifecycle-auto-start-next">
          <span style={fieldLabel}>Auto-start next intent on resolve</span>
          <Toggle value={settings.autoStartNextOnResolve !== false} onChange={v => updateSetting('autoStartNextOnResolve', v)} />
        </div>
      </Tooltip>
      <div style={fieldRow} data-search-id="lifecycle-meeting-grace">
        <span style={fieldLabel}>Meeting grace (minutes)</span>
        <input type="number" min="5" max="180" value={settings.meetingIdleGraceMinutes ?? 60} onChange={e => updateSetting('meetingIdleGraceMinutes', parseInt(e.target.value) || 60)} style={inputStyle} />
      </div>
      <div style={{ padding: '6px 0' }} data-search-id="lifecycle-meeting-domains">
        <div style={{ ...fieldLabel, marginBottom: '4px' }}>Meeting domains</div>
        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
          One domain per line. Press <kbd style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '3px', padding: '0 4px', fontSize: '10px' }}>Enter</kbd> after each. Tabs on these domains suppress idle/auto-pause even when muted or backgrounded.
        </div>
        <textarea
          style={textareaStyle}
          placeholder={'meet.google.com\nzoom.us\nteams.microsoft.com'}
          value={domainValue}
          onChange={e => setDomainDraft(e.target.value)}
          onBlur={e => commitDomains(e.target.value)}
          onKeyDown={e => e.stopPropagation()}
          spellCheck={false}
        />
      </div>

      {/* ── Auto-Focus ── */}
      <div style={sectionLabel}>Auto-Focus</div>
      <div style={fieldRow} data-search-id="lifecycle-auto-focus">
        <span style={fieldLabel}>Enable auto-focus suggestions</span>
        <Toggle value={settings.autoFocusEnabled !== false} onChange={v => updateSetting('autoFocusEnabled', v)} />
      </div>
      <Tooltip text="Minimum confidence before a suggestion chip is shown. 'High' = category/domain-group matches; 'Medium' also surfaces desktop-app matches; 'Explicit only' shows nothing and relies on URL-rule auto-create." position="bottom">
        <div style={fieldRow} data-search-id="lifecycle-suggestion-confidence">
          <span style={fieldLabel}>Suggestion confidence</span>
          <select value={settings.autoFocusConfidence || 'high'} onChange={e => updateSetting('autoFocusConfidence', e.target.value)} style={selectStyle}>
            <option value="explicit">Explicit only</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>
        </div>
      </Tooltip>
      <div style={{ padding: '6px 0' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={loadDismissals} disabled={loadingDismissals} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
            {loadingDismissals ? 'Loading…' : 'View dismissal history'}
          </button>
          {dismissals && Object.keys(dismissals).length > 0 && (
            <button onClick={clearDismissals} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>Clear</button>
          )}
        </div>
        {dismissals && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            {Object.keys(dismissals).length === 0
              ? 'No dismissals recorded.'
              : Object.entries(dismissals).map(([domain, d]) => (
                  <div key={domain} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>{domain}</span>
                    <span>{d.dismissCount}× · cooldown {d.cooldownMinutes}m</span>
                  </div>
                ))}
          </div>
        )}
      </div>

      {/* ── Drift Detection ── */}
      <div style={sectionLabel}>Drift Detection</div>
      <div style={fieldRow} data-search-id="lifecycle-drift-detection">
        <span style={fieldLabel}>Enable drift detection</span>
        <Toggle value={settings.driftDetectionEnabled !== false} onChange={v => updateSetting('driftDetectionEnabled', v)} />
      </div>
      <div style={fieldRow}>
        <span style={fieldLabel}>Drift threshold (minutes)</span>
        <input type="number" min="1" max="15" value={settings.driftThresholdMinutes ?? 3} onChange={e => updateSetting('driftThresholdMinutes', parseInt(e.target.value) || 3)} style={inputStyle} />
      </div>
      <div style={fieldRow}>
        <span style={fieldLabel}>Snooze duration (minutes)</span>
        <input type="number" min="1" max="30" value={settings.driftSnoozeMinutes ?? 5} onChange={e => updateSetting('driftSnoozeMinutes', parseInt(e.target.value) || 5)} style={inputStyle} />
      </div>

      {/* ── Auto Clock-In ── */}
      <div style={sectionLabel}>Auto Clock-In</div>
      <div style={fieldRow} data-search-id="lifecycle-auto-clock-in">
        <span style={fieldLabel}>Enable auto clock-in</span>
        <Toggle value={!!settings.autoClockInEnabled} onChange={v => updateSetting('autoClockInEnabled', v)} />
      </div>
      <Tooltip text="'When Chrome opens' clocks you in on browser launch. 'On OS unlock' uses the desktop companion to clock in when you unlock your computer (requires the companion running)." position="bottom">
        <div style={fieldRow}>
          <span style={fieldLabel}>Clock-in trigger</span>
          <select value={settings.autoClockInTrigger || 'chrome_open'} onChange={e => updateSetting('autoClockInTrigger', e.target.value)} style={selectStyle} disabled={!settings.autoClockInEnabled}>
            <option value="chrome_open">When Chrome opens</option>
            <option value="os_unlock">On OS unlock (companion)</option>
          </select>
        </div>
      </Tooltip>
    </div>
  );
}

function Settings() {
  const [theme, setTheme] = useTheme();
  // NB-08: honor settings.html#<section> deep links (e.g. sidebar sync chip
  // opens settings.html#sync). Read in the lazy initializer — same pattern as
  // workshifts' #live hash — so the first render already shows the target.
  const [activeSection, setActiveSection] = useState(() => {
    const hash = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#/, '');
    return SECTIONS.some(s => s.id === hash) ? hash : 'appearance';
  });
  const [settings, setSettings] = useChromeStorage('settings', {});
  const [clockSettings, setClockSettings] = useChromeStorage('clockSettings', CLOCK_DEFAULTS);
  const [companionConnected] = useChromeStorage('companionConnected', false);
  const [parkedTabs] = useChromeStorage('parkedTabs', []);
  const [sugarBox] = useChromeStorage('sugarBox', []);
  const [skippedDomains, setSkippedDomains] = useChromeStorage('skippedDomains', []);
  const [intentHistory] = useChromeStorage('intentHistory', []);
  const [intentPresets, setIntentPresets] = useChromeStorage('intentPresets', { persistent: [] });
  const [blockedSites, setBlockedSites] = useChromeStorage('blockedSites', []);
  const [urlRules, setUrlRules] = useChromeStorage('urlRules', []);
  const installIdentity = useInstallIdentity();
  const [repulling, setRepulling] = useState(false);
  const intentChangeLog = useMemo(
    () => (intentHistory || []).filter(isIntentChangeEntry),
    [intentHistory]
  );

  // Supabase Auth State (via useAuth hook)
  const { session, profile, orgs, teams, loading: authLoading, signIn, signOut, forceResetAuth, refreshProfile, saveDisplayName, isSignedIn } = useAuth();
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  // Create-organization control state
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Display-name editor state
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [resettingAuth, setResettingAuth] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  // When the user clicks "Sync now", we remember the timestamp. If state is
  // still not 'fresh' 6 seconds later, we shift the "pulse to attract user"
  // hint from the sync icon onto the reload icon — the implication being:
  // sync didn't help, try reloading the extension.
  const [lastSyncNowAt, setLastSyncNowAt] = useState(0);

  // Sync diagnostics — written by syncService and useAuth to chrome.storage.local
  const [syncDiagnostics] = useChromeStorage('_syncDiagnostics', []);
  const [lastSyncSuccess] = useChromeStorage('_lastSyncSuccess', null);
  // Shared sync-state derivation (A4) — same logic the sidebar chip uses.
  const syncStatus = useSyncStatus(isSignedIn);

  const handleSaveDisplayName = async () => {
    const next = displayNameDraft.trim();
    // Require a name + an identity. Prefer profile.id but fall back to the
    // auth user id so a momentarily-null profile can't make Save a no-op.
    if (!next || !(profile?.id || session?.user?.id)) { setEditingDisplayName(false); return; }
    setSavingDisplayName(true);
    setAuthError(null);
    // Optimistic + queued: the name updates locally immediately (survives
    // reload) and the write is handed to the background cloud outbox. No 10s
    // timeout race — the outbox flushes with backoff and reconciles later.
    const res = await saveDisplayName(next);
    setSavingDisplayName(false);
    setEditingDisplayName(false);
    if (res?.ok) {
      setAuthError(res.deferred ? '✓ Name saved — syncing to cloud…' : '✓ Name saved');
    } else {
      setAuthError('Failed to update name: ' + (res?.error || 'unknown error'));
    }
  };

  const handleManualExport = async () => {
    setAuthError(null);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'EXPORT_MARKDOWN' });
      if (res?.error) throw new Error(res.error);
      const content = res?.content;
      if (!content) throw new Error('No content returned from EXPORT_MARKDOWN');
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `tabatha-export-${dateStr}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setAuthError('Export failed: ' + (err.message || err));
    }
  };

  // Full chrome.storage.local snapshot, downloaded as JSON. This is the
  // recommended pre-upgrade backup — restores via a single chrome.storage.local.set()
  // call (paste into a Tabatha-page DevTools console) if something goes wrong.
  const handleBackupData = async () => {
    setAuthError(null);
    try {
      const data = await chrome.storage.local.get(null);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const meta = {
        _backupMeta: {
          createdAt: new Date().toISOString(),
          extensionVersion: chrome.runtime.getManifest?.()?.version || 'unknown',
          keyCount: Object.keys(data).length,
          note: 'Restore by pasting in any Tabatha page DevTools console: chrome.storage.local.set(JSON.parse(text)). Be aware this overwrites current state.'
        },
        ...data
      };
      const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tabatha-backup-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setAuthError('Backup failed: ' + (err.message || err));
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError(null);
    try {
      await signIn('password', { email: authEmail, password: authPassword });
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError(null);
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    else setAuthError('✓ Check your email for the confirmation link!');
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signIn('google');
    } catch (err) {
      setAuthError('Google login failed: ' + err.message);
    }
  };

  const handleMagicLink = async () => {
    if (!authEmail) return setAuthError('Enter your email first.');
    setAuthError(null);
    try {
      await signIn('magic_link', { email: authEmail });
      setAuthError('✓ Magic link sent! Check your email.');
    } catch (err) {
      setAuthError('Magic link failed: ' + err.message);
    }
  };

  const handleRedeemToken = async (e) => {
    e.preventDefault();
    if (!inviteToken.trim()) return;
    setInviteLoading(true);
    setAuthError(null);
    try {
      const res = await redeemInviteToken(inviteToken.trim());
      if (res.success) {
        setInviteToken('');
        // Org/team default attribution is applied server-side (migration 018)
        // and, as belt-and-braces, in the background REDEEM_INVITE_TOKEN handler.
        await refreshProfile();
        setAuthError('✓ Successfully joined organization!');
      } else {
        setAuthError('Failed: ' + res.error);
      }
    } catch (err) {
      setAuthError(err.message);
    }
    setInviteLoading(false);
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    const name = newOrgName.trim();
    if (!name) return;
    setCreatingOrg(true);
    setAuthError(null);
    try {
      const res = await createOrganization(name);
      if (res?.success) {
        setNewOrgName('');
        await refreshProfile();
        setAuthError('✓ Organization created!');
      } else {
        setAuthError('Failed: ' + (res?.error || 'Could not create organization'));
      }
    } catch (err) {
      setAuthError(err.message);
    }
    setCreatingOrg(false);
  };

  const updateSetting = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));
  const updateClock = (key, val) => setClockSettings(prev => ({ ...prev, [key]: val }));

  // NB-08: stable jump callback for <SettingsSearch> (which owns its own
  // query state). Switch section, then — after the section's 150ms mount
  // animation — scroll the data-search-id anchor into view and pulse it
  // (~2s, tabathaSearchPulse keyframes live in SettingsSearch).
  const handleSearchJump = useCallback((entry) => {
    setActiveSection(entry.section);
    setTimeout(() => {
      const el = document.querySelector(`[data-search-id="${entry.id}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.animation = 'none';
      void el.offsetWidth; // reflush so back-to-back jumps re-trigger the pulse
      el.style.animation = 'tabathaSearchPulse 1s ease-in-out 2';
      setTimeout(() => { el.style.animation = ''; }, 2100);
    }, 220);
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex' }}>
      {/* Left Nav */}
      <nav style={{ width: NAV_WIDTH, minWidth: NAV_WIDTH, borderRight: '1px solid var(--color-border)', padding: '16px 0', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', background: 'var(--color-surface)', backdropFilter: 'var(--surface-blur)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 16px 12px', borderBottom: '1px solid var(--color-border)', marginBottom: '8px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>⚙️ Settings</div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Tabatha v{chrome.runtime.getManifest?.()?.version || '?'}-α</div>
          {/* Sync status pill + sync now + reload */}
          {(() => {
            // A4: derive via the shared hook so Settings + sidebar agree.
            const state = syncStatus.state;
            const pill = { color: syncStatus.color, bg: syncStatus.bg, label: syncStatus.label, tip: syncStatus.tip };
            // Decide which icon should pulse to draw the user's eye:
            //   - Nothing pulses when sync is healthy.
            //   - If the user JUST clicked sync now and it didn't fix things in 6s, the
            //     reload button pulses (implying: sync alone won't help, reload to pick
            //     up fixes).
            //   - Otherwise the sync-now button pulses, prompting first action.
            const syncJustTried = lastSyncNowAt > 0 && (Date.now() - lastSyncNowAt) < 6000;
            const pulseTarget = state === 'fresh' ? null
              : syncingNow ? null
              : syncJustTried ? 'reload'
              : 'sync';
            const pulseColor = pill.color;
            const pulseStyle = (isMe) => isMe && pulseTarget ? {
              animation: 'tabathaSyncPulse 1.4s ease-in-out infinite',
              borderColor: pulseColor,
              color: pulseColor,
              boxShadow: '0 0 0 0 ' + pulseColor
            } : {};
            return (
              <>
                <style>{`@keyframes tabathaSyncPulse {
                  0%   { box-shadow: 0 0 0 0 ${pulseColor}66; transform: scale(1); }
                  50%  { box-shadow: 0 0 0 6px ${pulseColor}00; transform: scale(1.06); }
                  100% { box-shadow: 0 0 0 0 ${pulseColor}00; transform: scale(1); }
                }`}</style>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}>
                  <span
                    title={`${pill.tip} — click to open Sync & Account`}
                    onClick={() => setActiveSection('sync')}
                    style={{ flex: 1, padding: '3px 8px', fontSize: '10px', fontWeight: 600, color: pill.color, background: pill.bg, borderRadius: '10px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                  >{pill.label}</span>
                  <button
                    onClick={async () => {
                      if (syncingNow) return;
                      // NB-08: the "Sign in first" message names the Sync &
                      // Account section — clicking now also takes you there.
                      if (!isSignedIn) { setAuthError('Sign in first (Sync & Account section)'); setActiveSection('sync'); return; }
                      setSyncingNow(true);
                      setLastSyncNowAt(Date.now());
                      const backstop = setTimeout(() => setSyncingNow(false), 15000);
                      try {
                        const res = await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
                        // Surface the outcome EITHER way — a failing sync must never
                        // look like an unresponsive button (2026-07-10 finding: the
                        // handler always returns success:true; failures only show up
                        // as fresh diagnostic rows).
                        const newDiag = (res?.recentDiagnostics || []).filter(d => new Date(d.at).getTime() > (Date.now() - 10000));
                        if (newDiag.length > 0) {
                          setAuthError(`⚠ Sync issue: ${newDiag[0].kind} — ${String(newDiag[0].detail || '').slice(0, 140)}`);
                        } else if (res?.lastSyncSuccess) {
                          setAuthError('✓ Synced ' + new Date(res.lastSyncSuccess).toLocaleTimeString());
                        } else {
                          setAuthError('⚠ Sync ran but nothing was pushed — check Sync Status below');
                        }
                      } catch (e) { setAuthError(`⚠ Sync failed: ${e?.message || 'no response'}`); } finally { clearTimeout(backstop); setSyncingNow(false); }
                    }}
                    disabled={syncingNow}
                    title={pulseTarget === 'sync' ? 'Sync now (recommended)' : 'Sync now'}
                    style={{ padding: '3px 6px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: syncingNow ? 'wait' : 'pointer', fontSize: '11px', color: 'var(--color-text-muted)', transition: 'all 0.15s', ...pulseStyle('sync') }}
                  >
                    {syncingNow ? '⏳' : '↻'}
                  </button>
                  <button
                    onClick={() => chrome.runtime.reload()}
                    title={pulseTarget === 'reload' ? 'Sync didn’t fix it — reload the extension to pick up new code' : 'Reload extension'}
                    style={{ padding: '3px 6px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '11px', color: 'var(--color-text-muted)', transition: 'all 0.15s', ...pulseStyle('reload') }}
                  >
                    ⟳
                  </button>
                </div>
              </>
            );
          })()}
          {/* NB-08: fuzzy settings search — owns its query state locally */}
          <SettingsSearch onJump={handleSearchJump} />
        </div>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            display: 'block', width: '100%', textAlign: 'left', background: activeSection === s.id ? 'var(--color-accent-primary)11' : 'transparent',
            border: 'none', borderLeft: activeSection === s.id ? '3px solid var(--color-accent-primary)' : '3px solid transparent',
            color: activeSection === s.id ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
            padding: '8px 16px', fontSize: '12px', cursor: 'pointer', fontWeight: activeSection === s.id ? 600 : 400, transition: 'all 0.15s',
          }}>{s.label}</button>
        ))}
        <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', letterSpacing: '0.08em', fontWeight: 500 }}>Made by <strong style={{ color: 'var(--color-accent-primary)', fontWeight: 700 }}>Malkio</strong></span>
        </div>
      </nav>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', minHeight: '100vh' }}>
        {/* Settings Panel */}
        <div style={{ flex: 1, padding: '24px 32px', maxWidth: '480px', overflowY: 'auto' }}>
          <motion.div key={activeSection} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>

            {activeSection === 'appearance' && (
              <div data-search-id="section-appearance">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Appearance</h2>
                <Tooltip text="When: You want to change the visual vibe of Tabatha. How: Select a theme from the dropdown. Affects: Dashboard, sidebar, and all extension windows." position="bottom">
                  <div style={fieldRow} data-search-id="appearance-theme">
                    <span style={fieldLabel}>Theme</span>
                    <select value={theme} onChange={e => setTheme(e.target.value)} style={selectStyle}>
                      <option value="pop-art">🎨 Pop Art (Dark/Neon)</option>
                      <option value="corporate">🏢 Corporate (Light/High Contrast)</option>
                      <option value="midnight">🌙 Midnight (Deep Dark)</option>
                      <option value="matcha">🍵 Matcha (Soft Green)</option>
                      <option value="terminal">📟 Terminal (Hacker)</option>
                      <option value="sakura">🌸 Sakura (Pink/Soft)</option>
                      <option value="blueprint">📐 Blueprint (Technical)</option>
                      <option value="neo-brutalism">🟨 Neo-Brutalism (Harsh/Bright)</option>
                      <option value="glass-ocean">🌊 Glass Ocean (Translucent Blue)</option>
                      <option value="retro-pixel">👾 Retro Pixel (8-Bit/Warm)</option>
                      <option value="solarized-warm">📖 Solarized Warm (Sepia)</option>
                      <option value="high-contrast-dark">⚫ High Contrast Dark (Black/White)</option>
                    </select>
                  </div>
                </Tooltip>
                <Tooltip text="When: You click the Tabatha toolbar icon. How: Choose whether it opens the side panel or the tab-list popup. The Ctrl+Shift+E hotkey always opens the tab-list popup (rebindable at chrome://extensions/shortcuts)." position="bottom">
                  <div style={fieldRow} data-search-id="appearance-toolbar-click">
                    <span style={fieldLabel}>Toolbar Icon Click</span>
                    <select value={settings.toolbarClickAction || 'sidepanel'} onChange={e => updateSetting('toolbarClickAction', e.target.value)} style={selectStyle}>
                      <option value="sidepanel">📑 Open Side Panel</option>
                      <option value="popup">🗂 Open Tab List</option>
                    </select>
                  </div>
                </Tooltip>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', padding: '6px 8px', marginTop: '4px', lineHeight: '1.5' }}>
                  {(!settings.toolbarClickAction || settings.toolbarClickAction === 'sidepanel')
                    ? '📑 Clicking the toolbar icon opens Tabatha’s side panel. Press Ctrl+Shift+E (⌘⇧E on Mac) to pop open the tab list.'
                    : '🗂 Clicking the toolbar icon opens the tab-list popup. The same Ctrl+Shift+E (⌘⇧E on Mac) hotkey also opens it.'}
                </div>
                <div style={sectionLabel}>
                  This Browser Profile
                  {installIdentity?.saveState === 'saving' && <span style={{ marginLeft: 8, color: 'var(--color-text-muted)', fontWeight: 400 }}>· saving…</span>}
                  {installIdentity?.saveState === 'saved' && <span style={{ marginLeft: 8, color: '#34A853', fontWeight: 400 }}>· ✓ saved</span>}
                  {installIdentity?.saveState === 'error' && <span style={{ marginLeft: 8, color: '#ef5350', fontWeight: 400 }}>· save failed (check sync log)</span>}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', padding: '2px 8px 8px', lineHeight: '1.5' }}>
                  Identifies this Chrome profile on this machine. Each browser profile gets its own classification — Personal hides the clock controls; Business / Professional / Work expose them.
                </div>
                <Tooltip text="A unique ID generated on first run. Stays the same across sign-ins on this browser profile. Surfaced for support / debugging." position="bottom">
                  <div style={fieldRow} data-search-id="appearance-install-id">
                    <span style={fieldLabel}>Install ID</span>
                    <span style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px', color: 'var(--color-text-muted)', cursor: 'text', userSelect: 'all' }}>
                      {installIdentity?.identity?.supabaseId
                        ? `${installIdentity.identity.supabaseId.slice(0, 8)}…${installIdentity.identity.supabaseId.slice(-4)}`
                        : (installIdentity?.identity?.localId
                            ? `local:${installIdentity.identity.localId.slice(0, 8)}… (will register on next sync)`
                            : 'initialising…')}
                    </span>
                  </div>
                </Tooltip>
                <Tooltip text="How you recognise this install in cross-profile views. Examples: 'Work MacBook', 'Personal PC'. Press Enter or click away to save." position="bottom">
                  <div style={fieldRow} data-search-id="appearance-profile-name">
                    <span style={fieldLabel}>Profile Name</span>
                    <input
                      type="text"
                      placeholder="e.g. Work MacBook"
                      value={installIdentity?.identity?.profileName || ''}
                      onChange={e => installIdentity?.setProfileName(e.target.value)}
                      onBlur={() => installIdentity?.commitProfileName?.()}
                      onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                      style={inputStyle}
                    />
                  </div>
                </Tooltip>
                <Tooltip text="Per-install category. Personal hides clock-in/out and shift controls. Business / Professional / Work expose them. Changes save to the cloud immediately." position="bottom">
                  <div style={fieldRow} data-search-id="appearance-classification">
                    <span style={fieldLabel}>Classification</span>
                    <select
                      value={installIdentity?.identity?.classification || 'professional'}
                      onChange={e => {
                        installIdentity?.setClassification(e.target.value);
                        updateSetting('defaultRealm', e.target.value);
                      }}
                      style={selectStyle}
                    >
                      <option value="business" title="Your own venture — solo founder, owner-operator, freelancer running their book of clients">💼 Business</option>
                      <option value="professional" title="Day job as an employee — clock and outputs report to an employer or team">👔 Professional</option>
                      <option value="work" title="Project / contract / side-work that has shifts but isn't your main employer">🏗 Work</option>
                      <option value="personal" title="Off-shift browsing — clock controls hidden, time/attention breakdown still visible">🏠 Personal</option>
                    </select>
                  </div>
                </Tooltip>
                {/* Inline explainer beneath the picker — updates with selection */}
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', padding: '2px 8px 12px', lineHeight: 1.5 }}>
                  {installIdentity?.identity?.classification === 'business' && (
                    <><strong style={{ color: 'var(--color-text-primary)' }}>💼 Business —</strong> your own venture. Solo founder, owner-operator, or freelancer. Shift controls + clock visible. New focuses default to <code>realm: business</code>. Sync stamps every row from this install as <code>business</code> so it's clear in cross-profile views.</>
                  )}
                  {(!installIdentity?.identity?.classification || installIdentity?.identity?.classification === 'professional') && (
                    <><strong style={{ color: 'var(--color-text-primary)' }}>👔 Professional —</strong> day job as an employee. Shift controls + clock visible. Time reports up to a manager or team. New focuses default to <code>realm: professional</code>.</>
                  )}
                  {installIdentity?.identity?.classification === 'work' && (
                    <><strong style={{ color: 'var(--color-text-primary)' }}>🏗 Work —</strong> project / contract / side-work. Shifts apply but it's not your primary employer. Useful when you split a single Chrome profile across multiple gigs. Shift controls + clock visible.</>
                  )}
                  {installIdentity?.identity?.classification === 'personal' && (
                    <><strong style={{ color: 'var(--color-text-primary)' }}>🏠 Personal —</strong> off-shift browsing. Clock-in / clock-out / break / shift buttons are hidden everywhere; time-and-attention breakdowns still visible. New focuses default to <code>realm: personal</code>. Other profiles see this install as 🏠 in awareness chips.</>
                  )}
                </div>

                <div style={sectionLabel}>User</div>
                <Tooltip text="When: First setting up. How: Type your name. Affects: The dashboard greeting message." position="bottom">
                  <div style={fieldRow} data-search-id="appearance-user-name">
                    <span style={fieldLabel}>Your Name</span>
                    <input type="text" placeholder="e.g. Marcus" value={settings.userName || ''} onChange={e => updateSetting('userName', e.target.value)} style={inputStyle} />
                  </div>
                </Tooltip>

                <div style={sectionLabel}>Intent → Focus Bridge</div>
                <Tooltip text="When: A tab intent is set via InBar. How: Controls whether a focus queue item is auto-created. Smart Dedup = auto-create only if no matching focus exists." position="bottom">
                  <div style={fieldRow} data-search-id="appearance-intent-bridge">
                    <span style={fieldLabel}>Auto-Queue Mode</span>
                    <select value={settings.intentBridgeMode || 'smart_dedup'} onChange={e => updateSetting('intentBridgeMode', e.target.value)} style={selectStyle}>
                      <option value="smart_dedup">🧠 Smart Dedup</option>
                      <option value="always">⚡ Always Auto-Queue</option>
                      <option value="manual">✋ Manual Only</option>
                    </select>
                  </div>
                </Tooltip>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', padding: '6px 8px', marginTop: '4px', lineHeight: '1.5' }}>
                  {settings.intentBridgeMode === 'always' && '⚡ Every new tab intent creates a focus queue item, even if one with the same name exists.'}
                  {settings.intentBridgeMode === 'manual' && '✋ Tab intents never auto-create focus items. Use Link Tab → Create Focus manually.'}
                  {(!settings.intentBridgeMode || settings.intentBridgeMode === 'smart_dedup') && '🧠 A focus item is auto-created only when the intent doesn\u2019t match the active focus and no existing focus has the same label.'}
                </div>
              </div>
            )}

            {activeSection === 'sync' && (
              <div data-search-id="section-sync">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Sync & Account</h2>

                {/* Inline feedback banner */}
                {authError && (
                  <div style={{ padding: '8px 12px', marginBottom: '12px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 500, background: authError.startsWith('✓') ? 'rgba(52,168,83,0.15)' : 'rgba(234,67,53,0.15)', color: authError.startsWith('✓') ? '#34A853' : '#EA4335', border: `1px solid ${authError.startsWith('✓') ? '#34A85333' : '#EA433533'}` }}>
                    {authError}
                  </div>
                )}
                
                {authLoading ? (
                  <div style={{ color: 'var(--color-text-muted)', padding: '24px 0', textAlign: 'center' }}>
                    <div style={{ fontSize: '20px', marginBottom: '8px' }}>⏳</div>
                    Loading auth state...
                  </div>
                ) : isSignedIn ? (
                  <div>
                    {/* ── Profile Card ── */}
                    <div style={{ padding: '16px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--color-accent-primary)' }} />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, color: '#000' }}>
                            {(profile?.display_name || session.user.email)?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {editingDisplayName ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <input
                                type="text"
                                value={displayNameDraft}
                                onChange={(e) => setDisplayNameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveDisplayName();
                                  if (e.key === 'Escape') setEditingDisplayName(false);
                                }}
                                autoFocus
                                disabled={savingDisplayName}
                                style={{ fontSize: '14px', fontWeight: 600, padding: '4px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', minWidth: 0, flex: 1 }}
                              />
                              <button onClick={handleSaveDisplayName} disabled={savingDisplayName} style={{ padding: '4px 8px', background: 'var(--color-accent-primary)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>{savingDisplayName ? '…' : 'Save'}</button>
                              <button onClick={() => setEditingDisplayName(false)} disabled={savingDisplayName} style={{ padding: '4px 8px', background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '11px' }}>Cancel</button>
                            </div>
                          ) : (
                            <div
                              onClick={() => { setDisplayNameDraft(profile?.display_name || ''); setEditingDisplayName(true); }}
                              title="Click to edit"
                              style={{ fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              {profile?.display_name || 'Tabatha User'} <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 400 }}>✏️</span>
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{session.user.email}</div>
                          {installIdentity?.identity?.localId && (
                            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                              {installIdentity.identity.profileName ? `“${installIdentity.identity.profileName}” · ` : 'This install · '}
                              {installIdentity.identity.classification === 'business' && '💼 Business'}
                              {installIdentity.identity.classification === 'professional' && '👔 Professional'}
                              {installIdentity.identity.classification === 'work' && '🏗 Work'}
                              {installIdentity.identity.classification === 'personal' && '🏠 Personal'}
                              {!installIdentity.identity.supabaseId && <span style={{ color: '#ff9800' }}> · pending sync</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ marginLeft: 'auto', padding: '3px 8px', background: 'rgba(52,168,83,0.15)', color: '#34A853', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>Connected</div>
                      </div>
                      
                      {/* Sync status */}
                      <div data-search-id="sync-status" style={{ paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '8px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sync Status</div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={async () => {
                                if (syncingNow) return;
                                setSyncingNow(true);
                                setAuthError(null);
                                const backstop = setTimeout(() => setSyncingNow(false), 15000);
                                try {
                                  const res = await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
                                  if (res?.success) {
                                    const newDiag = (res.recentDiagnostics || []).filter(d => new Date(d.at).getTime() > (Date.now() - 5000));
                                    if (newDiag.length > 0) {
                                      setAuthError('Sync ran but reported: ' + newDiag[0].kind + ' — ' + newDiag[0].detail);
                                    } else if (res.lastSyncSuccess) {
                                      setAuthError('✓ Synced ' + new Date(res.lastSyncSuccess).toLocaleTimeString());
                                    } else {
                                      setAuthError('Sync ran but no success timestamp recorded. Check diagnostics.');
                                    }
                                  } else {
                                    setAuthError('Sync did not respond');
                                  }
                                } catch (err) {
                                  setAuthError('Sync now error: ' + (err.message || err));
                                } finally {
                                  clearTimeout(backstop);
                                  setSyncingNow(false);
                                }
                              }}
                              disabled={syncingNow}
                              style={{ padding: '4px 10px', background: 'var(--color-accent-primary)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', cursor: syncingNow ? 'wait' : 'pointer', fontSize: '10px', fontWeight: 600, opacity: syncingNow ? 0.7 : 1 }}
                            >
                              {syncingNow ? '⏳ Syncing…' : '↻ Sync now'}
                            </button>
                            {syncDiagnostics?.length > 0 && (
                              <button
                                onClick={async () => {
                                  try { await chrome.runtime.sendMessage({ type: 'CLEAR_SYNC_DIAGNOSTICS' }); }
                                  catch { /* ignore */ }
                                }}
                                style={{ padding: '4px 10px', background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '10px' }}
                                title="Clear diagnostic history (does not affect sync)"
                              >
                                Clear log
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                if (repulling) return;
                                if (!confirm('Re-pull the org registry from the cloud?\n\nThis will fetch every client / project / task / operation / initiative for your account and merge them into this browser profile by name (case-insensitive). Pure-local entries are unaffected.')) return;
                                setRepulling(true);
                                setAuthError(null);
                                const backstop = setTimeout(() => setRepulling(false), 30000);
                                try {
                                  const res = await chrome.runtime.sendMessage({ type: 'REPULL_ORG_REGISTRY' });
                                  if (res?.success) {
                                    const completed = (res.recentDiagnostics || []).find(d => d.kind === 'bootstrap_pull_completed');
                                    setAuthError(completed ? '✓ ' + completed.detail : '✓ Re-pull complete');
                                  } else {
                                    setAuthError('Re-pull did not respond');
                                  }
                                } catch (err) {
                                  setAuthError('Re-pull error: ' + (err.message || err));
                                } finally {
                                  clearTimeout(backstop);
                                  setRepulling(false);
                                }
                              }}
                              disabled={repulling}
                              style={{ padding: '4px 10px', background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: repulling ? 'wait' : 'pointer', fontSize: '10px', opacity: repulling ? 0.7 : 1 }}
                              title="Re-pull org registry from the cloud and merge by name. Useful after signing in on a new browser profile or machine."
                            >
                              {repulling ? '⏳ Pulling…' : '⤓ Re-pull registry'}
                            </button>
                          </div>
                        </div>
                        {lastSyncSuccess ? (
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: syncDiagnostics?.length > 0 ? '6px' : 0 }}>
                            ✓ Last successful sync: <span style={{ color: 'var(--color-text-primary)' }}>{new Date(lastSyncSuccess).toLocaleString()}</span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: '#ff9800', marginBottom: '6px' }}>⚠ No successful sync yet. Hit <strong>↻ Sync now</strong> to test.</div>
                        )}
                        {syncDiagnostics?.length > 0 && (
                          <details style={{ fontSize: '11px' }}>
                            <summary style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }}>{syncDiagnostics.length} diagnostic event{syncDiagnostics.length === 1 ? '' : 's'} (most recent first)</summary>
                            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflow: 'auto' }}>
                              {syncDiagnostics.slice(0, 10).map((d, i) => (
                                <div key={i} style={{ padding: '6px 8px', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                                  <div style={{ fontWeight: 600, color: d.kind?.includes('failed') || d.kind?.includes('no_') ? '#ff9800' : 'var(--color-text-primary)' }}>{d.kind}</div>
                                  <div style={{ color: 'var(--color-text-muted)', wordBreak: 'break-word' }}>{d.detail}</div>
                                  <div style={{ color: 'var(--color-text-muted)', fontSize: '10px', marginTop: '2px' }}>{new Date(d.at).toLocaleString()}</div>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>

                      {/* Linked identities */}
                      <div style={{ paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Linked Accounts</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {session.user.identities?.map((id) => (
                            <div key={id.identity_id} style={{ fontSize: '12px', background: 'var(--color-bg-base)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '14px' }}>{id.provider === 'google' ? '🔵' : id.provider === 'email' ? '✉️' : '🔗'}</span>
                              <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{id.provider}</span>
                              <span style={{ color: 'var(--color-text-muted)' }}>{id.identity_data?.email || id.identity_data?.name || id.id}</span>
                            </div>
                          ))}
                        </div>
                        <button onClick={async () => {
                          setAuthError(null);
                          try {
                            const { linkChromeIdentity } = await import('../services/supabaseClient');
                            await linkChromeIdentity();
                            await refreshProfile();
                            setAuthError('✓ Google account linked!');
                          } catch (err) {
                            setAuthError('Failed to link: ' + err.message);
                          }
                        }} style={{ marginTop: '8px', padding: '6px 12px', background: 'transparent', color: 'var(--color-text-primary)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '11px', width: '100%' }}>
                          + Link another Google Account
                        </button>
                      </div>
                    </div>

                    {/* ── Organizations ── */}
                    <div style={sectionLabel} data-search-id="sync-organizations">Organizations</div>
                    {orgs.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                        {orgs.map(o => (
                          <div key={o.org_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '12px' }}>
                            <span style={{ fontWeight: 600 }}>🏢 {o.org_name}</span>
                            <span style={{ padding: '2px 8px', background: 'var(--color-bg-base)', borderRadius: '10px', fontSize: '10px', textTransform: 'capitalize', color: 'var(--color-text-muted)' }}>{o.role}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>No organizations yet. Create one below, or use an invite token to join an existing one.</p>
                    )}

                    {/* ── Create Organization ── */}
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.5, marginTop: '2px', marginBottom: '8px' }}>
                      Start a new organisation to invite teammates. You'll become its owner and can mint invite tokens from the "Team Activity" panel below.
                    </p>
                    <form onSubmit={handleCreateOrg} style={{ display: 'flex', gap: '8px', marginTop: '4px', marginBottom: '16px' }}>
                      <input type="text" placeholder="New organization name..." value={newOrgName} onChange={e => setNewOrgName(e.target.value)} style={{ ...inputStyle, flex: 1 }} required />
                      <button type="submit" disabled={creatingOrg || !newOrgName.trim()} style={{ padding: '4px 12px', background: 'var(--color-accent-primary)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', cursor: creatingOrg ? 'default' : 'pointer', fontWeight: 600, fontSize: '12px', opacity: creatingOrg || !newOrgName.trim() ? 0.6 : 1 }}>
                        {creatingOrg ? '...' : 'Create'}
                      </button>
                    </form>

                    {/* ── Teams ── */}
                    <div style={sectionLabel} data-search-id="sync-teams">Teams</div>
                    {teams.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                        {teams.map(t => (
                          <div key={t.team_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '12px' }}>
                            <span style={{ fontWeight: 600 }}>👥 {t.team_name}</span>
                            <span style={{ padding: '2px 8px', background: 'var(--color-bg-base)', borderRadius: '10px', fontSize: '10px', textTransform: 'capitalize', color: 'var(--color-text-muted)' }}>{t.role}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>No teams yet.</p>
                    )}

                    {/* ── Team Activity (managers only — gated server-side) ── */}
                    <TeamActivityPanel
                      orgs={orgs}
                      teams={teams}
                      sectionLabelStyle={sectionLabel}
                      fieldRowStyle={fieldRow}
                      inputStyle={inputStyle}
                      selectStyle={selectStyle}
                      profileId={profile?.id}
                    />

                    {/* ── Invite Token ── */}
                    <div style={sectionLabel} data-search-id="sync-invite-token">Join via Invite Token</div>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.5, marginTop: '2px', marginBottom: '8px' }}>
                      Paste a token a manager shared with you to join their organisation or team. Both ends of this flow are now wired — managers can mint tokens from the "Generate Invite Token" panel above.
                    </p>
                    <form onSubmit={handleRedeemToken} style={{ display: 'flex', gap: '8px', marginTop: '4px', marginBottom: '16px' }}>
                      <input type="text" placeholder="Paste invite token..." value={inviteToken} onChange={e => setInviteToken(e.target.value)} style={{ ...inputStyle, flex: 1 }} required />
                      <button type="submit" disabled={inviteLoading} style={{ padding: '4px 12px', background: 'var(--color-accent-primary)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
                        {inviteLoading ? '...' : 'Join'}
                      </button>
                    </form>

                    {/* ── Sync Info ── */}
                    <div style={sectionLabel}>Sync Details</div>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: '16px' }}>
                      Focus items, intents, and time data sync automatically every 5 minutes.
                    </p>

                    <button
                      data-search-id="sync-signout"
                      onClick={async () => {
                        if (signingOut) return;
                        setSigningOut(true);
                        setAuthError(null);
                        // Hard backstop: if anything inside signOut hangs longer
                        // than 3s the button still recovers. Prevents the
                        // ⏳ Signing out… spinner from getting stuck.
                        const backstop = setTimeout(() => setSigningOut(false), 3000);
                        try {
                          await signOut();
                          setAuthError('✓ Signed out');
                        } catch (err) {
                          setAuthError('Sign out error: ' + (err.message || err));
                        } finally {
                          clearTimeout(backstop);
                          setSigningOut(false);
                        }
                      }}
                      disabled={signingOut}
                      style={{ ...inputStyle, width: '100%', background: signingOut ? 'var(--color-surface)' : 'var(--color-bg-base)', cursor: signingOut ? 'wait' : 'pointer', textAlign: 'center', padding: '8px', fontWeight: 500, marginBottom: '8px', opacity: signingOut ? 0.7 : 1 }}
                    >
                      {signingOut ? '⏳ Signing out…' : 'Sign Out'}
                    </button>
                    <button
                      onClick={async () => {
                        if (resettingAuth) return;
                        if (!confirm('Force-clear all auth state from this profile? Use this only if Sign Out isn\'t working or sync keeps timing out. You will be signed out and need to sign back in.')) return;
                        setResettingAuth(true);
                        setAuthError(null);
                        // Same backstop as Sign Out — forceResetAuth shouldn't
                        // hang now that its internal supabase call is timeout-raced,
                        // but defense in depth: never let the spinner stick.
                        const backstop = setTimeout(() => setResettingAuth(false), 3000);
                        try {
                          await forceResetAuth();
                          setAuthError('✓ Auth state cleared. Sign in again to restore sync.');
                        } catch (err) {
                          setAuthError('Force reset error: ' + (err.message || err));
                        } finally {
                          clearTimeout(backstop);
                          setResettingAuth(false);
                        }
                      }}
                      disabled={resettingAuth}
                      style={{ width: '100%', background: 'transparent', border: '1px dashed var(--color-border)', color: 'var(--color-text-muted)', cursor: resettingAuth ? 'wait' : 'pointer', textAlign: 'center', padding: '8px', fontSize: '11px', borderRadius: 'var(--radius-sm)', opacity: resettingAuth ? 0.7 : 1 }}
                    >
                      {resettingAuth ? '⏳ Resetting…' : '⚠ Force reset auth (use if Sign Out hangs or sync keeps timing out)'}
                    </button>
                  </div>
                ) : (
                  /* ── Login Form (not signed in) ── */
                  <div data-search-id="sync-signin" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    <button onClick={handleGoogleSignIn} disabled={authLoading} style={{ padding: '10px', background: '#fff', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      Continue with Google
                    </button>
                    
                    <div style={{ display: 'flex', alignItems: 'center', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '11px' }}>
                      <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }}></div>
                      <span style={{ padding: '0 8px' }}>or</span>
                      <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }}></div>
                    </div>

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>Email</label>
                        <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} required />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>Password</label>
                        <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} required />
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button type="submit" disabled={authLoading} style={{ flex: 1, padding: '8px', background: 'var(--color-accent-primary)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600 }}>Log In</button>
                        <button type="button" onClick={handleRegister} disabled={authLoading} style={{ flex: 1, padding: '8px', background: 'transparent', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Register</button>
                      </div>
                      
                      <button type="button" onClick={handleMagicLink} disabled={authLoading} style={{ width: '100%', padding: '8px', background: 'transparent', color: 'var(--color-text-primary)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '11px' }}>Send Magic Link to Email</button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'clock' && (
              <div data-search-id="section-clock">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>FlipClock</h2>
                <div style={sectionLabel}>Display Mode</div>
                <Tooltip text="When: Choosing what to display on the homepage. How: Toggle the clock on/off. Affects: Whether the real-time clock is visible." position="bottom">
                  <div style={fieldRow} data-search-id="clock-show-clock">
                    <span style={fieldLabel}>Show Clock</span>
                    <Toggle value={clockSettings.showClock !== false} onChange={v => updateClock('showClock', v)} />
                  </div>
                </Tooltip>
                <Tooltip text="When: Choosing what to display on the homepage. How: Toggle the countdown on/off. Affects: Whether the countdown timer is visible." position="bottom">
                  <div style={fieldRow} data-search-id="clock-show-countdown">
                    <span style={fieldLabel}>Show Countdown</span>
                    <Toggle value={!!clockSettings.showCountdown} onChange={v => updateClock('showCountdown', v)} />
                  </div>
                </Tooltip>
                <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '4px 0 16px', lineHeight: 1.5 }}>
                  Toggle both on to show clock and countdown together, or pick one. When both are off, the clock area is hidden.
                </p>
                <div style={sectionLabel}>Clock Options</div>
                <Tooltip text="When: Customizing clock display. How: Toggle 12h or 24h format. Affects: The main FlipClock component." position="bottom">
                  <div style={fieldRow} data-search-id="clock-time-format">
                    <span style={fieldLabel}>Time Format</span>
                    <select value={clockSettings.is24Hour ? '24' : '12'} onChange={e => updateClock('is24Hour', e.target.value === '24')} style={selectStyle}>
                      <option value="12">12 Hour</option>
                      <option value="24">24 Hour</option>
                    </select>
                  </div>
                </Tooltip>
                <Tooltip text="When: Customizing clock details. How: Toggle seconds visibility. Affects: Main FlipClock component." position="bottom">
                  <div style={fieldRow} data-search-id="clock-show-seconds">
                    <span style={fieldLabel}>Show Seconds</span>
                    <Toggle value={clockSettings.showClockSeconds !== false} onChange={v => updateClock('showClockSeconds', v)} />
                  </div>
                </Tooltip>
                <Tooltip text="When: Adjusting clock size. How: Drag the slider. Affects: The scale of the FlipClock in the settings preview." position="bottom">
                  <div style={fieldRow} data-search-id="clock-scale">
                    <span style={fieldLabel}>Scale</span>
                    <input type="range" min="0.3" max="1.5" step="0.1" value={clockSettings.scale || 1.0} onChange={e => updateClock('scale', parseFloat(e.target.value))} style={{ width: '120px' }} />
                  </div>
                </Tooltip>
                <Tooltip text="When: Customizing clock colors. How: Pick a color. Affects: Font color of the clock digits." position="bottom">
                  <div style={fieldRow} data-search-id="clock-text-color">
                    <span style={fieldLabel}>Text Color</span>
                    <input type="color" value={clockSettings.textColor || '#e0e0e0'} onChange={e => updateClock('textColor', e.target.value)} style={{ width: '40px', height: '24px', border: 'none', cursor: 'pointer' }} />
                  </div>
                </Tooltip>
                <div style={sectionLabel}>Countdown Options</div>
                <Tooltip text="When: Customizing countdown target. How: Choose End of Day or Custom. Affects: The target time for the countdown." position="bottom">
                  <div style={fieldRow} data-search-id="clock-countdown-mode">
                    <span style={fieldLabel}>Mode</span>
                    <select value={clockSettings.countdownMode || 'daily'} onChange={e => updateClock('countdownMode', e.target.value)} style={selectStyle}>
                      <option value="daily">End of Day</option>
                      <option value="custom">Custom Time</option>
                    </select>
                  </div>
                </Tooltip>
                {clockSettings.countdownMode === 'custom' && (
                  <div style={fieldRow}>
                    <span style={fieldLabel}>Target Time</span>
                    <input type="time" value={clockSettings.customCountdownTarget || '17:00'} onChange={e => updateClock('customCountdownTarget', e.target.value)} style={inputStyle} />
                  </div>
                )}
              </div>
            )}

            {activeSection === 'focus' && (
              <div data-search-id="section-focus">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Focus Engine</h2>
                <Tooltip text="When: Setting the default duration for a new Focus. How: Change the number of minutes. Affects: The initial countdown timer when a Focus is started." position="bottom">
                  <div style={fieldRow} data-search-id="focus-default-timer">
                    <span style={fieldLabel}>Default Timer (minutes)</span>
                    <input type="number" min="1" max="120" value={settings.focusTimerMinutes || 15} onChange={e => updateSetting('focusTimerMinutes', parseInt(e.target.value))} style={inputStyle} />
                  </div>
                </Tooltip>
                <Tooltip text="When: Tab behavior when opening a new tab. How: Toggle auto-associate. Affects: New tabs opened from an intent context are automatically assigned to that intent." position="bottom">
                  <div style={fieldRow} data-search-id="focus-auto-associate">
                    <span style={fieldLabel}>Auto-associate tabs</span>
                    <Toggle value={settings.autoAssociateTabs !== false} onChange={v => updateSetting('autoAssociateTabs', v)} />
                  </div>
                </Tooltip>
                <Tooltip text="When: Focus drifts and tab is not active. How: Toggle notification. Affects: A notification is shown when you stray from the intended tab." position="bottom">
                  <div style={fieldRow} data-search-id="focus-drift-notification">
                    <span style={fieldLabel}>Drift notification</span>
                    <Toggle value={settings.driftNotification !== false} onChange={v => updateSetting('driftNotification', v)} />
                  </div>
                </Tooltip>
                <div style={sectionLabel}>Funnel Stages</div>
                {Object.entries(FUNNEL_STAGES).map(([key, stage]) => (
                  <div key={key} style={{ ...fieldRow, padding: '4px 0' }}>
                    <span style={{ fontSize: '12px' }}>{stage.icon} {stage.label}</span>
                    <span style={{ fontSize: '10px', color: stage.color, fontWeight: 600 }}>{key}</span>
                  </div>
                ))}
              </div>
            )}

            {activeSection === 'lifecycle' && (
              <div data-search-id="section-lifecycle">
                <FocusLifecyclePanel settings={settings} updateSetting={updateSetting} />
              </div>
            )}

            {activeSection === 'intent' && (
              <div data-search-id="section-intent">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Intent-Popup (Gatekeeper)</h2>
                <Tooltip text="When: Enabling the Intent-Popup on new sites. How: Toggle the overlay. Affects: The Gatekeeper popup asking for intent." position="bottom">
                  <div style={fieldRow} data-search-id="intent-gatekeeper-enabled">
                    <span style={fieldLabel}>Enable overlay</span>
                    <Toggle value={settings.gatekeeperEnabled !== false} onChange={v => updateSetting('gatekeeperEnabled', v)} />
                  </div>
                </Tooltip>
                <Tooltip text="When: Setting a quick side quest duration. How: Change the minutes. Affects: The default duration when selecting 'Side Quest' in the Gatekeeper." position="bottom">
                  <div style={fieldRow} data-search-id="intent-side-quest">
                    <span style={fieldLabel}>Side Quest default (min)</span>
                    <input type="number" min="1" max="30" value={settings.sideQuestMinutes || 5} onChange={e => updateSetting('sideQuestMinutes', parseInt(e.target.value))} style={inputStyle} />
                  </div>
                </Tooltip>
                <Tooltip text="When: Inheriting focus from another tab. How: Change count. Affects: The number of recently used intents shown in Gatekeeper." position="bottom">
                  <div style={fieldRow} data-search-id="intent-inherit-count">
                    <span style={fieldLabel}>Inherit items shown</span>
                    <input type="number" min="0" max="10" value={settings.inheritItemCount || 3} onChange={e => updateSetting('inheritItemCount', parseInt(e.target.value))} style={inputStyle} />
                  </div>
                </Tooltip>
                <Tooltip text="When: Enforcing intent capture. How: Toggle strict mode. Affects: Whether the page is completely blurred out until an intent is chosen." position="bottom">
                  <div style={fieldRow} data-search-id="intent-strict-mode">
                    <span style={fieldLabel}>Strict mode (blocks page until intent set)</span>
                    <Toggle value={settings.inpopStrictMode !== false} onChange={v => updateSetting('inpopStrictMode', v)} />
                  </div>
                </Tooltip>
                <Tooltip text="When: Customizing Gatekeeper background. How: Slide to adjust. Affects: The blur intensity behind the Gatekeeper modal." position="bottom">
                  <div style={fieldRow} data-search-id="intent-blur-strength">
                    <span style={fieldLabel}>Background blur strength</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="range" min="0" max="30" value={settings.inpopBlurStrength ?? 10} onChange={e => updateSetting('inpopBlurStrength', parseInt(e.target.value))} style={{ flex: 1 }} />
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', minWidth: '30px', textAlign: 'right' }}>{settings.inpopBlurStrength ?? 10}px</span>
                    </div>
                  </div>
                </Tooltip>
                <div style={sectionLabel}>Intent Bar (InBar)</div>
                <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '-6px 0 8px', lineHeight: 1.5 }}>
                  The InBar appears on every page as a thin status bar. When no focus or intent is set, it shows a prompt to set one. You can collapse it to a tiny nub toggle.
                </p>
                {/* Visual Preview */}
                <div style={{ marginBottom: '12px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '9px', color: '#666', padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--color-border)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preview</div>
                  {/* Full bar preview */}
                  <div style={{ background: '#0d0d0d', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '26px', padding: '0 10px', gap: '8px', fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: '11px', color: '#ccc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '10px', fontWeight: 600, color: '#00e5ff' }}>03:42</span>
                      <span style={{ width: '1px', height: '10px', background: 'rgba(255,255,255,0.12)' }}></span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '10px', fontWeight: 600, color: '#66bb6a' }}>12:15</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center' }}>
                      <span style={{ fontSize: '7px', padding: '1px 4px', borderRadius: '3px', fontWeight: 700, background: '#00e5ff18', color: '#00e5ff', border: '1px solid #00e5ff33' }}>🎯 focus</span>
                      <span style={{ fontWeight: 500, color: '#eee', fontSize: '11px' }}>Ship Tabatha v1.0</span>
                      <span style={{ width: '1px', height: '10px', background: 'rgba(255,255,255,0.12)' }}></span>
                      <span style={{ fontSize: '10px', color: '#777' }}>📋 Deploy alpha</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '10px', fontWeight: 600, color: '#ff6b6b' }}>08:33</span>
                      <span style={{ fontSize: '11px', color: '#555', cursor: 'default' }}>📝</span>
                      <span style={{ fontSize: '11px', color: '#555', cursor: 'default' }}>▾</span>
                    </div>
                  </div>
                  {/* Nub preview */}
                  <div style={{ background: '#0a0a0a', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '9px', color: '#555' }}>Collapsed state →</span>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#00e5ff', boxShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>◉</div>
                  </div>
                </div>
                <Tooltip text="When: Seeing current intent on standard pages. How: Toggle the Intent Bar. Affects: Renders a sticky status bar across active tabs." position="bottom">
                  <div style={fieldRow} data-search-id="intent-inbar-enabled">
                    <span style={fieldLabel}>Show Intent Bar on pages</span>
                    <Toggle value={settings.inbarEnabled !== false} onChange={v => updateSetting('inbarEnabled', v)} />
                  </div>
                </Tooltip>
                <Tooltip text="When: Adjusting the Intent Bar's location. How: Select Top or Bottom. Affects: Where the Intent Bar is fixed on the screen." position="bottom">
                  <div style={fieldRow} data-search-id="intent-inbar-position">
                    <span style={fieldLabel}>Position</span>
                    <select value={settings.inbarPosition || 'bottom'} onChange={e => updateSetting('inbarPosition', e.target.value)} style={inputStyle}>
                      <option value="bottom">Bottom</option>
                      <option value="top">Top</option>
                    </select>
                  </div>
                </Tooltip>
                <div style={sectionLabel} data-search-id="intent-skipped-domains">Skipped Domains</div>
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
                <div style={sectionLabel} data-search-id="intent-presets">Persistent Presets</div>
                <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '0 0 6px' }}>Pinned intents that always appear in InPop under "Common"</p>
                {(intentPresets.persistent || []).map((p, i) => (
                  <div key={i} style={{ ...fieldRow, padding: '4px 0' }}>
                    <span style={{ fontSize: '12px' }}>📌 {p.label}</span>
                    <button onClick={() => {
                      const updated = { ...intentPresets, persistent: intentPresets.persistent.filter((_, j) => j !== i) };
                      setIntentPresets(updated);
                    }} style={{ background: 'transparent', border: '1px solid #ef5350', color: '#ef5350', borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>Remove</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <input type="text" id="new-preset" placeholder="Add persistent intent..." style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                    onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { const label = e.target.value.trim(); setIntentPresets(prev => ({ ...prev, persistent: [...(prev.persistent || []), { label, pinned: true }] })); e.target.value = ''; }}} />
                  <button onClick={() => { const el = document.getElementById('new-preset'); if (el && el.value.trim()) { const label = el.value.trim(); setIntentPresets(prev => ({ ...prev, persistent: [...(prev.persistent || []), { label, pinned: true }] })); el.value = ''; } }}
                    style={{ background: 'var(--color-accent-primary)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>Add</button>
                </div>
                <Tooltip text="When: Selecting an intent from recent history. How: Change count. Affects: Number of recent intents to show as shortcuts." position="bottom">
                  <div style={fieldRow} data-search-id="intent-recent-count">
                    <span style={fieldLabel}>Recent intents shown</span>
                    <input type="number" min="1" max="10" value={settings.recentIntentCount || 5} onChange={e => updateSetting('recentIntentCount', parseInt(e.target.value))} style={inputStyle} />
                  </div>
                </Tooltip>
              </div>
            )}

            {activeSection === 'urlrules' && (
              <div data-search-id="section-urlrules">
                <UrlRulesSection
                  urlRules={urlRules}
                  setUrlRules={setUrlRules}
                  intentChangeLog={intentChangeLog}
                  skippedDomains={skippedDomains}
                />
              </div>
            )}

            {activeSection === 'blocked' && (
              <div data-search-id="section-blocked">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Blocked Sites</h2>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                  Blocked sites show a gate requiring a 50+ character justification and timer before access. Supports wildcards like <code>*.reddit.com</code>.
                </p>
                <Tooltip text="When: Adding a new blocked domain. How: Type domain and press Block. Affects: Sites that trigger the BlockGate screen." position="bottom">
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }} data-search-id="blocked-add-site">
                    <input type="text" id="new-blocked" placeholder="e.g. reddit.com or *.tiktok.com" style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                      onKeyDown={async e => { if (e.key === 'Enter' && e.target.value.trim()) { await sendMessage('MANAGE_BLOCKED_SITES', { action: 'add', domain: e.target.value.trim() }); e.target.value = ''; setBlockedSites(prev => [...prev, e.target.value]); }}} />
                    <button onClick={async () => { const el = document.getElementById('new-blocked'); if (el && el.value.trim()) { const d = el.value.trim(); await sendMessage('MANAGE_BLOCKED_SITES', { action: 'add', domain: d }); setBlockedSites(prev => [...prev, d]); el.value = ''; } }}
                      style={{ background: '#ff6b6b', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>Block</button>
                  </div>
                </Tooltip>
                <div style={sectionLabel} data-search-id="blocked-list">Currently Blocked</div>
                {blockedSites.length === 0 ? (
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>No sites blocked yet.</p>
                ) : (
                  blockedSites.map((d, i) => (
                    <div key={i} style={{ ...fieldRow, padding: '4px 0' }}>
                      <span style={{ fontSize: '12px' }}>🚫 {d}</span>
                      <button onClick={async () => { await sendMessage('MANAGE_BLOCKED_SITES', { action: 'remove', domain: d }); setBlockedSites(prev => prev.filter((_, j) => j !== i)); }} style={{ background: 'transparent', border: '1px solid #ef5350', color: '#ef5350', borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>Unblock</button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeSection === 'time' && (
              <div data-search-id="section-time">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Time Tracking</h2>
                <div style={fieldRow} data-search-id="time-idle-threshold">
                  <span style={fieldLabel}>Idle threshold (minutes)</span>
                  <input type="number" min="1" max="60" value={settings.idleThresholdMinutes || 5} onChange={e => updateSetting('idleThresholdMinutes', parseInt(e.target.value))} style={inputStyle} />
                </div>
                <div style={fieldRow} data-search-id="time-context-timer">
                  <span style={fieldLabel}>Context timer (minutes)</span>
                  <input type="number" min="1" max="120" value={settings.globalTimerMinutes || 15} onChange={e => updateSetting('globalTimerMinutes', parseInt(e.target.value))} style={inputStyle} />
                </div>
                <div style={sectionLabel}>Data Retention</div>
                <Tooltip text="When: You want desktop activity data to auto-delete after a period. How: Set days (0 = keep forever). Affects: Companion/desktop activity entries older than this will be pruned daily." position="bottom">
                  <div style={fieldRow} data-search-id="time-retention">
                    <span style={fieldLabel}>Desktop data retention (days)</span>
                    <input type="number" min="0" max="365" value={settings.desktopRetentionDays || 90} onChange={e => updateSetting('desktopRetentionDays', parseInt(e.target.value))} style={inputStyle} />
                  </div>
                </Tooltip>
                <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '4px 0', lineHeight: 1.5 }}>
                  Desktop companion activity older than this will be automatically pruned once per day. Set to 0 to keep data indefinitely. Default: 90 days.
                </p>
              </div>
            )}

            {activeSection === 'workclock' && (
              <div data-search-id="section-workclock">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Work Clock</h2>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                  The Work Clock tracks your total working time via Clock In/Out. Available on the Dashboard and Sidebar.
                </p>
                <Tooltip text="When: You want Tabatha to auto-clock you in. How: Toggle on. Affects: Automatically clocks you in when you start browsing." position="bottom">
                  <div style={fieldRow} data-search-id="workclock-auto-clockin">
                    <span style={fieldLabel}>Auto clock-in on launch</span>
                    <Toggle value={!!settings.autoClockIn} onChange={v => updateSetting('autoClockIn', v)} />
                  </div>
                </Tooltip>
                <Tooltip text="When: You want break reminders. How: Set minutes (0 = disabled). Affects: Notification after continuous work without a break." position="bottom">
                  <div style={fieldRow} data-search-id="workclock-break-reminder">
                    <span style={fieldLabel}>Break reminder (min)</span>
                    <input type="number" min="0" max="120" value={settings.breakReminderMinutes || 0} onChange={e => updateSetting('breakReminderMinutes', parseInt(e.target.value))} style={inputStyle} />
                  </div>
                </Tooltip>
                <Tooltip text="When: You want to log completed sessions. How: Toggle on. Affects: Stores clock history in local storage for review." position="bottom">
                  <div style={fieldRow} data-search-id="workclock-history">
                    <span style={fieldLabel}>Save clock history</span>
                    <Toggle value={settings.saveClockHistory !== false} onChange={v => updateSetting('saveClockHistory', v)} />
                  </div>
                </Tooltip>
              </div>
            )}

            {activeSection === 'followthrough' && (
              <div data-search-id="section-followthrough">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Follow-through Support</h2>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                  Configure popup behavior, checkpoint progress notes, and follow-through tracking preferences.
                </p>

                <div style={sectionLabel}>Welcome Back Popup</div>
                <Tooltip text="Minimum time you must be idle before the Welcome Back popup appears. Lower = more frequent." position="bottom">
                  <div style={fieldRow} data-search-id="followthrough-welcomeback-idle">
                    <span style={fieldLabel}>Min idle time (minutes)</span>
                    <input type="number" min="1" max="60" value={settings.welcomeBackMinIdleMinutes ?? 5} onChange={e => updateSetting('welcomeBackMinIdleMinutes', parseInt(e.target.value) || 5)} style={inputStyle} />
                  </div>
                </Tooltip>
                <Tooltip text="Show the Welcome Back popup when returning from an auto-break. Disable to reduce interruptions." position="bottom">
                  <div style={fieldRow} data-search-id="followthrough-welcomeback-break">
                    <span style={fieldLabel}>Show after auto-break</span>
                    <Toggle value={settings.welcomeBackShowAfterBreak !== false} onChange={v => updateSetting('welcomeBackShowAfterBreak', v)} />
                  </div>
                </Tooltip>

                <div style={sectionLabel}>Checkpoint Progress Notes</div>
                <Tooltip text="Periodically prompt you to record what you've accomplished during a focus session." position="bottom">
                  <div style={fieldRow} data-search-id="followthrough-checkpoint-enabled">
                    <span style={fieldLabel}>Enable checkpoint prompts</span>
                    <Toggle value={settings.checkpointNotesEnabled !== false} onChange={v => updateSetting('checkpointNotesEnabled', v)} />
                  </div>
                </Tooltip>
                <Tooltip text="How often to prompt relative to your focus timer. 0.33 = every third of the timer." position="bottom">
                  <div style={fieldRow} data-search-id="followthrough-checkpoint-interval">
                    <span style={fieldLabel}>Prompt interval (fraction)</span>
                    <input type="number" min="0.1" max="0.5" step="0.05" value={settings.checkpointIntervalFraction ?? 0.33} onChange={e => updateSetting('checkpointIntervalFraction', parseFloat(e.target.value) || 0.33)} style={inputStyle} />
                  </div>
                </Tooltip>
                <Tooltip text="After this many minutes without a checkpoint, the InBar shows a staleness indicator." position="bottom">
                  <div style={fieldRow} data-search-id="followthrough-checkpoint-stale">
                    <span style={fieldLabel}>Staleness threshold (min)</span>
                    <input type="number" min="5" max="120" value={settings.checkpointStaleMinutes ?? 30} onChange={e => updateSetting('checkpointStaleMinutes', parseInt(e.target.value) || 30)} style={inputStyle} />
                  </div>
                </Tooltip>

                <div style={sectionLabel}>Integrations</div>
                <Tooltip text="Automatically post checkpoint notes as comments on linked Asana tasks. Requires Asana widget server." position="bottom">
                  <div style={fieldRow} data-search-id="followthrough-asana-cpn">
                    <span style={fieldLabel}>Auto-post CPNs to Asana</span>
                    <Toggle value={!!settings.checkpointAutoPostAsana} onChange={v => updateSetting('checkpointAutoPostAsana', v)} />
                  </div>
                </Tooltip>
              </div>
            )}

            {activeSection === 'export' && (
              <div data-search-id="section-export">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Export & Agents</h2>
                <div style={sectionLabel}>Manual Export</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }} data-search-id="export-manual">
                  <button
                    onClick={handleManualExport}
                    style={{ padding: '8px 14px', background: 'var(--color-accent-primary)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                  >
                    📥 Export markdown now
                  </button>
                  <button
                    data-search-id="export-backup"
                    onClick={handleBackupData}
                    style={{ padding: '8px 14px', background: 'transparent', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                  >
                    💾 Backup all data (JSON)
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                  <strong>Markdown</strong>: human-readable snapshot of tabs, contexts, sessions, time tracking. Same payload the auto-export alarm produces.<br />
                  <strong>Backup JSON</strong>: full <code>chrome.storage.local</code> snapshot. Use this before extension upgrades. Restore in any Tabatha page DevTools console with <code>chrome.storage.local.set(JSON.parse(...))</code>.
                </div>
                <div style={sectionLabel}>Auto Export</div>
                <div style={fieldRow} data-search-id="export-auto">
                  <span style={fieldLabel}>Auto-export</span>
                  <Toggle value={!!settings.autoExportEnabled} onChange={v => updateSetting('autoExportEnabled', v)} />
                </div>
                <div style={fieldRow} data-search-id="export-interval">
                  <span style={fieldLabel}>Export interval (min)</span>
                  <input type="number" min="5" max="1440" value={settings.autoExportIntervalMinutes || 60} onChange={e => updateSetting('autoExportIntervalMinutes', parseInt(e.target.value))} style={inputStyle} />
                </div>
                <div style={fieldRow} data-search-id="export-path">
                  <span style={fieldLabel}>Export path</span>
                  <input type="text" value={settings.exportPath || 'Tabatha'} onChange={e => updateSetting('exportPath', e.target.value)} style={inputStyle} />
                </div>
              </div>
            )}

            {activeSection === 'tags' && (
              <div data-search-id="section-tags">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Tags & Associations</h2>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                  Tags help you drill down on what each focus item relates to.
                </p>
                <div style={sectionLabel}>Preview</div>
                <TagPicker tags={{ realm: 'business', client: 'Example Co', project: 'Tabatha', task: '' }} onChange={() => {}} compact={false} />
              </div>
            )}

            {activeSection === 'parked' && (
              <div data-search-id="section-parked">
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
              <div data-search-id="section-sugarbox">
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
              <div data-search-id="section-stats">
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
                      {getIntentContext(entry) && <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>"{getIntentContext(entry)}"</div>}
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', flexShrink: 0 }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}

            {activeSection === 'privacy' && (
              <div data-search-id="section-privacy">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Privacy & Capture</h2>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>All capture features are OFF by default. Incognito tabs are never captured.</p>
                <div style={fieldRow} data-search-id="privacy-screenshot">
                  <span style={fieldLabel}>Screenshot capture</span>
                  <Toggle value={!!settings.screenshotCapture} onChange={v => updateSetting('screenshotCapture', v)} />
                </div>
                <div style={fieldRow} data-search-id="privacy-keystrokes">
                  <span style={fieldLabel}>Keystroke analytics</span>
                  <Toggle value={!!settings.keystrokeAnalytics} onChange={v => updateSetting('keystrokeAnalytics', v)} />
                </div>
                {/* Cortex Plan 040 T5 / 041 T6: capture status, recommendation dashboard, config surface */}
                <CortexPanel settings={settings} updateSetting={updateSetting} />
              </div>
            )}

            {activeSection === 'webhooks' && (
              <div data-search-id="section-webhooks">
                <WebhookSettings />
              </div>
            )}

            {activeSection === 'about' && (
              <div data-search-id="section-about">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>About Tabatha</h2>
                <div style={fieldRow} data-search-id="about-version"><span style={fieldLabel}>Version</span><span>v{chrome.runtime.getManifest?.()?.version || '?'}-α</span></div>
                <div style={fieldRow}><span style={fieldLabel}>Codename</span><span>Attention Operating System</span></div>
                <div style={fieldRow}><span style={fieldLabel}>Ecosystem</span><span>Flux Family</span></div>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '16px', lineHeight: 1.5 }}>
                  Tabatha is a context-driven tab manager that maintains intention, tracks time, and supports follow-through across browsing sessions. Part of the Flux ecosystem.
                </p>
                <AboutChangelog />
              </div>
            )}


            {activeSection === 'desktop' && (
              <div data-search-id="section-desktop">
                <DesktopActivityPanel settings={settings} updateSetting={updateSetting} />
              </div>
            )}

            {activeSection === 'integrations' && (
              <div data-search-id="section-integrations">
                <div style={sectionLabel}>🔌 External Integrations</div>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Connect Tabatha to external services for enhanced time tracking and project management.
                </p>

                {/* Asana */}
                <GlassCard style={{ padding: '16px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }} data-search-id="integrations-asana">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>📋</span>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>Asana</span>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                      background: settings.asanaWidgetEnabled ? '#66bb6a22' : '#9e9e9e22',
                      color: settings.asanaWidgetEnabled ? '#66bb6a' : '#9e9e9e',
                    }}>
                      {settings.asanaWidgetEnabled ? '✓ Enabled' : '○ Not configured'}
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                    Push time entries from Tabatha clock sessions to your Asana workspace via the Flux Asana Widget.
                    Requires the Flux Widget Server running locally.
                  </p>
                  <div style={fieldRow}>
                    <span style={fieldLabel}>Widget Server URL</span>
                    <input
                      type="text" placeholder="https://localhost:8443"
                      value={settings.asanaWidgetUrl || ''}
                      onChange={(e) => updateSetting('asanaWidgetUrl', e.target.value)}
                      style={{ ...inputStyle, width: '200px' }}
                    />
                  </div>
                  <div style={fieldRow}>
                    <span style={fieldLabel}>Enable Asana sync</span>
                    <Toggle value={!!settings.asanaWidgetEnabled} onChange={v => updateSetting('asanaWidgetEnabled', v)} />
                  </div>
                  <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '8px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
                    📘 See <strong>docs/guides/asana-integration.md</strong> for full setup instructions.
                  </p>
                </GlassCard>

                {/* Supabase */}
                <GlassCard style={{ padding: '16px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }} data-search-id="integrations-supabase">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>☁️</span>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>Cloud Sync</span>
                    </div>
                    <span
                      onClick={() => setActiveSection('sync')}
                      title="Open Sync & Account"
                      style={{
                        fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                        background: isSignedIn ? '#66bb6a22' : '#9e9e9e22',
                        color: isSignedIn ? '#66bb6a' : '#9e9e9e',
                        cursor: 'pointer',
                      }}>
                      {isSignedIn ? '✓ Connected' : '○ Not signed in'}
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '0', lineHeight: 1.5 }}>
                    Sync focuses, clock sessions, and org data to the cloud. Manage your account in the <strong>Sync & Account</strong> section.
                  </p>
                </GlassCard>

                {/* Desktop Companion */}
                <GlassCard style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }} data-search-id="integrations-companion">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>🖥️</span>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>Desktop Companion</span>
                    </div>
                    <span
                      onClick={() => setActiveSection('sync')}
                      title="Open Sync & Account"
                      style={{
                        fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                        background: companionConnected ? '#66bb6a22' : '#9e9e9e22',
                        color: companionConnected ? '#66bb6a' : '#9e9e9e',
                        cursor: 'pointer',
                      }}>
                      {companionConnected ? '✓ Connected' : '○ Not connected'}
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '0', lineHeight: 1.5 }}>
                    Tracks active desktop applications to provide cross-app activity context. Configure in the <strong>Desktop Activity</strong> section.
                  </p>
                </GlassCard>
              </div>
            )}

            {activeSection === 'developer' && (
              <div data-search-id="section-developer">
                <DeveloperPanel settings={settings} updateSetting={updateSetting} />
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

          {activeSection === 'urlrules' && (
            <div style={{ width: '100%', textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔗</div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>{urlRules.length}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>URL rules configured</div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '8px' }}>{intentChangeLog.length} intent changes logged</div>
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

const WEBHOOK_EVENTS = [
  'focus_started', 'focus_ended', 'focus_timer_expired', 'focus_resolved',
  'clock_in', 'clock_out', 'break_started', 'break_ended',
  'task_created', 'task_completed', 'context_drift', 'unfocused_nudge',
  'context_switch',
];

const INTERVAL_OPTIONS = [
  { label: 'Real-time', value: 0 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
  { label: '15 min', value: 900 },
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
];

function WebhookSettings() {
  const [config, setConfig] = useState({ enabled: false, url: '', events: [], secret: '', intervals: {} });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('tabathaWebhooks', r => {
      if (r.tabathaWebhooks) setConfig({ intervals: {}, ...r.tabathaWebhooks });
    });
  }, []);

  const save = () => {
    chrome.storage.local.set({ tabathaWebhooks: config });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleEvent = (ev) => {
    setConfig(prev => ({
      ...prev,
      events: prev.events.includes(ev) ? prev.events.filter(e => e !== ev) : [...prev.events, ev]
    }));
  };

  const setInterval = (ev, seconds) => {
    setConfig(prev => ({
      ...prev,
      intervals: { ...prev.intervals, [ev]: seconds }
    }));
  };

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>Webhook Integrations</h2>
      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
        Send real-time or scheduled event notifications to external services (Zapier, Make, custom endpoints).
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }} data-search-id="webhooks-enabled">
        <span style={{ fontSize: '13px', fontWeight: 500 }}>Enable Webhooks</span>
        <Toggle value={config.enabled} onChange={v => setConfig(prev => ({ ...prev, enabled: v }))} />
      </div>

      <div style={{ marginBottom: '10px' }} data-search-id="webhooks-url">
        <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Webhook URL</label>
        <input type="url" value={config.url} onChange={e => setConfig(prev => ({ ...prev, url: e.target.value }))}
          placeholder="https://hooks.example.com/tabatha"
          style={{ width: '100%', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', color: 'var(--color-text-primary)', fontSize: '12px', outline: 'none' }}
        />
      </div>

      <div style={{ marginBottom: '10px' }} data-search-id="webhooks-secret">
        <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Secret (optional, for signature verification)</label>
        <input type="password" value={config.secret} onChange={e => setConfig(prev => ({ ...prev, secret: e.target.value }))}
          placeholder="your-webhook-secret"
          style={{ width: '100%', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', color: 'var(--color-text-primary)', fontSize: '12px', outline: 'none' }}
        />
      </div>

      <div style={{ marginBottom: '12px' }} data-search-id="webhooks-events">
        <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>Events to send (empty = all)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {WEBHOOK_EVENTS.map(ev => (
            <button key={ev} onClick={() => toggleEvent(ev)}
              style={{
                fontSize: '9px', padding: '3px 8px', borderRadius: '12px', cursor: 'pointer',
                background: config.events.includes(ev) ? 'var(--color-accent-primary)' : 'var(--color-surface)',
                color: config.events.includes(ev) ? '#fff' : 'var(--color-text-muted)',
                border: '1px solid var(--color-border)', fontWeight: 500,
              }}
            >{ev}</button>
          ))}
        </div>
      </div>

      {/* Interval scheduling */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>Event intervals (per-event scheduling)</label>
        <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
          Set events to fire at intervals instead of real-time. Batched events are queued and sent together at the next interval tick. Default: real-time.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {(config.events.length > 0 ? config.events : WEBHOOK_EVENTS).map(ev => (
            <div key={ev} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '4px 0' }}>
              <span style={{ fontSize: '10px', color: 'var(--color-text-primary)', fontWeight: 500, minWidth: '120px' }}>{ev}</span>
              <select
                value={config.intervals?.[ev] || 0}
                onChange={e => setInterval(ev, parseInt(e.target.value))}
                style={{
                  background: 'var(--color-surface)', color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                  padding: '3px 6px', fontSize: '10px', outline: 'none', cursor: 'pointer',
                }}
              >
                {INTERVAL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <button onClick={save} style={{
        background: 'var(--color-accent-primary)', color: '#fff', border: 'none',
        borderRadius: 'var(--radius-sm)', padding: '6px 16px', fontSize: '12px',
        fontWeight: 600, cursor: 'pointer',
      }}>
        {saved ? '✓ Saved!' : 'Save Webhook Config'}
      </button>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Settings />);
