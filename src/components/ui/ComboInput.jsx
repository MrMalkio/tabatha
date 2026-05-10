import React, { useState, useRef, useEffect, useMemo } from 'react';

/**
 * ComboInput — Autocomplete text input that suggests from existing options
 * while still allowing free-form text entry without extra steps.
 *
 * Props:
 *   value        — Current value (string)
 *   onChange      — (newValue: string) => void
 *   options       — Array of existing options to suggest
 *   placeholder   — Input placeholder
 *   label         — Optional label above the input
 *   onSubmit      — Optional callback when Enter is pressed
 *   size          — 'sm' | 'md' (default: 'sm')
 *   icon          — Optional leading icon string
 *   allowCreate   — Show "Create new" option when no match (default: true)
 */
export function ComboInput({
  value = '',
  onChange,
  options = [],
  placeholder = '',
  label,
  onSubmit,
  size = 'sm',
  icon,
  allowCreate = true,
}) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Filtered suggestions
  const filtered = useMemo(() => {
    if (!value.trim()) return options.slice(0, 8);
    const q = value.toLowerCase();
    return options
      .filter(opt => opt.toLowerCase().includes(q))
      .sort((a, b) => {
        // Exact start-match first, then alphabetical
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b);
      })
      .slice(0, 8);
  }, [value, options]);

  const exactMatch = useMemo(
    () => filtered.some(o => o.toLowerCase() === value.toLowerCase()),
    [filtered, value]
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        inputRef.current && !inputRef.current.contains(e.target) &&
        listRef.current && !listRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (opt) => {
    onChange(opt);
    setOpen(false);
    setHighlightIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open) {
      if (e.key === 'Enter' && onSubmit) {
        onSubmit(value);
      }
      return;
    }

    const totalItems = filtered.length + (allowCreate && value.trim() && !exactMatch ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => (i + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => (i - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        handleSelect(filtered[highlightIdx]);
      } else if (highlightIdx === filtered.length && allowCreate && value.trim() && !exactMatch) {
        // "Create new" — just keep the typed value
        setOpen(false);
        if (onSubmit) onSubmit(value);
      } else if (onSubmit) {
        setOpen(false);
        onSubmit(value);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const fontSize = size === 'sm' ? '12px' : '14px';
  const padding = size === 'sm' ? '4px 8px' : '8px 12px';

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {label && (
        <div style={{
          fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px',
        }}>
          {label}
        </div>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {icon && (
          <span style={{
            position: 'absolute', left: '8px', fontSize, color: 'var(--color-text-muted)',
            pointerEvents: 'none', zIndex: 1,
          }}>
            {icon}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setHighlightIdx(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            width: '100%',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-primary)',
            fontSize,
            padding,
            paddingLeft: icon ? '28px' : undefined,
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (filtered.length > 0 || (allowCreate && value.trim() && !exactMatch)) && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            marginTop: '2px',
            maxHeight: '180px',
            overflowY: 'auto',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {filtered.map((opt, i) => (
            <div
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
              onMouseEnter={() => setHighlightIdx(i)}
              style={{
                padding: '6px 10px',
                fontSize,
                cursor: 'pointer',
                background: highlightIdx === i ? 'var(--color-accent-primary)' : 'transparent',
                color: highlightIdx === i ? '#fff' : 'var(--color-text-primary)',
                transition: 'background 0.1s',
              }}
            >
              {opt}
            </div>
          ))}
          {/* "Create new" option */}
          {allowCreate && value.trim() && !exactMatch && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                if (onSubmit) onSubmit(value);
              }}
              onMouseEnter={() => setHighlightIdx(filtered.length)}
              style={{
                padding: '6px 10px',
                fontSize,
                cursor: 'pointer',
                borderTop: filtered.length > 0 ? '1px solid var(--color-border)' : 'none',
                background: highlightIdx === filtered.length ? 'var(--color-accent-primary)' : 'transparent',
                color: highlightIdx === filtered.length ? '#fff' : 'var(--color-accent-secondary)',
                fontStyle: 'italic',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>＋</span> Create "{value.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
