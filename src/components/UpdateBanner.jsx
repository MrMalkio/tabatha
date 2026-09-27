/* global chrome */
// ============================================================
// UpdateBanner — 6.7.88 "New version available"
//
// Inline strip at the top of Home, Sidebar and Settings. Never an overlay:
// it sits in normal flow, so it can't cover or block anything.
//   ready     → "Tabatha {v} is ready."  [Update now]
//   published → "Tabatha {v} is out."    [Get it now]
// Both buttons send APPLY_UPDATE (src/background/services/updateService.js)
// and show the outcome inline. "Later" snoozes that version for 1 hour.
// State comes from chrome.storage.local['updateStatus'] (written by the
// background), so the banner updates live as checks land.
// ============================================================
import { useEffect, useState } from 'react';
import { useChromeStorage, sendMessage } from '../hooks/useChromeStorage';
import {
  UPDATE_STATUS_KEY,
  UPDATE_SNOOZE_KEY,
  decideUpdateBanner,
  describeUpdateResult,
  makeSnooze
} from '../utils/updateDecision.js';

const TICK_MS = 60 * 1000;

function runningVersion() {
  try { return chrome.runtime.getManifest().version; } catch { return null; }
}

export default function UpdateBanner({ compact = false, style = {} }) {
  const [status] = useChromeStorage(UPDATE_STATUS_KEY, null);
  const [snooze, setSnooze] = useChromeStorage(UPDATE_SNOOZE_KEY, null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Re-evaluate periodically so an expired "Later" brings the banner back.
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(iv);
  }, []);

  const banner = decideUpdateBanner({ status, currentVersion: runningVersion(), snooze, now });
  if (!banner) return null;

  const apply = async () => {
    setBusy(true);
    setNote(banner.kind === 'ready' ? 'Updating now…' : 'Asking Chrome for it…');
    const res = await sendMessage('APPLY_UPDATE');
    setBusy(false);
    if (res?.ok && res.action === 'reloading') {
      setNote('Updating now…');
      return;
    }
    if (res?.error && !res.reason) {
      setNote(describeUpdateResult({ reason: 'error', error: res.error }));
      return;
    }
    setNote(describeUpdateResult({ ...res, version: res?.version || banner.version }));
  };

  const later = () => {
    setSnooze(makeSnooze(banner.version));
    setNote('');
  };

  const accent = 'var(--color-accent-primary, #6c8cff)';

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        padding: compact ? '5px 8px' : '8px 12px',
        marginBottom: compact ? '5px' : '8px',
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(108,140,255,0.10)', border: '1px solid rgba(108,140,255,0.30)',
        color: 'var(--color-text-primary)',
        fontSize: compact ? '10px' : '12px', fontWeight: 500,
        ...style,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        ⬆ {banner.text}
        {note && (
          <span style={{ display: 'block', marginTop: '2px', color: 'var(--color-text-muted)', fontWeight: 400 }}>{note}</span>
        )}
      </span>
      <button
        onClick={apply}
        disabled={busy}
        style={{
          background: accent, color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
          padding: compact ? '2px 8px' : '4px 12px', fontSize: compact ? '10px' : '11px', fontWeight: 700,
          cursor: busy ? 'default' : 'pointer', flexShrink: 0, opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? '…' : banner.action}
      </button>
      <button
        onClick={later}
        title="Hide for an hour"
        style={{
          background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer',
          fontSize: compact ? '10px' : '11px', padding: '0 2px', flexShrink: 0,
        }}
      >
        Later
      </button>
    </div>
  );
}
