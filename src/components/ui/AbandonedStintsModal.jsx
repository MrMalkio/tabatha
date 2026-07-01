import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from './GlassCard';
import { sendMessage } from '../../hooks/useChromeStorage';
import { isOwnAbandonedStint } from '../../utils/stintReconciliation';

// ============================================================
// Tabatha — Abandoned-Stint surfacing at clock-in (NB-05).
//
// When the user clocks in AGAIN, any of their OWN installs that were left
// clocked in without a proper clock-out (the "ghost stint" case handled by
// migration 017 + stintReconciliation + the Live Stints panel) are surfaced
// HERE so they can set the real end time or discard them at that moment —
// rather than only via Work Shifts → Live Stints.
//
// Reuses the existing awarenessService write-back handlers:
//   CLOCK_OUT_INSTALL — reconstruct the closing stint at the corrected end
//   DISMISS_INSTALL   — discard the stale presence row
// and the Live Stints end-time picker pattern (datetime-local prefilled from
// last_heartbeat_at). Clock-in proceeds once the user resolves every row or
// explicitly skips.
//
// Freshness: on open we re-check via LIST_LIVE_STINTS so a row that came back
// online in the meantime is NOT treated as abandoned.
// ============================================================

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fmt = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

const miniBtn = {
  background: 'var(--color-surface)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
};

/**
 * @param {boolean}  isOpen
 * @param {string}   selfClassification  this install's classification
 * @param {Function} onResolved  called when the user finishes (all rows handled or skipped) → proceed with CLOCK_IN
 * @param {Function} onClose     called to dismiss without proceeding (Cancel) — clock-in does NOT fire
 */
export function AbandonedStintsModal({ isOpen, selfClassification, onResolved, onClose }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [ends, setEnds] = useState({});   // browser_profile_id → datetime-local string
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');

  const refresh = useCallback(() => {
    setLoading(true);
    sendMessage('LIST_LIVE_STINTS').then((res) => {
      const installs = res?.installs || [];
      const selfId = res?.selfBrowserProfileId || null;
      // Re-check freshness at open time so a row that came back online is not
      // treated as abandoned. fetchInstalls stamps is_self; belt-and-suspenders
      // against selfBrowserProfileId here too.
      const abandoned = installs.filter((i) =>
        i.browser_profile_id !== selfId && isOwnAbandonedStint(i, selfClassification)
      );
      setRows(abandoned);
      setEnds(Object.fromEntries(abandoned.map((i) => [i.browser_profile_id, toLocalInput(i.last_heartbeat_at)])));
      setLoading(false);
    }).catch(() => { setRows([]); setLoading(false); });
  }, [selfClassification]);

  useEffect(() => { if (isOpen) { setErr(''); refresh(); } }, [isOpen, refresh]);

  // If nothing is (still) abandoned once loaded, don't block the user — proceed.
  useEffect(() => {
    if (isOpen && !loading && rows.length === 0) onResolved();
  }, [isOpen, loading, rows.length, onResolved]);

  const remaining = rows.length;

  const doReconcile = async (inst) => {
    setBusy(inst.browser_profile_id); setErr('');
    const endLocal = ends[inst.browser_profile_id];
    const end_time = endLocal ? new Date(endLocal).toISOString() : null;
    const res = await sendMessage('CLOCK_OUT_INSTALL', { browser_profile_id: inst.browser_profile_id, end_time });
    setBusy(null);
    if (res?.error) { setErr('⚠ ' + res.error); return; }
    setRows((r) => r.filter((x) => x.browser_profile_id !== inst.browser_profile_id));
  };

  const doDiscard = async (inst) => {
    setBusy(inst.browser_profile_id); setErr('');
    const res = await sendMessage('DISMISS_INSTALL', { browser_profile_id: inst.browser_profile_id });
    setBusy(null);
    if (res?.error) { setErr('⚠ ' + res.error); return; }
    setRows((r) => r.filter((x) => x.browser_profile_id !== inst.browser_profile_id));
  };

  const body = useMemo(() => {
    if (loading) return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>Checking for abandoned shifts…</div>;
    if (rows.length === 0) return null; // effect above proceeds
    return rows.map((i) => {
      const name = i.profile_name || `Install ${i.browser_profile_id?.slice(0, 6) || '—'}`;
      const onBreak = i.clock_state === 'on_break';
      return (
        <GlassCard key={i.browser_profile_id} style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px' }}>⚪</span>
            {name}
            {i.classification && <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '3px', background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'capitalize' }}>{i.classification}</span>}
            {i.machine_id && <span style={{ fontSize: '8px', opacity: 0.7 }}>🖥 {i.machine_id.slice(0, 6)}</span>}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '3px' }}>
            {onBreak ? 'Abandoned while on break' : 'Abandoned'} · clocked in {fmt(i.clocked_in_at)} · last seen {fmt(i.last_heartbeat_at)}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '8px 0 6px' }}>
            Set when this shift should have ended (defaults to its last heartbeat). It's reconstructed into your history and attributed to your matching real install.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="datetime-local"
              value={ends[i.browser_profile_id] || ''}
              onChange={(e) => setEnds((s) => ({ ...s, [i.browser_profile_id]: e.target.value }))}
              min={toLocalInput(i.clocked_in_at)}
              max={toLocalInput(new Date().toISOString())}
              style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: '3px', color: 'var(--color-text-primary)', padding: '4px 6px', fontSize: '11px' }}
            />
            <button onClick={() => doReconcile(i)} disabled={busy === i.browser_profile_id} style={{ ...miniBtn, borderColor: '#66bb6a', color: '#66bb6a' }}>
              {busy === i.browser_profile_id ? '…' : '✓ Save end time'}
            </button>
            <button onClick={() => doDiscard(i)} disabled={busy === i.browser_profile_id} style={{ ...miniBtn, borderColor: '#ef5350', color: '#ef5350' }}>
              {busy === i.browser_profile_id ? '…' : '✕ Discard'}
            </button>
          </div>
        </GlassCard>
      );
    });
  }, [loading, rows, ends, busy]);

  if (!isOpen) return null;
  // While loading or when nothing is abandoned, render nothing visible — the
  // effects above resolve the gate and clock-in proceeds.
  if (!loading && rows.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}
      >
        <motion.div initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}>
          <GlassCard style={{ width: '480px', maxWidth: '92vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px 10px', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#ffa726', fontWeight: 600 }}>⚠ Unfinished shifts</div>
              <h2 style={{ margin: '2px 0 0', fontSize: '17px', fontWeight: 700 }}>
                {remaining} abandoned {remaining === 1 ? 'shift' : 'shifts'} to resolve
              </h2>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Another of your installs was left clocked in without clocking out. Fix the end times or discard them before starting a new shift.
              </div>
            </div>

            <div style={{ padding: '0 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {body}
              {err && <div style={{ fontSize: '11px', color: '#ef5350' }}>{err}</div>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '12px 22px 18px', flexShrink: 0, borderTop: '1px solid var(--color-border)' }}>
              <button onClick={onClose} style={{ ...miniBtn, background: 'transparent' }}>Cancel clock-in</button>
              <button
                onClick={onResolved}
                title="Leave the remaining shifts as-is and clock in anyway"
                style={{ ...miniBtn, background: 'var(--color-accent-primary)', color: '#000', border: 'none' }}
              >
                {remaining > 0 ? 'Skip & clock in' : 'Clock in'}
              </button>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
