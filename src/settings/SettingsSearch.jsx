import { useState, useRef, useEffect, useMemo } from 'react';
import { searchSettings, sectionLabelFor } from '../utils/settingsSearch';

// NB-08 — Settings fuzzy search box (sticky nav header).
// Owns its query state LOCALLY so keystrokes never re-render the giant
// Settings() component. The only prop is a stable `onJump(entry)` callback
// (setActiveSection + post-jump scroll/pulse, owned by Settings).
export function SettingsSearch({ onJump }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => searchSettings(query), [query]);

  // '/' focuses the search — fresh keydown listener local to the Settings
  // page. Input guard copied in full from KeyboardShortcuts.jsx.
  useEffect(() => {
    const handler = (e) => {
      // Ignore if typing in input/textarea
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.contentEditable === 'true') {
        // Only respond to Escape in input fields
        if (e.key === 'Escape') { e.target.blur(); return; }
        return;
      }

      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Keep selection in view while arrowing through results
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIdx];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx]);

  const jump = (entry) => {
    if (!entry) return;
    onJump?.(entry);
    setOpen(false);
    setQuery('');
    setSelectedIdx(0);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      e.currentTarget.blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); jump(results[selectedIdx]); }
  };

  return (
    <div style={{ position: 'relative', marginTop: '8px' }}>
      {/* Jump-target highlight — same keyframe pattern as tabathaSyncPulse */}
      <style>{`@keyframes tabathaSearchPulse {
        0%   { box-shadow: 0 0 0 0 var(--color-accent-primary); }
        50%  { box-shadow: 0 0 0 6px transparent; }
        100% { box-shadow: 0 0 0 0 transparent; }
      }`}</style>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Search settings…  ( / )"
        onChange={e => { setQuery(e.target.value); setOpen(true); setSelectedIdx(0); }}
        onFocus={() => { if (query.trim()) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '5px 8px',
          background: 'var(--color-bg-base)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)',
          fontSize: '11px', outline: 'none',
        }}
      />
      {open && query.trim() && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            marginTop: '4px', maxHeight: '260px', overflowY: 'auto',
            background: 'var(--color-bg-base)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
              No matching settings
            </div>
          ) : results.map((r, i) => (
            <div
              key={r.id}
              onMouseDown={e => { e.preventDefault(); jump(r); }}
              onMouseEnter={() => setSelectedIdx(i)}
              style={{
                padding: '6px 10px', cursor: 'pointer', fontSize: '11px',
                background: i === selectedIdx ? 'var(--color-surface)' : 'transparent',
                borderLeft: i === selectedIdx ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
              <div style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{sectionLabelFor(r.section)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
