import React from 'react';

/**
 * GlassCard – A themed container that follows the active design.md tokens.
 * In Pop Art mode: frosted glass with backdrop-blur and translucent borders.
 * In Corporate mode: solid white card with soft shadow.
 */
export function GlassCard({ children, className = '', style = {}, ...props }) {
  return (
    <div
      className={`glass-panel ${className}`}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}
