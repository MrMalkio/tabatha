import React, { useState, useMemo } from 'react';
import { ComboInput } from './ComboInput';

const REALM_OPTIONS = ['business', 'personal'];

/**
 * TagPicker — Compact inline tag selector for Focus associations.
 * Handles Realm (Business/Personal), Client, Project, Task.
 * Uses ComboInput for autocomplete with free-form entry.
 */
export function TagPicker({ tags = {}, onChange, clients = [], projects = [], compact = true }) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (field, value) => {
    const updated = { ...tags, [field]: value };
    // Auto-set "Self" as client when switching to personal realm
    if (field === 'realm' && value === 'personal' && !tags.client) {
      updated.client = 'Self';
    }
    onChange(updated);
  };

  // Ensure "Self" is always an option in personal realm
  const clientOptions = useMemo(() => {
    const base = [...clients];
    if (!base.includes('Self')) base.unshift('Self');
    return base;
  }, [clients]);

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
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>Realm</div>
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
        <ComboInput
          label="Client"
          value={tags.client || ''}
          onChange={(v) => handleChange('client', v)}
          options={clientOptions}
          placeholder="Client name"
          icon="👤"
        />
      </div>

      {/* Project */}
      <div>
        <ComboInput
          label="Project"
          value={tags.project || ''}
          onChange={(v) => handleChange('project', v)}
          options={projects}
          placeholder="Project"
          icon="📁"
        />
      </div>

      {/* Task */}
      <div>
        <ComboInput
          label="Task"
          value={tags.task || ''}
          onChange={(v) => handleChange('task', v)}
          options={[]}
          placeholder="Task name"
          icon="✏️"
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
