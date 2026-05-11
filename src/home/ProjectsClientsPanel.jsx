import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '../components/ui/GlassCard';
import { Tooltip } from '../components/ui/Tooltip';

const inputStyle = {
  padding: '4px 8px', fontSize: '12px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)', background: 'var(--color-bg-base)',
  color: 'var(--color-text-primary)', outline: 'none', width: '100%',
};

const smallBtn = (color) => ({
  background: 'transparent', border: `1px solid ${color || 'var(--color-border)'}`,
  color: color || 'var(--color-text-muted)', borderRadius: '4px',
  padding: '2px 8px', fontSize: '10px', cursor: 'pointer', fontWeight: 500,
});

/**
 * ProjectsClientsPanel — Manages the Org Hierarchy
 *
 * Props:
 *   orgData: from useOrgData hook
 *   taskList: from useOrgData
 */
export function ProjectsClientsPanel({ orgData }) {
  const { clientList, projectList, taskList, operationList, initiativeList,
          addClient, addProject, addTask, updateEntity, archiveEntity,
          getProjectsForClient, getTasksForProject } = orgData;

  const [activeTab, setActiveTab] = useState('clients'); // clients | projects | tasks
  const [expandedId, setExpandedId] = useState(null);
  const [addingNew, setAddingNew] = useState(null); // 'client' | 'project' | 'task' | null
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState('');

  const tabs = [
    { key: 'clients', label: 'Clients', icon: '👤', count: clientList.length },
    { key: 'projects', label: 'Projects', icon: '📁', count: projectList.length },
    { key: 'tasks', label: 'Tasks', icon: '✅', count: taskList.filter(t => t.status !== 'complete').length },
  ];

  const handleAdd = async () => {
    if (!newName.trim()) return;
    if (activeTab === 'clients') {
      await addClient(newName.trim());
    } else if (activeTab === 'projects') {
      await addProject(newName.trim(), newParentId || null);
    } else if (activeTab === 'tasks') {
      await addTask(newName.trim(), newParentId || null);
    }
    setNewName('');
    setNewParentId('');
    setAddingNew(null);
  };

  const renderClient = (client) => {
    const projects = getProjectsForClient(client.id);
    const isExpanded = expandedId === client.id;
    return (
      <GlassCard key={client.id} style={{ padding: '10px 12px', marginBottom: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : client.id)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '14px' }}>👤</span>
            <span style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {projects.length > 0 && <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>}
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
        {isExpanded && (
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Projects</div>
            {projects.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', padding: '4px 0' }}>No projects yet</div>
            ) : projects.map(p => {
              const tasks = getTasksForProject(p.id);
              return (
                <div key={p.id} style={{ padding: '4px 0 4px 16px', borderLeft: '2px solid var(--color-border)', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500 }}>📁 {p.name}</span>
                    <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
                  </div>
                  {tasks.map(t => (
                    <div key={t.id} style={{ paddingLeft: '12px', fontSize: '11px', color: t.status === 'complete' ? 'var(--color-text-muted)' : 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0 2px 12px' }}>
                      <span style={{ cursor: 'pointer' }} onClick={() => updateEntity('tasks', t.id, { status: t.status === 'complete' ? 'open' : 'complete' })}>
                        {t.status === 'complete' ? '☑️' : '☐'}
                      </span>
                      <span style={{ textDecoration: t.status === 'complete' ? 'line-through' : 'none' }}>{t.name}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <Tooltip text="Archive this client">
                <button onClick={() => archiveEntity('clients', client.id)} style={smallBtn('#ef5350')}>🗑 Archive</button>
              </Tooltip>
            </div>
          </div>
        )}
      </GlassCard>
    );
  };

  const renderProject = (project) => {
    const tasks = getTasksForProject(project.id);
    const client = project.clientId ? clientList.find(c => c.id === project.clientId) : null;
    const isExpanded = expandedId === project.id;
    return (
      <GlassCard key={project.id} style={{ padding: '10px 12px', marginBottom: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : project.id)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '14px' }}>📁</span>
            <span style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
            {client && <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>({client.name})</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
        {isExpanded && (
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
            {tasks.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '12px' }}>
                <span style={{ cursor: 'pointer' }} onClick={() => updateEntity('tasks', t.id, { status: t.status === 'complete' ? 'open' : 'complete' })}>
                  {t.status === 'complete' ? '☑️' : '☐'}
                </span>
                <span style={{ flex: 1, textDecoration: t.status === 'complete' ? 'line-through' : 'none', color: t.status === 'complete' ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>{t.name}</span>
                <Tooltip text="Archive"><button onClick={() => archiveEntity('tasks', t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: 'var(--color-text-muted)', padding: 0 }}>✕</button></Tooltip>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <Tooltip text="Archive this project">
                <button onClick={() => archiveEntity('projects', project.id)} style={smallBtn('#ef5350')}>🗑 Archive</button>
              </Tooltip>
            </div>
          </div>
        )}
      </GlassCard>
    );
  };

  const renderTask = (task) => {
    const project = task.projectId ? projectList.find(p => p.id === task.projectId) : null;
    const client = task.clientId ? clientList.find(c => c.id === task.clientId) : null;
    return (
      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderBottom: '1px solid var(--color-border)', fontSize: '12px' }}>
        <span style={{ cursor: 'pointer', fontSize: '14px' }} onClick={() => updateEntity('tasks', task.id, { status: task.status === 'complete' ? 'open' : 'complete' })}>
          {task.status === 'complete' ? '☑️' : '☐'}
        </span>
        <span style={{ flex: 1, textDecoration: task.status === 'complete' ? 'line-through' : 'none', color: task.status === 'complete' ? 'var(--color-text-muted)' : 'var(--color-text-primary)', fontWeight: 500 }}>
          {task.name}
        </span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {project && <span style={{ fontSize: '9px', background: 'var(--color-surface)', padding: '1px 5px', borderRadius: '3px', color: 'var(--color-text-muted)' }}>📁 {project.name}</span>}
          {client && <span style={{ fontSize: '9px', background: 'var(--color-surface)', padding: '1px 5px', borderRadius: '3px', color: 'var(--color-text-muted)' }}>👤 {client.name}</span>}
          <Tooltip text="Archive"><button onClick={() => archiveEntity('tasks', task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: 'var(--color-text-muted)', padding: 0 }}>✕</button></Tooltip>
        </div>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setExpandedId(null); }}
            style={{
              background: activeTab === tab.key ? 'var(--color-accent-primary)22' : 'transparent',
              border: `1px solid ${activeTab === tab.key ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
              color: activeTab === tab.key ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
              borderRadius: '6px', padding: '4px 12px', fontSize: '11px', cursor: 'pointer',
              fontWeight: activeTab === tab.key ? 600 : 400, display: 'flex', alignItems: 'center', gap: '4px',
            }}>
            {tab.icon} {tab.label}
            <span style={{ fontSize: '9px', opacity: 0.7 }}>({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Add new button */}
      <div style={{ marginBottom: '8px' }}>
        {addingNew ? (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                placeholder={`New ${activeTab.slice(0, -1)} name...`}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAddingNew(null); }}
                style={inputStyle} />
            </div>
            {activeTab === 'projects' && (
              <select value={newParentId} onChange={e => setNewParentId(e.target.value)} style={{ ...inputStyle, width: '120px' }}>
                <option value="">No client</option>
                {clientList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {activeTab === 'tasks' && (
              <select value={newParentId} onChange={e => setNewParentId(e.target.value)} style={{ ...inputStyle, width: '120px' }}>
                <option value="">No project</option>
                {projectList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <button onClick={handleAdd} style={smallBtn('#66bb6a')}>+ Add</button>
            <button onClick={() => { setAddingNew(null); setNewName(''); setNewParentId(''); }} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '14px', padding: 0 }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setAddingNew(activeTab)} style={smallBtn('var(--color-accent-primary)')}>
            + New {activeTab.slice(0, -1)}
          </button>
        )}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'clients' && (
          <motion.div key="clients" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {clientList.length === 0 ? (
              <GlassCard style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>👤</div>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', margin: 0 }}>No clients yet. Add one to start organizing.</p>
              </GlassCard>
            ) : clientList.map(renderClient)}
          </motion.div>
        )}
        {activeTab === 'projects' && (
          <motion.div key="projects" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {projectList.length === 0 ? (
              <GlassCard style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>📁</div>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', margin: 0 }}>No projects yet. Add one and optionally link a client.</p>
              </GlassCard>
            ) : projectList.map(renderProject)}
          </motion.div>
        )}
        {activeTab === 'tasks' && (
          <motion.div key="tasks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {taskList.filter(t => t.status !== 'complete').length === 0 ? (
              <GlassCard style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>✅</div>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', margin: 0 }}>All tasks complete! Add a new one to keep going.</p>
              </GlassCard>
            ) : (
              <GlassCard style={{ padding: '0', overflow: 'hidden' }}>
                {taskList.filter(t => t.status !== 'complete').map(renderTask)}
              </GlassCard>
            )}
            {/* Completed section */}
            {taskList.filter(t => t.status === 'complete').length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                  Completed ({taskList.filter(t => t.status === 'complete').length})
                </div>
                <GlassCard style={{ padding: '0', overflow: 'hidden', opacity: 0.6 }}>
                  {taskList.filter(t => t.status === 'complete').slice(0, 10).map(renderTask)}
                </GlassCard>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
