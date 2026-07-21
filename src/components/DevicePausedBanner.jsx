// ============================================================
// DevicePausedBanner — Feature #222 (Device Management in the Extension)
//
// Soft honor of THIS install's `paused` flag (tabatha.browser_profiles,
// migration 045). 2026-07-21 incident: Malkio paused the Sidecar device he
// was signed into and had no way to un-pause it from there because pause
// was treated as a hard gate with no in-app rescue. The lesson recorded in
// the spec: "pause is a user convenience flag, not a security boundary —
// self-rescue must always exist on every surface." So this banner NEVER
// blocks anything underneath it — it's a dismissible strip with a one-tap
// Resume, mounted at the top of home.html and sidebar.html.
//
// Data path: src/background/services/deviceService.js caches this install's
// own {paused, revokedAt} under chrome.storage.local['_selfDeviceStatus'] on
// SW startup and on every SET_DEVICE_PAUSED write that targets this device.
// This component reads that cache via useChromeStorage (instant on mount)
// and also polls GET_SELF_DEVICE_STATUS every 30s to pick up a pause set
// from ANOTHER device without needing a background realtime channel.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { useChromeStorage, sendMessage } from '../hooks/useChromeStorage';

// Storage key literal — MUST mirror deviceService.js's exported
// SELF_DEVICE_STATUS_KEY. Duplicated rather than imported so this page-context
// component doesn't pull the service worker's background bundle into
// home.html/sidebar.html — same tradeoff feedbackService.js makes by
// re-declaring its Supabase constants instead of importing supabaseClient.js.
const SELF_DEVICE_STATUS_KEY = '_selfDeviceStatus';

const POLL_MS = 30000;

export default function DevicePausedBanner({ compact = false, style = {} }) {
  const [status] = useChromeStorage(SELF_DEVICE_STATUS_KEY, null);
  const [dismissed, setDismissed] = useState(false);
  const [resuming, setResuming] = useState(false);
  const wasPausedRef = useRef(false);

  // Force a fresh read on mount (in case the cache is stale — e.g. paused
  // from another device while this SW instance was suspended) and then poll.
  useEffect(() => {
    let alive = true;
    const refresh = () => { if (alive) sendMessage('GET_SELF_DEVICE_STATUS'); };
    refresh();
    const iv = setInterval(refresh, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const paused = !!status?.paused;

  // Re-arm the dismiss state on a rising edge (false→true) so a fresh pause
  // — even one dismissed previously — is surfaced again.
  useEffect(() => {
    if (paused && !wasPausedRef.current) setDismissed(false);
    wasPausedRef.current = paused;
  }, [paused]);

  if (!paused || dismissed) return null;

  const resume = async () => {
    if (!status?.browserProfileId) return;
    setResuming(true);
    const res = await sendMessage('SET_DEVICE_PAUSED', { browser_profile_id: status.browserProfileId, paused: false });
    setResuming(false);
    if (!res?.error) setDismissed(true);
  };

  return (
    <div
      data-search-id="devices-paused-banner"
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        padding: compact ? '5px 8px' : '8px 12px',
        marginBottom: compact ? '5px' : '8px',
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(255,167,38,0.12)', border: '1px solid #ffa72633', color: '#ffa726',
        fontSize: compact ? '10px' : '12px', fontWeight: 500,
        ...style,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        ⏸ This device is paused — from Settings → Devices, on this or another device. Nothing is blocked; this is just a reminder.
      </span>
      <button
        onClick={resume}
        disabled={resuming}
        style={{
          background: '#ffa726', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)',
          padding: compact ? '2px 8px' : '4px 12px', fontSize: compact ? '10px' : '11px', fontWeight: 700,
          cursor: resuming ? 'default' : 'pointer', flexShrink: 0,
        }}
      >
        {resuming ? '…' : '▶ Resume'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        title="Dismiss"
        style={{ background: 'transparent', border: 'none', color: '#ffa726', cursor: 'pointer', fontSize: compact ? '11px' : '13px', padding: '0 2px', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}
