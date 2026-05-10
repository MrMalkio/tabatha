import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from './GlassCard';
import { useChromeStorage } from '../../hooks/useChromeStorage';

export function LinkMergeModal({ isOpen, onClose, targetItem, type }) {
  const [tasks, setTasks] = useChromeStorage('tasks', []);
  const [focusEngine] = useChromeStorage('focusEngine', { items: {} });
  const [mode, setMode] = useState('link');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [newTaskName, setNewTaskName] = useState('');

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) { setSelectedTargetId(''); setNewTaskName(''); setMode('link'); }
  }, [isOpen]);

  if (!isOpen || !targetItem) return null;

  // Build intent list from focusEngine — filter out the target item
  const intents = Object.entries(focusEngine.items || {})
    .map(([id, item]) => ({ id, ...item }))
    .filter(i => i.id !== targetItem?.id);

  const handleSave = () => {
    if (type === 'tab' && mode === 'link') {
      chrome.runtime.sendMessage({ type: 'LINK_TAB_TO_INTENT', tabId: targetItem.id, targetIntentId: selectedTargetId });
    } else if (type === 'intent' && mode === 'link') {
      chrome.runtime.sendMessage({ type: 'LINK_INTENT_TO_TASK', intentId: targetItem.id, taskId: selectedTargetId, newTaskName });
    } else if (type === 'intent' && mode === 'merge') {
      chrome.runtime.sendMessage({ type: 'MERGE_INTENTS', sourceIntentId: targetItem.id, targetIntentId: selectedTargetId });
    }
    onClose();
  };

  const inputStyle = { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: '12px', boxSizing: 'border-box' };
  const tabBtn = (active) => ({ background: active ? 'var(--color-accent-primary)' : 'transparent', color: active ? '#000' : 'var(--color-text-muted)', border: 'none', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 });

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        onClick={onClose}>
        <motion.div initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }} onClick={(e) => e.stopPropagation()}>
          <GlassCard style={{ width: '420px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                {type === 'tab' ? '🔗 Link Tab to Intent' : '🔗 Link / Merge Intent'}
              </h2>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ background: 'var(--color-surface)', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--color-border)' }}>
              <strong>Target:</strong> {targetItem.title || targetItem.label || targetItem.url || 'Unknown'}
            </div>

            {/* Mode Tabs */}
            <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
              <button onClick={() => setMode('link')} style={tabBtn(mode === 'link')}>🔗 Link</button>
              {type === 'intent' && (
                <button onClick={() => setMode('merge')} style={tabBtn(mode === 'merge')}>🔀 Merge</button>
              )}
            </div>

            {/* Link tab to intent */}
            {mode === 'link' && type === 'tab' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Select an Intent to link to</label>
                {intents.length === 0 ? (
                  <div style={{ fontSize: '11px', color: '#ffa726', padding: '8px', background: '#ffa72611', borderRadius: '4px' }}>No intents available. Create a focus first.</div>
                ) : (
                  <select value={selectedTargetId} onChange={e => setSelectedTargetId(e.target.value)} style={inputStyle}>
                    <option value="">-- Choose an Intent --</option>
                    {intents.map(i => <option key={i.id} value={i.id}>{i.label} ({i.focusState || 'queued'})</option>)}
                  </select>
                )}
              </div>
            )}

            {/* Link intent to task */}
            {mode === 'link' && type === 'intent' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Link to an existing Task</label>
                {tasks.length === 0 ? (
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', padding: '8px', background: 'var(--color-surface)', borderRadius: '4px', marginBottom: '8px' }}>No tasks yet. Create one below.</div>
                ) : (
                  <select value={selectedTargetId} onChange={e => setSelectedTargetId(e.target.value)} style={{ ...inputStyle, marginBottom: '8px' }}>
                    <option value="">-- Choose a Task --</option>
                    {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <div style={{ textAlign: 'center', margin: '6px 0', fontSize: '10px', color: 'var(--color-text-muted)' }}>— OR create new —</div>
                <input type="text" placeholder="New task name..." value={newTaskName} onChange={e => setNewTaskName(e.target.value)} style={inputStyle} />
              </div>
            )}

            {/* Merge intent into another */}
            {mode === 'merge' && type === 'intent' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Merge "{targetItem.label}" into:</label>
                {intents.length === 0 ? (
                  <div style={{ fontSize: '11px', color: '#ffa726', padding: '8px', background: '#ffa72611', borderRadius: '4px' }}>No other intents to merge into.</div>
                ) : (
                  <select value={selectedTargetId} onChange={e => setSelectedTargetId(e.target.value)} style={inputStyle}>
                    <option value="">-- Choose target Intent --</option>
                    {intents.map(i => <option key={i.id} value={i.id}>{i.label} ({i.focusState || 'queued'})</option>)}
                  </select>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button onClick={onClose} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              <button onClick={handleSave} disabled={!selectedTargetId && !newTaskName}
                style={{ padding: '6px 14px', background: 'var(--color-accent-primary)', border: 'none', color: '#000', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, opacity: (!selectedTargetId && !newTaskName) ? 0.5 : 1 }}>
                {mode === 'merge' ? 'Merge' : 'Link'}
              </button>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
