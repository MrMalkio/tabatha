// ============================================================
// Settings → Integrations → Task Sync (Asana) — Asana PAT parity
//
// Until now the "Task Sync (Asana)" connect card (paste a Personal Access
// Token, pull Asana tasks into Tabatha via subtasks/blockers, sync now)
// existed ONLY in the Tabby Sidecar (sidecar/src/screens/SettingsScreen.tsx +
// sidecar/src/data/integrations.ts, Epic 3 v1). This is the extension-side
// half of the same flow: same edge-function contracts, same message-router
// pattern as DevicesPanel.jsx (all writes route through the background's
// asanaIntegrationService — CONNECT_ASANA / DISCONNECT_ASANA / SYNC_ASANA_NOW
// / GET_ASANA_INTEGRATION — never a direct Supabase call from this page).
//
// The PAT is a credential: it lives in `patDraft` only until the user hits
// Connect, is sent once in the CONNECT_ASANA message, and the draft is
// cleared immediately after the round-trip (success OR failure) — this
// component never logs it, never persists it, and never receives it back
// from the background (GET_ASANA_INTEGRATION only ever returns the
// RLS-scoped connection *status* row: provider, workspace_gid, connected_at,
// last_synced_at, status).
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { sendMessage } from '../hooks/useChromeStorage';
import { GlassCard } from '../components/ui/GlassCard';

const inputStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-primary)',
  padding: '6px 10px',
  fontSize: '12px',
  outline: 'none',
};

function fmtDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString(); } catch { return null; }
}
function fmtTime(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return null; }
}

export default function AsanaPanel({ isSignedIn }) {
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [patDraft, setPatDraft] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    if (!isSignedIn) { setIntegration(null); setLoading(false); return; }
    setLoading(true);
    const res = await sendMessage('GET_ASANA_INTEGRATION');
    setLoading(false);
    setIntegration(res?.integration || null);
  }, [isSignedIn]);

  useEffect(() => { load(); }, [load]);

  const busy = connecting || disconnecting || syncing;

  const handleConnect = async () => {
    const pat = patDraft.trim();
    if (!pat) { setMsg({ error: true, text: 'Paste your Asana access token first.' }); return; }
    setConnecting(true);
    setMsg(null);
    const res = await sendMessage('CONNECT_ASANA', { pat });
    // Clear the draft immediately, success or failure — the PAT never lingers
    // in this component's state beyond the single round-trip.
    setPatDraft('');
    setConnecting(false);
    if (res?.ok) {
      setMsg({ error: false, text: '✓ Asana connected.' });
      await load();
    } else {
      setMsg({ error: true, text: res?.error || 'Connection failed.' });
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setMsg(null);
    const res = await sendMessage('DISCONNECT_ASANA');
    setDisconnecting(false);
    if (res?.ok) {
      setMsg({ error: false, text: '✓ Disconnected.' });
      await load();
    } else {
      setMsg({ error: true, text: res?.error || 'Could not disconnect.' });
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setMsg(null);
    const res = await sendMessage('SYNC_ASANA_NOW');
    setSyncing(false);
    if (res?.ok) {
      setMsg({ error: false, text: `✓ Synced ${res.tasksSynced ?? 0} task(s).` });
      await load();
    } else {
      setMsg({ error: true, text: res?.error || 'Sync failed.' });
    }
  };

  if (!isSignedIn) {
    return (
      <GlassCard style={{ padding: '16px', marginBottom: '12px' }} data-search-id="integrations-asana-tasksync">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '16px' }}>🔗</span>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Task Sync (Asana)</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
          Sign in (Sync &amp; Account) to connect Asana Task Sync.
        </p>
      </GlassCard>
    );
  }

  const connected = integration?.status === 'active';

  return (
    <GlassCard style={{ padding: '16px', marginBottom: '12px' }} data-search-id="integrations-asana-tasksync">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🔗</span>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Task Sync (Asana)</span>
        </div>
        <span style={{
          fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
          background: connected ? '#66bb6a22' : '#9e9e9e22',
          color: connected ? '#66bb6a' : '#9e9e9e',
        }}>
          {loading ? '…' : connected ? '✓ Connected' : '○ Not connected'}
        </span>
      </div>

      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
        Pull your Asana tasks into Tabatha — subtasks and blockers included — via a personal access token.
        {integration?.status === 'error' && ' Your last sync hit an error — reconnect below.'}
      </p>

      {connected ? (
        <>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '10px' }} data-search-id="asana-connection-status">
            Connected {fmtDate(integration.connected_at)}
            {integration.last_synced_at ? ` · last synced ${fmtTime(integration.last_synced_at)}` : ' · not yet synced'}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleSyncNow}
              disabled={busy}
              style={{ padding: '6px 14px', background: 'var(--color-accent-primary)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', cursor: busy ? 'default' : 'pointer', fontWeight: 600, fontSize: '11px', opacity: busy ? 0.6 : 1 }}
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={busy}
              style={{ padding: '6px 14px', background: 'transparent', color: '#ef5350', border: '1px solid #ef5350', borderRadius: 'var(--radius-sm)', cursor: busy ? 'default' : 'pointer', fontWeight: 600, fontSize: '11px', opacity: busy ? 0.6 : 1 }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="password"
            value={patDraft}
            onChange={(e) => setPatDraft(e.target.value)}
            placeholder="Paste your Asana personal access token"
            autoComplete="off"
            style={{ ...inputStyle, flex: 1, minWidth: '220px' }}
          />
          <button
            onClick={handleConnect}
            disabled={connecting || !patDraft.trim()}
            style={{ padding: '6px 14px', background: 'var(--color-accent-primary)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', cursor: connecting || !patDraft.trim() ? 'default' : 'pointer', fontWeight: 600, fontSize: '11px', opacity: connecting || !patDraft.trim() ? 0.5 : 1 }}
          >
            {connecting ? 'Connecting…' : 'Connect Asana'}
          </button>
        </div>
      )}

      {msg && (
        <p style={{ fontSize: '11px', margin: '8px 0 0', color: msg.error ? '#ef5350' : '#34A853' }}>
          {msg.error ? '⚠ ' : ''}{msg.text}
        </p>
      )}

      <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '8px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
        Asana → Settings → Apps → Developer apps → Personal access tokens. The token is validated
        server-side and stored in Vault — Tabatha never displays it back.
      </p>
    </GlassCard>
  );
}
