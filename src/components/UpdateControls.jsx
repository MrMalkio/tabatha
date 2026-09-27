/* global chrome */
// ============================================================
// UpdateControls — 6.7.88 Settings update actions
//
// Replaces the lone "Reload extension" button, which only restarted the
// running build and never fetched a new one.
//   • Check for updates  → CHECK_FOR_UPDATE (asks Chrome / reads the channel)
//   • Update and reload  → APPLY_UPDATE (reloads into a downloaded build, or
//                          asks Chrome for it and explains what happened)
// Shows the running version and the install channel (Workspace / Chrome Web
// Store / Staff). A plain reload stays available as a small secondary link.
// ============================================================
import { useEffect, useState } from 'react';
import { useChromeStorage, sendMessage } from '../hooks/useChromeStorage';
import {
  UPDATE_STATUS_KEY,
  channelForInstallType,
  describeUpdateResult
} from '../utils/updateDecision.js';

function runningVersion() {
  try { return chrome.runtime.getManifest().version; } catch { return null; }
}

export default function UpdateControls({ compact = false, showReload = true }) {
  const [status] = useChromeStorage(UPDATE_STATUS_KEY, null);
  const [installType, setInstallType] = useState(null);
  const [busy, setBusy] = useState(null); // 'check' | 'apply' | null
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true;
    try {
      chrome.management?.getSelf?.().then((self) => { if (alive) setInstallType(self?.installType || null); }).catch(() => {});
    } catch { /* ignore */ }
    return () => { alive = false; };
  }, []);

  const type = installType || status?.installType || null;
  const channel = channelForInstallType(type);

  const check = async () => {
    setBusy('check');
    setNote('Checking…');
    const res = await sendMessage('CHECK_FOR_UPDATE');
    setBusy(null);
    if (!res?.ok) {
      setNote(describeUpdateResult({ reason: 'error', error: res?.error }));
      return;
    }
    const s = res.status || {};
    setNote(describeUpdateResult({
      reason: s.lastResult,
      version: s.readyVersion || s.diskVersion || s.publishedVersion,
      installType: s.installType,
    }));
  };

  const apply = async () => {
    setBusy('apply');
    setNote('Updating…');
    const res = await sendMessage('APPLY_UPDATE');
    setBusy(null);
    if (res?.error && !res.reason) {
      setNote(describeUpdateResult({ reason: 'error', error: res.error }));
      return;
    }
    setNote(describeUpdateResult(res || {}));
  };

  const btn = (primary) => ({
    padding: compact ? '3px 6px' : '5px 10px',
    background: primary ? 'var(--color-accent-primary)' : 'transparent',
    color: primary ? '#fff' : 'var(--color-text-primary)',
    border: primary ? 'none' : '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: compact ? '10px' : '11px', fontWeight: 600,
    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
    flex: compact ? 1 : undefined, whiteSpace: 'nowrap',
  });

  return (
    <div style={{ marginTop: compact ? '6px' : '8px' }}>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        <button onClick={check} disabled={!!busy} style={btn(false)} title="Ask for the newest published version">
          {busy === 'check' ? '⏳' : 'Check for updates'}
        </button>
        <button onClick={apply} disabled={!!busy} style={btn(true)} title="Download the newest version if needed, then reload into it">
          {busy === 'apply' ? '⏳' : 'Update and reload'}
        </button>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
        v{runningVersion() || '?'} · {channel.label}
        {showReload && (
          <>
            {' · '}
            <button
              onClick={() => chrome.runtime.reload()}
              title="Restart the running version (does not download updates)"
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-muted)', textDecoration: 'underline', cursor: 'pointer', fontSize: '10px' }}
            >
              reload
            </button>
          </>
        )}
      </div>
      {note && (
        <div style={{ fontSize: '10px', color: 'var(--color-text-primary)', marginTop: '3px', lineHeight: 1.4 }}>{note}</div>
      )}
    </div>
  );
}
