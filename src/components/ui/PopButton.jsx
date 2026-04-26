import React from 'react';
import { motion } from 'framer-motion';

/**
 * PopButton – Themed interactive button.
 * Pop Art: hard offset shadow, uppercase, translate on hover.
 * Corporate: clean rounded button with subtle shadow lift.
 */
export function PopButton({ children, className = '', onClick, variant = 'primary', size = 'md', ...props }) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-8 py-3.5 text-base',
  };

  return (
    <motion.button
      className={`btn-pop ${sizeClasses[size] || sizeClasses.md} ${className}`}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
