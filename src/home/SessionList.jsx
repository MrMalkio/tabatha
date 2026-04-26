import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '../components/ui/GlassCard';

/**
 * SessionList – Displays active browsing sessions with time tracking data.
 */
export function SessionList({ sessions = [], timeTracking = {} }) {
  if (sessions.length === 0) {
    return (
      <GlassCard className="p-4">
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', textAlign: 'center' }}>
          No active sessions. Open some tabs to start tracking.
        </p>
      </GlassCard>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <AnimatePresence>
        {sessions.map((session, i) => (
          <motion.div
            key={session.id || i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
          >
            <GlassCard className="p-3" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div style={{
                    width: '4px',
                    height: '32px',
                    borderRadius: '2px',
                    backgroundColor: session.active ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                    flexShrink: 0,
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {session.icon} {session.context || session.title || 'Untitled'}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--color-text-muted)',
                      marginTop: '2px',
                    }}>
                      {session.tabCount || 0} tab{(session.tabCount || 0) !== 1 ? 's' : ''} · {session.category || 'Unknown'}
                    </div>
                  </div>
                </div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: session.active ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                  marginLeft: '12px',
                }}>
                  {session.timeStr || '0m'}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
