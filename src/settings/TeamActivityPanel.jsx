// ============================================================
// Team Activity Panel — Plan 028 / Phase D first slice
//
// For each org / team the user is a manager of, fetch member rosters
// plus their current browser_profile_status rows and render compact
// awareness chips (one per member install). Also exposes the "Generate
// Invite" mint flow.
//
// Read access is gated server-side by tabatha.{profiles,browser_profiles,
// browser_profile_status} RLS policies from migration 012. Mint is gated
// by SECURITY DEFINER RPC tabatha.create_invite_token. Non-managers will
// see empty rosters and disabled mint buttons.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, createInviteToken } from '../services/supabaseClient';

const CLASSIFICATION_ICON = { business: '💼', professional: '👔', work: '🏗', personal: '🏠' };
const BROWSER_ICON = { desktop_companion: '💻', mobile_ios: '📱', mobile_android: '📱', tabatha_web: '🌐' };
const ROLE_OPTIONS = ['user', 'sub_manager', 'manager', 'read_only'];

function formatRemaining(timerEndsAt) {
  if (!timerEndsAt) return null;
  const remMs = new Date(timerEndsAt).getTime() - Date.now();
  if (!Number.isFinite(remMs)) return null;
  const abs = Math.abs(remMs);
  const mins = Math.floor(abs / 60000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m`;
  return `${Math.floor(abs / 1000)}s`;
}

function StatusChip({ status }) {
  if (status.focus_state === 'active' && status.active_focus_label) {
    const rem = formatRemaining(status.focus_timer_ends_at);
    return <span>🎯 {status.active_focus_label}{rem ? ` · ${rem}` : ''}</span>;
  }
  if (status.focus_state === 'paused' && status.active_focus_label) return <span>⏸ {status.active_focus_label}</span>;
  if (status.focus_state === 'drifted' && status.active_focus_label) return <span>⚠ over on {status.active_focus_label}</span>;
  if (status.clock_state === 'on_break') return <span>☕ on break</span>;
  if (status.clock_state === 'clocked_in') return <span>🟢 clocked in</span>;
  if (status.clock_state === 'clocked_out') return <span>⚪ clocked out</span>;
  if (status.online) return <span style={{ color: 'var(--color-text-muted)' }}>idle</span>;
  return <span style={{ color: 'var(--color-text-muted)' }}>offline</span>;
}

export function TeamActivityPanel({ orgs, teams, sectionLabelStyle, fieldRowStyle, inputStyle, selectStyle, profileId }) {
  const manageableOrgs = useMemo(() => orgs.filter(o => o.role === 'owner'), [orgs]);
  const manageableTeams = useMemo(() => teams.filter(t => ['owner', 'manager', 'sub_manager'].includes(t.role)), [teams]);
  const canSeeTeamActivity = manageableOrgs.length > 0 || manageableTeams.length > 0;

  const [members, setMembers] = useState([]); // [{ profile_id, display_name, avatar_url, role, scope }]
  const [statuses, setStatuses] = useState({}); // { browser_profile_id: status }
  const [installsByProfile, setInstallsByProfile] = useState({}); // { profile_id: [browser_profile rows] }
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState(null);

  const loadTeamActivity = useCallback(async () => {
    if (!canSeeTeamActivity) return;
    setLoading(true);
    setLastError(null);
    try {
      // 1. Collect profile_ids the caller can see by virtue of org-owner / team-manager roles.
      //    We fetch the rosters then dedupe by profile_id.
      const memberMap = new Map();

      // Org-owner: all members of those orgs
      if (manageableOrgs.length > 0) {
        const { data: orgMembers, error: orgErr } = await supabase
          .schema('tabatha')
          .from('org_members')
          .select('profile_id, role, org_id')
          .in('org_id', manageableOrgs.map(o => o.org_id));
        if (orgErr) throw orgErr;
        for (const m of orgMembers || []) {
          if (m.profile_id === profileId) continue;
          const existing = memberMap.get(m.profile_id) || { profile_id: m.profile_id, scopes: [] };
          existing.scopes.push(`org:${m.role}`);
          memberMap.set(m.profile_id, existing);
        }
      }

      // Team-manager: members of those teams
      if (manageableTeams.length > 0) {
        const { data: teamMembers, error: teamErr } = await supabase
          .schema('tabatha')
          .from('team_members')
          .select('profile_id, role, team_id')
          .in('team_id', manageableTeams.map(t => t.team_id));
        if (teamErr) throw teamErr;
        for (const m of teamMembers || []) {
          if (m.profile_id === profileId) continue;
          const existing = memberMap.get(m.profile_id) || { profile_id: m.profile_id, scopes: [] };
          existing.scopes.push(`team:${m.role}`);
          memberMap.set(m.profile_id, existing);
        }
      }

      const memberIds = Array.from(memberMap.keys());
      if (memberIds.length === 0) {
        setMembers([]);
        setStatuses({});
        setInstallsByProfile({});
        return;
      }

      // 2. Hydrate profile names / avatars
      const { data: profileRows, error: profErr } = await supabase
        .schema('tabatha')
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', memberIds);
      if (profErr) throw profErr;
      const profileById = new Map((profileRows || []).map(p => [p.id, p]));

      // 3. Pull browser_profiles per member
      const { data: installRows, error: installErr } = await supabase
        .schema('tabatha')
        .from('browser_profiles')
        .select('id, profile_id, browser, profile_name, classification, last_seen_at')
        .in('profile_id', memberIds);
      if (installErr) throw installErr;
      const byProfile = {};
      for (const r of installRows || []) {
        (byProfile[r.profile_id] = byProfile[r.profile_id] || []).push(r);
      }

      // 4. Pull all status rows for those members
      const installIds = (installRows || []).map(r => r.id);
      let statusMap = {};
      if (installIds.length > 0) {
        const { data: statusRows, error: statusErr } = await supabase
          .schema('tabatha')
          .from('browser_profile_status')
          .select('*')
          .in('browser_profile_id', installIds);
        if (statusErr) throw statusErr;
        statusMap = Object.fromEntries((statusRows || []).map(s => [s.browser_profile_id, s]));
      }

      // 5. Build the rendered member list, ordered by display_name
      const merged = memberIds.map(id => {
        const meta = profileById.get(id) || {};
        const entry = memberMap.get(id);
        return {
          profile_id: id,
          display_name: meta.display_name || 'Unknown user',
          avatar_url: meta.avatar_url || null,
          scopes: entry.scopes
        };
      }).sort((a, b) => a.display_name.localeCompare(b.display_name));

      setMembers(merged);
      setStatuses(statusMap);
      setInstallsByProfile(byProfile);
    } catch (err) {
      setLastError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [canSeeTeamActivity, manageableOrgs, manageableTeams, profileId]);

  useEffect(() => { loadTeamActivity(); }, [loadTeamActivity]);

  // Realtime — when any member's status row changes, refresh this panel.
  // Filter is by table only (Supabase Realtime can't filter on a SET of
  // ids); we live with a small over-fetch since manager dashboards are
  // low-frequency surfaces.
  useEffect(() => {
    if (!canSeeTeamActivity) return undefined;
    const channel = supabase
      .channel(`team_activity_${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'tabatha', table: 'browser_profile_status' }, loadTeamActivity)
      .subscribe();
    return () => { try { channel.unsubscribe(); } catch { /* ignore */ } };
  }, [canSeeTeamActivity, loadTeamActivity, profileId]);

  // ─── Pending (unredeemed) invites ─────────────────────────
  const [pendingInvites, setPendingInvites] = useState([]);
  const [revokingId, setRevokingId] = useState(null);

  const loadPendingInvites = useCallback(async () => {
    if (!canSeeTeamActivity) { setPendingInvites([]); return; }
    try {
      const orgIds = manageableOrgs.map(o => o.org_id);
      const { data, error } = await supabase
        .schema('tabatha')
        .from('invite_tokens')
        .select('id, token, org_id, team_id, role, expires_at, used_at, created_at')
        .in('org_id', orgIds)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPendingInvites(Array.isArray(data) ? data : []);
    } catch {
      setPendingInvites([]);
    }
  }, [canSeeTeamActivity, manageableOrgs]);

  useEffect(() => { loadPendingInvites(); }, [loadPendingInvites]);

  const revokeInvite = async (id) => {
    if (!window.confirm('Revoke this invite? Anyone who has it but has not redeemed will no longer be able to join.')) return;
    setRevokingId(id);
    try {
      const { error } = await supabase.schema('tabatha').from('invite_tokens').delete().eq('id', id);
      if (error) throw error;
      await loadPendingInvites();
    } catch (err) {
      window.alert('Revoke failed: ' + (err.message || err));
    } finally {
      setRevokingId(null);
    }
  };

  // ─── Invite mint state ────────────────────────────────────
  const [mintOrgId, setMintOrgId] = useState('');
  const [mintTeamId, setMintTeamId] = useState('');
  const [mintRole, setMintRole] = useState('user');
  const [mintExpiresHours, setMintExpiresHours] = useState(168);
  const [minting, setMinting] = useState(false);
  const [mintResult, setMintResult] = useState(null);

  useEffect(() => {
    if (!mintOrgId && manageableOrgs[0]) setMintOrgId(manageableOrgs[0].org_id);
  }, [manageableOrgs, mintOrgId]);

  const mintableOrgIds = useMemo(() => {
    const ids = new Set(manageableOrgs.map(o => o.org_id));
    return ids;
  }, [manageableOrgs]);

  const handleMint = async (e) => {
    e.preventDefault();
    setMinting(true);
    setMintResult(null);
    try {
      const res = await createInviteToken({
        orgId: mintOrgId,
        teamId: mintTeamId || null,
        role: mintRole,
        expiresInHours: Math.max(1, Math.min(2160, Number(mintExpiresHours) || 168))
      });
      if (res?.success) {
        setMintResult({ ok: true, token: res.token, expires_at: res.expires_at });
        loadPendingInvites();
      } else {
        setMintResult({ ok: false, error: res?.error || 'Mint failed' });
      }
    } catch (err) {
      setMintResult({ ok: false, error: err?.message || String(err) });
    } finally {
      setMinting(false);
    }
  };

  if (!canSeeTeamActivity) {
    // Non-owner / non-manager users can't mint invites or see team rosters.
    // Rather than render nothing (which looks broken/greyed-out), show a
    // short note so the surface reads as intentional.
    return (
      <div style={{ marginTop: '8px' }}>
        <div style={sectionLabelStyle}>Team Activity</div>
        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.5, padding: '2px 8px 8px' }}>
          Invite minting and team activity are available to organisation owners and team managers.
          Ask an owner or manager to send you an invite, or redeem an invite token to join a team.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={sectionLabelStyle}>
        Team Activity
        {loading && <span style={{ marginLeft: 8, color: 'var(--color-text-muted)', fontWeight: 400 }}>· loading…</span>}
      </div>
      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.5, padding: '2px 8px 8px' }}>
        Live status of members in {manageableOrgs.length > 0 ? 'organisations you own' : ''}
        {manageableOrgs.length > 0 && manageableTeams.length > 0 ? ' / ' : ''}
        {manageableTeams.length > 0 ? 'teams you manage' : ''}. Updates in real time.
      </p>
      {lastError && (
        <div style={{ fontSize: '11px', color: '#ef5350', padding: '6px 8px', marginBottom: 8 }}>{lastError}</div>
      )}
      {members.length === 0 && !loading ? (
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', padding: '8px 8px 16px' }}>No other members yet. Mint an invite token below to add some.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          {members.map(m => {
            const installs = installsByProfile[m.profile_id] || [];
            return (
              <div key={m.profile_id} style={{ padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: installs.length ? 6 : 0 }}>
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                  ) : (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--color-accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#000' }}>
                      {(m.display_name || '?')[0]?.toUpperCase()}
                    </div>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{m.display_name}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{m.scopes.join(' · ')}</span>
                </div>
                {installs.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 30 }}>
                    {installs.map(inst => {
                      const s = statuses[inst.id];
                      const stale = s?.last_heartbeat_at && (Date.now() - new Date(s.last_heartbeat_at).getTime() > 5 * 60 * 1000);
                      const dim = !s?.online || stale;
                      return (
                        <div
                          key={inst.id}
                          title={`${inst.profile_name || 'Install'} · ${inst.classification || '?'}${stale ? ' · offline (>5m)' : ''}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 8px',
                            borderRadius: 999,
                            border: '1px solid var(--color-border)',
                            background: dim ? 'transparent' : 'var(--color-bg-base)',
                            fontSize: 11,
                            opacity: dim ? 0.6 : 1
                          }}
                        >
                          <span>{BROWSER_ICON[inst.browser] || CLASSIFICATION_ICON[inst.classification] || '🖥'}</span>
                          <span style={{ fontWeight: 500 }}>{inst.profile_name || inst.browser || 'install'}</span>
                          <span style={{ color: 'var(--color-text-muted)' }}>·</span>
                          {s ? <StatusChip status={s} /> : <span style={{ color: 'var(--color-text-muted)' }}>no status</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pending invites ──────────────────────────────── */}
      {pendingInvites.length > 0 && (
        <>
          <div style={sectionLabelStyle}>Pending Invites</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {pendingInvites.map(inv => {
              const expiry = new Date(inv.expires_at);
              const expiresSoon = expiry.getTime() - Date.now() < 24 * 3600 * 1000;
              return (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 11 }}>
                  <span style={{ fontFamily: 'monospace', userSelect: 'all', flex: 1, color: 'var(--color-text-muted)' }}>{inv.token}</span>
                  <span style={{ padding: '1px 6px', background: 'var(--color-bg-base)', borderRadius: 8, textTransform: 'capitalize', fontSize: 10, color: 'var(--color-text-muted)' }}>{inv.role}</span>
                  <span style={{ fontSize: 10, color: expiresSoon ? '#ffa726' : 'var(--color-text-muted)' }}>
                    expires {expiry.toLocaleDateString()} {expiry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    disabled={revokingId === inv.id}
                    style={{ padding: '2px 8px', background: 'transparent', color: '#ef5350', border: '1px solid #ef535044', borderRadius: 4, cursor: revokingId === inv.id ? 'wait' : 'pointer', fontSize: 10 }}
                    title="Revoke this invite — anyone who has the token can no longer redeem it"
                  >
                    {revokingId === inv.id ? '…' : 'Revoke'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Mint Invite Token ─────────────────────────────── */}
      <div style={sectionLabelStyle}>Generate Invite Token</div>
      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.5, padding: '2px 8px 8px' }}>
        Mint a one-shot token for a new member to join. They paste it into Settings → Team Invite Token on their install.
      </p>
      <form onSubmit={handleMint} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        <div style={fieldRowStyle}>
          <span style={{ fontSize: 12 }}>Organisation</span>
          <select value={mintOrgId} onChange={e => setMintOrgId(e.target.value)} style={selectStyle} required>
            {manageableOrgs.map(o => (
              <option key={o.org_id} value={o.org_id}>{o.org_name}</option>
            ))}
          </select>
        </div>
        <div style={fieldRowStyle}>
          <span style={{ fontSize: 12 }}>Team (optional)</span>
          <select value={mintTeamId} onChange={e => setMintTeamId(e.target.value)} style={selectStyle}>
            <option value="">— None —</option>
            {manageableTeams.map(t => (
              <option key={t.team_id} value={t.team_id}>{t.team_name}</option>
            ))}
          </select>
        </div>
        <div style={fieldRowStyle}>
          <span style={{ fontSize: 12 }}>Role</span>
          <select value={mintRole} onChange={e => setMintRole(e.target.value)} style={selectStyle}>
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={fieldRowStyle}>
          <span style={{ fontSize: 12 }}>Expires in (hours)</span>
          <input
            type="number"
            min={1}
            max={2160}
            value={mintExpiresHours}
            onChange={e => setMintExpiresHours(e.target.value)}
            style={inputStyle}
            required
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button
            type="submit"
            disabled={minting || !mintOrgId || !mintableOrgIds.has(mintOrgId) && !manageableTeams.find(t => t.team_id === mintTeamId)}
            style={{ padding: '6px 14px', background: 'var(--color-accent-primary)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', cursor: minting ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            {minting ? 'Generating…' : 'Generate Invite'}
          </button>
        </div>
      </form>
      {mintResult?.ok && (
        <div style={{ padding: 10, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 12, marginBottom: 8 }}>
          <div style={{ marginBottom: 6, color: '#34A853' }}>✓ Token generated</div>
          <input
            type="text"
            value={mintResult.token}
            readOnly
            onFocus={e => e.currentTarget.select()}
            style={{ ...inputStyle, width: '100%', fontFamily: 'monospace' }}
          />
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Expires {new Date(mintResult.expires_at).toLocaleString()}. Share with the new member — they paste into Settings → Team Invite Token.
          </div>
        </div>
      )}
      {mintResult && !mintResult.ok && (
        <div style={{ fontSize: 12, color: '#ef5350', padding: 6 }}>Mint failed: {mintResult.error}</div>
      )}
    </div>
  );
}
