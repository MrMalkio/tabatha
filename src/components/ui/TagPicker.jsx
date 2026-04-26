import React, { useState, useMemo } from 'react';

const REALM_OPTIONS = ['business', 'personal'];

/**
 * TagPicker — Compact inline tag selector for Focus associations.
 * Handles Realm (Business/Personal), Client, Project, Task.
 */
export function TagPicker({ tags = {}, onChange, clients = [], projects = [], compact = true }) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (field, value) => {
    onChange({ ...tags, [field]: value });
  };

  const tagDisplay = useMemo(() => {
    const parts = [];
    if (tags.realm) parts.push(tags.realm === 'business' ? '💼' : '🏠');
    if (tags.client) parts.push(tags.client);
    if (tags.project) parts.push(tags.project);
    if (tags.task) parts.push(tags.task);
    return parts.length > 0 ? parts.join(' › ') : null;
  }, [tags]);

  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        title="Set associations"
        style={{
          background: 'transparent',
          border: '1px dashed var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          color: tagDisplay ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          fontSize: '11px',
          padding: '3px 8px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {tagDisplay || '🏷 Add tags'}
      </button>
    );
  }

  const inputStyle = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    padding: '4px 8px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '3px',
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '6px',
      padding: '8px',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      backdropFilter: 'var(--surface-blur)',
    }}>
      {/* Realm */}
      <div>
        <div style={labelStyle}>Realm</div>
        <div style={{ display: 'flex', gap: '2px' }}>
          {REALM_OPTIONS.map(r => (
            <button
              key={r}
              onClick={() => handleChange('realm', tags.realm === r ? '' : r)}
              style={{
                flex: 1,
                background: tags.realm === r ? 'var(--color-accent-primary)' : 'transparent',
                color: tags.realm === r ? '#fff' : 'var(--color-text-muted)',
                border: `1px solid ${tags.realm === r ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                padding: '3px 6px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              {r === 'business' ? '💼' : '🏠'} {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Client */}
      <div>
        <div style={labelStyle}>Client</div>
        <input
          type="text"
          list="tag-clients"
          value={tags.client || ''}
          onChange={e => handleChange('client', e.target.value)}
          placeholder="Client name"
          style={inputStyle}
        />
        <datalist id="tag-clients">
          {clients.map(c => <option key={c} value={c} />)}
        </datalist>
      </div>

      {/* Project */}
      <div>
        <div style={labelStyle}>Project</div>
        <input
          type="text"
          list="tag-projects"
          value={tags.project || ''}
          onChange={e => handleChange('project', e.target.value)}
          placeholder="Project"
          style={inputStyle}
        />
        <datalist id="tag-projects">
          {projects.map(p => <option key={p} value={p} />)}
        </datalist>
      </div>

      {/* Task */}
      <div>
        <div style={labelStyle}>Task</div>
        <input
          type="text"
          value={tags.task || ''}
          onChange={e => handleChange('task', e.target.value)}
          placeholder="Task name"
          style={inputStyle}
        />
      </div>

      {/* Collapse */}
      <div style={{ gridColumn: 'span 2', textAlign: 'right' }}>
        <button
          onClick={() => setExpanded(false)}
          style={{
            background: 'transparent', border: 'none', color: 'var(--color-accent-primary)',
            fontSize: '11px', cursor: 'pointer', padding: '2px 6px',
          }}
        >
          Done ✓
        </button>
      </div>
    </div>
  );
}
