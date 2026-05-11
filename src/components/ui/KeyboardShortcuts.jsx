import React, { useState, useEffect, useMemo } from 'react';
import { GlassCard } from './GlassCard';

/**
 * KeyboardShortcuts — Global keyboard shortcut handler + help overlay.
 * Shows all available shortcuts when triggered (Ctrl+/).
 * Actually binds the shortcuts to actions.
 */
const SHORTCUTS = [
  { keys: 'Ctrl+K', label: 'Open Command Palette', action: 'palette' },
  { keys: 'Ctrl+/', label: 'Show Keyboard Shortcuts', action: 'shortcuts' },
  { keys: 'Ctrl+Shift+F', label: 'Set New Focus', action: 'focus' },
  { keys: 'Ctrl+Shift+B', label: 'Toggle Break', action: 'break' },
  { keys: 'Ctrl+Shift+T', label: 'Switch Theme', action: 'theme' },
  { keys: 'Ctrl+1', label: 'Go to Intents tab', action: 'tab:intents' },
  { keys: 'Ctrl+2', label: 'Go to Tasks tab', action: 'tab:tasks' },
  { keys: 'Ctrl+3', label: 'Go to Projects tab', action: 'tab:projects' },
  { keys: 'Ctrl+4', label: 'Go to Org tab', action: 'tab:org' },
  { keys: 'Ctrl+5', label: 'Go to Logs tab', action: 'tab:logs' },
  { keys: 'Ctrl+6', label: 'Go to Tabs tab', action: 'tab:tabs' },
  { keys: 'Ctrl+7', label: 'Go to Sessions tab', action: 'tab:contexts' },
  { keys: 'Ctrl+8', label: 'Go to Stashed tab', action: 'tab:stashed' },
  { keys: 'Escape', label: 'Close open modals/overlays', action: 'escape' },
];

export function useKeyboardShortcuts({ onAction }) {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      // Ignore if typing in input/textarea
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.contentEditable === 'true') {
        // Only respond to Escape in input fields
        if (e.key === 'Escape') { e.target.blur(); return; }
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // Ctrl+K — open command palette
      if (ctrl && !shift && e.key === 'k') { e.preventDefault(); onAction?.('palette'); return; }

      // Ctrl+/ — show shortcuts help
      if (ctrl && e.key === '/') { e.preventDefault(); setShowHelp(v => !v); return; }

      // Ctrl+Shift+F — set focus
      if (ctrl && shift && e.key === 'F') { e.preventDefault(); onAction?.('focus'); return; }

      // Ctrl+Shift+B — toggle break
      if (ctrl && shift && e.key === 'B') { e.preventDefault(); onAction?.('break'); return; }

      // Ctrl+Shift+T — cycle theme
      if (ctrl && shift && e.key === 'T') { e.preventDefault(); onAction?.('theme'); return; }

      // Ctrl+1..8 — switch nav tabs
      if (ctrl && !shift && e.key >= '1' && e.key <= '8') {
        const tabActions = ['intents', 'tasks', 'projects', 'org', 'logs', 'tabs', 'contexts', 'stashed'];
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < tabActions.length) {
          e.preventDefault();
          onAction?.(`tab:${tabActions[idx]}`);
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onAction]);

  return { showHelp, setShowHelp };
}

export function ShortcutsHelp({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '420px', maxWidth: '90vw', maxHeight: '70vh',
        background: 'var(--color-bg-base)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg, 12px)', overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 700 }}>⌨️ Keyboard Shortcuts</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '14px' }}>✕</button>
        </div>
        <div style={{ padding: '12px 16px', maxHeight: '50vh', overflowY: 'auto' }}>
          {SHORTCUTS.map(s => (
            <div key={s.keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-primary)' }}>{s.label}</span>
              <kbd style={{ fontSize: '10px', color: 'var(--color-accent-primary)', background: 'var(--color-surface)', padding: '2px 8px', borderRadius: '3px', border: '1px solid var(--color-border)', fontFamily: 'monospace', fontWeight: 600 }}>{s.keys}</kbd>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--color-border)', textAlign: 'center', fontSize: '10px', color: 'var(--color-text-muted)' }}>
          Press <kbd style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '2px', border: '1px solid var(--color-border)' }}>Ctrl+/</kbd> to toggle this overlay
        </div>
      </div>
    </div>
  );
}
