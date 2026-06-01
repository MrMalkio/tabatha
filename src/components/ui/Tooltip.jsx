import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tooltip — Hover tooltip with 300ms delay, theme-aware.
 * Usage: <Tooltip text="Description"><button>Hover me</button></Tooltip>
 */
export function Tooltip({ text, children, position = 'top', delay = 300 }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const timerRef = useRef(null);
  const triggerRef = useRef(null);

  const show = () => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        // Clamp x so the tooltip (max ~280px wide) never clips the viewport edges.
        // Left edge: keep at least 8px from viewport left.
        // Right edge: keep at least 8px from viewport right.
        const rawX = rect.left + rect.width / 2;
        const TOOLTIP_HALF = 140; // half of maxWidth 280
        const clampedX = Math.max(TOOLTIP_HALF + 8, Math.min(rawX, window.innerWidth - TOOLTIP_HALF - 8));
        setCoords({
          x: clampedX,
          y: position === 'top' ? rect.top : rect.bottom,
        });
      }
      setVisible(true);
    }, delay);
  };

  const hide = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!text) return children;

  const tooltipContent = visible ? (
    <span
      role="tooltip"
      style={{
        position: 'fixed',
        left: coords.x,
        top: position === 'top' ? coords.y - 6 : coords.y + 6,
        transform: position === 'top'
          ? 'translate(-50%, -100%)'
          : 'translate(-50%, 0)',
        backgroundColor: 'var(--color-tooltip-bg, #222)',
        color: 'var(--color-tooltip-text, #eee)',
        fontSize: '11px',
        fontWeight: 500,
        padding: '5px 10px',
        borderRadius: '6px',
        whiteSpace: 'normal',
        maxWidth: '280px',
        wordBreak: 'break-word',
        pointerEvents: 'none',
        zIndex: 99999, // Ensure it's above all panels
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        border: '1px solid var(--color-border)',
        animation: 'tooltip-fade 0.15s ease-out',
      }}
    >
      {text}
      <style>{`@keyframes tooltip-fade { from { opacity: 0; transform: translate(-50%, ${position === 'top' ? '-90%' : '10%'}); } to { opacity: 1; transform: translate(-50%, ${position === 'top' ? '-100%' : '0'}); } }`}</style>
    </span>
  ) : null;

  return (
    <span
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      style={{ display: 'inline-flex', position: 'relative' }}
    >
      {children}
      {visible && createPortal(tooltipContent, document.body)}
    </span>
  );
}
