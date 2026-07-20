// ════════════════════════════════════════════
// Tabatha — CheckpointTimeline (Plan 037/QA, NB-09 time-edit overhaul)
// Shared between home/FocusBar and sidebar.
// Props: activeFocus, sendMessage, onAddNote (opens CPN form in parent)
// ════════════════════════════════════════════
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from './ui/Tooltip';
import { formatElapsed } from '../hooks/useFocusEngine';
import { parseDuration, formatDurationMs } from '../utils/duration';

const LEVEL_EMOJI = { none: '😐', little: '📈', lot: '🚀', almost_done: '🏁', stuck: '🚧' };

const timeEditBtn = {
  background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
  borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontSize: '11px',
  cursor: 'pointer', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
};

const DUR_MODES = [
  { key: 'set', label: 'Set total' },
  { key: 'add', label: 'Add' },
  { key: 'sub', label: 'Subtract' },
];

export function CheckpointTimeline({ activeFocus, sendMessage, onAddNote }) {
  const [tlEdit, setTlEdit] = useState(false);
  const [editCpn, setEditCpn] = useState(null); // { id, text, progressLevel }
  const [durInput, setDurInput] = useState('');
  const [durMode, setDurMode] = useState('set'); // 'set' | 'add' | 'sub'
  const [feedback, setFeedback] = useState(null); // { text, clamped, error }
  const [lastActivityAt, setLastActivityAt] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!activeFocus) return null;

  // NB-09: the time-edit panel must stay reachable even with ZERO checkpoints
  // (previously the whole component early-returned, orphaning time editing).
  const cpnTotalCount = (activeFocus.checkpoint || []).length;

  const hasPause = activeFocus.focusState === 'paused' ||
    (activeFocus.checkpoint || []).some(c => c.triggeredBy === 'system' && /^Paused/i.test(c.text || ''));

  // ── NB-09: live clamp-aware preview math (mirrors focusService clamping) ──
  // The parent re-renders this component every second (useFocusEngine tick),
  // so a per-render "now" is effectively tick-driven, not unstable.
  const nowMs = Date.now(); // eslint-disable-line react-hooks/purity
  const liveMs = activeFocus.liveElapsedMs || 0;
  const isRunning = (activeFocus.focusState === 'active' || activeFocus.focusState === 'drifted') && activeFocus.lastResumedAt;
  const activePortionMs = isRunning ? Math.max(0, nowMs - new Date(activeFocus.lastResumedAt).getTime()) : 0;
  const wallMaxMs = activeFocus.startedAt ? Math.max(0, nowMs - new Date(activeFocus.startedAt).getTime()) : null;

  const parsedMs = parseDuration(durInput);
  let previewMs = null, previewClamped = false;
  if (parsedMs != null) {
    const rawTarget = durMode === 'set' ? parsedMs : durMode === 'add' ? liveMs + parsedMs : liveMs - parsedMs;
    // Floor: the running portion can't be un-lived; ceiling: wall-clock since start.
    let target = Math.max(activePortionMs, rawTarget, 0);
    if (wallMaxMs != null && target > wallMaxMs) target = wallMaxMs;
    previewClamped = Math.abs(target - rawTarget) > 1500; // ignore sub-second tick skew
    previewMs = target;
  }

  const showFeedback = (r, fallbackText) => {
    if (r?.error) { setFeedback({ text: r.error, error: true }); return; }
    const applied = r?.appliedMs ?? 0;
    const total = r?.liveElapsedMs != null ? formatElapsed(r.liveElapsedMs) : formatElapsed(activeFocus.liveElapsedMs);
    const sign = applied >= 0 ? '+' : '−';
    setFeedback({
      text: fallbackText || `Applied ${sign}${formatDurationMs(Math.abs(applied))} — total now ${total}`,
      clamped: !!r?.clamped,
      clampedTo: r?.liveElapsedMs,
    });
  };

  const adjustTime = async (deltaMin) => {
    const r = await sendMessage('ADJUST_FOCUS_TIME', { focusId: activeFocus.id, adjustmentMs: deltaMin * 60000, reason: 'manual edit' });
    showFeedback(r);
  };

  const removeLastPauseAction = () =>
    sendMessage('REMOVE_LAST_PAUSE', { focusId: activeFocus.id });

  const applyDuration = async () => {
    if (parsedMs == null) return;
    let r;
    if (durMode === 'set') {
      r = await sendMessage('SET_FOCUS_ELAPSED', { focusId: activeFocus.id, elapsedMs: parsedMs });
    } else {
      const signed = (durMode === 'sub' ? -1 : 1) * parsedMs;
      r = await sendMessage('ADJUST_FOCUS_TIME', { focusId: activeFocus.id, adjustmentMs: signed, reason: 'manual edit' });
    }
    showFeedback(r);
    setDurInput('');
  };

  const openEdit = async () => {
    setTlEdit(true); setEditCpn(null); setFeedback(null); setDurInput('');
    try {
      const r = await sendMessage('GET_LAST_ACTIVITY', {});
      setLastActivityAt(r?.lastActivityAt || null);
    } catch { setLastActivityAt(null); }
  };

  // Only offer the trim when we HAVE a timestamp and it's meaningfully behind now.
  const trimTargetMs = lastActivityAt ? new Date(lastActivityAt).getTime() : null;
  const canTrim = tlEdit && isRunning && trimTargetMs != null && (nowMs - trimTargetMs) > 60000;

  const trimToLastActivity = async () => {
    if (!trimTargetMs) return;
    const deltaMs = trimTargetMs - Date.now(); // negative — removes the away span
    if (deltaMs >= -1000) return;
    const r = await sendMessage('ADJUST_FOCUS_TIME', { focusId: activeFocus.id, adjustmentMs: deltaMs, reason: 'trimmed to last activity' });
    showFeedback(r);
  };

  const startEditCpn = (cpn) =>
    setEditCpn({ id: cpn.id, text: cpn.text || '', progressLevel: cpn.progressLevel || 'none' });

  const saveCpnEdit = async () => {
    if (!editCpn) return;
    await sendMessage('EDIT_CHECKPOINT', {
      focusId: activeFocus.id,
      checkpointId: editCpn.id,
      text: editCpn.text,
      progressLevel: editCpn.progressLevel
    });
    setEditCpn(null);
  };

  const deleteCpn = (id) =>
    sendMessage('DELETE_CHECKPOINT', { focusId: activeFocus.id, checkpointId: id });

  // Clean plain-text copy of the whole timeline (oldest → newest), so the user
  // can paste it elsewhere without screen-scraping irrelevant page elements.
  const copyTimeline = async () => {
    const lines = [`${activeFocus.label} — ${formatElapsed(activeFocus.liveElapsedMs)} tracked`];
    for (const cpn of (activeFocus.checkpoint || [])) {
      const t = cpn.createdAt ? new Date(cpn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const mins = Math.floor((cpn.elapsedAtMs || 0) / 60000);
      const label = cpn.triggeredBy === 'system' ? (cpn.text || 'event') : (cpn.progressLevel?.replace('_', ' ') || 'note');
      lines.push(`[${t} · ${mins}m in] ${label}`);
      if (cpn.text && cpn.triggeredBy !== 'system') {
        lines.push('    ' + cpn.text.replace(/\n/g, '\n    '));
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div style={{ marginTop: '10px', padding: '8px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          📊 Checkpoint Timeline
        </span>
        <span style={{ display: 'flex', gap: '4px' }}>
          {cpnTotalCount > 0 && (
            <Tooltip text="Copy the timeline as clean text">
              <button onClick={copyTimeline} style={{ ...timeEditBtn, color: copied ? '#66bb6a' : 'var(--color-text-muted)', borderColor: copied ? '#66bb6a' : 'var(--color-border)' }}>
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </Tooltip>
          )}
          <Tooltip text={tlEdit ? 'Finish editing' : 'Edit times and notes for this focus'}>
            <button
              onClick={() => { if (tlEdit) { setTlEdit(false); setEditCpn(null); setFeedback(null); } else { openEdit(); } }}
              style={{ ...timeEditBtn, borderColor: tlEdit ? '#66bb6a' : 'var(--color-border)', color: tlEdit ? '#66bb6a' : 'var(--color-text-muted)' }}
            >
              {tlEdit ? '✓ Done' : '✏️ Edit'}
            </button>
          </Tooltip>
        </span>
      </div>

      {!tlEdit && (
        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
          Tap <strong>✏️ Edit</strong> to correct tracked time{cpnTotalCount > 0 ? ', edit a note, or add/remove entries' : ' or add a note'}.
        </div>
      )}

      {/* Time adjustment panel — edit mode only */}
      {tlEdit && (
        <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
            <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              🕐 Total tracked time
            </span>
            <span style={{ fontSize: '14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {formatElapsed(activeFocus.liveElapsedMs)}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
            Nudge with the buttons, or type a duration like <strong>2h</strong>, <strong>8h20m</strong>, <strong>500m</strong>, or plain minutes. Press Enter to apply.
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '6px' }}>
            <button onClick={() => adjustTime(-5)} style={timeEditBtn}>−5m</button>
            <button onClick={() => adjustTime(-1)} style={timeEditBtn}>−1m</button>
            <button onClick={() => adjustTime(1)} style={timeEditBtn}>+1m</button>
            <button onClick={() => adjustTime(5)} style={timeEditBtn}>+5m</button>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            {DUR_MODES.map(m => (
              <button
                key={m.key}
                onClick={() => setDurMode(m.key)}
                style={{ ...timeEditBtn, padding: '2px 6px', borderColor: durMode === m.key ? 'var(--color-accent-primary)' : 'var(--color-border)', color: durMode === m.key ? 'var(--color-accent-primary)' : 'var(--color-text-muted)' }}
              >
                {m.label}
              </button>
            ))}
            <input
              type="text" value={durInput}
              onChange={e => setDurInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyDuration(); }}
              placeholder="e.g. 8h20m"
              style={{ width: '84px', padding: '2px 6px', fontSize: '11px', borderRadius: 'var(--radius-sm)', border: `1px solid ${durInput && parsedMs == null ? '#ef5350' : 'var(--color-border)'}`, background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', outline: 'none' }}
            />
            <button onClick={applyDuration} disabled={parsedMs == null} style={{ ...timeEditBtn, opacity: parsedMs == null ? 0.4 : 1 }}>Apply</button>
          </div>
          {/* Live preview of the resulting total BEFORE commit (incl. clamping) */}
          {parsedMs != null && (
            <div style={{ fontSize: '10px', marginTop: '4px', color: previewClamped ? '#ffa726' : 'var(--color-text-muted)' }}>
              → total becomes <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatElapsed(previewMs)}</strong>
              {previewClamped && <> — clamped to {formatDurationMs(previewMs)} (can't exceed time since start{activePortionMs > 0 ? ' or undo the running portion' : ''})</>}
            </div>
          )}
          {durInput && parsedMs == null && (
            <div style={{ fontSize: '10px', marginTop: '4px', color: '#ef5350' }}>
              Can't read that — try "2h", "8h20m", "500m", or plain minutes.
            </div>
          )}
          {/* Post-apply feedback from the handler's response */}
          {feedback && (
            <div style={{ fontSize: '10px', marginTop: '4px', color: feedback.error ? '#ef5350' : feedback.clamped ? '#ffa726' : '#66bb6a' }}>
              {feedback.error ? '⚠ ' : feedback.clamped ? '⚠ ' : '✓ '}{feedback.text}
              {feedback.clamped && feedback.clampedTo != null && <> — clamped to {formatElapsed(feedback.clampedTo)}</>}
            </div>
          )}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
            {canTrim && (
              <Tooltip text={`Remove time tracked since your last browser activity (${new Date(trimTargetMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}>
                <button onClick={trimToLastActivity} style={{ ...timeEditBtn, borderColor: '#ffa726', color: '#ffa726' }}>
                  ✂ Trim to last activity ({formatDurationMs(nowMs - trimTargetMs)} ago)
                </button>
              </Tooltip>
            )}
            {hasPause && (
              <button
                onClick={removeLastPauseAction}
                style={{ ...timeEditBtn, borderColor: '#66bb6a', color: '#66bb6a' }}
              >
                ↩ Remove last pause &amp; restore its time
              </button>
            )}
          </div>
        </div>
      )}

      {cpnTotalCount === 0 && (
        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '2px 0' }}>
          No checkpoint entries yet.
        </div>
      )}

      {/* Checkpoint entries */}
      {(activeFocus.checkpoint || []).slice().reverse().map((cpn, i) => {
        const isSys = cpn.triggeredBy === 'system';
        const isEditingThis = editCpn?.id === cpn.id;
        return (
          <div
            key={cpn.id || i}
            style={{ padding: '5px 0', borderBottom: i < cpnTotalCount - 1 ? '1px solid var(--color-border)' : 'none', fontSize: '11px', opacity: isSys && !tlEdit ? 0.6 : 1 }}
          >
            {isEditingThis ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <textarea
                  value={editCpn.text}
                  onChange={e => setEditCpn({ ...editCpn, text: e.target.value })}
                  rows={2}
                  style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
                {!isSys && (
                  <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                    {['none', 'little', 'lot', 'almost_done', 'stuck'].map(lv => (
                      <button
                        key={lv}
                        onClick={() => setEditCpn({ ...editCpn, progressLevel: lv })}
                        title={lv.replace('_', ' ')}
                        style={{ ...timeEditBtn, padding: '1px 6px', borderColor: editCpn.progressLevel === lv ? 'var(--color-accent-primary)' : 'var(--color-border)' }}
                      >
                        {LEVEL_EMOJI[lv]}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={saveCpnEdit} style={{ ...timeEditBtn, borderColor: '#66bb6a', color: '#66bb6a' }}>💾 Save</button>
                  <button onClick={() => setEditCpn(null)} style={timeEditBtn}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px', gap: '6px' }}>
                  <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isSys ? '⚙️' : (LEVEL_EMOJI[cpn.progressLevel] || '📋')} {isSys ? cpn.text : cpn.progressLevel?.replace('_', ' ')}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>
                      {cpn.createdAt ? new Date(cpn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} · {Math.floor((cpn.elapsedAtMs || 0) / 60000)}m in{cpn.editedAt ? ' · edited' : ''}
                    </span>
                    {tlEdit && !isSys && (
                      <button onClick={() => startEditCpn(cpn)} title="Edit note" style={{ ...timeEditBtn, padding: '0 5px' }}>✏️</button>
                    )}
                    {tlEdit && (
                      <button onClick={() => deleteCpn(cpn.id)} title="Delete entry" style={{ ...timeEditBtn, padding: '0 5px', borderColor: '#ef5350', color: '#ef5350' }}>✕</button>
                    )}
                  </span>
                </div>
                {/* pre-wrap preserves manual line breaks in notes */}
                {cpn.text && !isSys && (
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '10px', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {cpn.text}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {tlEdit && onAddNote && (
        <button
          onClick={() => { setTlEdit(false); onAddNote(); }}
          style={{ ...timeEditBtn, marginTop: '8px', width: '100%', borderStyle: 'dashed' }}
        >
          + Add checkpoint note
        </button>
      )}
    </div>
  );
}
