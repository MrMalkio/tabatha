import React from 'react';
import { FUNNEL_STAGES } from '../../hooks/useFocusEngine';

/**
 * StagePicker — Reusable inline funnel stage selector.
 * Used in: IntentsPanel, FocusBar edit, FocusQueue, Sidebar, InBar edit dropdown.
 *
 * Props:
 *   currentStage: string — current funnel stage key
 *   onChange: (stageKey: string) => void
 *   compact: boolean — if true, smaller chips
 */
export function StagePicker({ currentStage, onChange, compact = false }) {
  return (
    <div style={{ display: 'flex', gap: compact ? '2px' : '3px', flexWrap: 'wrap' }}>
      {Object.entries(FUNNEL_STAGES).map(([key, stage]) => {
        const isActive = currentStage === key;
        return (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); onChange(key); }}
            title={stage.label}
            style={{
              background: isActive ? stage.color + '33' : 'transparent',
              border: `1px solid ${isActive ? stage.color : 'var(--color-border)'}`,
              color: isActive ? stage.color : 'var(--color-text-muted)',
              borderRadius: '4px',
              padding: compact ? '1px 4px' : '2px 6px',
              fontSize: compact ? '8px' : '9px',
              cursor: 'pointer',
              fontWeight: isActive ? 600 : 400,
              transition: 'all 0.12s ease',
            }}
          >
            {stage.icon} {!compact && stage.label}
          </button>
        );
      })}
    </div>
  );
}
