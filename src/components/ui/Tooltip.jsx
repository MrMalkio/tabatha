import React, { useState, useRef, useEffect } from 'react';

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
        setCoords({
          x: rect.left + rect.width / 2,
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
      {visible && (
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
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            border: '1px solid var(--color-border)',
            animation: 'tooltip-fade 0.15s ease-out',
          }}
        >
          {text}
        </span>
      )}
      {/* Inject keyframes once */}
      {visible && (
        <style>{`@keyframes tooltip-fade { from { opacity: 0; transform: translate(-50%, ${position === 'top' ? '-90%' : '10%'}); } to { opacity: 1; transform: translate(-50%, ${position === 'top' ? '-100%' : '0'}); } }`}</style>
      )}
    </span>
  );
}
