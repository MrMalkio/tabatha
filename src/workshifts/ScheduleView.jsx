// ════════════════════════════════════════════
// ScheduleView — NB-01 (Work Schedule) + NB-02 (Work Profiles + Required
// Hours). Replaces the old self-only, local-only stub with three modes:
//
//   SELF     — every member: view own slots/requirements/shortfalls.
//              dedicated_hours: schedule is OA-set; propose changes via
//              schedule_change_requests. self_managed: no fixed schedule,
//              but required-hours floors + accounting still apply —
//              shift/make-up requests and shortfall resolution live here.
//   MANAGE   — manager scope (useOrgRole/orgPermissions, NB-03): pick a
//              visible member; set slots, work profile type, requirements.
//   REQUESTS — manager scope: approval inbox for pending change requests.
//
// The legacy chrome.storage `workSchedule` key is kept as an OFFLINE CACHE
// (and remains the editor when signed out); the server is the source of
// truth when signed in. Server writes go through migration 027's RLS'd
// tables + SECURITY DEFINER RPCs via src/services/scheduleApi.js.
// ════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { useChromeStorage } from '../hooks/useChromeStorage';
import { useAuth } from '../hooks/useAuth';
import { useOrgRole } from '../hooks/useOrgRole';
import {
  WEEKDAY_LABELS,
  minuteToHHMM,
  slotsToLocalSchedule,
  localScheduleToSlots,
  weeklyScheduledMinutes,
  fmtMinutes,
} from '../utils/scheduleModel';
import {
  getScheduleSlots,
  getWorkRequirements,
  getMembership,
  getOrgRoster,
  getProfileNames,
  listMyChangeRequests,
  listPendingChangeRequests,
  listShortfalls,
  setMemberSchedule,
  setWorkRequirements,
  setMemberWorkProfile,
  submitChangeRequest,
  decideChangeRequest,
  resolveShortfall,
} from '../services/scheduleApi';

const CADENCE_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const RESOLUTION_LABELS = { unresolved: '⚠ unresolved', made_up: '✓ made up', shifted: '→ shifted', excused: '✓ excused' };

const btn = {
  background: 'var(--color-surface)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  padding: '3px 10px', fontSize: '10px', fontWeight: 600, cursor: 'pointer',
};
const btnPrimary = { ...btn, background: 'var(--color-accent-primary)', color: '#000', border: 'none' };
const inputStyle = {
  background: 'var(--color-bg-base)', border: '1px solid var(--color-border)',
  borderRadius: '3px', color: 'var(--color-text-primary)', padding: '2px 6px', fontSize: '11px',
};
const mutedText = { fontSize: '10px', color: 'var(--color-text-muted)' };
const sectionTitle = { margin: '0 0 8px', fontSize: '12px', fontWeight: 700 };

function TypeBadge({ type }) {
  const dedicated = type === 'dedicated_hours';
  return (
    <span style={{
      fontSize: '9px', padding: '2px 8px', borderRadius: '10px', fontWeight: 700,
      background: dedicated ? '#42a5f522' : '#66bb6a22',
      color: dedicated ? '#42a5f5' : '#66bb6a',
    }}>
      {dedicated ? '🕐 Dedicated hours' : '🧭 Self-managed'}
    </span>
  );
}

// ── Weekly grid editor over the legacy {Monday:{start,end,enabled}} draft ──
function WeekEditor({ draft, onChange, readOnly = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {WEEKDAY_LABELS.map(day => {
        const entry = draft[day];
        return (
          <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
            <button
              disabled={readOnly}
              onClick={() => onChange({ ...draft, [day]: entry ? { ...entry, enabled: !entry.enabled } : { start: '09:00', end: '17:00', enabled: true } })}
              style={{ background: 'transparent', border: 'none', fontSize: '13px', cursor: readOnly ? 'default' : 'pointer', padding: 0, opacity: readOnly ? 0.6 : 1 }}
            >
              {entry?.enabled ? '✅' : '⬜'}
            </button>
            <span style={{ width: '86px', fontSize: '11px', fontWeight: 600 }}>{day}</span>
            {entry?.enabled ? (
              readOnly ? (
                <span style={{ fontSize: '11px' }}>{entry.start} → {entry.end}</span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="time" value={entry.start} onChange={e => onChange({ ...draft, [day]: { ...entry, start: e.target.value } })} style={inputStyle} />
                  <span style={mutedText}>→</span>
                  <input type="time" value={entry.end} onChange={e => onChange({ ...draft, [day]: { ...entry, end: e.target.value } })} style={inputStyle} />
                </div>
              )
            ) : (
              <span style={{ ...mutedText, fontStyle: 'italic' }}>Off</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Required-hours floors editor (MANAGE) ──
function RequirementsEditor({ requirements, onSave, saving }) {
  // Hours as strings so partial input doesn't fight the user. Lazy-initialized
  // from the loaded requirements; the parent remounts this editor (via key=)
  // when the selected member changes, so no prop→state syncing effect is needed.
  const [draft, setDraft] = useState(() => {
    const next = { daily: '', weekly: '', monthly: '' };
    for (const r of requirements || []) {
      if (next[r.cadence] !== undefined) next[r.cadence] = String(Math.round((r.min_minutes / 60) * 100) / 100);
    }
    return next;
  });

  const save = () => {
    const entries = ['daily', 'weekly', 'monthly'].map(cadence => {
      const raw = String(draft[cadence]).trim();
      if (raw === '') return { cadence, min_minutes: null };
      const hours = Number(raw);
      if (!Number.isFinite(hours) || hours < 0) return { cadence, min_minutes: null };
      return { cadence, min_minutes: Math.round(hours * 60) };
    });
    onSave(entries);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {['daily', 'weekly', 'monthly'].map(cadence => (
          <label key={cadence} style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {CADENCE_LABELS[cadence]} minimum (hours)
            <input
              type="number" min="0" step="0.25" placeholder="none"
              value={draft[cadence]}
              onChange={e => setDraft(d => ({ ...d, [cadence]: e.target.value }))}
              style={{ ...inputStyle, width: '90px' }}
            />
          </label>
        ))}
        <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save floors'}</button>
      </div>
      <div style={{ ...mutedText, marginTop: '6px' }}>
        Floors are independent (anti-back-loading): a met weekly minimum does not excuse missed daily minimums. Blank = no floor at that cadence.
      </div>
    </div>
  );
}

// ── Shortfall list with accounting actions (SELF) or read-only (MANAGE) ──
function ShortfallList({ shortfalls, canAct, onAccount, onExcuse }) {
  const [excusing, setExcusing] = useState(null); // ledger id
  const [reason, setReason] = useState('');

  if (!shortfalls?.length) return <div style={mutedText}>No shortfalls on record. 🎉</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {shortfalls.map(s => (
        <div key={s.id} style={{ padding: '8px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: `1px solid ${s.resolution === 'unresolved' ? '#ffa72655' : 'var(--color-border)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>
              {CADENCE_LABELS[s.cadence]} floor · {s.period_start} · missing {fmtMinutes(s.missing_minutes)}
            </span>
            <span style={{ fontSize: '10px', color: s.resolution === 'unresolved' ? '#ffa726' : 'var(--color-text-muted)', fontWeight: 600 }}>
              {RESOLUTION_LABELS[s.resolution] || s.resolution}
            </span>
          </div>
          {s.reason && <div style={{ ...mutedText, marginTop: '3px' }}>Reason: {s.reason}</div>}
          {canAct && s.resolution === 'unresolved' && (
            excusing === s.id ? (
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <input
                  type="text" autoFocus placeholder="Why couldn't this time be worked?"
                  value={reason} onChange={e => setReason(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button style={btnPrimary} disabled={!reason.trim()} onClick={() => { onExcuse(s, reason.trim()); setExcusing(null); setReason(''); }}>Log reason</button>
                <button style={btn} onClick={() => { setExcusing(null); setReason(''); }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                <button style={btn} onClick={() => onAccount(s, 'make_up')}>🔁 Make up</button>
                <button style={btn} onClick={() => onAccount(s, 'shift_hours')}>➡ Shift hours</button>
                <button style={btn} onClick={() => { setExcusing(s.id); setReason(''); }}>📝 Log reason</button>
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}

// ── Shift / make-up request mini-form ──
function AccountingForm({ kind, shortfall, onSubmit, onCancel, busy }) {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(shortfall?.period_start || today);
  const [toDate, setToDate] = useState(today);
  const [minutes, setMinutes] = useState(shortfall ? String(shortfall.missing_minutes) : '60');
  const [reason, setReason] = useState('');
  const isShift = kind === 'shift_hours';

  return (
    <GlassCard style={{ padding: '14px', border: '1px solid var(--color-accent-primary)' }}>
      <h4 style={{ ...sectionTitle, marginBottom: '10px' }}>{isShift ? '➡ Shift expected hours' : '🔁 Log make-up plan'}</h4>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {isShift && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
            From day
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inputStyle} />
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
          {isShift ? 'To day' : 'Make-up day'}
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
          Minutes
          <input type="number" min="1" value={minutes} onChange={e => setMinutes(e.target.value)} style={{ ...inputStyle, width: '80px' }} />
        </label>
      </div>
      <input
        type="text" placeholder="Reason / context (recorded with the request)"
        value={reason} onChange={e => setReason(e.target.value)}
        style={{ ...inputStyle, width: '100%', marginTop: '8px', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
        <button
          style={btnPrimary} disabled={busy || !(Number(minutes) > 0)}
          onClick={() => onSubmit({
            kind,
            payload: isShift
              ? { from_date: fromDate, to_date: toDate, minutes: Number(minutes), ...(shortfall ? { shortfall_ledger_id: shortfall.id } : {}) }
              : { date: toDate, minutes: Number(minutes), ...(shortfall ? { shortfall_ledger_id: shortfall.id } : {}) },
            reason: reason.trim() || null,
          })}
        >
          {busy ? 'Submitting…' : 'Submit for approval'}
        </button>
        <button style={btn} onClick={onCancel}>Cancel</button>
      </div>
    </GlassCard>
  );
}

function summarizeRequest(req) {
  if (req.kind === 'slot_change') {
    const slots = Array.isArray(req.payload?.slots) ? req.payload.slots : [];
    return `New weekly schedule · ${slots.length} slot(s) · ${fmtMinutes(weeklyScheduledMinutes(slots))}/wk`;
  }
  if (req.kind === 'shift_hours') {
    return `Shift ${fmtMinutes(req.payload?.minutes || 0)} from ${req.payload?.from_date || '?'} to ${req.payload?.to_date || '?'}`;
  }
  if (req.kind === 'make_up') {
    return `Make up ${fmtMinutes(req.payload?.minutes || 0)} on ${req.payload?.date || '?'}`;
  }
  return req.kind;
}

// ════════════════════════════════════════════
// SELF mode
// ════════════════════════════════════════════
function SelfSchedule({ profile, orgId, setLocalCache }) {
  const [state, setState] = useState({ loading: true, membership: null, slots: [], requirements: [], shortfalls: [], requests: [] });
  const [proposing, setProposing] = useState(false);
  const [draft, setDraft] = useState({});
  const [proposeReason, setProposeReason] = useState('');
  const [accounting, setAccounting] = useState(null); // { kind, shortfall }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [reloadTick, setReloadTick] = useState(0);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };
  const load = () => setReloadTick(n => n + 1); // actions bump this to refetch

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getMembership({ profileId: profile.id, orgId }),
      getScheduleSlots({ profileId: profile.id, orgId }),
      getWorkRequirements({ profileId: profile.id, orgId }),
      listShortfalls({ profileId: profile.id, orgId }),
      listMyChangeRequests(profile.id),
    ]).then(([membership, slots, requirements, shortfalls, requests]) => {
      if (cancelled) return;
      setState({ loading: false, membership, slots, requirements, shortfalls, requests });
      // Mirror the server schedule into the legacy local key (offline cache).
      if (slots.length > 0) setLocalCache(slotsToLocalSchedule(slots));
    }).catch(err => {
      if (cancelled) return;
      setState(s => ({ ...s, loading: false }));
      setMsg('⚠ ' + (err?.message || 'Failed to load schedule'));
      setTimeout(() => { if (!cancelled) setMsg(''); }, 4000);
    });
    return () => { cancelled = true; };
  }, [profile.id, orgId, setLocalCache, reloadTick]);

  const type = state.membership?.work_profile_type || 'self_managed';
  const isDedicated = type === 'dedicated_hours';

  const startPropose = () => {
    setDraft(slotsToLocalSchedule(state.slots));
    setProposeReason('');
    setProposing(true);
  };

  const submitProposal = async () => {
    setBusy(true);
    try {
      await submitChangeRequest({
        orgId, profileId: profile.id, requestedBy: profile.id,
        kind: 'slot_change',
        payload: { slots: localScheduleToSlots(draft) },
        reason: proposeReason.trim() || null,
      });
      setProposing(false);
      flash('✓ Change request submitted for approval');
      load();
    } catch (err) { flash('⚠ ' + (err?.message || 'Failed to submit')); }
    setBusy(false);
  };

  const submitAccounting = async ({ kind, payload, reason }) => {
    setBusy(true);
    try {
      await submitChangeRequest({ orgId, profileId: profile.id, requestedBy: profile.id, kind, payload, reason });
      setAccounting(null);
      flash('✓ Submitted — a manager will review it');
      load();
    } catch (err) { flash('⚠ ' + (err?.message || 'Failed to submit')); }
    setBusy(false);
  };

  const excuseShortfall = async (s, reason) => {
    try {
      await resolveShortfall({ ledgerId: s.id, resolution: 'excused', reason });
      flash('✓ Reason logged');
      load();
    } catch (err) { flash('⚠ ' + (err?.message || 'Failed to resolve')); }
  };

  if (state.loading) return <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)' }}>Loading your schedule…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {msg && <div style={{ fontSize: '11px', color: 'var(--color-accent-primary)' }}>{msg}</div>}

      <GlassCard style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>📋 My Work Profile</h3>
          <TypeBadge type={type} />
        </div>
        <div style={{ ...mutedText, marginTop: '6px' }}>
          {isDedicated
            ? 'Your weekly schedule is set by your manager. Propose changes below — they take effect once approved.'
            : 'No fixed schedule — you manage your own hours. Required-hours minimums and time accounting still apply: clock in/out and keep your context logged.'}
        </div>

        {/* Required-hours floors */}
        <div style={{ marginTop: '12px' }}>
          <h4 style={sectionTitle}>Required hours</h4>
          {state.requirements.length === 0 ? (
            <div style={mutedText}>No minimums set.</div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {state.requirements.map(r => (
                <span key={r.id} style={{ fontSize: '11px', padding: '4px 10px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '10px', fontWeight: 600 }}>
                  {CADENCE_LABELS[r.cadence]}: {fmtMinutes(r.min_minutes)}
                </span>
              ))}
            </div>
          )}
        </div>
      </GlassCard>

      {/* Fixed weekly schedule (dedicated only) */}
      {isDedicated && (
        <GlassCard style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h4 style={{ ...sectionTitle, margin: 0 }}>🗓 Weekly schedule {state.slots.length > 0 && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>· {fmtMinutes(weeklyScheduledMinutes(state.slots))}/wk</span>}</h4>
            {!proposing && <button style={btn} onClick={startPropose}>✏️ Propose change</button>}
          </div>
          {proposing ? (
            <div>
              <WeekEditor draft={draft} onChange={setDraft} />
              <input
                type="text" placeholder="Why this change? (shown to your manager)"
                value={proposeReason} onChange={e => setProposeReason(e.target.value)}
                style={{ ...inputStyle, width: '100%', marginTop: '8px', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button style={btnPrimary} disabled={busy} onClick={submitProposal}>{busy ? 'Submitting…' : 'Submit for approval'}</button>
                <button style={btn} onClick={() => setProposing(false)}>Cancel</button>
              </div>
            </div>
          ) : state.slots.length === 0 ? (
            <div style={mutedText}>No schedule set yet — your manager sets it, or propose one.</div>
          ) : (
            <WeekEditor draft={slotsToLocalSchedule(state.slots)} onChange={() => {}} readOnly />
          )}
        </GlassCard>
      )}

      {/* Self-managed: shift/make-up entry points without a shortfall */}
      {!isDedicated && !accounting && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={btn} onClick={() => setAccounting({ kind: 'shift_hours', shortfall: null })}>➡ Shift expected hours</button>
          <button style={btn} onClick={() => setAccounting({ kind: 'make_up', shortfall: null })}>🔁 Log a make-up plan</button>
        </div>
      )}

      {accounting && (
        <AccountingForm
          kind={accounting.kind} shortfall={accounting.shortfall}
          onSubmit={submitAccounting} onCancel={() => setAccounting(null)} busy={busy}
        />
      )}

      {/* Shortfall accounting */}
      <GlassCard style={{ padding: '16px' }}>
        <h4 style={sectionTitle}>⏳ Time accounting</h4>
        <div style={{ ...mutedText, marginBottom: '8px' }}>
          Shortfalls vs your minimums appear here. Account for each one: make it up, shift the hours, or log a reason. Unaccounted shortfalls are visible to your manager.
        </div>
        <ShortfallList
          shortfalls={state.shortfalls}
          canAct
          onAccount={(s, kind) => setAccounting({ kind, shortfall: s })}
          onExcuse={excuseShortfall}
        />
      </GlassCard>

      {/* My requests */}
      {state.requests.length > 0 && (
        <GlassCard style={{ padding: '16px' }}>
          <h4 style={sectionTitle}>📨 My change requests</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {state.requests.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px' }}>{summarizeRequest(r)}{r.reason ? ` — “${r.reason}”` : ''}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: r.status === 'pending' ? '#ffa726' : r.status === 'approved' ? '#66bb6a' : '#ef5350' }}>{r.status}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// MANAGE mode
// ════════════════════════════════════════════
function ManageSchedules({ profile, orgs }) {
  const [orgId, setOrgId] = useState(orgs[0]?.org_id || null);
  const [roster, setRoster] = useState([]);
  const [selected, setSelected] = useState(null); // profile_id
  const [detail, setDetail] = useState(null); // { membership, slots, requirements, shortfalls }
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  // Switching org is an EVENT — reset the selection there, not in an effect.
  const changeOrg = (id) => {
    setOrgId(id);
    setSelected(null);
    setDetail(null);
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    getOrgRoster(orgId)
      .then(r => { if (!cancelled) setRoster(r); })
      .catch(err => { if (!cancelled) flash('⚠ ' + (err?.message || 'Roster load failed')); });
    return () => { cancelled = true; };
  }, [orgId]);

  const loadMember = async (pid) => {
    setSelected(pid);
    setDetail(null);
    try {
      const [membership, slots, requirements, shortfalls] = await Promise.all([
        getMembership({ profileId: pid, orgId }),
        getScheduleSlots({ profileId: pid, orgId }),
        getWorkRequirements({ profileId: pid, orgId }),
        listShortfalls({ profileId: pid, orgId }),
      ]);
      setDetail({ membership, slots, requirements, shortfalls });
      setDraft(slotsToLocalSchedule(slots));
    } catch (err) {
      flash('⚠ ' + (err?.message || 'Member load failed'));
    }
  };

  const saveType = async (type) => {
    setBusy(true);
    try {
      await setMemberWorkProfile({ orgId, profileId: selected, type });
      flash('✓ Work profile updated');
      await loadMember(selected);
      getOrgRoster(orgId).then(setRoster).catch(() => {});
    } catch (err) { flash('⚠ ' + (err?.message || 'Failed')); }
    setBusy(false);
  };

  const saveSlots = async () => {
    setBusy(true);
    try {
      await setMemberSchedule({ orgId, profileId: selected, slots: localScheduleToSlots(draft) });
      flash('✓ Schedule saved');
      await loadMember(selected);
    } catch (err) { flash('⚠ ' + (err?.message || 'Failed')); }
    setBusy(false);
  };

  const saveRequirements = async (entries) => {
    setBusy(true);
    try {
      await setWorkRequirements({ orgId, profileId: selected, requirements: entries });
      flash('✓ Required-hours floors saved');
      await loadMember(selected);
    } catch (err) { flash('⚠ ' + (err?.message || 'Failed')); }
    setBusy(false);
  };

  const type = detail?.membership?.work_profile_type || 'self_managed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {msg && <div style={{ fontSize: '11px', color: 'var(--color-accent-primary)' }}>{msg}</div>}

      <GlassCard style={{ padding: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>👥 Manage member schedules</h3>
          {orgs.length > 1 && (
            <select value={orgId || ''} onChange={e => changeOrg(e.target.value)} style={{ ...inputStyle, padding: '3px 6px' }}>
              {orgs.map(o => <option key={o.org_id} value={o.org_id}>{o.org_name}</option>)}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
          {roster.map(m => (
            <button
              key={m.profile_id}
              onClick={() => loadMember(m.profile_id)}
              style={{
                ...btn,
                ...(selected === m.profile_id ? { background: 'var(--color-accent-primary)', color: '#000', border: 'none' } : {}),
              }}
            >
              {m.display_name}{m.profile_id === profile.id ? ' (you)' : ''} · {m.work_profile_type === 'dedicated_hours' ? '🕐' : '🧭'}
            </button>
          ))}
          {roster.length === 0 && <span style={mutedText}>No visible members in this org (your reach is your managed teams unless you're an org-wide admin).</span>}
        </div>
      </GlassCard>

      {selected && !detail && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)' }}>Loading member…</div>}

      {selected && detail && (
        <>
          <GlassCard style={{ padding: '16px' }}>
            <h4 style={sectionTitle}>Work profile type</h4>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button style={type === 'dedicated_hours' ? btnPrimary : btn} disabled={busy} onClick={() => saveType('dedicated_hours')}>🕐 Dedicated hours</button>
              <button style={type === 'self_managed' ? btnPrimary : btn} disabled={busy} onClick={() => saveType('self_managed')}>🧭 Self-managed</button>
            </div>
            <div style={{ ...mutedText, marginTop: '6px' }}>
              Dedicated: fixed weekly schedule + adherence + minimums. Self-managed: no fixed schedule, but minimums and time accounting still apply.
            </div>
          </GlassCard>

          <GlassCard style={{ padding: '16px' }}>
            <h4 style={sectionTitle}>Required hours (independent floors)</h4>
            <RequirementsEditor key={`${orgId}:${selected}`} requirements={detail.requirements} onSave={saveRequirements} saving={busy} />
          </GlassCard>

          {type === 'dedicated_hours' && (
            <GlassCard style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h4 style={{ ...sectionTitle, margin: 0 }}>Weekly schedule · {fmtMinutes(weeklyScheduledMinutes(localScheduleToSlots(draft)))}/wk</h4>
                <button style={btnPrimary} disabled={busy} onClick={saveSlots}>{busy ? 'Saving…' : 'Save schedule'}</button>
              </div>
              <WeekEditor draft={draft} onChange={setDraft} />
            </GlassCard>
          )}

          <GlassCard style={{ padding: '16px' }}>
            <h4 style={sectionTitle}>⏳ Shortfall ledger</h4>
            <ShortfallList shortfalls={detail.shortfalls} canAct={false} />
          </GlassCard>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// REQUESTS mode — approval inbox
// ════════════════════════════════════════════
function RequestsInbox({ orgs, onCountChange }) {
  const [requests, setRequests] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listPendingChangeRequests(orgs.map(o => o.org_id));
        if (cancelled) return;
        setRequests(rows);
        onCountChange?.(rows.length);
        const nameMap = await getProfileNames(rows.flatMap(r => [r.profile_id, r.requested_by]));
        if (cancelled) return;
        setNames(nameMap);
      } catch (err) {
        if (cancelled) return;
        setMsg('⚠ ' + (err?.message || 'Failed to load requests'));
        setTimeout(() => { if (!cancelled) setMsg(''); }, 4000);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgs, onCountChange, reloadTick]);

  const decide = async (req, decision) => {
    setBusy(req.id);
    try {
      await decideChangeRequest({ requestId: req.id, decision });
      flash(decision === 'approved' ? '✓ Approved and applied' : '✓ Rejected');
      setReloadTick(n => n + 1); // refetch the inbox
    } catch (err) { flash('⚠ ' + (err?.message || 'Failed to decide')); }
    setBusy(null);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)' }}>Loading requests…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {msg && <div style={{ fontSize: '11px', color: 'var(--color-accent-primary)' }}>{msg}</div>}
      {requests.length === 0 ? (
        <GlassCard style={{ padding: '30px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', marginBottom: '6px' }}>📭</div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>No pending change requests.</div>
        </GlassCard>
      ) : requests.map(r => (
        <GlassCard key={r.id} style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700 }}>
                {names[r.profile_id] || 'Member'} · {summarizeRequest(r)}
              </div>
              <div style={{ ...mutedText, marginTop: '2px' }}>
                Filed {new Date(r.created_at).toLocaleString()} by {names[r.requested_by] || 'member'}
                {r.reason ? ` — “${r.reason}”` : ''}
              </div>
              {r.kind === 'slot_change' && Array.isArray(r.payload?.slots) && (
                <div style={{ ...mutedText, marginTop: '4px' }}>
                  {r.payload.slots.map((s, i) => (
                    <span key={i} style={{ marginRight: '8px' }}>
                      {WEEKDAY_LABELS[s.weekday]?.slice(0, 3)} {minuteToHHMM(s.start_minute)}–{minuteToHHMM(s.end_minute)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button style={{ ...btn, borderColor: '#66bb6a', color: '#66bb6a' }} disabled={busy === r.id} onClick={() => decide(r, 'approved')}>✓ Approve</button>
              <button style={{ ...btn, borderColor: '#ef5350', color: '#ef5350' }} disabled={busy === r.id} onClick={() => decide(r, 'rejected')}>✗ Reject</button>
            </div>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════
// Signed-out fallback — the legacy local-only editor (offline cache).
// ════════════════════════════════════════════
function LocalOnlySchedule() {
  const [schedule, setSchedule] = useChromeStorage('workSchedule', {});
  return (
    <GlassCard style={{ padding: '20px' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700 }}>📋 Work Schedule (local only)</h3>
      <p style={{ ...mutedText, margin: '0 0 14px' }}>
        You're not signed in — this schedule is stored on this device only. Sign in from Settings to sync it, get org schedules, required-hours floors, and change-request approvals.
      </p>
      <WeekEditor draft={schedule} onChange={setSchedule} />
    </GlassCard>
  );
}

// ════════════════════════════════════════════
// Entry — mode switcher
// ════════════════════════════════════════════
export function ScheduleView() {
  const { profile, isSignedIn, loading } = useAuth();
  const { orgs, canManageAnything } = useOrgRole();
  const [, setLocalCache] = useChromeStorage('workSchedule', {});
  const [mode, setMode] = useState('self'); // 'self' | 'manage' | 'requests'
  const [pendingCount, setPendingCount] = useState(null);
  const [orgId, setOrgId] = useState(null);

  const activeOrgId = orgId || profile?.default_org_id || orgs[0]?.org_id || null;

  const modes = useMemo(() => {
    const m = [{ id: 'self', label: '🙋 My Schedule' }];
    if (canManageAnything) {
      m.push({ id: 'manage', label: '👥 Manage' });
      m.push({ id: 'requests', label: `📨 Requests${pendingCount ? ` (${pendingCount})` : ''}` });
    }
    return m;
  }, [canManageAnything, pendingCount]);

  if (loading) return <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)' }}>Loading…</div>;
  if (!isSignedIn || !profile?.id) return <LocalOnlySchedule />;
  if (!activeOrgId) {
    return (
      <GlassCard style={{ padding: '20px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700 }}>📋 Work Schedule</h3>
        <p style={mutedText}>You're signed in but not a member of any organization yet. Join or create one from Settings → Team, then schedules, work profiles and required hours unlock here.</p>
      </GlassCard>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        {modes.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            ...btn,
            ...(mode === m.id ? { background: 'var(--color-accent-primary)', color: '#000', border: 'none' } : {}),
          }}>{m.label}</button>
        ))}
        {mode === 'self' && orgs.length > 1 && (
          <select value={activeOrgId} onChange={e => setOrgId(e.target.value)} style={{ ...inputStyle, marginLeft: 'auto', padding: '3px 6px' }}>
            {orgs.map(o => <option key={o.org_id} value={o.org_id}>{o.org_name}</option>)}
          </select>
        )}
      </div>

      {mode === 'self' && <SelfSchedule profile={profile} orgId={activeOrgId} setLocalCache={setLocalCache} />}
      {mode === 'manage' && canManageAnything && <ManageSchedules profile={profile} orgs={orgs} />}
      {mode === 'requests' && canManageAnything && <RequestsInbox orgs={orgs} onCountChange={setPendingCount} />}
    </div>
  );
}

export default ScheduleView;
