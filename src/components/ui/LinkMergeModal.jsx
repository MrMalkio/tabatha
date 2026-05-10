import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from './GlassCard';
import { useChromeStorage } from '../../hooks/useChromeStorage';

export function LinkMergeModal({ isOpen, onClose, targetItem, type }) {
  // targetItem could be a tab, an intent, etc.
  // type is 'tab' or 'intent'
  
  const [tasks, setTasks] = useChromeStorage('tasks', []);
  const [focusEngine] = useChromeStorage('focusEngine', { items: {} });
  const [mode, setMode] = useState('link'); // 'link' or 'merge'
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [newTaskName, setNewTaskName] = useState('');

  // Close on esc
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen || !targetItem) return null;

  const intents = Object.values(focusEngine.items || {});

  const handleSave = () => {
    if (type === 'tab' && mode === 'link') {
      chrome.runtime.sendMessage({
        type: 'LINK_TAB_TO_INTENT',
        tabId: targetItem.id,
        targetIntentId: selectedTargetId
      });
    } else if (type === 'intent' && mode === 'link') {
      chrome.runtime.sendMessage({
        type: 'LINK_INTENT_TO_TASK',
        intentId: targetItem.id,
        taskId: selectedTargetId,
        newTaskName: newTaskName
      });
    } else if (type === 'intent' && mode === 'merge') {
      chrome.runtime.sendMessage({
        type: 'MERGE_INTENTS',
        sourceIntentId: targetItem.id,
        targetIntentId: selectedTargetId
      });
    }
    
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
        >
          <GlassCard style={{ width: '400px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                {type === 'tab' ? 'Link Tab to Intent' : 'Link/Merge Intent'}
              </h2>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            
            <div style={{ background: 'var(--color-surface)', padding: '12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--color-border)' }}>
              <strong>Target:</strong> {targetItem.title || targetItem.label || targetItem.url || 'Unknown Item'}
            </div>

            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
              <button onClick={() => setMode('link')} style={{ background: mode === 'link' ? 'var(--color-accent-primary)' : 'transparent', color: mode === 'link' ? '#fff' : 'var(--color-text-muted)', border: 'none', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Link</button>
              {type === 'intent' && (
                <button onClick={() => setMode('merge')} style={{ background: mode === 'merge' ? 'var(--color-accent-primary)' : 'transparent', color: mode === 'merge' ? '#fff' : 'var(--color-text-muted)', border: 'none', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Merge</button>
              )}
            </div>

            {mode === 'link' && type === 'tab' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>Select an Intent to link to</label>
                <select value={selectedTargetId} onChange={e => setSelectedTargetId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>
                  <option value="">-- Choose an Intent --</option>
                  {intents.map(intent => (
                    <option key={intent.id} value={intent.id}>{intent.label}</option>
                  ))}
                </select>
              </div>
            )}

            {mode === 'link' && type === 'intent' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>Link to an existing Task</label>
                <select value={selectedTargetId} onChange={e => setSelectedTargetId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                  <option value="">-- Choose a Task --</option>
                  {tasks.map(task => (
                    <option key={task.id} value={task.id}>{task.name}</option>
                  ))}
                </select>
                <div style={{ textAlign: 'center', margin: '8px 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>OR</div>
                <input 
                  type="text" 
                  placeholder="Create new Task" 
                  value={newTaskName} 
                  onChange={e => setNewTaskName(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}
                />
              </div>
            )}

            {mode === 'merge' && type === 'intent' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>Select another Intent to merge into</label>
                <select value={selectedTargetId} onChange={e => setSelectedTargetId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>
                  <option value="">-- Choose an Intent --</option>
                  {intents.filter(i => i.id !== targetItem.id).map(intent => (
                    <option key={intent.id} value={intent.id}>{intent.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button onClick={onClose} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              <button onClick={handleSave} disabled={!selectedTargetId && !newTaskName} style={{ padding: '6px 12px', background: 'var(--color-accent-primary)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, opacity: (!selectedTargetId && !newTaskName) ? 0.5 : 1 }}>Save</button>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
