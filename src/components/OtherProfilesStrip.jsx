// ============================================================
// Cross-profile awareness strip — renders a compact chip for each
// other browser-profile install of this user that's recently active.
// Hidden when no other profiles exist (the common Phase A case).
// ============================================================
import React, { useState } from 'react';
import { useOtherProfiles, useOtherQueues, formatRemaining } from '../hooks/useOtherProfiles';

const CLASSIFICATION_ICON = {
  business: '💼',
  professional: '👔',
  work: '🏗',
  personal: '🏠'
};

const BROWSER_ICON = {
  desktop_companion: '💻',
  mobile_ios: '📱',
  mobile_android: '📱',
  tabatha_web: '🌐'
};

function StatusLine({ row }) {
  if (row.focus_state === 'active' && row.active_focus_label) {
    const rem = formatRemaining(row.focus_timer_ends_at);
    return <span>🎯 {row.active_focus_label}{rem ? ` · ${rem}` : ''}</span>;
  }
  if (row.focus_state === 'paused' && row.active_focus_label) {
    return <span>⏸ {row.active_focus_label}</span>;
  }
  if (row.focus_state === 'drifted' && row.active_focus_label) {
    return <span>⚠ over on {row.active_focus_label}</span>;
  }
  if (row.clock_state === 'on_break') {
    return <span>☕ on break</span>;
  }
  if (row.clock_state === 'clocked_in') {
    return <span>🟢 clocked in</span>;
  }
  if (row.clock_state === 'clocked_out') {
    return <span>⚪ clocked out</span>;
  }
  if (row.online) {
    return <span style={{ color: 'var(--color-text-muted)' }}>idle</span>;
  }
  return <span style={{ color: 'var(--color-text-muted)' }}>offline</span>;
}

// Priority pill mirroring the sidebar/home P-priority colours. Remote items
// that never carried a priority (older sync / pre-migration rows) render as a
// muted "P—" so the read-only queue is honest about what it does/doesn't know.
function PriorityPill({ priority }) {
  const has = Number.isFinite(Number(priority));
  const p = has ? Number(priority) : null;
  const color = !has ? 'var(--color-text-muted)' : p <= 3 ? '#ff6b6b' : p <= 6 ? '#ffa726' : '#66bb6a';
  const bg = !has ? 'transparent' : p <= 3 ? '#ff6b6b22' : p <= 6 ? '#ffa72622' : '#66bb6a22';
  return (
    <span
      title={has ? `Priority ${p} of 10` : 'No priority synced from this device'}
      style={{ fontSize: '9px', background: bg, color, padding: '0 4px', borderRadius: '2px', fontWeight: 600, flexShrink: 0 }}
    >
      {has ? `P${p}` : 'P—'}
    </span>
  );
}

// Read-only per-device queue list, shown when a device chip is expanded.
function DeviceQueue({ device }) {
  if (!device) {
    return <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--color-text-muted)' }}>No queued intents</div>;
  }
  const items = device.items || [];
  if (!items.length) {
    return <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--color-text-muted)' }}>No queued intents</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px 0' }}>
      {items.map(item => (
        <div
          key={item.client_id}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 10px', fontSize: '11px' }}
        >
          <PriorityPill priority={item.priority} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
          {item.focus_state === 'active' && <span aria-hidden title="active on that device">🎯</span>}
        </div>
      ))}
      {device.truncated && (
        <div style={{ padding: '2px 10px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
          +{device.count - items.length} more…
        </div>
      )}
    </div>
  );
}

export function OtherProfilesStrip({ style = {} }) {
  const rows = useOtherProfiles();
  const { byDevice } = useOtherQueues();
  const [expanded, setExpanded] = useState(null);
  if (!rows.length) return null;

  // Only show genuinely-live siblings as chips. Stale installs (no heartbeat in
  // 5m) are almost always abandoned ghosts — collapse them into a single
  // "+N offline" chip that links to Live Stints for cleanup, instead of
  // cluttering the header with day-old frozen state.
  const live = rows.filter(r => !r.stale);
  const staleCount = rows.length - live.length;
  if (!live.length && !staleCount) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '4px 0', ...style }}>
      {live.map(row => {
        const icon = BROWSER_ICON[row.browser] || CLASSIFICATION_ICON[row.classification] || '🖥';
        const name = row.profile_name || `Install ${row.browser_profile_id?.slice(0, 6) || '—'}`;
        const dim = !row.online || row.stale;
        const device = byDevice[row.browser_profile_id];
        const queueCount = device?.count || 0;
        const isOpen = expanded === row.browser_profile_id;
        return (
          <div key={row.browser_profile_id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : row.browser_profile_id)}
              aria-expanded={isOpen}
              title={`${name}${row.classification ? ` · ${row.classification}` : ''}${row.stale ? ' · offline (no heartbeat in 5m)' : ''} — click to view their queue (read-only)`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '999px',
                border: `1px solid var(--color-border)`,
                background: dim ? 'transparent' : 'var(--color-surface)',
                fontSize: '11px',
                color: dim ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                opacity: dim ? 0.6 : 1,
                cursor: 'pointer'
              }}
            >
              <span aria-hidden>{icon}</span>
              <span style={{ fontWeight: 600 }}>{name}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>·</span>
              <StatusLine row={row} />
              {queueCount > 0 && (
                <span
                  title={`${queueCount} queued intent${queueCount === 1 ? '' : 's'} on this device`}
                  style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-border)', borderRadius: '999px', padding: '0 5px' }}
                >
                  {queueCount}
                </span>
              )}
              <span aria-hidden style={{ color: 'var(--color-text-muted)' }}>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-surface)' }}>
                <DeviceQueue device={device} />
              </div>
            )}
          </div>
        );
      })}
      {staleCount > 0 && (
        <button
          onClick={() => chrome.tabs.create({ url: 'workshifts.html#live' })}
          title="Offline installs (no heartbeat in 5m) — review and clean up in Live Stints"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '999px',
            border: '1px dashed var(--color-border)', background: 'transparent',
            fontSize: '11px', color: 'var(--color-text-muted)', cursor: 'pointer', opacity: 0.8
          }}
        >
          🕘 {staleCount} offline · clean up
        </button>
      )}
    </div>
  );
}
