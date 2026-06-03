// ════════════════════════════════════════════
// Tabatha — CheckpointTimeline (Plan 037/QA)
// Shared between home/FocusBar and sidebar.
// Props: activeFocus, sendMessage, onAddNote (opens CPN form in parent)
// ════════════════════════════════════════════
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from './ui/Tooltip';
import { formatElapsed } from '../hooks/useFocusEngine';

const LEVEL_EMOJI = { none: '😐', little: '📈', lot: '🚀', almost_done: '🏁', stuck: '🚧' };

const timeEditBtn = {
  background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
  borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontSize: '11px',
  cursor: 'pointer', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
};

export function CheckpointTimeline({ activeFocus, sendMessage, onAddNote }) {
  const [tlEdit, setTlEdit] = useState(false);
  const [editCpn, setEditCpn] = useState(null); // { id, text, progressLevel }
  const [setExactMin, setSetExactMin] = useState('');
  const [copied, setCopied] = useState(false);

  if (!activeFocus) return null;

  const cpnTotalCount = (activeFocus.checkpoint || []).length;
  if (cpnTotalCount === 0) return null;

  const hasPause = activeFocus.focusState === 'paused' ||
    (activeFocus.checkpoint || []).some(c => c.triggeredBy === 'system' && /^Paused/i.test(c.text || ''));

  const adjustTime = (deltaMin) =>
    sendMessage('ADJUST_FOCUS_TIME', { focusId: activeFocus.id, adjustmentMs: deltaMin * 60000, reason: 'manual edit' });

  const removeLastPauseAction = () =>
    sendMessage('REMOVE_LAST_PAUSE', { focusId: activeFocus.id });

  const applyExactTime = () => {
    const m = parseFloat(setExactMin);
    if (!Number.isNaN(m) && m >= 0) {
      sendMessage('SET_FOCUS_ELAPSED', { focusId: activeFocus.id, elapsedMs: m * 60000 });
      setSetExactMin('');
    }
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
          <Tooltip text="Copy the timeline as clean text">
            <button onClick={copyTimeline} style={{ ...timeEditBtn, color: copied ? '#66bb6a' : 'var(--color-text-muted)', borderColor: copied ? '#66bb6a' : 'var(--color-border)' }}>
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          </Tooltip>
          <Tooltip text={tlEdit ? 'Finish editing' : 'Edit times and notes for this focus'}>
            <button
              onClick={() => { setTlEdit(!tlEdit); setEditCpn(null); }}
              style={{ ...timeEditBtn, borderColor: tlEdit ? '#66bb6a' : 'var(--color-border)', color: tlEdit ? '#66bb6a' : 'var(--color-text-muted)' }}
            >
              {tlEdit ? '✓ Done' : '✏️ Edit'}
            </button>
          </Tooltip>
        </span>
      </div>

      {!tlEdit && (
        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
          Tap <strong>✏️ Edit</strong> to correct tracked time, edit a note, or add/remove entries.
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
            Nudge with the buttons, or type an exact value. Use this to recover time lost to a false or accidental pause.
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => adjustTime(-5)} style={timeEditBtn}>−5m</button>
            <button onClick={() => adjustTime(-1)} style={timeEditBtn}>−1m</button>
            <button onClick={() => adjustTime(1)} style={timeEditBtn}>+1m</button>
            <button onClick={() => adjustTime(5)} style={timeEditBtn}>+5m</button>
            <span style={{ width: '1px', height: '18px', background: 'var(--color-border)', margin: '0 2px' }} />
            <input
              type="number" min="0" value={setExactMin}
              onChange={e => setSetExactMin(e.target.value)}
              placeholder="exact min"
              style={{ width: '78px', padding: '2px 6px', fontSize: '11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', outline: 'none' }}
            />
            <button onClick={applyExactTime} disabled={setExactMin === ''} style={{ ...timeEditBtn, opacity: setExactMin === '' ? 0.4 : 1 }}>Set</button>
          </div>
          {hasPause && (
            <button
              onClick={removeLastPauseAction}
              style={{ ...timeEditBtn, borderColor: '#66bb6a', color: '#66bb6a', marginTop: '6px' }}
            >
              ↩ Remove last pause &amp; restore its time
            </button>
          )}
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
