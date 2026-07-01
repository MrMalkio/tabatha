import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from './GlassCard';
import { ChangelogView } from './ChangelogView';

// ============================================================
// Tabatha — "What's New" modal (FIX-11).
// Mirrors the LinkMergeModal overlay pattern (fixed backdrop, GlassCard, Esc
// to close, click-outside to dismiss). Shown once when the running version is
// newer than the stored `_lastSeenVersion` — the useWhatsNew hook owns that
// decision and the seen-marking; this component is presentational.
//
// We surface the single newest release (matching `version`) plus a couple of
// prior entries for context, sourced from the pre-parsed changelog.json.
// ============================================================

export function WhatsNewModal({ isOpen, version, releases, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const list = Array.isArray(releases) ? releases : [];
  // Prefer showing from the release matching the current version downward, so
  // a user who skipped several versions still sees what changed since. Cap at
  // 3 so the modal stays digestible; the full history lives in Settings.
  const startIdx = Math.max(0, list.findIndex((r) => r.version === version));
  const shown = list.slice(startIdx, startIdx + 3);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}
        onClick={onClose}
      >
        <motion.div initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }} onClick={(e) => e.stopPropagation()}>
          <GlassCard style={{ width: '520px', maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 12px', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-accent-primary)', fontWeight: 600 }}>🎉 What's New</div>
                <h2 style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 700 }}>Tabatha updated to v{version}</h2>
              </div>
              <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>

            <div style={{ padding: '0 24px', overflowY: 'auto', flex: 1 }}>
              {shown.length > 0
                ? <ChangelogView releases={shown} />
                : <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', padding: '12px 0' }}>You're on the latest version.</div>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 24px 20px', flexShrink: 0, borderTop: '1px solid var(--color-border)' }}>
              <button
                onClick={onClose}
                style={{ padding: '8px 18px', background: 'var(--color-accent-primary)', border: 'none', color: '#000', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                Got it
              </button>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
