import React, { useState, useMemo } from 'react';
import { ComboInput } from './ComboInput';

const REALM_OPTIONS = ['business', 'personal'];

/**
 * TagPicker — Compact inline tag selector for Focus associations.
 * Handles Realm (Business/Personal), Client, Project, Task.
 * Uses ComboInput for autocomplete with free-form entry.
 *
 * Auto-fill cascade:
 *   - Selecting a task auto-fills its project + client
 *   - Selecting a project auto-fills its client
 * 
 * Business attribution:
 *   - Client/Project fields only appear when realm === 'business'
 *   - Task is always available regardless of realm
 */
export function TagPicker({ tags = {}, onChange, clients = [], projects = [], tasks = [], compact = true, onPersist, orgData }) {
  const [expanded, setExpanded] = useState(false);

  // Persist a NEW entry to the org registry — only called on explicit submit (Enter/dropdown)
  const handlePersistNew = (field, value) => {
    if (!onPersist || !value?.trim() || field === 'realm') return;
    onPersist(field, value.trim());
  };

  const handleChange = (field, value) => {
    const updated = { ...tags, [field]: value };
    // Auto-set "Self" as client when switching to personal realm
    if (field === 'realm' && value === 'personal' && !tags.client) {
      updated.client = 'Self';
    }
    // Auto-fill cascade: task → project → client
    if (field === 'task' && value && orgData) {
      const taskObj = orgData.taskList.find(t => t.name.toLowerCase() === value.toLowerCase());
      if (taskObj) {
        if (taskObj.projectId) {
          const proj = orgData.org.projects[taskObj.projectId];
          if (proj && !proj.archived) {
            updated.project = proj.name;
            // Also cascade project → client
            if (proj.clientId) {
              const cli = orgData.org.clients[proj.clientId];
              if (cli && !cli.archived) updated.client = cli.name;
            }
          }
        }
        if (taskObj.clientId && !updated.client) {
          const cli = orgData.org.clients[taskObj.clientId];
          if (cli && !cli.archived) updated.client = cli.name;
        }
      }
    }
    // Auto-fill cascade: project → client
    if (field === 'project' && value && orgData) {
      const projObj = orgData.projectList.find(p => p.name.toLowerCase() === value.toLowerCase());
      if (projObj?.clientId) {
        const cli = orgData.org.clients[projObj.clientId];
        if (cli && !cli.archived) updated.client = cli.name;
      }
    }
    onChange(updated);
    // Persist new entries to org registry ONLY when selecting an existing option
    // (not on every keystroke — that creates a task per character!)
    if (onPersist && value && field !== 'realm') {
      // Only persist if the value matches an existing option (user selected from dropdown)
      const isExistingOption = (() => {
        if (field === 'client') return clients.some(c => c.toLowerCase() === value.toLowerCase());
        if (field === 'project') return projects.some(p => p.toLowerCase() === value.toLowerCase());
        if (field === 'task') return tasks.some(t => t.toLowerCase() === value.toLowerCase());
        return false;
      })();
      if (isExistingOption) {
        onPersist(field, value);
      }
    }
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

  const isBusiness = tags.realm === 'business';

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

      {/* Client — shown always for business, or when already set for personal */}
      {(isBusiness || tags.client) && (
        <div>
          <ComboInput
            label="Client"
            value={tags.client || ''}
            onChange={(v) => handleChange('client', v)}
            onSubmit={(v) => handlePersistNew('client', v)}
            options={clientOptions}
            placeholder="Client name"
            icon="👤"
          />
        </div>
      )}

      {/* Project — shown for business realm, or when already set */}
      {(isBusiness || tags.project) && (
        <div>
          <ComboInput
            label="Project"
            value={tags.project || ''}
            onChange={(v) => handleChange('project', v)}
            onSubmit={(v) => handlePersistNew('project', v)}
            options={projects}
            placeholder="Project"
            icon="📁"
          />
        </div>
      )}

      {/* Task — always available */}
      <div>
        <ComboInput
          label="Task"
          value={tags.task || ''}
          onChange={(v) => handleChange('task', v)}
          onSubmit={(v) => handlePersistNew('task', v)}
          options={tasks}
          placeholder="Task name"
          icon="✏️"
        />
      </div>

      {/* Auto-fill hint */}
      {orgData && (tags.task || tags.project) && (
        <div style={{ gridColumn: 'span 2', fontSize: '9px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          💡 Selecting a task or project auto-fills related fields
        </div>
      )}

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
