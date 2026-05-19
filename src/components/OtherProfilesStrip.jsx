// ============================================================
// Cross-profile awareness strip — renders a compact chip for each
// other browser-profile install of this user that's recently active.
// Hidden when no other profiles exist (the common Phase A case).
// ============================================================
import React from 'react';
import { useOtherProfiles, formatRemaining } from '../hooks/useOtherProfiles';

const CLASSIFICATION_ICON = {
  business: '💼',
  professional: '👔',
  work: '🏗',
  personal: '🏠'
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

export function OtherProfilesStrip({ style = {} }) {
  const rows = useOtherProfiles();
  if (!rows.length) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '4px 0', ...style }}>
      {rows.map(row => {
        const icon = CLASSIFICATION_ICON[row.classification] || '🖥';
        const name = row.profile_name || `Install ${row.browser_profile_id?.slice(0, 6) || '—'}`;
        const dim = !row.online || row.stale;
        return (
          <div
            key={row.browser_profile_id}
            title={`${name}${row.classification ? ` · ${row.classification}` : ''}${row.stale ? ' · offline (no heartbeat in 5m)' : ''}`}
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
              opacity: dim ? 0.6 : 1
            }}
          >
            <span aria-hidden>{icon}</span>
            <span style={{ fontWeight: 600 }}>{name}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>·</span>
            <StatusLine row={row} />
          </div>
        );
      })}
    </div>
  );
}
