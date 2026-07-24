// ============================================================
// Settings → Devices — Feature #222 (Device Management in the Extension)
//
// 2026-07-21 incident: Malkio paused the Sidecar device he was signed into.
// The extension — the primary surface — had no device UI at all, so while
// trying to recover from the phone he paused his other devices too and had
// to sign out of everything to get back in. This panel is the extension-side
// half of the fix, parity with the Sidecar's DevicesCard.tsx: list, rename,
// pause/resume, device-kind, and remote sign-out for every browser_profiles
// row under this profile. All writes route through the background's
// deviceService (LIST_DEVICES / RENAME_DEVICE / SET_DEVICE_PAUSED /
// SET_DEVICE_KIND / SIGNOUT_DEVICE) — same message-router pattern as the
// Live Stints panel (Work Shifts → awarenessService), not a direct Supabase
// call from this page.
//
// Pause honor for THIS install is intentionally soft everywhere (see
// src/components/DevicePausedBanner.jsx) — pausing/resuming yourself from
// this very panel is allowed and expected; it's exactly the self-rescue path
// the incident needed and didn't have.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { sendMessage } from '../hooks/useChromeStorage';
import { useInstallIdentity } from '../hooks/useInstallIdentity';
import {
  DEVICE_KINDS,
  deriveName,
  deviceKindOf,
  relTime,
  surfaceLabel,
  visibleDeviceRows,
} from '../utils/deviceGrouping';

const sectionLabel = { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '10px', marginTop: '16px' };
const inputStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', padding: '4px 8px', fontSize: '12px', outline: 'none' };
const toggleStyle = (on) => ({ width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: on ? '#ffa726' : 'var(--color-border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 });
const toggleDot = (on) => ({ position: 'absolute', top: '2px', left: on ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' });

function Toggle({ value, onChange, disabled }) {
  return (
    <button onClick={() => !disabled && onChange(!value)} disabled={disabled} style={{ ...toggleStyle(value), opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}>
      <span style={toggleDot(value)} />
    </button>
  );
}

function DeviceRow({ row, isThisDevice, onRename, onTogglePause, onSetKind, onSignOut, busy }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const label = deriveName(row);
  const kind = deviceKindOf(row);

  const startRename = () => {
    setDraft(row.display_name || row.profile_name || surfaceLabel(row));
    setEditing(true);
  };
  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (name) onRename(row.id, name);
  };

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
              style={{ ...inputStyle, width: '220px', fontWeight: 700 }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                onClick={startRename}
                title="Click to rename"
                style={{ fontSize: '13px', fontWeight: 700, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {label}
              </span>
              {isThisDevice && (
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>This device</span>
              )}
              <button onClick={startRename} title="Rename" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', opacity: 0.7, padding: 0 }}>✏️</button>
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {surfaceLabel(row)} · last seen {relTime(row.last_seen_at)}
            {row.paused ? ' · paused' : ''}
          </div>
        </div>
        <Toggle value={!!row.paused} onChange={(v) => onTogglePause(row, v)} disabled={busy} />
      </div>

      {/* Fix Wave 3, item 5b parity — device_settings.kind picker */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '5px' }}>
        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginRight: '2px' }}>Type</span>
        {DEVICE_KINDS.map((k) => {
          const on = kind === k.value;
          return (
            <button
              key={k.value}
              disabled={busy}
              onClick={() => onSetKind(row, k.value)}
              style={{
                border: `1px solid ${on ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                background: on ? 'var(--color-accent-primary)22' : 'transparent',
                color: on ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                borderRadius: 'var(--radius-sm)', padding: '3px 8px', fontSize: '11px', fontWeight: on ? 700 : 500, cursor: busy ? 'default' : 'pointer',
              }}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => (isThisDevice || row.revoked_at || busy ? null : onSignOut(row))}
          disabled={isThisDevice || !!row.revoked_at || busy}
          style={{
            border: `1px solid ${isThisDevice || row.revoked_at ? 'var(--color-border)' : '#ef5350'}`,
            color: isThisDevice || row.revoked_at ? 'var(--color-text-muted)' : '#ef5350',
            background: 'transparent', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: '11px', fontWeight: 700,
            cursor: isThisDevice || row.revoked_at ? 'default' : 'pointer',
          }}
        >
          {row.revoked_at ? 'Signed out ✓' : isThisDevice ? 'This device' : busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

// 6.7.52 — mint a pairing code from the extension (parity with the Sidecar's
// PairWatchCard / TV "Sign in with a code" flow; until now minting was
// Sidecar-only, which is why the Devices panel had no "generate a code").
const PAIR_KINDS = [
  { key: 'tv', label: 'TV', mintLabel: 'TV' },
  { key: 'watch', label: 'Watch', mintLabel: 'Galaxy Watch' },
  { key: 'other', label: 'Other', mintLabel: 'Other device' },
];

function PairDeviceCard() {
  const [kind, setKind] = useState('tv');
  const [customName, setCustomName] = useState('');
  const [code, setCode] = useState(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!code || left <= 0) return undefined;
    const iv = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) { setCode(null); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [code, left > 0]);

  const mint = async () => {
    setBusy(true);
    setErr(null);
    const chipDefault = PAIR_KINDS.find((k) => k.key === kind)?.mintLabel || 'Other device';
    const res = await sendMessage('MINT_DEVICE_CODE', { device_label: customName.trim() || chipDefault });
    setBusy(false);
    if (!res?.code) { setErr(res?.error || 'Pairing service unavailable'); return; }
    setCode(res.code);
    setLeft(res.expiresInSeconds || 300);
  };

  return (
    <div data-search-id="devices-pair" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: '16px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>➕ Pair a new device</div>
      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
        Generate a one-time code, then on the new device (phone, TV, watch, or
        anything else running the Sidecar) open the Sidecar and choose
        “Sign in with a code.”
      </p>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        {PAIR_KINDS.map((k) => {
          const on = kind === k.key;
          return (
            <button
              key={k.key}
              disabled={busy}
              onClick={() => setKind(k.key)}
              style={{
                border: `1px solid ${on ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                background: on ? 'var(--color-accent-primary)22' : 'transparent',
                color: on ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                borderRadius: 'var(--radius-sm)', padding: '3px 10px', fontSize: '11px', fontWeight: on ? 700 : 500, cursor: 'pointer',
              }}
            >
              {k.label}
            </button>
          );
        })}
        <input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Name it (optional) — e.g. Living-room TV"
          style={{ ...inputStyle, flex: 1, minWidth: '160px' }}
        />
      </div>
      {code ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '0.35em', color: 'var(--color-accent-primary)', fontFamily: 'monospace' }}>{code}</span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
            expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </span>
        </div>
      ) : (
        <button
          onClick={mint}
          disabled={busy}
          style={{
            border: '1px solid var(--color-accent-primary)', color: 'var(--color-accent-primary)', background: 'transparent',
            borderRadius: 'var(--radius-sm)', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Generating…' : 'Generate code'}
        </button>
      )}
      {err && <p style={{ fontSize: '11px', color: '#ef5350', margin: '8px 0 0' }}>⚠ {err}</p>}
    </div>
  );
}

export default function DevicesPanel({ isSignedIn }) {
  const { identity } = useInstallIdentity();
  const [rows, setRows] = useState([]);
  const [rawCount, setRawCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isSignedIn) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const res = await sendMessage('LIST_DEVICES');
    setLoading(false);
    if (res?.error) { setError(res.error); return; }
    setError(null);
    setRows(res?.devices || []);
    setRawCount(res?.rawCount ?? (res?.devices || []).length);
  }, [isSignedIn]);

  useEffect(() => { load(); }, [load]);

  const selfId = identity?.supabaseId || null;
  const { visible, hiddenCount } = visibleDeviceRows(rows, selfId, { showAll });

  const withBusy = async (id, fn) => {
    setBusyId(id);
    setError(null);
    const res = await fn();
    setBusyId(null);
    if (res?.error) { setError(res.error); return; }
    await load();
  };

  const handleRename = (id, display_name) => withBusy(id, () => sendMessage('RENAME_DEVICE', { browser_profile_id: id, display_name }));
  const handleTogglePause = (row, paused) => withBusy(row.id, () => sendMessage('SET_DEVICE_PAUSED', { browser_profile_id: row.id, paused }));
  const handleSetKind = (row, kind) => withBusy(row.id, () => sendMessage('SET_DEVICE_KIND', { browser_profile_id: row.id, kind }));
  const handleSignOut = (row) => withBusy(row.id, () => sendMessage('SIGNOUT_DEVICE', { browser_profile_id: row.id }));

  if (!isSignedIn) {
    return (
      <div data-search-id="devices-signin">
        <div style={sectionLabel}>📟 Devices</div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          Sign in (Sync & Account) to manage the devices on this account.
        </p>
      </div>
    );
  }

  return (
    <div data-search-id="devices-panel">
      <div style={sectionLabel}>📟 Devices</div>
      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
        Every device signed into this account — extension installs and paired Sidecar screens. Rename, pause, or sign one out remotely.
      </p>
      <p style={{ fontSize: '11px', color: '#ffa726', marginBottom: '12px', lineHeight: 1.5 }}>
        Pause is a reminder, not a lock — a paused device can always resume itself from a dismissible banner. Sign out is the only remote action that actually ends a session.
      </p>

      <PairDeviceCard />

      {loading && <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Loading…</p>}
      {error && <p style={{ fontSize: '11px', color: '#ef5350' }}>⚠ {error}</p>}
      {!loading && rows.length === 0 && !error && (
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No devices registered yet.</p>
      )}

      <div data-search-id="devices-list">
        {visible.map((row) => (
          <DeviceRow
            key={row.id}
            row={row}
            isThisDevice={row.id === selfId}
            busy={busyId === row.id}
            onRename={handleRename}
            onTogglePause={handleTogglePause}
            onSetKind={handleSetKind}
            onSignOut={handleSignOut}
          />
        ))}
      </div>

      {hiddenCount > 0 && (
        <div style={{ textAlign: 'center', marginTop: '10px' }} data-search-id="devices-show-all">
          <button
            onClick={() => setShowAll((v) => !v)}
            style={{ background: 'transparent', border: 'none', color: 'var(--color-accent-primary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: '6px 14px' }}
          >
            {showAll ? 'Show fewer' : `Show all (${rawCount})`}
          </button>
        </div>
      )}
    </div>
  );
}
